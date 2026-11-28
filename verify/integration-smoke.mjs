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
const intervalDelays = []
const listeners = new Map()
const storage = new Map()
const pageStorage = new Map()

/* Layout-read counters: the whole point of the idle-time fix is that a pulse
 * with nothing changed must not force style/layout work. */
const reads = { columnRect: 0, headerRect: 0, querySelector: 0 }

/** Right sidebar column: 420px wide, no fullscreen flag. */
const frameEl = {
  hasAttribute: () => false,
  parentElement: null,
}
const columnEl = {
  isConnected: true,
  parentElement: frameEl,
  closest: (selector) => (String(selector).includes('data-rightbar') ? frameEl : null),
  getBoundingClientRect: () => {
    reads.columnRect += 1
    return { width: 420, height: 900, top: 0, left: 1080, right: 1500, bottom: 900 }
  },
}

/** Composer card: no running turn (no stop button). */
const cardEl = {
  querySelectorAll: () => [],
}

/** Official conversation header: 76px tall, so the island must start below it. */
const headerEl = {
  isConnected: true,
  getBoundingClientRect: () => {
    reads.headerRect += 1
    return { width: 1080, height: 76, top: 0, left: 0, right: 1080, bottom: 76 }
  },
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
  setInterval: (fn, delay) => { intervals.push(fn); intervalDelays.push(delay); return intervals.length },
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
  /* Session storage: survives a reload of the same page, dies with the page.
   * The boot path uses its marker to tell "F5" from "closed the app". */
  sessionStorage: {
    getItem: (key) => (pageStorage.has(key) ? pageStorage.get(key) : null),
    setItem: (key, value) => { pageStorage.set(key, String(value)) },
    removeItem: (key) => { pageStorage.delete(key) },
  },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }),
}

