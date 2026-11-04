// dsh-focus-island — Node tests for the OPTIONAL resource half.
//
// Pure math and degradation paths only: no network, no real child process, no
// DOM. Run: `node verify/monitor.test.mjs` (exit code 0 = all green).

import assert from 'node:assert/strict'
import {
  ROUTE as HOST_ROUTE,
  computeCpuPercent,
  parseNvidiaSmi,
  registerResourceMonitor,
} from '../lib/host-monitor.js'
import {
  ROUTE as CLIENT_ROUTE,
  createResourcePoller,
  isSampleFresh,
} from '../lib/monitor-client.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const unhandled = []
process.on('unhandledRejection', (error) => unhandled.push(error))

let passed = 0
function check(name, run) {
  return Promise.resolve()
    .then(run)
    .then(() => {
      passed += 1
      console.log(`ok ${passed} - ${name}`)
    })
    .catch((error) => {
      console.error(`not ok - ${name}`)
      throw error
    })
}

/** Minimal Node HTTP response double. */
function fakeRes() {
  return {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers ?? null
    },
    end(chunk) {
      if (chunk !== undefined) this.body = String(chunk)
    },
  }
}

/** Fake host context that records registrations. */
function fakeCtx() {
  const routes = []
  const disposed = { count: 0 }
  return {
    routes,
    disposed,
    ctx: {
      logger: { warn() {}, debug() {}, info() {} },
      webServer: {
        register(options) {
          routes.push(options)
          return () => {
            disposed.count += 1
          }
        },
      },
    },
  }
}

// ---------------------------------------------------------------------------
// computeCpuPercent
// ---------------------------------------------------------------------------

await check('computeCpuPercent: idle-only delta is 0%', () => {
  const prev = [{ idle: 100, total: 200 }]
  const next = [{ idle: 200, total: 300 }]
  assert.equal(computeCpuPercent(prev, next), 0)
})

await check('computeCpuPercent: no idle delta is ~100%', () => {
  assert.equal(computeCpuPercent([{ idle: 100, total: 200 }], [{ idle: 100, total: 300 }]), 100)
})

await check('computeCpuPercent: mixed delta rounds and clamps', () => {
  // idle 50 / total 100 spent -> 50% busy.
  assert.equal(computeCpuPercent([{ idle: 0, total: 0 }], [{ idle: 50, total: 100 }]), 50)
  // Overloaded counter (idle grows faster than total) clamps to 0, not < 0.
  assert.equal(computeCpuPercent([{ idle: 0, total: 0 }], [{ idle: 150, total: 100 }]), 0)
  // More idle accounting than possible clamps to 0; negative total -> null.
  assert.equal(computeCpuPercent([{ idle: 0, total: 0 }], [{ idle: 0, total: 100 }]), 100)
})

await check('computeCpuPercent: zero delta and bad input are null', () => {
  assert.equal(computeCpuPercent([{ idle: 5, total: 5 }], [{ idle: 5, total: 5 }]), null)
  assert.equal(computeCpuPercent(null, []), null)
  assert.equal(computeCpuPercent([], []), null)
  assert.equal(computeCpuPercent([{ idle: 0 }], [{ idle: 1, total: 1 }]), null)
  // Counter reset (negative total delta) is not a percentage.
  assert.equal(computeCpuPercent([{ idle: 10, total: 20 }], [{ idle: 1, total: 2 }]), null)
})

await check('computeCpuPercent: accepts os.cpus()-like entries too', () => {
  const prev = [{ times: { user: 100, nice: 0, sys: 100, idle: 200, irq: 0 } }]
  const next = [{ times: { user: 200, nice: 0, sys: 200, idle: 200, irq: 0 } }]
  // total 400 -> 800 (+400), idle 200 -> 200 (0) => 100% busy.
  assert.equal(computeCpuPercent(prev, next), 100)
})

await check('parseNvidiaSmi: parses CSV and tolerates N/A', () => {
  assert.deepEqual(parseNvidiaSmi('96, 70\n'), { gpu: 96, temp: 70 })
  assert.deepEqual(parseNvidiaSmi('\r\n 42 , 55 \r\n'), { gpu: 42, temp: 55 })
  assert.deepEqual(parseNvidiaSmi('12, [N/A]'), { gpu: 12, temp: null })
  assert.deepEqual(parseNvidiaSmi('[N/A], [N/A]'), null)
  assert.equal(parseNvidiaSmi(''), null)
})

// ---------------------------------------------------------------------------
// registerResourceMonitor
// ---------------------------------------------------------------------------

