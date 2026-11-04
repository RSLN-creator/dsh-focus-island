/**
 * dsh-focus-island — Host resource sampler (OPTIONAL half).
 *
 * Exposes one same-origin GET route that reports whole-machine resource use for
 * the floating "focus island" widget:
 *
 *   GET /dsh-focus-island/resources
 *   -> { ok, updatedAt, cpu, gpu, mem, temp, memUsedMb, memTotalMb }
 *
 * Every value is best-effort. Missing data (no NVIDIA GPU, no `nvidia-smi`,
 * weird OS counters) degrades to `null`; nothing in here is allowed to throw
 * out of `registerResourceMonitor` or to break the base countdown plugin.
 *
 * Sampling cost: `os.cpus()` + `os` memory are synchronous and cheap, so they
 * are sampled on the request path at most once every 1000 ms. GPU data needs a
 * child process, so it is refreshed in the background (never awaited by the
 * handler) and backs off for 30 s after a failure.
 *
 * @module dsh-focus-island/host-monitor
 */

import { execFile } from 'node:child_process'
import os from 'node:os'

/** Exact same-origin path the client polls. */
export const ROUTE = '/dsh-focus-island/resources'

/** Minimum gap between CPU/memory samples (route hits inside it reuse the cache). */
const SAMPLE_INTERVAL_MS = 1000

/** After a failed `nvidia-smi` call, wait this long before trying again. */
const GPU_RETRY_MS = 30_000

/** After a successful call, refresh GPU at most this often (spawning is not free). */
const GPU_REFRESH_MS = 4000

/** Hard bound on one `nvidia-smi` invocation. */
const GPU_TIMEOUT_MS = 1200

/** Empty sample shape; `updatedAt` is filled per sample. */
const EMPTY = Object.freeze({
  ok: true,
  cpu: null,
  gpu: null,
  mem: null,
  temp: null,
  memUsedMb: null,
  memTotalMb: null,
})

/**
 * One bounded log helper — a broken logger never breaks the sampler.
 *
 * @param {any} ctx Plugin context.
 * @param {'warn'|'debug'} level Log level to use when available.
 * @param {string} message Message body (prefixed by the caller).
 */
function log(ctx, level, message) {
  try {
    const logger = ctx === null || ctx === undefined ? undefined : ctx.logger
    if (logger !== undefined && logger !== null && typeof logger[level] === 'function') {
      logger[level](`[dsh-focus-island] ${message}`)
    }
  } catch {
    /* logging is best-effort */
  }
}

/** Read the per-CPU cumulative times, normalized to `{ idle, total }`. */
function readOsCpuTimes() {
  const cpus = os.cpus()
  if (!Array.isArray(cpus)) return []
  const out = []
  for (const cpu of cpus) {
    const times = cpu === null || typeof cpu !== 'object' ? null : cpu.times
    if (times === null || typeof times !== 'object') continue
    const idle = numberOrZero(times.idle)
    const total = idle + numberOrZero(times.user) + numberOrZero(times.nice)
      + numberOrZero(times.sys) + numberOrZero(times.irq)
    out.push({ idle, total })
  }
  return out
}

/** Read whole-machine memory as `{ mem, memUsedMb, memTotalMb }`, or all null. */
function readOsMemory() {
  try {
    const totalBytes = os.totalmem()
    const freeBytes = os.freemem()
    if (!Number.isFinite(totalBytes) || totalBytes <= 0 || !Number.isFinite(freeBytes)) {
      return { mem: null, memUsedMb: null, memTotalMb: null }
    }
    const usedBytes = Math.max(0, totalBytes - Math.max(0, freeBytes))
    const totalMb = totalBytes / 1048576
    const usedMb = usedBytes / 1048576
    return {
      mem: clampPercent((usedBytes / totalBytes) * 100),
      memUsedMb: Math.round(usedMb),
      memTotalMb: Math.round(totalMb),
    }
  } catch {
    return { mem: null, memUsedMb: null, memTotalMb: null }
  }
}

/** Coerce a value to a finite number, or 0. */
function numberOrZero(value) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Round a percentage to an integer in [0, 100]. */
function clampPercent(value) {
  if (!Number.isFinite(value)) return null
  return Math.round(Math.min(100, Math.max(0, value)))
}