globalThis.document = {
  visibilityState: 'visible',
  hasFocus: () => true,
  documentElement: { getAttribute: () => 'zh', addEventListener: () => {} },
  head: { appendChild: () => {} },
  querySelector: (selector) => {
    reads.querySelector += 1
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
assert.deepEqual(intervalDelays, [1000, 5000], 'pulses run at 1 s / 5 s — the 1 s display resolution')
const [tick, save] = intervals

/* An idle pulse must cost no layout read at all: the tracked header/column are
 * still connected, so nothing can have moved and nothing is measured. */
reads.columnRect = 0
reads.headerRect = 0
tick()
assert.equal(reads.columnRect, 0, 'an idle pulse must not read the column rect')
assert.equal(reads.headerRect, 0, 'an idle pulse must not read the header rect')

/* A session switch detaches the old header; that is the only case that has to
 * re-measure, and `isConnected` is what detects it. */
const detached = headerEl.isConnected
headerEl.isConnected = false
tick()
headerEl.isConnected = detached
assert.ok(reads.headerRect > 0, 'a replaced header must trigger a fresh measurement')

/** Read back the persisted focus snapshot. */
function storedState() {
  const raw = storage.get('dsh-focus-island:v1:state')
  return raw === undefined ? null : JSON.parse(raw)
}

// --- typing must NOT pause the countdown ----------------------------------
composerEl.textContent = '正在写一半的消息'
const keydown = listeners.get('keydown')
assert.equal(typeof keydown, 'function', 'keydown listener must be installed')
keydown({ target: composerEl, key: 'a', shiftKey: false, isComposing: false })
tick()
save()
const typingState = storedState()
assert.ok(typingState !== null, 'a snapshot must be persisted')
assert.equal(typingState.phase, 'counting', `typing must not pause the clock (got ${typingState && typingState.phase})`)
const typingElapsed = typingState.elapsedMs
await sleep(1150)
tick()
save()
assert.ok(storedState().elapsedMs > typingElapsed, 'the clock must keep running while typing')

// --- sending resets it -----------------------------------------------------
keydown({ target: composerEl, key: 'Enter', shiftKey: false, isComposing: false, metaKey: false, ctrlKey: false, altKey: false })
composerEl.textContent = ''
tick()
save()
const reset = storedState()
assert.ok(reset !== null, 'send must persist a snapshot')
assert.equal(reset.phase, 'counting', `send must restart counting (got ${reset.phase})`)
assert.ok(reset.elapsedMs <= 150, `send must reset elapsed (got ${reset.elapsedMs})`)

// --- a skipped round survives a *reload*, not a cold start ------------------
/* Regression, twice over. First the boot path skipped restoring `finished` and
 * `skipped`, so reloading after "skip" started a brand-new countdown and the
 * reminder could come back seconds later. Then restoring them unconditionally
 * brought yesterday's reminder back when the app was opened the next morning.
 *
 * A reload keeps the page-session marker in `sessionStorage`; closing the app
 * loses it. Where that storage is unavailable the 5 s heartbeat decides instead.
 * Both rules are only visible across two boots of the same process, so this is
 * the only place they can be proven. */
function storedRound(pulseAgeMs) {
  return JSON.stringify({
    v: 1,
    phase: 'skipped',
    durationMinutes: 25,
    elapsedMs: 8 * 60 * 1000,
    watchedMs: 8 * 60 * 1000,
    startedAt: null,
    pausedAt: null,
    finishedAt: null,
    skipArmed: false,
    ...(pulseAgeMs === null ? {} : { pulseAt: Date.now() - pulseAgeMs }),
  })
}

/**
 * Boot the plugin once against the current storage; returns what it persisted.
 * @param {boolean} [newRun] Drop the page-session marker first, as closing the app does.
 */
function bootAndReadState(newRun) {
  if (newRun === true) pageStorage.clear()
  const before = intervals.length
  const booted = createFakeCtx()
  plugin.apply(booted)
  const bootIntervals = intervals.slice(before)
  assert.equal(bootIntervals.length, 2, 'a reload reschedules the same two pulses')
  /* A second island instance listens for the same global events; leaving those
   * registrations in place would let both instances keep a timer alive and the
   * process would never exit. Run the disposal hook first, then read storage. */
  bootIntervals[1]()  // persistence pulse, before disposal
  const state = storedState()
  for (const factory of booted._effects) {
    const dispose = factory()
    if (typeof dispose === 'function') dispose()
  }
  return state
}

// Same page session = a reload: the stored round is kept, even a terminal one.
storage.set('dsh-focus-island:v1:state', storedRound(1000))
const afterReload = bootAndReadState()
assert.notEqual(afterReload, null, 'the reload must persist a snapshot')
assert.equal(afterReload.phase, 'skipped', `a skipped round must survive a reload (got ${afterReload.phase})`)
assert.equal(afterReload.elapsedMs, 8 * 60 * 1000, 'the time counted before skipping must survive the reload')

// No page-session marker = the app was started again: count from zero, even
// though the heartbeat is only a second old.
storage.set('dsh-focus-island:v1:state', storedRound(1000))
const afterColdStart = bootAndReadState(true)
assert.equal(afterColdStart.phase, 'counting', `a cold start must begin counting, not reopen the old card (got ${afterColdStart.phase})`)
assert.ok(afterColdStart.elapsedMs < 2000, `a cold start must count from zero (got ${afterColdStart.elapsedMs} ms)`)

/* Fallback for a runtime where `sessionStorage` throws (private mode): the
 * heartbeat decides. A fresh one still means "reload", an old one "new run". */
const sessionStorageRef = globalThis.window.sessionStorage
const throwing = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() {} }
globalThis.window.sessionStorage = throwing
storage.set('dsh-focus-island:v1:state', storedRound(1000))
const fallbackReload = bootAndReadState()
assert.equal(fallbackReload.phase, 'skipped', 'without sessionStorage a fresh heartbeat still means reload')
storage.set('dsh-focus-island:v1:state', storedRound(10 * 60 * 1000))
const fallbackCold = bootAndReadState()
assert.equal(fallbackCold.phase, 'counting', 'without sessionStorage an old heartbeat means a new run')
globalThis.window.sessionStorage = sessionStorageRef

// A snapshot from a build without the heartbeat cannot prove it is current.
storage.set('dsh-focus-island:v1:state', storedRound(null))
const afterLegacy = bootAndReadState(true)
assert.equal(afterLegacy.phase, 'counting', 'a heartbeat-less snapshot is treated as a cold start')

// --- session facts: running + waiting on you, and nothing else --------------
/* The strict mask used to invent a 「未命名会话 · 深度求索中」 row for a blank
 * conversation nobody was using. The fix lives in the integration layer (it owns
 * the `useSessions` / `useSessionStatus` pair), so it has to be proven here: a
 * blank idle session produces no row at all, and the mask falls back to its own
 * idle state. */
function findNodes(node, predicate, out = []) {
  if (node === null || node === undefined) return out
  if (Array.isArray(node)) {
    for (const child of node) findNodes(child, predicate, out)
    return out
  }
  if (typeof node !== 'object') return out
  if (predicate(node)) out.push(node)
  for (const child of node.children || []) findNodes(child, predicate, out)
  return out
}
const byClass = (tree, name) => findNodes(tree, (node) => typeof node.props.className === 'string'
  && node.props.className.split(/\s+/).includes(name))
const textOf = (node) => {
  const parts = []
  findNodes(node, () => false)
  const walk = (current) => {
    if (current === null || current === undefined) return
    if (Array.isArray(current)) { current.forEach(walk); return }
    if (typeof current !== 'object') return
    for (const child of current.children || []) {
      if (typeof child === 'string') parts.push(child)
      else walk(child)
    }
  }
  walk(node)
  return parts.join(' ').trim()
}

storage.set('dsh-focus-island:v1:prefs', JSON.stringify({ strictMode: true, expanded: false, locale: 'zh' }))
storage.set('dsh-focus-island:v1:state', JSON.stringify({
  v: 1,
  phase: 'finished',
  durationMinutes: 25,
  elapsedMs: 25 * 60 * 1000,
  watchedMs: 25 * 60 * 1000,
  startedAt: null,
  pausedAt: null,
  finishedAt: Date.now(),
  skipArmed: false,
  /* A heartbeat this fresh means "reload inside the same run", so the finished
   * round is restored rather than dropped as a cold start. */
  pulseAt: Date.now(),
}))

const sessionCtx = createFakeCtx()
plugin.apply(sessionCtx)
const sessionOverlay = sessionCtx._registered.find((entry) => entry.options !== undefined
  && entry.options.name === 'shell.overlay')

/** Render the overlay occupant with a fake session store. */
function renderWith(sessions, statuses) {
  hookCursor = 0
  hookValues.length = 0
  const host = sessionOverlay.component({
    useSessions: (selector) => selector(sessions),
    useSessionStatus: (selector) => selector(statuses),
  })
  hookCursor = 0
  hookValues.length = 0
  return host.type(host.props)
}

const blankOnly = {
  ids: ['s-blank'],
  byId: { 's-blank': { id: 's-blank', title: '', blank: true } },
}
const blankStatus = new Map([['s-blank', { running: false, completionUnread: false }]])
const idleTree = renderWith(blankOnly, blankStatus)
assert.equal(idleTree.props['data-strict'], 'true', 'strict + finished still shows the mask')
const idleRows = byClass(idleTree, 'dfi-maskItem')
assert.equal(idleRows.length, 1, 'a blank idle conversation adds no row of its own')
assert.equal(textOf(byClass(idleTree, 'dfi-maskName')[0]), '空闲中', 'the mask says 空闲中 when nothing is running')
assert.match(textOf(byClass(idleTree, 'dfi-maskUse')[0]), /^已停留 /, 'and carries a stopwatch instead of a run duration')

/* One running session, one session waiting on the user, one blank idle one. */
const mixed = {
  ids: ['s-run', 's-blank', 's-wait'],
  byId: {
    's-run': { id: 's-run', title: '电站复习', running: true, retainedBy: { mainView: 1 } },
    's-blank': { id: 's-blank', title: '', blank: true },
    's-wait': { id: 's-wait', title: '结构实验' },
  },
}
const mixedStatus = new Map([
  ['s-run', { running: true, completionUnread: false }],
  ['s-blank', { running: false, completionUnread: false }],
  ['s-wait', { running: false, pendingInteraction: { key: 'q1', kind: 'question', sessionId: 's-wait' }, completionUnread: false }],
])
const mixedTree = renderWith(mixed, mixedStatus)
const mixedRows = byClass(mixedTree, 'dfi-maskItem')
assert.equal(mixedRows.length, 2, 'the running and the waiting session are listed, the blank one is not')
assert.deepEqual(byClass(mixedTree, 'dfi-maskName').map(textOf), ['电站复习', '结构实验'], 'current first, waiting second')
assert.match(textOf(byClass(mixedTree, 'dfi-maskUse')[0]), /^深度求索中，用时 /, 'the running row reports a run duration')
assert.match(textOf(byClass(mixedTree, 'dfi-maskUse')[1]), /^等待你的回答，已等 /, 'the waiting row reports how long it has waited')
assert.equal(mixedTree.props['data-pending'], 'true', 'the island flag is set while something waits')

/* The wait instants are persisted, so a reload does not restart them at 1 s.
 * `savePrefs()` debounces by 250 ms, hence the wait. */
await sleep(320)
const storedPending = JSON.parse(storage.get('dsh-focus-island:v1:prefs') || '{}')
assert.ok(storedPending.pendingStarts !== undefined, 'the pending edge is remembered across reloads')
assert.ok(storedPending.pendingStarts['s-wait'] > 0, 'it carries the instant the wait began')
for (const factory of sessionCtx._effects) {
  const dispose = factory()
  if (typeof dispose === 'function') dispose()
}
storage.delete('dsh-focus-island:v1:prefs')

// --- disposal --------------------------------------------------------------
for (const factory of ctx._effects) {
  const dispose = factory()
  if (typeof dispose === 'function') dispose()
}

console.log('integration smoke: OK')
console.log('  overlay registrations: 1')
console.log('  rightInset from live layout: 420')
console.log('  typing keeps counting, send resets, disposal clean')


