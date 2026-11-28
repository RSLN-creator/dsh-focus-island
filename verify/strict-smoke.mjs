// dsh-focus-island — strict-mode wiring test (integration half).
//
// Two rules that only exist below the widget, and that no widget test can prove:
//   1. 严格模式 must disable auto-repeat. Auto-repeat resets `finished` back to
//      `counting`, which would silently lift the full-screen mask — i.e. exactly
//      the "automatic skip" the mode forbids.
//   2. the conversation name comes from `document.title` (the only place the
//      official layout publishes it), and a title in any other shape degrades to
//      "no name" instead of inventing one.
//
// Run: node verify/strict-smoke.mjs

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ARTIFACT = new URL('../lib/client.js', import.meta.url)
const STATE_KEY = 'dsh-focus-island:v1:state'
const PREFS_KEY = 'dsh-focus-island:v1:prefs'

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
  title: 'DeepSeek Harness',
  documentElement: { getAttribute: () => 'zh', addEventListener: () => {} },
  head: { appendChild: () => {} },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: (type, handler) => {
    if (!listeners.has(type)) listeners.set(type, [])
    listeners.get(type).push(handler)
  },
  removeEventListener: () => {},
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

function readState() {
  const raw = storage.get(STATE_KEY)
  assert.ok(raw !== undefined, 'state snapshot persisted')
  return JSON.parse(raw)
}

// ------------------------------------------------------------------------ run

const source = await readFile(ARTIFACT, 'utf8')

function boot(prefs) {
  intervals.length = 0
  storage.clear()
  storage.set(PREFS_KEY, JSON.stringify(prefs))
  new Function('window', 'document', 'MutationObserver', 'ResizeObserver', 'console', source)(
    fakeWindow, fakeDocument, globalThis.MutationObserver, globalThis.ResizeObserver, console,
  )
  const plugin = fakeWindow.__definition.factory((name) => {
    if (name === 'react') return React
    throw new Error('unexpected require ' + name)
  })
  const ctx = makeCtx()
  plugin.apply(ctx)
  return { ctx, tick: intervals[0], save: intervals[1], plugin }
}

const clock = { value: 1_900_000_000_000 }
const realNow = Date.now
Date.now = () => clock.value