/**
 * Derive CPU busy percentage from two cumulative CPU-time snapshots.
 *
 * Shape: `[{ idle, total }]` — one entry per logical CPU, both in milliseconds
 * (any consistent unit works because only the delta ratio is used). For
 * convenience, `os.cpus()`-style entries (`{ times: { user, nice, sys, idle,
 * irq } }`) are also accepted and normalized internally.
 *
 * Returns a rounded integer 0..100, or `null` when the answer would be
 * meaningless: invalid input, no shared CPUs, counter reset (negative total
 * delta), or a zero delta (two snapshots taken within the same tick).
 *
 * @param {Array<{ idle: number, total: number }> | Array<object> | null | undefined} prevTimes Earlier snapshot.
 * @param {Array<{ idle: number, total: number }> | Array<object> | null | undefined} nextTimes Later snapshot.
 * @returns {number | null} Busy percentage, or null when not computable.
 */
export function computeCpuPercent(prevTimes, nextTimes) {
  if (!Array.isArray(prevTimes) || !Array.isArray(nextTimes)) return null
  const count = Math.min(prevTimes.length, nextTimes.length)
  if (count === 0) return null

  let idleDelta = 0
  let totalDelta = 0
  for (let index = 0; index < count; index += 1) {
    const prev = normalizeCpuTimes(prevTimes[index])
    const next = normalizeCpuTimes(nextTimes[index])
    if (prev === null || next === null) return null
    idleDelta += next.idle - prev.idle
    totalDelta += next.total - prev.total
  }

  // Counter reset / no elapsed CPU time: no honest answer.
  if (!Number.isFinite(totalDelta) || totalDelta <= 0) return null
  // Tolerate small clock/counter jitter: a negative idle delta means full load.
  return clampPercent((1 - Math.max(0, idleDelta) / totalDelta) * 100)
}

/** Normalize one CPU-time entry to `{ idle, total }`, or null when invalid. */
function normalizeCpuTimes(entry) {
  if (entry === null || typeof entry !== 'object') return null
  if (Number.isFinite(entry.idle) && Number.isFinite(entry.total)) {
    return { idle: entry.idle, total: entry.total }
  }
  const times = entry.times
  if (times === null || typeof times !== 'object') return null
  const idle = times.idle
  const total = idle + times.user + times.nice + times.sys + times.irq
  if (!Number.isFinite(idle) || !Number.isFinite(total)) return null
  return { idle, total }
}

/**
 * Parse one `nvidia-smi --query-gpu=utilization.gpu,temperature.gpu` CSV line.
 *
 * @param {string} stdout Raw process output.
 * @returns {{ gpu: number, temp: number } | null} Parsed values, or null when unusable.
 */
export function parseNvidiaSmi(stdout) {
  try {
    const line = String(stdout ?? '').split(/\r?\n/).map((part) => part.trim()).filter((part) => part !== '')[0]
    if (line === undefined) return null
    const cells = line.split(',').map((cell) => cell.trim())
    if (cells.length < 2) return null
    const gpu = Number.parseFloat(cells[0].replace('[N/A]', ''))
    const temp = Number.parseFloat(cells[1].replace('[N/A]', ''))
    const hasGpu = Number.isFinite(gpu)
    const hasTemp = Number.isFinite(temp)
    if (!hasGpu && !hasTemp) return null
    return {
      gpu: hasGpu ? clampPercent(gpu) : null,
      temp: hasTemp ? Math.round(temp) : null,
    }
  } catch {
    return null
  }
}

/**
 * Run one `nvidia-smi` query.
 *
 * @param {(child: any) => void} [onChild] Receives the spawned child (for disposal).
 * @returns {Promise<{ gpu: number | null, temp: number | null } | null>} Never rejects.
 */
function queryNvidiaSmi(onChild) {
  return new Promise((resolve) => {
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    try {
      const child = execFile(
        'nvidia-smi',
        ['--query-gpu=utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'],
        { timeout: GPU_TIMEOUT_MS, windowsHide: true },
        (error, stdout) => {
          if (error) {
            done(null)
            return
          }
          done(parseNvidiaSmi(stdout))
        },
      )
      if (typeof onChild === 'function') onChild(child)
    } catch {
      done(null)
    }
  })
}