await check('registerResourceMonitor: one exact GET route with the contract shape', async () => {
  const { ctx, routes } = fakeCtx()
  const handle = registerResourceMonitor(ctx, {
    now: () => 1_000_000,
    readCpuTimes: () => [{ idle: 100, total: 200 }],
    readMemory: () => ({ mem: 50, memUsedMb: 8192, memTotalMb: 16384 }),
    queryGpu: async () => ({ gpu: 40, temp: 60 }),
  })

  assert.equal(typeof handle.dispose, 'function')
  assert.equal(routes.length, 1)
  assert.equal(routes[0].path, HOST_ROUTE)
  assert.equal(routes[0].path, '/dsh-focus-island/resources')
  assert.equal(routes[0].method, 'GET')
  assert.equal(routes[0].kind, 'exact')

  await Promise.resolve()
  const handler = routes[0].handler
  assert.equal(typeof handler, 'function')
  const res = fakeRes()
  const sample = await handler({ method: 'GET', url: HOST_ROUTE, headers: {} }, res)
  assert.equal(res.status, 200)
  assert.equal(typeof res.body, 'string')
  // It returns the same JSON-serializable sample it wrote.
  assert.deepEqual(JSON.parse(res.body), JSON.parse(JSON.stringify(sample)))
  assert.equal(sample.ok, true)
  assert.equal(typeof sample.updatedAt, 'number')
  for (const key of ['cpu', 'gpu', 'mem']) {
    const value = sample[key]
    assert.ok(value === null || (Number.isInteger(value) && value >= 0 && value <= 100), `${key}=${value}`)
  }
  assert.ok(sample.temp === null || Number.isInteger(sample.temp))
  assert.ok(sample.memUsedMb === null || Number.isInteger(sample.memUsedMb))
  assert.ok(sample.memTotalMb === null || Number.isInteger(sample.memTotalMb))
  handle.dispose()
  assert.equal(fakeCtx && res.status, 200)
})

await check('registerResourceMonitor: two hits within 2000 ms sample once', async () => {
  const { ctx, routes, disposed } = fakeCtx()
  let clock = 2_000_000
  let cpuReads = 0
  const handle = registerResourceMonitor(ctx, {
    now: () => clock,
    readCpuTimes: () => {
      cpuReads += 1
      // Each read is 100 ms busy and 100 ms idle further than the previous one.
      const step = cpuReads * 100
      return [{ idle: step, total: step * 2 }]
    },
    readMemory: () => ({ mem: 25, memUsedMb: 4096, memTotalMb: 16384 }),
    queryGpu: async () => null,
  })
  const handler = routes[0].handler
  const readsAfterRegister = cpuReads

  await handler({ method: 'GET', url: HOST_ROUTE, headers: {} }, fakeRes())
  const readsAfterFirst = cpuReads
  clock += 100
  await handler({ method: 'GET', url: HOST_ROUTE, headers: {} }, fakeRes())
  assert.equal(cpuReads, readsAfterFirst, 'cached sample must not re-read CPU within 2000 ms')
  assert.ok(readsAfterFirst > readsAfterRegister, 'first hit must produce a fresh sample')
  clock += 2500
  await handler({ method: 'GET', url: HOST_ROUTE, headers: {} }, fakeRes())
  assert.ok(cpuReads > readsAfterFirst, 'a stale cache must refresh after 2000 ms')

  const first = fakeRes()
  await handler({ method: 'GET', url: HOST_ROUTE, headers: {} }, first)
  assert.equal(first.status, 200)

  handle.dispose()
  handle.dispose() // idempotent
  assert.equal(disposed.count, 1)
})

await check('registerResourceMonitor: method and rejection degradation', async () => {
  const { ctx, routes } = fakeCtx()
  const handle = registerResourceMonitor(ctx, {
    queryGpu: async () => null,
    readCpuTimes: () => [{ idle: 1, total: 2 }],
    readMemory: () => ({ mem: null, memUsedMb: null, memTotalMb: null }),
  })
  const handler = routes[0].handler
  const res = fakeRes()
  const result = await handler({ method: 'POST', url: HOST_ROUTE, headers: {} }, res)
  assert.equal(result, null)
  assert.equal(res.status, 405)
  handle.dispose()
})

await check('registerResourceMonitor: missing webServer / bad ctx never throws', () => {
  assert.doesNotThrow(() => registerResourceMonitor({}))
  assert.doesNotThrow(() => registerResourceMonitor({ webServer: {} }))
  assert.doesNotThrow(() => registerResourceMonitor(null))
  const handle = registerResourceMonitor(undefined)
  assert.equal(typeof handle.dispose, 'function')
  handle.dispose()
})

await check('registerResourceMonitor: a throwing deps reader degrades to nulls', async () => {
  const { ctx, routes } = fakeCtx()
  const handle = registerResourceMonitor(ctx, {
    now: () => 3_000_000,
    readCpuTimes: () => {
      throw new Error('no cpu')
    },
    readMemory: () => {
      throw new Error('no mem')
    },
    queryGpu: async () => {
      throw new Error('no gpu')
    },
  })
  const res = fakeRes()
  const sample = await routes[0].handler({ method: 'GET', url: HOST_ROUTE, headers: {} }, res)
  assert.equal(res.status, 200)
  assert.equal(sample.cpu, null)
  assert.equal(sample.mem, null)
  await sleep(0)
  handle.dispose()
})

