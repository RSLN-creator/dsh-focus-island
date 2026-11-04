// dsh-focus-island — tests for lib/core.js (plain node, no dependencies).
//
// Run: node verify/core.test.mjs
//
// Every test uses an injected fake clock, so the state machine is fully
// deterministic; no timers, no DOM, no host APIs are involved.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as moduleNamespace from '../lib/core.js'
import {
  PHASE,
  DURATION_MIN_MINUTES,
  DURATION_MAX_MINUTES,
  DEFAULT_DURATION_MINUTES,
  clampDurationMinutes,
  createFocusCore,
} from '../lib/core.js'

const MIN = 60 * 1000
const T0 = 1_000_000
const PHASES = [PHASE.IDLE, PHASE.COUNTING, PHASE.PAUSED, PHASE.FINISHED, PHASE.SKIPPED]

const tests = []
function test(name, fn) {
  tests.push({ name, fn })
}

/** Build a core plus a fake clock. `tick()` passes the clock's current time. */
function harness(options = {}) {
  const state = { t: options.start === undefined ? T0 : options.start }
  const now = () => state.t
  const core = createFocusCore({
    now,
    durationMinutes: options.durationMinutes,
    onChange: options.onChange,
  })
  return {
    core,
    state,
    now,
    advance(ms) {
      state.t += ms
      return state.t
    },
    set(ms) {
      state.t = ms
      return state.t
    },
    tick(nowMs) {
      return nowMs === undefined ? core.tick(state.t) : core.tick(nowMs)
    },
  }
}

// ---------------------------------------------------------------------------
// Contract surface
// ---------------------------------------------------------------------------

test('exports: required names are present and nothing else leaks', () => {
  assert.deepEqual(
    Object.keys(moduleNamespace).sort(),
    [
      'PHASE',
      'DEFAULT_DURATION_MINUTES',
      'DURATION_MAX_MINUTES',
      'DURATION_MIN_MINUTES',
      'clampDurationMinutes',
      'createFocusCore',
    ].sort(),
  )
  assert.deepEqual([...PHASES].sort(), ['counting', 'finished', 'idle', 'paused', 'skipped'])
  assert.equal(DURATION_MIN_MINUTES, 10)
  assert.equal(DURATION_MAX_MINUTES, 240)
  assert.equal(DEFAULT_DURATION_MINUTES, 25)
})

test('createFocusCore exposes the exact API', () => {
  const core = createFocusCore({ now: () => T0 })
  for (const name of [
    'getState',
    'subscribe',
    'tick',
    'setPresence',
    'onUserSend',
    'setDurationMinutes',
    'start',
    'pause',
    'reset',
    'skipArm',
    'skipConfirm',
    'skipCancel',
    'snapshot',
    'restore',
    'destroy',
  ]) {
    assert.equal(typeof core[name], 'function', `missing method ${name}`)
  }
})

// ---------------------------------------------------------------------------
// Clamping and configuration
// ---------------------------------------------------------------------------

test('clampDurationMinutes: defaults, strings, rounding, bounds', () => {
  assert.equal(clampDurationMinutes(undefined), 25)
  assert.equal(clampDurationMinutes(null), 25)
  assert.equal(clampDurationMinutes(NaN), 25)
  assert.equal(clampDurationMinutes(Infinity), 25)
  assert.equal(clampDurationMinutes(-Infinity), 25)
  assert.equal(clampDurationMinutes('nope'), 25)
  assert.equal(clampDurationMinutes(''), 25)
  assert.equal(clampDurationMinutes('   '), 25)
  assert.equal(clampDurationMinutes({}), 25)
  assert.equal(clampDurationMinutes([]), 25)
  assert.equal(clampDurationMinutes(5), 10)
  assert.equal(clampDurationMinutes(0), 10)
  assert.equal(clampDurationMinutes(-30), 10)
  assert.equal(clampDurationMinutes(10), 10)
  assert.equal(clampDurationMinutes(240), 240)
  assert.equal(clampDurationMinutes(999), 240)
  assert.equal(clampDurationMinutes(1e9), 240)
  assert.equal(clampDurationMinutes(25.4), 25)
  assert.equal(clampDurationMinutes(25.5), 26)
  assert.equal(clampDurationMinutes('45'), 45)
  assert.equal(clampDurationMinutes(' 90 '), 90)
  assert.equal(clampDurationMinutes(true), 10)
  assert.equal(clampDurationMinutes(false), 10)
})