try {
  /* 1) strict mode ON: an ignored finished round must stay finished forever.
   *    Auto-repeat would otherwise reset it to `counting` after the wait. */
  const strict = boot({
    durationMinutes: 10,
    autoRepeatMinutes: 2,
    strictMode: true,
    notifyEnabled: false,
    soundEnabled: false,
  })
  clock.value += 9 * 60 * 1000
  strict.tick()
  strict.save()
  clock.value += 2 * 60 * 1000
  strict.tick()
  strict.save()
  assert.equal(readState().phase, 'finished', 'strict mode reaches the finished round')

  /* Well past the 2 minute auto-repeat window, and clicked at nothing: the round
   * must not restart itself, because that would lift the mask. */
  clock.value += 30 * 60 * 1000
  strict.tick()
  strict.save()
  assert.equal(readState().phase, 'finished', 'strict mode never auto-skips the mask')

  /* 2) the mask's sessions and name come from the official session store.
   *
   * `shell.overlay` injects `useSessions` and `useSessionStatus`; the sidebar
   * builds its own rows from exactly this pair (`status.running ?? session.running`),
   * so "running" here means what it means in the app. This asserts the wiring
   * against a real shape rather than trusting a regex on the source. */
  fakeDocument.title = '电场电路期末复习资料整理 — DeepSeek Harness'
  const overlay = strict.ctx._registered.find((entry) => entry.options.name === 'shell.overlay')
  assert.ok(overlay !== undefined, 'the island registered into shell.overlay')

  const sessionList = {
    ids: ['s-a', 's-b', 's-c', 's-d'],
    byId: {
      's-a': { sessionId: 's-a', title: '电场电路期末复习资料整理', running: true, blank: false, retainedBy: { mainView: 1 }, updatedAt: 1 },
      's-b': { sessionId: 's-b', title: '数据结构实验', running: true, blank: false, retainedBy: {}, updatedAt: 2 },
      's-c': { sessionId: 's-c', title: '已经停下的会话', running: false, blank: false, retainedBy: {}, updatedAt: 3 },
      's-d': { sessionId: 's-d', title: '', running: true, blank: true, retainedBy: {}, updatedAt: 4 },
    },
  }
  /* The status map overrides the list's own `running` flag, and s-c is reported
   * stopped there too: a session that merely exists must never appear. */
  const statusMap = new Map([
    ['s-a', { running: true }],
    ['s-b', { running: true }],
    ['s-c', { running: false }],
    ['s-d', { running: true }],
  ])
  /** Snapshot-selector hooks, shaped like the official ones. */
  const makeSnapshotHook = (value) => (selector) => (typeof selector === 'function' ? selector(value) : value)

  const hostTree = overlay.component({
    useSessions: makeSnapshotHook(sessionList),
    useSessionStatus: makeSnapshotHook(statusMap),
  })
  assert.equal(typeof hostTree.type, 'function', 'the overlay renders the widget component')
  const islandTree = hostTree.type(hostTree.props)

  /** Depth-first collect by class name, as the widget tests do. */
  function byClass(tree, className) {
    const found = []
    ;(function walk(node) {
      if (node === null || node === undefined) return
      if (Array.isArray(node)) { node.forEach(walk); return }
      if (typeof node !== 'object') return
      const value = node.props && node.props.className
      if (typeof value === 'string' && value.split(/\s+/).includes(className)) found.push(node)
      ;(node.children || []).forEach(walk)
    })(tree)
    return found
  }

  function textOf(tree) {
    const parts = []
    ;(function walk(node) {
      if (node === null || node === undefined) return
      if (Array.isArray(node)) { node.forEach(walk); return }
      if (typeof node === 'string') { parts.push(node); return }
      if (typeof node !== 'object') return
      if (node.type === 'style') return
      ;(node.children || []).forEach(walk)
    })(tree)
    return parts.join(' ').trim()
  }

  assert.equal(byClass(islandTree, 'dfi-mask').length, 1, 'the finished round is behind the strict mask')

  /* Only the three running sessions are listed; the stopped one is not. The
   * blank one is listed but untitled — it is still doing work. */
  const rows = byClass(islandTree, 'dfi-maskItem')
  assert.equal(rows.length, 3, `only running sessions are listed (got ${rows.length}: ${byClass(islandTree, 'dfi-maskName').map(textOf).join(' / ')})`)
  const names = byClass(islandTree, 'dfi-maskName').map(textOf)
  assert.equal(names[0], '电场电路期末复习资料整理', 'the current conversation is listed first')
  assert.deepEqual(names.slice(1), ['数据结构实验', '未命名会话'], 'the other running sessions follow, blank ones untitled')
  assert.ok(!names.includes('已经停下的会话'), 'a stopped session is not listed')
  assert.equal(rows.filter((node) => node.props['data-current'] === 'true').length, 1, 'exactly one row is current')

  /* No separate title and no "watched N minutes" line: the list IS the content,
   * and each row carries its own run duration in the official wording. */
  assert.equal(byClass(islandTree, 'dfi-maskTitle').length, 0, 'no separate title above the list')
  assert.equal(byClass(islandTree, 'dfi-maskLine').length, 0, 'the middle watched-minutes line is gone')
  const uses = byClass(islandTree, 'dfi-maskUse').map(textOf)
  assert.equal(uses.length, 3, 'each running session row carries its own duration')
  for (const line of uses) {
    assert.ok(/^深度求索中，用时 \d+(分\d+秒|秒) ···$/.test(line), `the duration uses the app's own wording (got "${line}")`)
  }

  /* Both exits share the base class; the second adds `dfi-maskSkipAll`. */
  const exits = byClass(islandTree, 'dfi-maskSkip')
  assert.equal(exits.length, 2, 'two exits: this round, or the whole mode')
  assert.equal(byClass(islandTree, 'dfi-maskSkipAll').length, 1, 'exactly one of them leaves the mode')

  /* A host that does not inject the hooks (an older build, the fake ctx) must
   * still render something usable rather than an empty list. */
  const bareTree = overlay.component({}).type(overlay.component({}).props)
  assert.ok(byClass(bareTree, 'dfi-maskItem').length >= 1, 'without the session hooks the mask still lists one row')

  /* The run durations are measured here, from the `running` edge, because the
   * official status map carries only running/interaction/unread — the app's own
   * "用时" line reads a per-conversation timeline the overlay cannot see.
   *
   * The first render is the moment the edge was observed, so every session is at
   * 1s (the official floor). Advancing the clock must move the numbers, which is
   * what makes this a measurement rather than a constant. */
  const durations = uses.map((line) => line.replace(/^.*用时 /, '').replace(/ ···$/, ''))
  assert.equal(durations.length, 3, 'three durations were rendered')
  assert.ok(durations.every((d) => /^\d+秒$|^\d+分\d+秒$/.test(d)), `durations are formatted (got ${durations.join(' / ')})`)
  clock.value += 19 * 60 * 1000 + 25 * 1000
  const grownHost = overlay.component({
    useSessions: makeSnapshotHook(sessionList),
    useSessionStatus: makeSnapshotHook(statusMap),
  })
  const grownIsland = grownHost.type(grownHost.props)
  const grown = byClass(grownIsland, 'dfi-maskUse').map(textOf)
  assert.ok(grown.every((line) => /19分2\d秒|19分25秒/.test(line)),
    `after 19 minutes the rows report ~19 minutes each (got ${grown.join(' / ')})`)

  /* The window title is no longer read at all: names come from the session
   * store, so a foreign title cannot leak in as a name. */
  fakeDocument.title = '一点别的标题 — 某个别的应用'
  const otherHost = overlay.component({
    useSessions: makeSnapshotHook(sessionList),
    useSessionStatus: makeSnapshotHook(statusMap),
  })
  const otherIsland = otherHost.type(otherHost.props)
  const otherNames = byClass(otherIsland, 'dfi-maskName').map(textOf)
  assert.deepEqual(otherNames, names, 'a foreign window title does not change the session names')

  for (const factory of strict.ctx._effects) {
    const dispose = factory()
    if (typeof dispose === 'function') dispose()
  }

  /* 3) strict mode OFF: the same scenario still auto-repeats (this is the
   *    regression guard — the suppression must be conditional, not a deletion). */
  const loose = boot({
    durationMinutes: 10,
    autoRepeatMinutes: 2,
    strictMode: false,
    notifyEnabled: false,
    soundEnabled: false,
  })
  clock.value += 9 * 60 * 1000
  loose.tick()
  loose.save()
  clock.value += 2 * 60 * 1000
  loose.tick()
  loose.save()
  assert.equal(readState().phase, 'finished', 'the non-strict round finishes')
  clock.value += 2 * 60 * 1000 + 1000
  loose.tick()
  loose.save()
  assert.equal(readState().phase, 'counting', 'without strict mode the reminder still auto-repeats')

  for (const factory of loose.ctx._effects) {
    const dispose = factory()
    if (typeof dispose === 'function') dispose()
  }
} finally {
  Date.now = realNow
}

console.log('strict smoke: OK')
console.log('  strict mode suppresses auto-repeat (the mask is never lifted by a timer)')
console.log('  non-strict mode still auto-repeats: the suppression is conditional')
process.exit(0)