/**
 * Write one buffered JSON response. Owned here so the sampler never depends on
 * Node's higher-level response helpers.
 *
 * @param {any} res Node HTTP response.
 * @param {number} status HTTP status.
 * @param {object} body JSON-serializable body.
 */
function writeJson(res, status, body) {
  const payload = JSON.stringify(body)
  try {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      'cache-control': 'no-store',
    })
    res.end(payload)
  } catch {
    /* the request may already be gone */
  }
}

/**
 * Optional browser-trust fence, used only when this profile exposes it.
 *
 * @param {any} ctx Plugin context.
 * @param {any} req Node HTTP request.
 * @returns {number | undefined} Rejection status, or undefined when allowed.
 */
function requestRejection(ctx, req) {
  try {
    if (typeof ctx.get !== 'function') return undefined
    const connection = ctx.get('connection')
    if (connection === undefined || connection === null || typeof connection.requestRejection !== 'function') return undefined
    return connection.requestRejection({ headers: req.headers })
  } catch {
    return 403
  }
}

/**
 * Register the resource route.
 *
 * Never throws: a missing `ctx.webServer`, a duplicate route, or a broken
 * sampler all degrade to a no-op disposer. The returned handle is disposed by
 * the caller (the plugin's `apply` wraps it in `ctx.effect`).
 *
 * @param {any} ctx Cordis plugin context.
 * @param {object} [deps] Optional seams for tests; every field is optional.
 * @param {() => number} [deps.now] Clock.
 * @param {() => Array<{ idle: number, total: number }>} [deps.readCpuTimes] CPU snapshot reader.
 * @param {() => { mem: number | null, memUsedMb: number | null, memTotalMb: number | null }} [deps.readMemory] Memory reader.
 * @param {(onChild?: (child: any) => void) => Promise<{ gpu: number | null, temp: number | null } | null>} [deps.queryGpu] GPU reader.
 * @returns {{ dispose: () => void }} Disposer handle.
 */