test('initial state is idle, empty and well-formed', () => {
  const h = harness()
  const s = h.core.getState()
  assert.equal(s.phase, PHASE.IDLE)
  assert.equal(s.durationMinutes, 25)
  assert.equal(s.durationMs, 25 * MIN)
  assert.equal(s.elapsedMs, 0)
  assert.equal(s.watchedMs, 0)
  assert.equal(s.remainingMs, 25 * MIN)
  assert.equal(s.progress, 0)
  assert.equal(s.startedAt, null)
  assert.equal(s.pausedAt, null)
  assert.equal(s.finishedAt, null)
  assert.equal(s.modelBusy, false)
  assert.equal(s.draftEmpty, true)
  assert.equal(s.typing, false)
  assert.equal(s.visible, true)
  assert.equal(s.sending, false)
  assert.equal(s.skipArmed, false)
  assert.equal(s.pauseReason, null)
  assert.ok(Object.isFrozen(s), 'state must be frozen')
  assert.equal(Object.getPrototypeOf(s), Object.prototype)
  assert.throws(() => {
    s.phase = 'tampered'
  }, TypeError)
})

test('createFocusCore applies, clamps and defaults the duration option', () => {
  assert.equal(createFocusCore({ now: () => T0 }).getState().durationMinutes, 25)
  assert.equal(createFocusCore({ now: () => T0, durationMinutes: 45 }).getState().durationMinutes, 45)
  assert.equal(createFocusCore({ now: () => T0, durationMinutes: 3 }).getState().durationMinutes, 10)
  assert.equal(createFocusCore({ now: () => T0, durationMinutes: 999 }).getState().durationMinutes, 240)
  assert.equal(createFocusCore().getState().durationMinutes, 25)
})

// ---------------------------------------------------------------------------
// Counting math
// ---------------------------------------------------------------------------

test('first tick auto-starts counting from the creation timestamp', () => {
  const h = harness()
  const s = h.tick()
  assert.equal(s.phase, PHASE.COUNTING)
  assert.equal(s.elapsedMs, 0)
  assert.equal(s.startedAt, T0)
  assert.equal(s.remainingMs, 25 * MIN)
})

test('counting across ticks uses timestamps (no drift)', () => {
  const h = harness()
  h.tick()
  h.advance(1500)
  assert.equal(h.tick().elapsedMs, 1500)
  h.advance(2500)
  const s = h.tick()
  assert.equal(s.elapsedMs, 4000)
  assert.equal(s.watchedMs, 4000)
  assert.equal(s.remainingMs, 25 * MIN - 4000)
  assert.ok(Math.abs(s.progress - 4000 / (25 * MIN)) < 1e-12)
})

test('three ticks inside one second do not double count', () => {
  const h = harness()
  h.tick()
  h.advance(100)
  h.tick()
  h.advance(100)
  h.tick()
  h.advance(100)
  h.tick()
  const s = h.core.getState()
  assert.equal(s.elapsedMs, 300)
  assert.equal(s.watchedMs, 300)
})

test('repeated ticks at the same instant are idempotent', () => {
  const h = harness()
  h.tick()
  h.advance(1000)
  const first = h.tick()
  const second = h.tick()
  assert.equal(first.elapsedMs, 1000)
  assert.equal(second.elapsedMs, 1000)
  assert.equal(second.watchedMs, 1000)
})