// ---------------------------------------------------------------------------
// createResourcePoller
// ---------------------------------------------------------------------------

await check('createResourcePoller: rejecting fetch reports once and stops after 3', async () => {
  let calls = 0
  const errors = []
  const poller = createResourcePoller({
    fetchImpl: async () => {
      calls += 1
      throw new Error('host down')
    },
    intervalMs: 20,
    onUpdate: () => assert.fail('onUpdate must not fire on failure'),
    onError: (error) => errors.push(error),
  })
  poller.start()
  await sleep(150)
  assert.equal(errors.length, 1, 'onError is throttled to one report')
  assert.equal(errors[0].message, 'host down')
  const callsAfterStop = calls
  assert.ok(calls >= 3 && calls <= 4, `calls=${calls}`)
  await sleep(80)
  assert.equal(calls, callsAfterStop, 'loop must stay stopped after 3 consecutive failures')
  assert.equal(poller.getSnapshot(), null)

  // Still restartable through start().
  poller.start()
  await sleep(120)
  poller.stop()
  assert.ok(calls > callsAfterStop, 'start() after the silent stop must resume polling')
  poller.dispose()
})

await check('createResourcePoller: stop() prevents further calls', async () => {
  let calls = 0
  const poller = createResourcePoller({
    fetchImpl: async () => {
      calls += 1
      return { ok: true, json: async () => ({ ok: true, updatedAt: 1 }) }
    },
    intervalMs: 10,
    onUpdate: () => {},
  })
  poller.start()
  await sleep(35)
  poller.stop()
  const stoppedAt = calls
  await sleep(60)
  assert.equal(calls, stoppedAt)
  poller.dispose()
})

await check('createResourcePoller: onUpdate only on changed updatedAt, snapshot is last', async () => {
  const bodies = [
    { ok: true, updatedAt: 100, cpu: 10, gpu: null, mem: 20, temp: null, memUsedMb: 1, memTotalMb: 2 },
    { ok: true, updatedAt: 100, cpu: 10, gpu: null, mem: 20, temp: null, memUsedMb: 1, memTotalMb: 2 },
    { ok: true, updatedAt: 200, cpu: 30, gpu: null, mem: 40, temp: null, memUsedMb: 1, memTotalMb: 2 },
  ]
  let calls = 0
  const updates = []
  const poller = createResourcePoller({
    fetchImpl: async () => {
      const body = bodies[Math.min(calls, bodies.length - 1)]
      calls += 1
      return { ok: true, json: async () => body }
    },
    intervalMs: 20,
    onUpdate: (sample) => updates.push(sample.updatedAt),
  })
  assert.equal(poller.getSnapshot(), null)
  poller.start()
  await sleep(110)
  poller.stop()
  assert.ok(calls >= 3, `calls=${calls}`)
  assert.deepEqual(updates, [100, 200])
  assert.equal(poller.getSnapshot().updatedAt, 200)
  assert.equal(poller.getSnapshot().cpu, 30)
  poller.dispose()
})

await check('createResourcePoller: no fetch at all is inert, not a crash', async () => {
  const poller = createResourcePoller({ fetchImpl: undefined, intervalMs: 10 })
  assert.doesNotThrow(() => poller.start())
  await sleep(30)
  poller.stop()
  poller.dispose()
})

// ---------------------------------------------------------------------------
// isSampleFresh
// ---------------------------------------------------------------------------

await check('isSampleFresh: fresh vs stale vs invalid', () => {
  assert.equal(isSampleFresh({ updatedAt: 1000 }, 1500, 1000), true)
  assert.equal(isSampleFresh({ updatedAt: 1000 }, 2500, 1000), false)
  assert.equal(isSampleFresh({ updatedAt: 2000 }, 1500, 1000), true, 'small clock skew is fresh')
  assert.equal(isSampleFresh(null, 1000, 1000), false)
  assert.equal(isSampleFresh({}, 1000, 1000), false)
  assert.equal(isSampleFresh({ updatedAt: 1000 }, Number.NaN, 1000), false)
  assert.equal(isSampleFresh({ updatedAt: 1000 }, 1000, -1), false)
})

// ---------------------------------------------------------------------------
// Contract sanity
// ---------------------------------------------------------------------------

await check('client and host agree on ROUTE', () => {
  assert.equal(HOST_ROUTE, CLIENT_ROUTE)
})

await sleep(20)
assert.deepEqual(unhandled, [], 'no unhandled rejections')
console.log(`\nall ${passed} checks passed`)
process.exit(0)
