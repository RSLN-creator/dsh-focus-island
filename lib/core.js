/**
 * dsh-focus-island — focus state machine (pure logic, no rendering, no host APIs).
 *
 * The island counts the time the user spends *passively watching* the assistant:
 * the page is visible and focused, the composer draft is empty, the user is not
 * typing and not sending. Sending a message hard-resets the countdown, typing or
 * leaving the page pauses it without losing the counted time, reaching the
 * configured budget finishes it, and skipping requires two steps (arm, then
 * confirm) and stays skipped until the next send.
 *
 * All timing is derived from timestamps — `base + (now - segmentStart)` — so a
 * throttled background tab cannot make the clock drift. The clock is injected
 * (`options.now`) so tests are deterministic. Persistence, DOM observation and
 * rendering belong to the integration layer; this module only exposes
 * `snapshot()` and `restore()`.
 */

/** The five phases of the countdown. */
export const PHASE = Object.freeze({
  IDLE: 'idle',
  COUNTING: 'counting',
  PAUSED: 'paused',
  FINISHED: 'finished',
  SKIPPED: 'skipped',
})

/** Smallest configurable budget in minutes (10 minutes). */
export const DURATION_MIN_MINUTES = 10

/** Largest configurable budget in minutes (4 hours). */
export const DURATION_MAX_MINUTES = 240

/** Budget used when the caller supplies nothing usable. */
export const DEFAULT_DURATION_MINUTES = 25

const focusMsPerMinute = 60000
const focusMaxMs = 9007199254740991
const focusPresenceKeys = ['visible', 'typing', 'draftEmpty', 'sending', 'modelBusy']
const focusPauseReasons = ['typing', 'draft', 'hidden', 'sending']

/** True for plain-ish records (objects that are not arrays). */
function focusIsRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Coerce numbers/strings to a finite number; anything else becomes null. */
function focusNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** Coerce a duration/elapsed value to a non-negative finite millisecond count. */
function focusMillis(value) {
  const parsed = focusNumber(value)
  if (parsed === null) return null
  if (parsed <= 0) return 0
  return parsed > focusMaxMs ? focusMaxMs : parsed
}

/**
 * Clamp a duration to a whole number of minutes in [10, 240].
 *
 * Non-finite, null, blank or non-numeric input falls back to the 25 minute
 * default; negative and too-small values clamp to 10, too-large to 240.
 *
 * @param {unknown} value Candidate duration in minutes.
 * @returns {number} Integer minutes in [DURATION_MIN_MINUTES, DURATION_MAX_MINUTES].
 */
export function clampDurationMinutes(value) {
  const parsed = focusNumber(typeof value === 'boolean' ? (value ? 1 : 0) : value)
  if (parsed === null) return DEFAULT_DURATION_MINUTES
  const rounded = Math.round(parsed)
  if (!Number.isFinite(rounded)) return DEFAULT_DURATION_MINUTES
  if (rounded < DURATION_MIN_MINUTES) return DURATION_MIN_MINUTES
  if (rounded > DURATION_MAX_MINUTES) return DURATION_MAX_MINUTES
  return rounded
}

/**
 * Create one focus core.
 *
 * @param {object} [options]
 * @param {() => number} [options.now] Injected millisecond clock (defaults to `Date.now`).
 * @param {number} [options.durationMinutes] Initial budget in minutes; clamped.
 * @param {(state: object) => void} [options.onChange] Called for structural changes
 *   (phase, duration, skip arming, presence, pause metadata) — not for the
 *   every-second elapsed updates that `subscribe` reports.
 * @returns {object} The core API; every method is safe to call with bad input.
 */