test('tick(nowMs) accepts an explicit timestamp', () => {
  const h = harness()
  h.tick()
  let s = h.tick(h.state.t + 5000)
  assert.equal(s.elapsedMs, 5000)
  s = h.tick(h.state.t + 5000)
  assert.equal(s.elapsedMs, 5000)
})

test('progress and remaining are consistent', () => {
  const h = harness({ durationMinutes: 20 })
  h.tick()
  h.advance(5 * MIN)
  const s = h.tick()
  assert.equal(s.elapsedMs, 5 * MIN)
  assert.equal(s.remainingMs, 15 * MIN)
  assert.equal(s.progress, 0.25)
})

// ---------------------------------------------------------------------------
// Pause / resume
// ---------------------------------------------------------------------------

test('typing pauses without resetting; clearing resumes from the frozen value', () => {
  const h = harness()
  h.tick()
  h.advance(10 * MIN)
  h.tick()
  const paused = h.core.setPresence({ typing: true })
  assert.equal(paused.phase, PHASE.PAUSED)
  assert.equal(paused.pauseReason, 'typing')
  assert.equal(paused.elapsedMs, 10 * MIN)
  assert.equal(paused.watchedMs, 10 * MIN)
  assert.equal(paused.startedAt, null)
  assert.equal(paused.pausedAt, h.state.t)

  h.advance(30 * MIN)
  const still = h.tick()
  assert.equal(still.phase, PHASE.PAUSED)
  assert.equal(still.elapsedMs, 10 * MIN, 'elapsed must stay frozen while typing')

  const resumed = h.core.setPresence({ typing: false })
  assert.equal(resumed.phase, PHASE.COUNTING)
  assert.equal(resumed.elapsedMs, 10 * MIN)
  assert.equal(resumed.startedAt, h.state.t)

  h.advance(5 * MIN)
  assert.equal(h.tick().elapsedMs, 15 * MIN)
})

test('a non-empty draft pauses with reason draft', () => {
  const h = harness()
  h.tick()
  h.advance(MIN)
  h.tick()
  const paused = h.core.setPresence({ draftEmpty: false })
  assert.equal(paused.phase, PHASE.PAUSED)
  assert.equal(paused.pauseReason, 'draft')
  assert.equal(paused.elapsedMs, MIN)
  h.advance(3 * MIN)
  assert.equal(h.tick().elapsedMs, MIN)
  h.core.setPresence({ draftEmpty: true })
  h.advance(MIN)
  assert.equal(h.tick().elapsedMs, 2 * MIN)
})

test('typing has priority over the draft reason', () => {
  const h = harness()
  h.tick()
  h.advance(MIN)
  h.tick()
  const s = h.core.setPresence({ typing: true, draftEmpty: false })
  assert.equal(s.pauseReason, 'typing')
})

test('hidden pauses with reason hidden and resumes when visible', () => {
  const h = harness()
  h.tick()
  h.advance(2 * MIN)
  h.tick()
  const hidden = h.core.setPresence({ visible: false })
  assert.equal(hidden.phase, PHASE.PAUSED)
  assert.equal(hidden.pauseReason, 'hidden')
  assert.equal(hidden.elapsedMs, 2 * MIN)

  h.advance(60 * MIN)
  assert.equal(h.tick().elapsedMs, 2 * MIN, 'hidden time must not be counted')

  const visible = h.core.setPresence({ visible: true })
  assert.equal(visible.phase, PHASE.COUNTING)
  assert.equal(visible.elapsedMs, 2 * MIN)
  h.advance(MIN)
  assert.equal(h.tick().elapsedMs, 3 * MIN)
})

test('hidden wins over a simultaneous typing state', () => {
  const h = harness()
  h.tick()
  h.advance(MIN)
  h.tick()
  const s = h.core.setPresence({ visible: false, typing: true })
  assert.equal(s.phase, PHASE.PAUSED)
  assert.equal(s.pauseReason, 'hidden')
})

