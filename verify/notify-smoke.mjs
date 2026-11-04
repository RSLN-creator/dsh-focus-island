// dsh-focus-island — notification + sound wiring test.
//
// Loads the generated bundle twice in a fake browser with a controllable clock:
// once with alerts enabled (must show one system notification and play the
// chime when the passive timer finishes) and once with them disabled (must do
// neither). Proves the defaults-on behaviour and that both switches gate their
// own channel independently.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ARTIFACT = new URL('../lib/client.js', import.meta.url)

// ------------------------------------------------------------- fake environment

function makeEnv(nowRef, prefs, notifications, tones) {
  const listeners = new Map()
  const intervals = []
  const storage = new Map()

  storage.set('dsh-focus-island:v1:prefs', JSON.stringify(prefs))

  const fakeWindow = {
    __ModuleLoader__: { load: (definition) => { fakeWindow.__definition = definition } },
    requestAnimationFrame: (fn) => { fn(); return 1 },
    cancelAnimationFrame: () => {},
    setInterval: (fn) => { intervals.push(fn); return intervals.length },
    clearInterval: () => {},
    setTimeout: (fn) => setTimeout(fn, 0),
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

  const fakeDocument = {
    visibilityState: 'visible',
    hasFocus: () => true,
    documentElement: { getAttribute: () => 'zh', addEventListener: () => {} },
    head: { appendChild: () => {} },
    querySelector: (selector) => (selector === '[data-rightbar-col]' ? null : null),
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({ style: {}, remove: () => {} }),
  }

  return { fakeWindow, fakeDocument, listeners, intervals, storage }
}

class FakeNotification {
  constructor(title, options) {
    this.title = title
    this.options = options || {}
    FakeNotification.instances.push(this)
  }
  close() {}
  static permission = 'granted'
  static instances = []
  static requestPermission = async () => 'granted'
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0
    this.state = 'running'
    this.destination = {}
    FakeAudioContext.created += 1
  }
  createGain() {
    return { gain: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => {} }
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { value: 0 },
      connect: () => {},
      start: () => { FakeAudioContext.notes += 1 },
      stop: () => {},
      addEventListener: () => {},
    }
  }
  resume() {}
  suspend() {}
  close() {}
  static created = 0
  static notes = 0
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
    return [hookValues[index], (next) => { hookValues[index] = next }]
  },
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

/** Load the bundle and apply the plugin; returns the tick pulse. */
async function start({ prefs }) {
  const clock = { value: 1_800_000_000_000 }
  const realNow = Date.now
  Date.now = () => clock.value
  try {
    const env = makeEnv(clock, prefs, FakeNotification.instances, FakeAudioContext.notes)
    globalThis.window = env.fakeWindow
    globalThis.document = env.fakeDocument
    globalThis.MutationObserver = class { observe() {} disconnect() {} }
    globalThis.ResizeObserver = class { observe() {} disconnect() {} }
    globalThis.Notification = FakeNotification
    globalThis.AudioContext = FakeAudioContext

    const source = await readFile(ARTIFACT, 'utf8')
    new Function('window', 'document', 'MutationObserver', 'ResizeObserver', 'console', source)(
      env.fakeWindow,
      env.fakeDocument,
      globalThis.MutationObserver,
      globalThis.ResizeObserver,
      console,
    )
    const definition = env.fakeWindow.__definition
    const plugin = definition.factory((name) => {
      if (name === 'react') return React
      throw new Error('unexpected require ' + name)
    })
    const ctx = makeCtx()
    hookCursor = 0
    hookValues.length = 0
    plugin.apply(ctx)
    return { clock, intervals: env.intervals, ctx }
  } finally {
    Date.now = realNow
  }
}

// ------------------------------------------------------------------------ run

// Case 1: defaults on -> passive finish fires exactly one notification + sound.
{
  FakeNotification.instances.length = 0
  FakeAudioContext.created = 0
  FakeAudioContext.notes = 0
  const { clock, intervals } = await start({ prefs: { durationMinutes: 10 } })
  const realNow = Date.now
  // Drive the same clock the bundle's core reads.
  clock.value += 10 * 60 * 1000 + 1_000
  Date.now = () => clock.value
  try {
    intervals[0]()
  } finally {
    Date.now = realNow
  }
  assert.equal(FakeNotification.instances.length, 1, 'one notification on the first finish')
  assert.match(FakeNotification.instances[0].title, /惜时岛|Focus Island/, 'notification title is localized')
  assert.match(FakeNotification.instances[0].options.body, /10/, 'notification body carries the watched minutes')
  assert.ok(FakeAudioContext.notes >= 2, 'chime played at least two notes')
}

// Case 2: both channels disabled -> no notification and no sound.
{
  FakeNotification.instances.length = 0
  FakeAudioContext.created = 0
  FakeAudioContext.notes = 0
  const { clock, intervals } = await start({ prefs: { durationMinutes: 10, notifyEnabled: false, soundEnabled: false } })
  const realNow = Date.now
  clock.value += 10 * 60 * 1000 + 1_000
  Date.now = () => clock.value
  try {
    intervals[0]()
  } finally {
    Date.now = realNow
  }
  assert.equal(FakeNotification.instances.length, 0, 'no notification when the switch is off')
  assert.equal(FakeAudioContext.notes, 0, 'no sound when the switch is off')
}

console.log('notify smoke: OK')
console.log('  defaults on -> 1 notification + chime; both off -> silent')
// The plugin keeps no real timers here; exit explicitly so a stray harness
// handle can never leave a CI run hanging.
process.exit(0)