export function createFocusCore(options) {
  const config = focusIsRecord(options) ? options : {}
  const clock = typeof config.now === 'function' ? config.now : () => Date.now()
  let changeHandler = typeof config.onChange === 'function' ? config.onChange : null

  /** Read the injected clock without ever throwing or returning a non-number. */
  function readNow() {
    try {
      const value = clock()
      return Number.isFinite(value) ? value : Date.now()
    } catch {
      return Date.now()
    }
  }

  const createdAt = readNow()

  let durationMinutes = clampDurationMinutes(config.durationMinutes)
  let durationMs = durationMinutes * focusMsPerMinute

  let phase = PHASE.IDLE
  /** Counted watch time accrued before the running segment started. */
  let baseMs = 0
  /** Timestamp the running counting segment started, or null when stopped. */
  let segmentStart = null
  let pausedAt = null
  let finishedAt = null
  let manualPause = false
  let skipArmed = false
  let pauseReason = null

  const presence = {
    visible: true,
    typing: false,
    draftEmpty: true,
    sending: false,
    modelBusy: false,
  }

  const listeners = new Set()
  let destroyed = false
  let lastNotifySignature = null
  let lastChangeSignature = null

  // ---------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------

  /** True counted watch time at `now` (uncapped). */
  function watchedAt(now) {
    let watched = baseMs
    if (phase === PHASE.COUNTING && segmentStart !== null) {
      watched += Math.max(0, now - segmentStart)
    }
    if (!Number.isFinite(watched) || watched < 0) return 0
    return Math.min(watched, focusMaxMs)
  }

  /** Build the public, frozen state snapshot derived at `now`. */
  function buildState(now) {
    const watchedMs = watchedAt(now)
    const elapsedMs = Math.min(watchedMs, durationMs)
    const remainingMs = Math.max(0, durationMs - elapsedMs)
    const progress = durationMs > 0 ? Math.min(1, Math.max(0, elapsedMs / durationMs)) : 1
    return Object.freeze({
      phase,
      durationMinutes,
      durationMs,
      elapsedMs,
      watchedMs,
      remainingMs,
      progress,
      startedAt: segmentStart,
      pausedAt,
      finishedAt,
      modelBusy: presence.modelBusy,
      draftEmpty: presence.draftEmpty,
      typing: presence.typing,
      visible: presence.visible,
      sending: presence.sending,
      skipArmed,
      pauseReason,
    })
  }

  /** Coarse signature: subscriber updates at most once per watched second. */
  function notifySignature(state) {
    return [
      state.phase,
      state.durationMinutes,
      state.skipArmed,
      state.visible,
      state.typing,
      state.draftEmpty,
      state.sending,
      state.modelBusy,
      state.pauseReason,
      state.finishedAt,
      state.pausedAt,
      state.startedAt,
      Math.floor(state.elapsedMs / 1000),
      Math.floor(state.watchedMs / 1000),
    ].join('~')
  }

  /** Structural signature: what `onChange` (persistence) cares about. */
  function changeSignature(state) {
    return [
      state.phase,
      state.durationMinutes,
      state.skipArmed,
      state.visible,
      state.typing,
      state.draftEmpty,
      state.sending,
      state.modelBusy,
      state.pauseReason,
      state.finishedAt,
      state.pausedAt,
      state.startedAt,
    ].join('~')
  }

  /** Rebuild the state, notify subscribers/`onChange` when it really changed. */
  function publish(now) {
    const state = buildState(now)
    if (!destroyed) {
      const nextNotify = notifySignature(state)
      if (nextNotify !== lastNotifySignature) {
        lastNotifySignature = nextNotify
        for (const listener of Array.from(listeners)) {
          try {
            listener(state)
          } catch {
            /* a broken subscriber must never break the countdown */
          }
        }
      }
      const nextChange = changeSignature(state)
      if (nextChange !== lastChangeSignature) {
        lastChangeSignature = nextChange
        if (changeHandler !== null) {
          try {
            changeHandler(state)
          } catch {
            /* a broken persistence hook must never break the countdown */
          }
        }
      }
    }
    return state
  }

  // ---------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------

  /** Presence reason the countdown must be paused for, or null when passive. */
  function blockReason() {
    if (!presence.visible) return 'hidden'
    if (presence.sending) return 'sending'
    if (presence.typing) return 'typing'
    if (!presence.draftEmpty) return 'draft'
    return null
  }

  /** Freeze the running segment into `baseMs` (idempotent). */
  function freezeSegment(now) {
    if (segmentStart !== null) {
      baseMs += Math.max(0, now - segmentStart)
      segmentStart = null
    }
    if (!Number.isFinite(baseMs) || baseMs < 0) baseMs = 0
    if (baseMs > focusMaxMs) baseMs = focusMaxMs
  }

  function enterPaused(now, reason, manual) {
    freezeSegment(now)
    phase = PHASE.PAUSED
    pausedAt = now
    pauseReason = reason
    manualPause = manual
  }

  /** Timestamp at which the running segment reaches the budget. */
  function segmentBoundary() {
    if (segmentStart === null) return null
    const reach = Math.min(Math.max(0, durationMs - baseMs), durationMs)
    return segmentStart + reach
  }

  function enterFinished(now, boundary) {
    freezeSegment(now)
    phase = PHASE.FINISHED
    finishedAt = Number.isFinite(boundary) ? Math.min(boundary, now) : now
    pausedAt = null
    pauseReason = null
    manualPause = false
    skipArmed = false
  }

  function enterSkipped(now) {
    freezeSegment(now)
    phase = PHASE.SKIPPED
    pausedAt = null
    pauseReason = null
    manualPause = false
    skipArmed = false
  }

  /** Shared reset used by `onUserSend()` / `reset()` / presence `sending`. */
  function applySendReset(now) {
    baseMs = 0
    segmentStart = now
    phase = PHASE.COUNTING
    pausedAt = null
    finishedAt = null
    pauseReason = null
    manualPause = false
    skipArmed = false
  }

  /** Keep presence coherent with an explicitly named pause reason. */
  function applyReasonToPresence(reason) {
    if (reason === 'hidden') presence.visible = false
    else if (reason === 'sending') presence.sending = true
    else if (reason === 'typing') presence.typing = true
    else if (reason === 'draft') presence.draftEmpty = false
  }

  /** Bring the machine up to date at `now`, then publish. */
  function recompute(now) {
    if (phase === PHASE.IDLE) {
      const reason = blockReason()
      if (reason === null) {
        phase = PHASE.COUNTING
        baseMs = 0
        segmentStart = Math.min(createdAt, now)
        pausedAt = null
        pauseReason = null
        manualPause = false
      } else {
        phase = PHASE.PAUSED
        baseMs = 0
        segmentStart = null
        pausedAt = now
        pauseReason = reason
        manualPause = false
      }
    }

    if (phase === PHASE.COUNTING) {
      const watched = baseMs + Math.max(0, now - segmentStart)
      if (watched >= durationMs) {
        enterFinished(now, segmentBoundary())
      } else {
        const reason = blockReason()
        if (reason !== null) enterPaused(now, reason, false)
      }
    } else if (phase === PHASE.PAUSED && !manualPause) {
      const reason = blockReason()
      if (reason === null) {
        if (baseMs >= durationMs) {
          phase = PHASE.FINISHED
          finishedAt = pausedAt === null ? now : pausedAt
          pausedAt = null
          pauseReason = null
          manualPause = false
          skipArmed = false
        } else {
          phase = PHASE.COUNTING
          segmentStart = now
          pausedAt = null
          pauseReason = null
        }
      } else {
        pauseReason = reason
      }
    }

    return publish(now)
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  /** Current state, derived from the injected clock. */
  function getState() {
    return buildState(readNow())
  }

  /**
   * Subscribe to meaningful state changes.
   *
   * `listener(state)` fires when any public field changes; elapsed updates are
   * coalesced to one per watched second so a fast tick loop cannot flood the UI.
   *
   * @param {(state: object) => void} listener Subscriber.
   * @returns {() => void} Unsubscribe function (idempotent).
   */
  function subscribe(listener) {
    if (typeof listener !== 'function' || destroyed) return () => {}
    listeners.add(listener)
    let active = true
    return function unsubscribe() {
      if (!active) return
      active = false
      listeners.delete(listener)
    }
  }

  /** Recompute from timestamps at `nowMs` (defaults to the injected clock). */
  function tick(nowMs) {
    const explicit = focusNumber(nowMs)
    return recompute(explicit === null ? readNow() : explicit)
  }

  /**
   * Apply a presence patch: `{ visible?, typing?, draftEmpty?, sending?, modelBusy? }`.
   *
   * A `sending: true` patch is treated as a real send (hard reset). Typing or a
   * non-empty draft pauses the countdown, hidden pauses it with reason `hidden`,
   * and clearing every blocker resumes from the frozen value.
   */
  function setPresence(patch) {
    if (!focusIsRecord(patch)) return getState()
    const now = readNow()
    let sendRequested = false
    for (const key of focusPresenceKeys) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) continue
      const value = patch[key]
      if (typeof value !== 'boolean') continue
      presence[key] = value
      if (key === 'sending' && value) sendRequested = true
    }
    if (sendRequested) applySendReset(now)
    return recompute(now)
  }

  /** The user sent a message: hard reset and start counting again. */
  function onUserSend() {
    const now = readNow()
    applySendReset(now)
    return recompute(now)
  }

  /** Clamp and apply a new budget; finishes immediately when already used up. */
  function setDurationMinutes(minutes) {
    const now = readNow()
    const next = clampDurationMinutes(minutes)
    const changed = next !== durationMinutes
    durationMinutes = next
    durationMs = next * focusMsPerMinute
    if (changed && phase === PHASE.COUNTING && segmentStart !== null) {
      const watched = baseMs + Math.max(0, now - segmentStart)
      if (watched >= durationMs) enterFinished(now, segmentBoundary())
    } else if (changed && phase === PHASE.PAUSED && baseMs >= durationMs) {
      enterFinished(pausedAt === null ? now : pausedAt, pausedAt === null ? now : pausedAt)
    }
    return recompute(now)
  }

  /** Begin counting from the current position (no-op once finished/skipped). */
  function start() {
    const now = readNow()
    if (phase === PHASE.COUNTING) return recompute(now)
    if (phase === PHASE.FINISHED || phase === PHASE.SKIPPED) return getState()
    manualPause = false
    pausedAt = null
    if (baseMs >= durationMs) {
      phase = PHASE.FINISHED
      finishedAt = now
      segmentStart = null
    } else {
      phase = PHASE.COUNTING
      segmentStart = now
    }
    return recompute(now)
  }

  /** Pause explicitly; `reason` is one of typing/draft/hidden/sending or omitted. */
  function pause(reason) {
    const now = readNow()
    const named = typeof reason === 'string' && focusPauseReasons.indexOf(reason) !== -1 ? reason : null
    if (phase === PHASE.COUNTING || phase === PHASE.IDLE) {
      if (named !== null) applyReasonToPresence(named)
      enterPaused(now, named, named === null)
      return publish(now)
    }
    if (phase === PHASE.PAUSED) {
      if (named !== null) {
        applyReasonToPresence(named)
        pauseReason = named
        manualPause = false
      }
      return publish(now)
    }
    return getState()
  }

  /** Manual restart with elapsed 0. */
  function reset() {
    return onUserSend()
  }

  /** First skip click: arm the confirmation. */
  function skipArm() {
    const now = readNow()
    if (phase === PHASE.COUNTING || phase === PHASE.PAUSED || phase === PHASE.IDLE) {
      skipArmed = true
      return publish(now)
    }
    return getState()
  }

  /** Second skip click: only works when armed; freezes the countdown as skipped. */
  function skipConfirm() {
    const now = readNow()
    if (!skipArmed) return publish(now)
    if (phase === PHASE.FINISHED || phase === PHASE.SKIPPED) return publish(now)
    enterSkipped(now)
    return publish(now)
  }

  /** Abort a pending skip confirmation; counting continues untouched. */
  function skipCancel() {
    const now = readNow()
    if (!skipArmed) return publish(now)
    skipArmed = false
    return publish(now)
  }

  /** JSON-serializable persistence envelope. */
  function snapshot() {
    const now = readNow()
    const watchedMs = watchedAt(now)
    return Object.freeze({
      v: 1,
      phase,
      durationMinutes,
      elapsedMs: Math.min(watchedMs, durationMs),
      watchedMs,
      startedAt: segmentStart,
      pausedAt,
      finishedAt,
      skipArmed,
    })
  }

  /** Restore a `snapshot()` (or anything else — garbage is ignored field-wise). */
  function restore(snap) {
    if (!focusIsRecord(snap)) return getState()
    // Only our own envelope is trusted; missing or foreign versions are ignored
    // so a bad persistence payload can never clobber a live countdown.
    if (snap.v !== 1) return getState()
    const now = readNow()

    durationMinutes = clampDurationMinutes(snap.durationMinutes)
    durationMs = durationMinutes * focusMsPerMinute

    const rawElapsed = focusMillis(snap.elapsedMs)
    const rawWatched = focusMillis(snap.watchedMs)
    const elapsed = rawElapsed === null ? 0 : rawElapsed
    let watched = rawWatched === null ? elapsed : rawWatched
    if (watched < elapsed) watched = elapsed

    phase = PHASE.IDLE
    baseMs = 0
    segmentStart = null
    pausedAt = null
    finishedAt = null
    pauseReason = null
    manualPause = false
    skipArmed = false

    if (snap.phase === PHASE.FINISHED) {
      phase = PHASE.FINISHED
      baseMs = Math.max(watched, durationMs)
      finishedAt = focusNumber(snap.finishedAt) === null ? now : focusNumber(snap.finishedAt)
      skipArmed = false
    } else if (snap.phase === PHASE.SKIPPED) {
      phase = PHASE.SKIPPED
      baseMs = Math.min(elapsed, durationMs)
      skipArmed = false
    } else if (snap.phase === PHASE.PAUSED) {
      phase = PHASE.PAUSED
      baseMs = Math.min(elapsed, durationMs)
      pausedAt = focusNumber(snap.pausedAt) === null ? now : focusNumber(snap.pausedAt)
      pauseReason = null
      skipArmed = snap.skipArmed === true
    } else if (snap.phase === PHASE.COUNTING) {
      phase = PHASE.COUNTING
      baseMs = Math.min(elapsed, durationMs)
      segmentStart = now
      skipArmed = snap.skipArmed === true
    }

    if (phase === PHASE.COUNTING && baseMs >= durationMs) {
      phase = PHASE.FINISHED
      baseMs = Math.max(baseMs, durationMs)
      finishedAt = now
      segmentStart = null
      skipArmed = false
    }

    return publish(now)
  }

  /** Drop every subscriber (and the optional change handler). */
  function destroy() {
    destroyed = true
    listeners.clear()
    changeHandler = null
    lastNotifySignature = null
    lastChangeSignature = null
  }

  return Object.freeze({
    getState,
    subscribe,
    tick,
    setPresence,
    onUserSend,
    setDurationMinutes,
    start,
    pause,
    reset,
    skipArm,
    skipConfirm,
    skipCancel,
    snapshot,
    restore,
    destroy,
  })
}