test('modelBusy never pauses the countdown', () => {
  const h = harness()
  h.tick()
  h.advance(MIN)
  h.tick()
  const busy = h.core.setPresence({ modelBusy: true })
  assert.equal(busy.phase, PHASE.COUNTING)
  assert.equal(busy.modelBusy, true)
  h.advance(MIN)
  assert.equal(h.tick().elapsedMs, 2 * MIN)
})

test('pause(reason) is coherent with presence and start() resumes a manual pause', () => {
  const h = harness()
  h.tick()
  h.advance(2 * MIN)
  h.tick()

  const hidden = h.core.pause('hidden')
  assert.equal(hidden.phase, PHASE.PAUSED)
  assert.equal(hidden.pauseReason, 'hidden')
  assert.equal(hidden.visible, false)
  h.advance(5 * MIN)
  assert.equal(h.tick().elapsedMs, 2 * MIN)
  assert.equal(h.core.setPresence({ visible: true }).phase, PHASE.COUNTING)
  h.advance(MIN)
  assert.equal(h.tick().elapsedMs, 3 * MIN)

  const manual = h.core.pause()
  assert.equal(manual.phase, PHASE.PAUSED)
  assert.equal(manual.pauseReason, null)
  h.advance(10 * MIN)
  assert.equal(h.tick().elapsedMs, 3 * MIN, 'manual pause must not auto-resume')
  const started = h.core.start()
  assert.equal(started.phase, PHASE.COUNTING)
  assert.equal(started.elapsedMs, 3 * MIN)
  h.advance(MIN)
  assert.equal(h.tick().elapsedMs, 4 * MIN)
})

// ---------------------------------------------------------------------------
// Send reset
// ---------------------------------------------------------------------------

test('onUserSend hard-resets a counting countdown', () => {
  const h = harness()
  h.tick()
  h.advance(5 * MIN)
  h.tick()
  h.core.skipArm()
  assert.equal(h.core.getState().skipArmed, true)

  const reset = h.core.onUserSend()
  assert.equal(reset.phase, PHASE.COUNTING)
  assert.equal(reset.elapsedMs, 0)
  assert.equal(reset.watchedMs, 0)
  assert.equal(reset.finishedAt, null)
  assert.equal(reset.skipArmed, false)
  assert.equal(reset.startedAt, h.state.t)

  h.advance(MIN)
  assert.equal(h.tick().elapsedMs, MIN)
})

test('onUserSend resets a finished countdown', () => {
  const h = harness({ durationMinutes: 10 })
  h.tick()
  h.advance(10 * MIN)
  assert.equal(h.tick().phase, PHASE.FINISHED)
  const reset = h.core.onUserSend()
  assert.equal(reset.phase, PHASE.COUNTING)
  assert.equal(reset.elapsedMs, 0)
  assert.equal(reset.watchedMs, 0)
  assert.equal(reset.finishedAt, null)
  h.advance(MIN)
  assert.equal(h.tick().elapsedMs, MIN)
})

test('onUserSend resets a skipped countdown and re-arms skipping', () => {
  const h = harness({ durationMinutes: 10 })
  h.tick()
  h.advance(3 * MIN)
  h.tick()
  h.core.skipArm()
  assert.equal(h.core.skipConfirm().phase, PHASE.SKIPPED)

  const reset = h.core.onUserSend()
  assert.equal(reset.phase, PHASE.COUNTING)
  assert.equal(reset.elapsedMs, 0)
  assert.equal(reset.skipArmed, false)
  h.advance(4 * MIN)
  h.tick()
  h.core.skipArm()
  assert.equal(h.core.getState().skipArmed, true, 'skip must re-arm after a send')
  assert.equal(h.core.skipConfirm().phase, PHASE.SKIPPED)
})

