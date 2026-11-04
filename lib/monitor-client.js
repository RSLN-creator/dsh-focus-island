/**
 * dsh-focus-island — Client resource poller (OPTIONAL half).
 *
 * Polls the Host sampler at `/dsh-focus-island/resources` for the floating
 * "focus island" readout. Rules that matter for a long-lived page:
 *
 *   - `setTimeout` chaining, never `setInterval`, so a slow host cannot pile
 *     requests up;
 *   - `onUpdate` fires only when the Host's `updatedAt` changes (the Host may
 *     answer many polls from one cached sample);
 *   - failures never throw: `onError` fires at most once per 30 s, the last
 *     snapshot is kept, and three consecutive failures stop the loop silently
 *     (an explicit `start()` restarts it);
 *   - hidden pages pause and resume on `visibilitychange`.
 *
 * This file is concatenated into the browser bundle by build.mjs, so it must
 * stay import-free and must not touch `document` at module evaluation time.
 */

/** Same-origin path served by lib/host-monitor.js. */
export const ROUTE = '/dsh-focus-island/resources'

/** Default poll cadence; the Host caches its sample for 2000 ms. */
const DEFAULT_INTERVAL_MS = 2000

/** Minimum gap between two `onError` calls. */
const ERROR_NOTIFY_INTERVAL_MS = 30_000

/** Consecutive failed polls after which the loop stops (restartable). */
const MAX_CONSECUTIVE_FAILURES = 3

/**
 * Is a sample recent enough to display?
 *
 * A negative age (Host clock ahead of the page clock) still counts as fresh;
 * callers should be tolerant of small skew. Invalid input is stale.
 *
 * @param {object | null | undefined} sample Host sample with numeric `updatedAt`.
 * @param {number} nowMs Caller clock.
 * @param {number} maxAgeMs Maximum accepted age.
 * @returns {boolean} True when the sample can be shown.
 */
export function isSampleFresh(sample, nowMs, maxAgeMs) {
  try {
    if (sample === null || typeof sample !== 'object') return false
    if (!Number.isFinite(sample.updatedAt) || !Number.isFinite(nowMs)) return false
    if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) return false
    return nowMs - sample.updatedAt <= maxAgeMs
  } catch {
    return false
  }
}

/** Current document visibility, tolerant of non-browser contexts. */
function pageIsHidden() {
  try {
    if (typeof document === 'undefined' || document === null) return false
    return document.visibilityState === 'hidden'
  } catch {
    return false
  }
}

/** Call a user callback without letting it escape into the poll loop. */
function safeCall(callback, argument) {
  if (typeof callback !== 'function') return
  try {
    callback(argument)
  } catch {
    /* a consumer callback must never break polling */
  }
}

/**
 * Create the resource poller used by the island widget.
 *
 * @param {object} options Poller options.
 * @param {(input: string, init?: object) => Promise<any>} [options.fetchImpl] Fetch implementation (defaults to global fetch).
 * @param {number} [options.intervalMs] Poll cadence in milliseconds (default 2000).
 * @param {(sample: object) => void} [options.onUpdate] Called when `updatedAt` changes.
 * @param {(error: unknown) => void} [options.onError] Called on failures, throttled to once per 30 s.
 * @param {() => number} [options.now] Clock seam for tests.
 * @returns {{ start: () => void, stop: () => void, dispose: () => void, getSnapshot: () => object | null }} Poller handle.
 */
export function createResourcePoller({ fetchImpl, intervalMs = DEFAULT_INTERVAL_MS, onUpdate, onError, now } = {}) {
  const clock = typeof now === 'function' ? now : Date.now
  const interval = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_INTERVAL_MS
  const fetcher = typeof fetchImpl === 'function'
    ? fetchImpl
    : (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null)

  let snapshot = null
  let lastUpdatedAt
  let timer = null
  let active = false
  let disposed = false
  let stoppedForFailures = false
  let consecutiveFailures = 0
  let lastErrorAt = 0
  let visibilityAttached = false

  /** Clear the pending timeout, if any. */
  function clearTimer() {
    if (timer === null) return
    try {
      clearTimeout(timer)
    } catch {
      /* already gone */
    }
    timer = null
  }

  /** Schedule the next poll. */
  function schedule(delay) {
    clearTimer()
    if (!active || disposed || stoppedForFailures) return
    if (pageIsHidden()) return
    timer = setTimeout(() => {
      timer = null
      void runPoll()
    }, Math.max(0, delay))
  }

  /** One poll; every failure path is contained. */
  async function runPoll() {
    if (!active || disposed || stoppedForFailures) return
    if (pageIsHidden()) return
    if (fetcher === null) {
      // No fetch in this runtime: degrade silently and stop.
      active = false
      return
    }

    let sample
    try {
      const response = await fetcher(ROUTE, { credentials: 'same-origin', cache: 'no-store' })
      if (response === null || response === undefined) throw new Error('empty resource response')
      if (typeof response.ok === 'boolean' && !response.ok) throw new Error(`resource route status ${response.status}`)
      const body = typeof response.json === 'function' ? await response.json() : response
      if (body === null || typeof body !== 'object') throw new Error('malformed resource sample')
      sample = body
    } catch (error) {
      if (disposed) return
      consecutiveFailures += 1
      const at = clock()
      if (at - lastErrorAt >= ERROR_NOTIFY_INTERVAL_MS) {
        lastErrorAt = at
        safeCall(onError, error)
      }
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        // Silent stop: the readout keeps its last snapshot and start() can
        // bring the loop back (e.g. when the readout is toggled again).
        stoppedForFailures = true
        active = false
        clearTimer()
        detachVisibility()
        return
      }
      schedule(interval)
      return
    }

    if (disposed) return
    consecutiveFailures = 0
    lastErrorAt = 0
    snapshot = sample
    const updatedAt = Number.isFinite(sample.updatedAt) ? sample.updatedAt : clock()
    if (lastUpdatedAt !== updatedAt) {
      lastUpdatedAt = updatedAt
      safeCall(onUpdate, sample)
    }
    schedule(interval)
  }

  /** Pause while hidden, poll immediately when visible again. */
  function onVisibilityChange() {
    if (!active || disposed || stoppedForFailures) return
    if (pageIsHidden()) {
      clearTimer()
      return
    }
    if (timer === null) schedule(0)
  }

  /** Attach the visibility listener only while running. */
  function attachVisibility() {
    if (visibilityAttached) return
    try {
      if (typeof document === 'undefined' || document === null || typeof document.addEventListener !== 'function') return
      document.addEventListener('visibilitychange', onVisibilityChange)
      visibilityAttached = true
    } catch {
      /* no DOM: polling simply never pauses */
    }
  }

  /** Detach the visibility listener. */
  function detachVisibility() {
    if (!visibilityAttached) return
    visibilityAttached = false
    try {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    } catch {
      /* best-effort */
    }
  }

  return {
    /** Begin polling; safe to call repeatedly. */
    start() {
      if (disposed || active) return
      active = true
      stoppedForFailures = false
      consecutiveFailures = 0
      lastErrorAt = 0
      attachVisibility()
      schedule(0)
    },
    /** Stop polling and release the timer/listener; keeps the last snapshot. */
    stop() {
      active = false
      clearTimer()
      detachVisibility()
    },
    /** Stop and mark this poller unusable. */
    dispose() {
      this.stop()
      disposed = true
    },
    /** Last successful sample, or null before the first one. */
    getSnapshot() {
      return snapshot
    },
  }
}
