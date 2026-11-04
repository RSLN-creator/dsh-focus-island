// dsh-focus-island — headless integration smoke test.
//
// Loads the GENERATED `lib/client.js` into a fake browser + fake React, calls
// the loader factory exactly like the host page does, applies the plugin with a
// fake Cordis context, and then drives the real integration layer:
//   * the artifact parses and registers under `window.__ModuleLoader__.load`
//   * the plugin declares the `slots` injection and applies cleanly
//   * `shell.overlay` gets exactly one occupant with the expected id
//   * the occupant renders and receives the measured right-sidebar inset
//   * typed text pauses the countdown; Enter resets it (the two rules that
//     matter most and that no pure unit test can prove)
//   * disposal runs without throwing
//
// Run: node verify/integration-smoke.mjs

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ARTIFACT = new URL('../lib/client.js', import.meta.url)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------- fake browser

const captured = {}
const intervals = []
const listeners = new Map()
const storage = new Map()

/** Right sidebar column: 420px wide, no fullscreen flag. */
const frameEl = {
  hasAttribute: () => false,
  parentElement: null,
}
const columnEl = {
  isConnected: true,
  parentElement: frameEl,
  closest: (selector) => (String(selector).includes('data-rightbar') ? frameEl : null),
  getBoundingClientRect: () => ({ width: 420, height: 900, top: 0, left: 1080, right: 1500, bottom: 900 }),
}

/** Composer card: no running turn (no stop button). */
const cardEl = {
  querySelectorAll: () => [],
}

/** Official conversation header: 76px tall, so the island must start below it. */
const headerEl = {
  isConnected: true,
  getBoundingClientRect: () => ({ width: 1080, height: 76, top: 0, left: 0, right: 1080, bottom: 76 }),
}
const headerLeadingEl = {
  closest: (selector) => (selector === 'header' ? headerEl : null),
}

/** Contenteditable editor; `textContent` stands in for the Lexical text. */
const composerEl = {
  textContent: '',
  closest: (selector) => (selector === '[data-composer-card]' ? cardEl : null),
}

globalThis.window = {
  __ModuleLoader__: { load: (definition) => { captured.load = definition } },
  requestAnimationFrame: (fn) => { fn(); return 1 },
  cancelAnimationFrame: () => {},
  setInterval: (fn) => { intervals.push(fn); return intervals.length },
  clearInterval: () => {},
  setTimeout: (fn) => { const id = setTimeout(fn, 0); return id },
  clearTimeout: (id) => clearTimeout(id),
  addEventListener: (type, handler) => { listeners.set(type, handler) },
  removeEventListener: () => {},
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)) },
    removeItem: (key) => { storage.delete(key) },
  },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }),
}

globalThis.document = {
  visibilityState: 'visible',
  hasFocus: () => true,
  documentElement: { getAttribute: () => 'zh', addEventListener: () => {} },
  head: { appendChild: () => {} },
  querySelector: (selector) => {
    if (selector === '[data-composer-input]') return composerEl
    if (selector === '[data-composer-card]') return cardEl
    if (selector === '[data-rightbar-col]') return columnEl
    if (selector === '[data-conversation-header-leading]') return headerLeadingEl
    return null
  },
  querySelectorAll: () => [],
  addEventListener: (type, handler) => { listeners.set(type, handler) },
  removeEventListener: () => {},
  createElement: () => ({ style: {}, remove: () => {} }),
}

globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
}

globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
}

// ------------------------------------------------------------------- fake React

let hookCursor = 0
const hookValues = []

const React = {
  Fragment: Symbol('fragment'),
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState(initial) {
    const index = hookCursor++
    if (!(index in hookValues)) hookValues[index] = typeof initial === 'function' ? initial() : initial
    return [hookValues[index], (next) => { hookValues[index] = typeof next === 'function' ? next(hookValues[index]) : next }]
  },
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  useMemo: (factory) => factory(),
  useCallback: (callback) => callback,
  memo: (component) => component,
  useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
}

// ---------------------------------------------------------------- fake Cordis