test('sending presence is treated as a send and pauses until cleared', () => {
  const h = harness()
  h.tick()
  h.advance(3 * MIN)
  h.tick()
  const sending = h.core.setPresence({ sending: true })
  assert.equal(sending.phase, PHASE.PAUSED)
  assert.equal(sending.pauseReason, 'sending')
  assert.equal(sending.elapsedMs, 0, 'sending implies a hard reset')
  h.advance(2 * MIN)
  assert.equal(h.tick().elapsedMs, 0)
  const cleared = h.core.setPresence({ sending: false })
  assert.equal(cleared.phase, PHASE.COUNTING)
  h.advance(MIN)
  assert.equal(h.tick().elapsedMs, MIN)
})

test('reset() restarts counting at zero', () => {
  const h = harness({ durationMinutes: 10 })
  h.tick()
  h.advance(10 * MIN)
  h.tick()
  assert.equal(h.core.getState().phase, PHASE.FINISHED)
  const s = h.core.reset()
  assert.equal(s.phase, PHASE.COUNTING)
  assert.equal(s.elapsedMs, 0)
  assert.equal(s.finishedAt, null)
})

// ---------------------------------------------------------------------------
// Finish
// ---------------------------------------------------------------------------

test('finishes exactly at the configured duration', () => {
  const h = harness()
  h.tick()
  h.advance(25 * MIN - 1)
  assert.equal(h.tick().phase, PHASE.COUNTING)

  h.advance(1)
  const s = h.tick()
  assert.equal(s.phase, PHASE.FINISHED)
  assert.equal(s.elapsedMs, 25 * MIN)
  assert.equal(s.watchedMs, 25 * MIN)
  assert.equal(s.remainingMs, 0)
  assert.equal(s.progress, 1)
  assert.equal(s.finishedAt, T0 + 25 * MIN)

  h.advance(10 * MIN)
  const later = h.tick()
  assert.equal(later.phase, PHASE.FINISHED)
  assert.equal(later.finishedAt, T0 + 25 * MIN, 'finish timestamp must not drift')
  assert.equal(later.watchedMs, 25 * MIN)
})

test('a long jump (47 min) finishes instead of accumulating drift', () => {
  const h = harness()
  h.tick()
  h.advance(47 * MIN)
  const s = h.tick()
  assert.equal(s.phase, PHASE.FINISHED)
  assert.equal(s.elapsedMs, 25 * MIN)
  assert.equal(s.watchedMs, 47 * MIN)
  assert.equal(s.remainingMs, 0)
  assert.equal(s.progress, 1)
  assert.equal(s.finishedAt, T0 + 25 * MIN)
})

test('a user send interrupts a finished countdown immediately', () => {
  const h = harness({ durationMinutes: 10 })
  h.tick()
  h.advance(30 * MIN)
  assert.equal(h.tick().phase, PHASE.FINISHED)
  const s = h.core.onUserSend()
  assert.equal(s.phase, PHASE.COUNTING)
  assert.equal(s.elapsedMs, 0)
})

// ---------------------------------------------------------------------------
// Skip two-step
// ---------------------------------------------------------------------------

test('skip requires arm then confirm; confirm without arm is a no-op', () => {
  const h = harness({ durationMinutes: 10 })
  h.tick()
  h.advance(2 * MIN)
  h.tick()

  const unarmed = h.core.skipConfirm()
  assert.equal(unarmed.phase, PHASE.COUNTING, 'confirm without arm must not skip')
  assert.equal(unarmed.skipArmed, false)
  assert.equal(unarmed.elapsedMs, 2 * MIN)

  h.advance(30 * 1000)
  h.tick()
  const armed = h.core.skipArm()
  assert.equal(armed.skipArmed, true)
  assert.equal(armed.phase, PHASE.COUNTING)

  const armedState = h.core.getState()
  assert.equal(armedState.elapsedMs, 2 * MIN + 30 * 1000)

  const skipped = h.core.skipConfirm()
  assert.equal(skipped.phase, PHASE.SKIPPED)
  assert.equal(skipped.skipArmed, false)
  const frozen = skipped.elapsedMs
  assert.equal(frozen, 2 * MIN + 30 * 1000)

  h.advance(10 * MIN)
  const later = h.tick()
  assert.equal(later.phase, PHASE.SKIPPED, 'skipped must stay skipped')
  assert.equal(later.elapsedMs, frozen)

  const rearm = h.core.skipArm()
  assert.equal(rearm.skipArmed, false, 'skip must not re-arm until the next send')
  assert.equal(h.core.skipConfirm().phase, PHASE.SKIPPED)
})

