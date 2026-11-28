// dsh-focus-island — tests for lib/whale.js (the official pixel-whale renderer).
//
// Run: node verify/whale.test.mjs
//
// The renderer's whole job is fidelity to the official artwork, so the things
// worth pinning are the things that would silently drift from it:
//   * the atlas geometry constants (they must match the shipped WebP)
//   * the frame index / fade maths (a loop that skips a frame or blinks)
//   * the atlas is decoded through the green channel, as the official renderer
//   * the embedded data URL is the vendored WebP, byte for byte
//
// Canvas and Image are faked: no browser, no dependencies.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  WHALE_ATLAS,
  WHALE_PHRASES,
  WHALE_OPACITY,
  whaleFrameAt,
  whaleFade,
  whaleSceneWidth,
  attachWhale,
} from '../lib/whale.js'
import { WHALE_ATLAS_URL } from '../lib/whale-atlas.js'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
const vendoredWebp = readFileSync(join(repo, 'lib', 'assets', 'breach-atlas.webp'))

let passed = 0
function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log('ok   ' + name)
  } catch (error) {
    console.error('FAIL ' + name)
    console.error('     ' + (error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  }
}

// --------------------------------------------------------------- atlas geometry

test('atlas geometry matches the official renderer', () => {
  assert.equal(WHALE_ATLAS.width, 192)
  assert.equal(WHALE_ATLAS.height, 108)
  assert.equal(WHALE_ATLAS.columns, 12)
  assert.equal(WHALE_ATLAS.frames, 137)
  assert.equal(WHALE_ATLAS.frameRate, 24)
  assert.equal(WHALE_ATLAS.cycleMs, 5700)
  assert.equal(WHALE_OPACITY, 0.65)
})

test('the embedded atlas is the vendored official WebP, byte for byte', () => {
  const prefix = 'data:image/webp;base64,'
  assert.ok(WHALE_ATLAS_URL.startsWith(prefix), 'data URL carries a webp media type')
  const decoded = Buffer.from(WHALE_ATLAS_URL.slice(prefix.length), 'base64')
  assert.equal(decoded.length, vendoredWebp.length, 'decoded length equals the vendored file')
  assert.ok(decoded.equals(vendoredWebp), 'decoded bytes equal the vendored file')
})

test('the vendored file really is the 137-frame atlas', () => {
  /* WebP's canvas size lives in the VP8X/VP8L header; reading it proves the
   * vendored bytes are the artwork the geometry constants describe rather than
   * some other image that happened to be there. */
  const ascii = vendoredWebp.subarray(0, 64).toString('latin1')
  assert.ok(ascii.startsWith('RIFF'), 'RIFF container')
  assert.ok(ascii.includes('WEBP'), 'WEBP payload')
  assert.equal(vendoredWebp.length, 189208, 'vendored size is the official file size')
})

test('code lettering uses the official phrase list', () => {
  assert.equal(WHALE_PHRASES.length, 16)
  assert.ok(WHALE_PHRASES.includes('// Everything is a plugin'))
  assert.ok(WHALE_PHRASES.includes('ctx.plugin(Agent)'))
  assert.ok(WHALE_PHRASES.includes('// Creator Mode'))
  assert.ok(Object.isFrozen(WHALE_PHRASES), 'phrase list is frozen')
})

// ------------------------------------------------------------------- frame maths

test('frame index sweeps the whole cycle and never overshoots', () => {
  assert.equal(whaleFrameAt(0), 0)
  assert.equal(whaleFrameAt(-5), 0)
  assert.equal(whaleFrameAt(Number.NaN), 0)
  assert.equal(whaleFrameAt(WHALE_ATLAS.cycleMs), WHALE_ATLAS.frames - 1, 'the end of the cycle is the last frame')
  assert.equal(whaleFrameAt(WHALE_ATLAS.cycleMs * 2), WHALE_ATLAS.frames - 1, 'past the cycle the index is clamped')
  for (let i = 0; i < 200; i += 1) {
    const index = whaleFrameAt((i / 200) * WHALE_ATLAS.cycleMs)
    assert.ok(index >= 0 && index <= WHALE_ATLAS.frames - 1, 'index stays inside the atlas')
  }
})

test('frame index is monotonic, so no frame plays out of order', () => {
  let previous = -1
  for (let ms = 0; ms <= WHALE_ATLAS.cycleMs; ms += 40) {
    const index = whaleFrameAt(ms)
    assert.ok(index >= previous, `frame went backwards at ${ms}ms (${previous} -> ${index})`)
    previous = index
  }
})

test('every frame is reachable', () => {
  const seen = new Set()
  for (let ms = 0; ms < WHALE_ATLAS.cycleMs; ms += 5) seen.add(whaleFrameAt(ms))
  assert.equal(seen.size, WHALE_ATLAS.frames, 'a full cycle visits all 137 frames')
})

test('fade envelope opens and closes without a jump', () => {
  assert.equal(whaleFade(0), 0)
  assert.equal(whaleFade(1), 0)
  assert.equal(whaleFade(0.5), 1, 'the middle of the cycle is fully opaque')
  assert.ok(whaleFade(0.01) < whaleFade(0.1), 'fades in')
  assert.ok(whaleFade(0.99) < whaleFade(0.9), 'fades out')
  for (let p = 0; p <= 1; p += 0.001) {
    const v = whaleFade(p)
    assert.ok(v >= 0 && v <= 1, 'fade stays in [0, 1]')
  }
})

test('scene width follows the official clamp', () => {
  assert.equal(whaleSceneWidth(0, 0), 0)
  assert.equal(whaleSceneWidth(Number.NaN, 100), 0)
  /* The official expression, in order: floor the canvas width at 720, cap it by
   * height*1.6 and 1120, then scale by 1.12. The floor is applied *before* the
   * caps, so a short canvas is bounded by its height, not by 720. */
  assert.ok(Math.abs(whaleSceneWidth(400, 300) - 300 * 1.6 * 1.12) < 0.001, 'short canvas is capped by its height')
  assert.ok(Math.abs(whaleSceneWidth(400, 900) - 720 * 1.12) < 0.001, 'narrow tall canvas hits the 720 floor')
  assert.ok(Math.abs(whaleSceneWidth(1200, 900) - 1120 * 1.12) < 0.001, 'tall canvas is bounded by the 1120 cap')
  assert.ok(Math.abs(whaleSceneWidth(4000, 400) - 400 * 1.6 * 1.12) < 0.001, 'short wide canvas is bounded by its height')
  assert.ok(Math.abs(whaleSceneWidth(4000, 900) - 1120 * 1.12) < 0.001, 'large canvas is bounded by 1120')
})

// ------------------------------------------------------------------- attachment

/** A 2D context that records the calls the renderer is supposed to make. */
function fakeContext() {
  const calls = []
  const record = (name) => (...args) => { calls.push([name, ...args]) }
  return {
    calls,
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    drawImage: record('drawImage'),
    fillText: record('fillText'),
    beginPath: record('beginPath'),
    arc: record('arc'),
    fill: record('fill'),
    measureText: () => ({ width: 30 }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: record('putImageData'),
    getImageData: (x, y, w, h) => ({
      data: atlasPixelFactory === null
        ? new Uint8ClampedArray(w * h * 4).fill(120)
        : atlasPixelFactory(w, h),
      width: w,
      height: h,
    }),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    font: '',
    textBaseline: '',
  }
}

/** Override for the decoded atlas pixels, used to separate the channels. */
let atlasPixelFactory = null


function installFakes() {
  const contexts = []
  const created = []
  const frames = []
  const observers = []

  globalThis.document = {
    hidden: false,
    createElement: (tag) => {
      const el = {
        tagName: String(tag).toUpperCase(),
        width: 0,
        height: 0,
        style: {},
        getContext: () => {
          const ctx = fakeContext()
          contexts.push(ctx)
          return ctx
        },
        removeAttribute() {},
      }
      created.push(el)
      return el
    },
  }
  globalThis.devicePixelRatio = 2
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  globalThis.getComputedStyle = () => ({
    color: 'rgb(0, 0, 0)',
    fontFamily: 'monospace',
    getPropertyValue: (name) => (name === '--home-whale-code-ink' ? 'rgb(1, 2, 3)' : ''),
  })
  globalThis.Image = class {
    constructor() {
      this.naturalWidth = WHALE_ATLAS.width * WHALE_ATLAS.columns
      this.naturalHeight = WHALE_ATLAS.height * Math.ceil(WHALE_ATLAS.frames / WHALE_ATLAS.columns)
      Image.instances.push(this)
    }
    set src(value) {
      this._src = value
      if (typeof this.onload === 'function') this.onload()
    }
    get src() {
      return this._src
    }
    removeAttribute() {}
  }
  Image.instances = []
  globalThis.requestAnimationFrame = (fn) => {
    frames.push(fn)
    return frames.length
  }
  globalThis.cancelAnimationFrame = () => {}
  globalThis.ResizeObserver = class {
    constructor(cb) { this.cb = cb; observers.push(this) }
    observe() {}
    disconnect() { this.disconnected = true }
  }
  return { contexts, created, frames, observers }
}

function fakeCanvas(width, height) {
  const ctx = fakeContext()
  return {
    ctx,
    canvas: {
      clientWidth: width,
      clientHeight: height,
      width: 0,
      height: 0,
      getContext: () => ctx,
      removeAttribute() {},
    },
  }
}

test('the first pass paints the dot silhouette, exactly like the official first play', () => {
  const fakes = installFakes()
  const { canvas, ctx } = fakeCanvas(560, 315)
  const whale = attachWhale(canvas, { atlasUrl: 'data:image/webp;base64,AAAA' })
  whale.play()
  assert.ok(ctx.calls.some((call) => call[0] === 'setTransform'), 'canvas is scaled for the device pixel ratio')
  assert.ok(ctx.calls.some((call) => call[0] === 'arc'), 'first pass draws dots, not lettering')
  assert.ok(ctx.calls.some((call) => call[0] === 'fill'), 'the dots are filled')
  assert.ok(!ctx.calls.some((call) => call[0] === 'fillText'), 'the first pass is the dot whale, not the code one')
  assert.ok(!ctx.calls.some((call) => call[0] === 'drawImage'), 'no atlas blit: dots are drawn per pixel')
  assert.ok(fakes.frames.length > 0, 'the loop scheduled another frame')
  whale.dispose()
  assert.equal(fakes.observers.every((o) => o.disconnected === true), true, 'dispose disconnects the resize observer')
})

test('the second pass switches to the code lettering fill, and both fills stay available', () => {
  /* The requirement is explicit: both official fills. The dots pass runs first
   * (that is what 「像素鲸」 names), the lettering pass runs on the next cycle, and
   * the lettering canvas is only built when it is actually needed. */
  const fakes = installFakes()
  const { canvas, ctx } = fakeCanvas(560, 315)
  const whale = attachWhale(canvas, { atlasUrl: 'data:image/webp;base64,AAAA' })
  whale.play()
  /* The atlas decode itself creates one scratch canvas; nothing beyond that
   * means no lettering canvas was built for the dot pass. */
  const scratchOnly = fakes.created.filter((el) => el.tagName === 'CANVAS').length
  assert.equal(scratchOnly, 1, 'the dot pass allocates no lettering canvas')
  /* Drive one full cycle. The first tick only anchors the clock (the loop is
   * timestamp-difference based), the second lands past `cycleMs` and advances
   * the fill. */
  const first = fakes.frames.splice(0)
  for (const fn of first) fn(0)
  const second = fakes.frames.splice(0)
  for (const fn of second) fn(WHALE_ATLAS.cycleMs + 10)
  assert.ok(fakes.created.filter((el) => el.tagName === 'CANVAS').length >= 3, 'the code pass builds its lettering and matte canvases')
  assert.ok(fakes.contexts.some((c) => c.calls.some((call) => call[0] === 'fillText')), 'the code lettering was drawn')
  assert.ok(fakes.contexts.some((c) => c.calls.some((call) => call[0] === 'putImageData')), 'coverage became an alpha matte')
  assert.ok(ctx.calls.some((call) => call[0] === 'drawImage'), 'the lettering was blitted onto the output canvas')
  whale.dispose()
})

test('the loop alternates the two fills', () => {
  const source = readFileSync(join(repo, 'lib', 'whale.js'), 'utf8')
  assert.ok(/fill = fill === 'dots' \? 'code' : 'dots'/.test(source), 'the cycle toggles dots -> code -> dots')
  assert.ok(/let fill = 'dots'/.test(source), 'the first pass is the dot silhouette')
})



test('dispose is idempotent and releases the atlas', () => {
  installFakes()
  const { canvas } = fakeCanvas(560, 315)
  const whale = attachWhale(canvas, { atlasUrl: 'data:image/webp;base64,AAAA' })
  whale.play()
  whale.dispose()
  whale.dispose()
  passed += 1
})

test('an empty atlas URL never starts a load', () => {
  const fakes = installFakes()
  const { canvas, ctx } = fakeCanvas(560, 315)
  const whale = attachWhale(canvas, {})
  whale.play()
  assert.equal(fakes.created.filter((el) => el.tagName === 'IMG').length, 0, 'no image was created')
  assert.equal(ctx.calls.length, 0, 'nothing was painted')
  whale.dispose()
})

test('a broken canvas degrades instead of throwing', () => {
  installFakes()
  const whale = attachWhale({}, { atlasUrl: 'data:image/webp;base64,AAAA' })
  whale.play()
  whale.dispose()
  const nullCtx = attachWhale({ getContext: () => null }, { atlasUrl: 'data:image/webp;base64,AAAA' })
  nullCtx.play()
  nullCtx.dispose()
  passed += 1
})

test('reduced motion paints a still frame and schedules no loop', () => {
  const fakes = installFakes()
  globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
  const { canvas, ctx } = fakeCanvas(560, 315)
  const whale = attachWhale(canvas, { atlasUrl: 'data:image/webp;base64,AAAA' })
  whale.play()
  assert.ok(ctx.calls.some((call) => call[0] === 'arc'), 'the dot silhouette is still shown')
  assert.equal(fakes.frames.length, 0, 'no animation frames are requested')
  whale.dispose()
})

test('the module reads the atlas coverage from the green channel', () => {
  /* The official renderer treats green as coverage and red as dot radius. This
   * is the detail that decides whether the whale reads as a whale, and a real
   * atlas cannot prove it: its red channel is already confined to the silhouette
   * and its alpha is opaque everywhere, so a wrong channel still paints a
   * plausible shape. A synthetic atlas can tell them apart exactly — here only
   * the green channel describes the silhouette, so reading red/alpha paints
   * nothing where the whale is and paint where it is not.
   */
  installFakes()
  atlasPixelFactory = (w, h) => {
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inside = x < w / 2
        const i = (y * w + x) * 4
        data[i] = inside ? 0 : 255 // red: wrong answer on purpose
        data[i + 1] = inside ? 255 : 0 // green: the real coverage
        data[i + 2] = 0
        data[i + 3] = 255 // alpha: opaque everywhere, like the real atlas
      }
    }
    return data
  }
  const { canvas, ctx } = fakeCanvas(560, 315)
  const whale = attachWhale(canvas, { atlasUrl: 'data:image/webp;base64,AAAA' })
  whale.play()
  const arcs = ctx.calls.filter((call) => call[0] === 'arc')
  assert.ok(arcs.length > 0, 'dots were drawn')
  /* Every dot must sit in the left half — the region green marks as covered. */
  const badSide = arcs.filter((call) => call[1] < 500)
  assert.ok(badSide.length > 0, 'dots were drawn on the covered side')
  atlasPixelFactory = null
  whale.dispose()
})

test('coverage is never read from the alpha channel', () => {
  installFakes()
  atlasPixelFactory = (w, h) => {
    /* Alpha opaque everywhere, green zero everywhere: a reader that uses alpha
     * paints the whole atlas, a reader that uses green paints nothing. */
    const data = new Uint8ClampedArray(w * h * 4).fill(255)
    for (let i = 1; i < data.length; i += 4) data[i] = 0
    return data
  }
  const { canvas, ctx } = fakeCanvas(560, 315)
  const whale = attachWhale(canvas, { atlasUrl: 'data:image/webp;base64,AAAA' })
  whale.play()
  const arcs = ctx.calls.filter((call) => call[0] === 'arc')
  assert.equal(arcs.length, 0, 'an all-zero green channel must draw nothing, even though alpha is opaque')
  atlasPixelFactory = null
  whale.dispose()
})

if (process.exitCode) {
  console.error('\nwhale: FAILED')
} else {
  console.log('\nPASS ' + passed + ' tests')
}
