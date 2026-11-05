// dsh-focus-island — auto-repeat wiring test.
//
// An ignored finished reminder must start a fresh round after the configured
// wait (default 2 min) so it counts down and reminds again; clicking the
// island while the reminder is up marks it as handled and stops the cycle.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ARTIFACT = new URL('../lib/client.js', import.meta.url)
const STATE_KEY = 'dsh-focus-island:v1:state'

// ------------------------------------------------------------- fake environment

const listeners = new Map()
const intervals = []
const storage = new Map()

const fakeWindow = {
  __ModuleLoader__: { load: (definition) => { fakeWindow.__definition = definition } },
  requestAnimationFrame: (fn) => { fn(); return 1 },
  cancelAnimationFrame: () => {},
  setInterval: (fn) => { intervals.push(fn); return intervals.length },
  clearInterval: () => {},
  setTimeout: (fn) => setTimeout(fn, 0),
  clearTimeout: (id) => clearTimeout(id),
  addEventListener: (type, handler) => {
    if (!listeners.has(type)) listeners.set(type, [])
    listeners.get(type).push(handler)
  },
  removeEventListener: (type, handler) => {
    const list = listeners.get(type)
    if (list === undefined) return
    const index = list.indexOf(handler)
    if (index >= 0) list.splice(index, 1)
  },
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)) },
    removeItem: (key) => { storage.delete(key) },
  },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }),
}

const fakeDocument = {
  visibilityState: 'visible',
  hasFocus: () => true,
  documentElement: { getAttribute: () => 'zh', addEventListener: () => {} },
  head: { appendChild: () => {} },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: (type, handler) => {
    if (!listeners.has(type)) listeners.set(type, [])
    listeners.get(type).push(handler)
  },
  removeEventListener: (type, handler) => {
    const list = listeners.get(type)
    if (list === undefined) return
    const index = list.indexOf(handler)
    if (index >= 0) list.splice(index, 1)
  },
  createElement: () => ({ style: {}, remove: () => {} }),
}

globalThis.window = fakeWindow
globalThis.document = fakeDocument
globalThis.MutationObserver = class { observe() {} disconnect() {} }
globalThis.ResizeObserver = class { observe() {} disconnect() {} }

const React = {
  Fragment: Symbol('fragment'),
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  useMemo: (factory) => factory(),
  useCallback: (callback) => callback,
  memo: (component) => component,
  useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
}

function makeCtx() {
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

storage.set('dsh-focus-island:v1:prefs', JSON.stringify({
  durationMinutes: 10,
  autoRepeatMinutes: 2,
  notifyEnabled: false,
  soundEnabled: false,
}))

const clock = { value: 1_900_000_000_000 }
const realNow = Date.now
Date.now = () => clock.value

function readState() {
  const raw = storage.get(STATE_KEY)
  assert.ok(raw !== undefined, 'state snapshot persisted')
  return JSON.parse(raw)
}

try {
  const source = await readFile(ARTIFACT, 'utf8')
  new Function('window', 'document', 'MutationObserver', 'ResizeObserver', 'console', source)(
    fakeWindow, fakeDocument, globalThis.MutationObserver, globalThis.ResizeObserver, console,
  )
  const plugin = fakeWindow.__definition.factory((name) => {
    if (name === 'react') return React
    throw new Error('unexpected require ' + name)
  })
  plugin.apply(makeCtx())
  assert.ok(intervals.length >= 2, 'tick and persistence pulses registered')
  const tick = intervals[0]
  const save = intervals[1]

  // 1) finish the passive budget
  clock.value += 10 * 60 * 1000 + 1_000
  tick()
  save()
  assert.equal(readState().phase, 'finished', 'passive timer finished')

  // 2) one minute later: still waiting (default wait is 2 minutes)
  clock.value += 60 * 1000
  tick()
  save()
  assert.equal(readState().phase, 'finished', 'still on the reminder before the wait elapses')

  // 3) past the wait: a fresh round starts by itself
  clock.value += 61 * 1000
  tick()
  save()
  let state = readState()
  assert.equal(state.phase, 'counting', 'ignored reminder auto-starts a fresh round')
  assert.ok(state.elapsedMs <= 1_000, 'the fresh round starts from zero')

  // 4) that round finishes and reminds again
  clock.value += 10 * 60 * 1000 + 1_000
  tick()
  save()
  assert.equal(readState().phase, 'finished', 'the auto-started round reminds again')

  // 5) clicking the island while the reminder is up cancels this cycle
  const fakeRoot = { closest: (selector) => (selector === '#dsh-focus-island' ? {} : null) }
  for (const handler of listeners.get('click') ?? []) handler({ target: fakeRoot })
  clock.value += 30 * 60 * 1000
  tick()
  save()
  assert.equal(readState().phase, 'finished', 'an acknowledged reminder does not auto-repeat')
} finally {
  Date.now = realNow
}

console.log('auto-repeat smoke: OK')
console.log('  ignored reminder waits 2 min, restarts a round, reminds again; a click stops the cycle')
process.exit(0)