test('skipCancel drops the confirmation and counting continues', () => {
  const h = harness({ durationMinutes: 10 })
  h.tick()
  h.advance(2 * MIN)
  h.tick()
  h.core.skipArm()
  const cancelled = h.core.skipCancel()
  assert.equal(cancelled.skipArmed, false)
  assert.equal(cancelled.phase, PHASE.COUNTING)
  h.advance(MIN)
  assert.equal(h.tick().elapsedMs, 3 * MIN)

  const noop = h.core.skipCancel()
  assert.equal(noop.skipArmed, false)
  assert.equal(noop.phase, PHASE.COUNTING)
})

// ---------------------------------------------------------------------------
// Duration changes
// ---------------------------------------------------------------------------

test('setDurationMinutes clamps and persists', () => {
  const h = harness()
  assert.equal(h.core.setDurationMinutes(999).durationMinutes, 240)
  assert.equal(h.core.getState().durationMs, 240 * MIN)
  assert.equal(h.core.setDurationMinutes(1).durationMinutes, 10)
  assert.equal(h.core.setDurationMinutes('45').durationMinutes, 45)
  assert.equal(h.core.setDurationMinutes(NaN).durationMinutes, 25)
  assert.equal(h.core.setDurationMinutes(undefined).durationMinutes, 25)
  assert.equal(h.core.setDurationMinutes('nope').durationMinutes, 25)
})

test('lowering the duration below elapsed finishes immediately', () => {
  const h = harness({ durationMinutes: 60 })
  h.tick()
  h.advance(30 * MIN)
  h.tick()
  const s = h.core.setDurationMinutes(10)
  assert.equal(s.phase, PHASE.FINISHED)
  assert.equal(s.elapsedMs, 10 * MIN)
  assert.equal(s.remainingMs, 0)
  assert.equal(s.finishedAt, T0 + 10 * MIN)
})

test('raising the duration while counting keeps counting', () => {
  const h = harness({ durationMinutes: 10 })
  h.tick()
  h.advance(5 * MIN)
  h.tick()
  const s = h.core.setDurationMinutes(20)
  assert.equal(s.phase, PHASE.COUNTING)
  assert.equal(s.elapsedMs, 5 * MIN)
  assert.equal(s.remainingMs, 15 * MIN)
  assert.equal(s.progress, 0.25)
})

test('duration changes are reported through onChange', () => {
  const changes = []
  const h = harness({ durationMinutes: 10, onChange: (s) => changes.push(s) })
  h.tick()
  assert.equal(changes.length, 1, 'idle -> counting is a phase change')
  h.core.setDurationMinutes(30)
  assert.equal(changes.length, 2, 'duration change must be reported')
  assert.equal(changes[1].durationMinutes, 30)
})

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

test('snapshot() is a plain JSON-serializable envelope', () => {
  const h = harness({ durationMinutes: 45 })
  h.tick()
  h.advance(10 * MIN)
  h.tick()
  h.core.skipArm()
  h.core.setPresence({ typing: true })
  const snap = h.core.snapshot()
  assert.equal(snap.v, 1)
  assert.equal(snap.phase, PHASE.PAUSED)
  assert.equal(snap.durationMinutes, 45)
  assert.equal(snap.elapsedMs, 10 * MIN)
  assert.equal(snap.watchedMs, 10 * MIN)
  assert.equal(snap.skipArmed, true)
  assert.doesNotThrow(() => JSON.stringify(snap))
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap)
})