function createFakeCtx() {
  const registered = []
  const effects = []
  return {
    logger: { warn: () => {}, info: () => {}, debug: () => {} },
    get: () => undefined,
    on: () => () => {},
    effect: (factory) => { effects.push(factory); return () => {} },
    slots: {
      inject: (key, callback) => { callback() },
      register: (options, component) => { registered.push({ options, component }); return () => {} },
    },
    _registered: registered,
    _effects: effects,
  }
}

// ------------------------------------------------------------------------ run

const source = await readFile(ARTIFACT, 'utf8')
assert.ok(source.includes('__ModuleLoader__.load'), 'artifact must call the module loader')
assert.ok(source.includes("id: 'dsh-focus-island'"), 'artifact must declare the plugin id')

new Function('window', 'document', 'MutationObserver', 'ResizeObserver', 'console', source)(
  globalThis.window,
  globalThis.document,
  globalThis.MutationObserver,
  globalThis.ResizeObserver,
  console,
)

assert.ok(captured.load !== undefined, 'loader.load must have been called')
assert.equal(captured.load.id, 'dsh-focus-island')

const plugin = captured.load.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require: ${name}`)
})

assert.equal(typeof plugin.apply, 'function', 'plugin must export apply')
assert.deepEqual(plugin.inject, ['slots'], 'plugin must inject the slots service')

const ctx = createFakeCtx()
plugin.apply(ctx)

const overlays = ctx._registered.filter((entry) => entry.options !== undefined && entry.options.name === 'shell.overlay')
assert.equal(overlays.length, 1, 'exactly one shell.overlay registration')
assert.equal(overlays[0].options.id, 'dsh-focus-island')
assert.equal(typeof overlays[0].component, 'function', 'registration must carry a component')

// The overlay occupant must receive the right-sidebar inset measured from the
// live layout ([data-rightbar-col] = 420 in this fake page).
hookCursor = 0
hookValues.length = 0
const tree = overlays[0].component({})
assert.ok(tree !== null, 'overlay component must render something')
assert.equal(tree.props.rightInset, 420, 'right sidebar inset must follow the measured column width')
assert.equal(tree.props.topInset, 86, 'top inset must clear the 76px conversation header (+10px gap)')

assert.equal(intervals.length, 2, 'plugin must schedule the 1 s tick and the 5 s persistence pulse')
const [tick, save] = intervals

/** Read back the persisted focus snapshot. */
function storedState() {
  const raw = storage.get('dsh-focus-island:v1:state')
  return raw === undefined ? null : JSON.parse(raw)
}

// --- typing pauses the countdown ------------------------------------------
composerEl.textContent = '正在写一半的消息'
const keydown = listeners.get('keydown')
assert.equal(typeof keydown, 'function', 'keydown listener must be installed')
keydown({ target: composerEl, key: 'a', shiftKey: false, isComposing: false })
tick()
save()
const paused = storedState()
assert.ok(paused !== null, 'a snapshot must be persisted')
assert.equal(paused.phase, 'paused', `typing must pause the countdown (got ${paused && paused.phase})`)
const pausedElapsed = paused.elapsedMs
await sleep(1150)
tick()
save()
assert.equal(storedState().elapsedMs, pausedElapsed, 'paused countdown must not advance')

// --- sending resets it -----------------------------------------------------
keydown({ target: composerEl, key: 'Enter', shiftKey: false, isComposing: false, metaKey: false, ctrlKey: false, altKey: false })
composerEl.textContent = ''
tick()
save()
const reset = storedState()
assert.ok(reset !== null, 'send must persist a snapshot')
assert.equal(reset.phase, 'counting', `send must restart counting (got ${reset.phase})`)
assert.ok(reset.elapsedMs <= 150, `send must reset elapsed (got ${reset.elapsedMs})`)

// --- disposal --------------------------------------------------------------
for (const factory of ctx._effects) {
  const dispose = factory()
  if (typeof dispose === 'function') dispose()
}

console.log('integration smoke: OK')
console.log('  overlay registrations: 1')
console.log('  rightInset from live layout: 420')
console.log('  typing -> paused, send -> counting, disposal clean')