export function registerResourceMonitor(ctx, deps = {}) {
  try {
    // Strict service reads (`ctx.get`) are topology-independent; the property
    // proxy only exposes services this plugin declared in `inject`. The host
    // half intentionally declares no injection (a missing webServer must not
    // park the row and take the client half down with it), so try both forms.
    let webServer
    if (ctx !== null && ctx !== undefined && typeof ctx.get === 'function') {
      try {
        webServer = ctx.get('webServer')
      } catch {
        webServer = undefined
      }
    }
    if (webServer === undefined || webServer === null) {
      webServer = ctx === null || ctx === undefined ? undefined : ctx.webServer
    }
    if (webServer === undefined || webServer === null || typeof webServer.register !== 'function') {
      log(ctx, 'debug', 'resource monitor skipped: no webServer in this profile')
      return { dispose() {} }
    }

    const now = typeof deps.now === 'function' ? deps.now : Date.now
    const readCpuTimes = typeof deps.readCpuTimes === 'function' ? deps.readCpuTimes : readOsCpuTimes
    const readMemory = typeof deps.readMemory === 'function' ? deps.readMemory : readOsMemory
    const queryGpu = typeof deps.queryGpu === 'function' ? deps.queryGpu : queryNvidiaSmi

    /** Baseline captured at registration; the first sample diffs against it. */
    let cpuBaseline = safeCpuTimes(readCpuTimes)
    let baseAt = 0
    let sample = { ...EMPTY, updatedAt: now() }
    let gpuNextAt = 0
    let gpuInFlight = false
    let gpuFailureLogged = false
    let child = null
    let disposed = false

    // Kick off the first GPU attempt outside the request path, so the very
    // first route hit already has a chance to carry GPU data.
    queueMicrotask(() => {
      if (!disposed) kickGpu(now())
    })

    /** Read CPU times without letting a broken reader escape. */
    function safeCpuTimes(reader) {
      try {
        const times = reader()
        return Array.isArray(times) ? times : []
      } catch {
        return []
      }
    }

    /**
     * Refresh CPU/memory synchronously when the cache is stale, then start a
     * background GPU refresh. Never awaits the child process.
     *
     * @param {number} at Sample timestamp.
     * @returns {object} The current (possibly refreshed) sample.
     */
    function sampleNow(at) {
      if (at - baseAt < SAMPLE_INTERVAL_MS && Number.isFinite(sample.updatedAt) && sample.updatedAt > 0) {
        if (at >= gpuNextAt) kickGpu(at)
        return sample
      }

      const cpuTimes = safeCpuTimes(readCpuTimes)
      const cpu = cpuBaseline.length === 0 ? null : computeCpuPercent(cpuBaseline, cpuTimes)
      cpuBaseline = cpuTimes
      const memory = readMemory()
      baseAt = at
      sample = {
        ok: true,
        updatedAt: at,
        cpu,
        gpu: sample.gpu,
        mem: memory === null || typeof memory !== 'object' ? null : (memory.mem ?? null),
        temp: sample.temp,
        memUsedMb: memory === null || typeof memory !== 'object' ? null : (memory.memUsedMb ?? null),
        memTotalMb: memory === null || typeof memory !== 'object' ? null : (memory.memTotalMb ?? null),
      }
      if (at >= gpuNextAt) kickGpu(at)
      return sample
    }

    /**
     * Query the GPU in the background, honoring the retry backoff.
     *
     * @param {number} at Current timestamp.
     */
    function kickGpu(at) {
      if (disposed || gpuInFlight || at < gpuNextAt) return
      gpuInFlight = true
      let promise
      try {
        promise = Promise.resolve(queryGpu((spawned) => {
          child = spawned ?? null
        }))
      } catch {
        promise = Promise.resolve(null)
      }
      promise.then((result) => {
        if (disposed) return
        child = null
        gpuInFlight = false
        const valid = result !== null && typeof result === 'object'
          && (Number.isFinite(result.gpu) || Number.isFinite(result.temp))
        if (!valid) {
          gpuNextAt = now() + GPU_RETRY_MS
          if (!gpuFailureLogged) {
            gpuFailureLogged = true
            log(ctx, 'warn', 'GPU telemetry unavailable (nvidia-smi missing or failed); continuing without it')
          } else {
            log(ctx, 'debug', 'GPU telemetry still unavailable; retry backoff active')
          }
          return
        }
        gpuFailureLogged = false
        gpuNextAt = now() + GPU_REFRESH_MS
        sample = {
          ...sample,
          gpu: Number.isFinite(result.gpu) ? clampPercent(result.gpu) : sample.gpu,
          temp: Number.isFinite(result.temp) ? Math.round(result.temp) : sample.temp,
          // A new timestamp makes the client notice the late GPU values.
          updatedAt: Math.max(sample.updatedAt, now()),
        }
      }).catch(() => {
        if (disposed) return
        child = null
        gpuInFlight = false
        gpuNextAt = now() + GPU_RETRY_MS
      })
    }

    /** One route request. Always answers; never throws outward. */
    async function handler(req, res) {
      try {
        if (req !== null && typeof req === 'object' && typeof req.method === 'string'
          && req.method !== 'GET' && req.method !== 'HEAD') {
          writeJson(res, 405, { ok: false, error: 'method not allowed' })
          return null
        }
        const rejection = requestRejection(ctx, req ?? {})
        if (rejection !== undefined) {
          writeJson(res, rejection, { ok: false, error: 'unauthorized' })
          return null
        }
        const current = sampleNow(now())
        writeJson(res, 200, current)
        return current
      } catch (error) {
        log(ctx, 'warn', `resource sample failed: ${error instanceof Error ? error.message : String(error)}`)
        const fallback = { ...EMPTY, updatedAt: now() }
        writeJson(res, 200, fallback)
        return fallback
      }
    }

    let disposeRoute = null
    try {
      disposeRoute = webServer.register({
        // The real DSH webServer dispatches by `kind` + exact `path`; `method`
        // is kept as documentation/test metadata and ignored by the host.
        kind: 'exact',
        method: 'GET',
        path: ROUTE,
        handler,
      })
    } catch (error) {
      log(ctx, 'warn', `resource route not registered: ${error instanceof Error ? error.message : String(error)}`)
      return { dispose() {} }
    }

    log(ctx, 'debug', `resource route registered: ${ROUTE}`)

    return {
      dispose() {
        if (disposed) return
        disposed = true
        child = null
        try {
          if (typeof disposeRoute === 'function') disposeRoute()
        } catch {
          /* route disposal is best-effort */
        }
      },
    }
  } catch (error) {
    log(ctx, 'warn', `resource monitor failed to start: ${error instanceof Error ? error.message : String(error)}`)
    return { dispose() {} }
  }
}