test('paused snapshot round-trips through JSON into a fresh core', () => {
  const a = harness({ durationMinutes: 45, start: 5_000_000 })
  a.tick()
  a.advance(10 * MIN)
  a.tick()
  a.core.skipArm()
  a.core.setPresence({ typing: true })
  const snap = a.core.snapshot()

  const b = harness({ start: 9_000_000 })
  b.core.restore(JSON.parse(JSON.stringify(snap)))
  const s = b.core.getState()
  assert.equal(s.phase, PHASE.PAUSED)
  assert.equal(s.durationMinutes, 45)
  assert.equal(s.elapsedMs, 10 * MIN)
  assert.equal(s.remainingMs, 35 * MIN)
  assert.equal(s.skipArmed, true)
  assert.deepEqual(b.core.snapshot(), snap)

  b.advance(MIN)
  const resumed = b.core.setPresence({ typing: false })
  assert.equal(resumed.phase, PHASE.COUNTING)
  assert.equal(resumed.elapsedMs, 10 * MIN)
  b.advance(MIN)
  assert.equal(b.tick().elapsedMs, 11 * MIN)
})

test('counting snapshot resumes counting and keeps its elapsed time', () => {
  const a = harness({ durationMinutes: 45 })
  a.tick()
  a.advance(3 * MIN)
  a.tick()
  const snap = a.core.snapshot()

  const b = harness({ start: 7_000_000 })
  b.core.restore(snap)
  let s = b.core.getState()
  assert.equal(s.phase, PHASE.COUNTING)
  assert.equal(s.elapsedMs, 3 * MIN)
  assert.equal(s.startedAt, b.state.t)
  b.advance(MIN)
  s = b.tick()
  assert.equal(s.elapsedMs, 4 * MIN)
})

test('finished snapshot restores as finished and sanitizes watched time', () => {
  const h = harness()
  h.core.restore({ v: 1, phase: 'finished', watchedMs: 99 * MIN, finishedAt: 'garbage' })
  const s = h.core.getState()
  assert.equal(s.phase, PHASE.FINISHED)
  assert.equal(s.elapsedMs, 25 * MIN)
  assert.equal(s.watchedMs, 99 * MIN)
  assert.equal(s.remainingMs, 0)
  assert.equal(s.finishedAt, T0, 'unusable finishedAt falls back to now')

  h.core.restore({ v: 1, phase: 'finished', watchedMs: null })
  assert.equal(h.core.getState().watchedMs, 25 * MIN)
})

test('restore tolerates garbage and rejects foreign versions', () => {
  const h = harness()
  h.tick()
  h.advance(MIN)
  h.tick()
  const before = h.core.getState()

  for (const bad of [null, undefined, 42, 'nope', [], {}, { v: 2, phase: 'finished' }, { v: '1' }]) {
    assert.doesNotThrow(() => h.core.restore(bad))
  }
  const after = h.core.getState()
  assert.equal(after.phase, before.phase)
  assert.equal(after.elapsedMs, before.elapsedMs)
  assert.equal(after.durationMinutes, before.durationMinutes)

  h.core.restore({
    v: 1,
    phase: 'counting',
    durationMinutes: 999,
    elapsedMs: 120_000,
    watchedMs: 'garbage',
  })
  const clamped = h.core.getState()
  assert.equal(clamped.phase, PHASE.COUNTING)
  assert.equal(clamped.durationMinutes, 240)
  assert.equal(clamped.elapsedMs, 120_000)

  h.core.restore({ v: 1, phase: 'paused', elapsedMs: -5000, watchedMs: NaN, durationMinutes: 'nope' })
  const sanitized = h.core.getState()
  assert.equal(sanitized.phase, PHASE.PAUSED)
  assert.equal(sanitized.durationMinutes, 25)
  assert.equal(sanitized.elapsedMs, 0)
  assert.equal(sanitized.watchedMs, 0)

  h.core.restore({ v: 1, phase: 'bogus', elapsedMs: 5_000_000 })
  assert.equal(h.core.getState().phase, PHASE.IDLE)
  assert.equal(h.core.getState().elapsedMs, 0)
})

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

test('subscribe notifies on meaningful changes and coalesces elapsed to 1 s', () => {
  const h = harness({ durationMinutes: 10 })
  const seen = []
  const off = h.core.subscribe((s) => seen.push(s))
  h.tick()
  assert.equal(seen.length, 1, 'idle -> counting must notify')
  assert.equal(seen[0].phase, PHASE.COUNTING)

  h.tick()
  assert.equal(seen.length, 1, 'a tick with no elapsed change must not notify')

  h.advance(500)
  h.tick()
  assert.equal(seen.length, 1, 'sub-second updates are coalesced')

  h.advance(500)
  h.tick()
  assert.equal(seen.length, 2, 'one update per watched second')
  assert.equal(seen[1].elapsedMs, 1000)

  h.core.setPresence({ typing: true })
  assert.equal(seen.length, 3, 'a phase change must notify immediately')
  assert.equal(seen[2].phase, PHASE.PAUSED)

  off()
  off()
  h.advance(10_000)
  h.tick()
  h.core.setPresence({ typing: false })
  assert.equal(seen.length, 3, 'unsubscribe must stop notifications')
})

test('destroy drops subscribers and is idempotent', () => {
  const h = harness()
  let calls = 0
  h.core.subscribe(() => {
    calls += 1
  })
  h.tick()
  assert.equal(calls, 1)
  h.core.destroy()
  h.core.destroy()
  h.advance(MIN)
  h.tick()
  assert.equal(calls, 1)
  assert.equal(typeof h.core.subscribe(() => {}), 'function')
})

// ---------------------------------------------------------------------------
// Robustness / hygiene
// ---------------------------------------------------------------------------

test('invalid input never throws', () => {
  const h = harness()
  assert.doesNotThrow(() => h.core.setPresence(null))
  assert.doesNotThrow(() => h.core.setPresence(42))
  assert.doesNotThrow(() => h.core.setPresence({ visible: 'yes', typing: 0, draftEmpty: null }))
  assert.doesNotThrow(() => h.core.setDurationMinutes(undefined))
  assert.doesNotThrow(() => h.core.setDurationMinutes('abc'))
  assert.doesNotThrow(() => h.core.tick(NaN))
  assert.doesNotThrow(() => h.core.tick('123'))
  assert.doesNotThrow(() => h.core.pause(42))
  assert.doesNotThrow(() => h.core.pause({}))
  assert.doesNotThrow(() => h.core.start())
  assert.doesNotThrow(() => h.core.restore(Symbol('nope')))
  assert.deepEqual([...PHASES].includes(h.core.getState().phase), true)
})

test('the module contains no DOM or host-API references', () => {
  const source = readFileSync(new URL('../lib/core.js', import.meta.url), 'utf8')
  for (const forbidden of [
    'window',
    'document',
    'localStorage',
    'sessionStorage',
    'navigator',
    'globalThis',
    'setInterval',
    'setTimeout',
    'requestAnimationFrame',
    'fetch',
  ]) {
    const pattern = new RegExp(`\\b${forbidden}\\b`)
    assert.equal(pattern.test(source), false, `lib/core.js must not reference ${forbidden}`)
  }
})

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

let failed = 0
for (const item of tests) {
  try {
    item.fn()
    console.log(`ok   ${item.name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${item.name}`)
    console.error(error && error.stack ? error.stack : String(error))
  }
}

console.log('')
if (failed === 0) {
  console.log(`PASS ${tests.length} tests`)
  process.exit(0)
} else {
  console.error(`FAILED ${failed} of ${tests.length} tests`)
  process.exit(1)
}
