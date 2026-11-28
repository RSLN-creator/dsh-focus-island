/**
 * dsh-focus-island — the official DeepSeek pixel whale, reused for the strict mask.
 *
 * Why this file exists: 严格模式 has to show *the* whale the app shows on a new
 * conversation, not a redrawing of it. The official artwork is a 137-frame WebP
 * atlas shipped by `@deepseek-ai/dsh-client-ui-brand-official`; we vendor that
 * file (lib/assets/breach-atlas.webp, byte-identical) and drive it the same way
 * the official renderer does, so the mask cannot drift from the real thing.
 *
 * Atlas semantics, taken from the official renderer (not guessed):
 *   - geometry: 192 x 108 cells, 12 columns, 137 frames
 *   - red channel  = dot radius for the "pixel" fill
 *   - green channel = coverage, used as alpha for both fills
 *   - the first play of every cycle uses the "code" fill: the whale silhouette
 *     is filled with lines of code rather than dots
 *
 * Differences from the official renderer, all deliberate and all local:
 *   - it loops (the mask stays up for minutes, the home artwork plays once)
 *   - it does not observe theme/intersection changes; the mask owns its own
 *     lifecycle and disposes with it
 *   - `prefers-reduced-motion` paints one still frame instead of stopping
 *     (the mask is a blocking screen, an empty canvas would look broken)
 *
 * Nothing here runs at import time: the module is concatenated into the client
 * bundle, so every DOM touch stays inside `attachWhale()`.
 */

/** Frame geometry of the bundled atlas — checked against the decoded image. */
export const WHALE_ATLAS = Object.freeze({
  width: 192,
  height: 108,
  columns: 12,
  frames: 137,
  frameRate: 24,
  cycleMs: 5700,
})

/**
 * Code lines drawn inside the whale silhouette.
 *
 * These are the official artwork's own phrases (`home-whale/artwork.ts`): the
 * whale is a DeepSeek Harness shape, so the lettering is Harness API calls.
 */
export const WHALE_PHRASES = Object.freeze([
  '// Everything is a plugin', 'ctx.plugin(Agent)', 'await agent.run()',
  'ctx.on("turn/end", next)', 'const tools = ctx.tools', 'await session.append(event)',
  'return next()', 'ctx.effect(() => dispose)', 'const { skills } = ctx',
  'yield tool.result', 'type Context = Harness', 'MCP.connect()',
  'useSession()', 'const workspace = cwd', 'await runtime.start()', '// Creator Mode',
])

/** Official artwork opacity for the fill. */
export const WHALE_OPACITY = 0.65

/** Official lettering size in CSS pixels. */
export const WHALE_FONT_SIZE = 7

/**
 * Frame index for a point inside one cycle.
 *
 * Pure, so the loop's timing is testable without a canvas.
 *
 * @param {number} elapsedMs Milliseconds since the cycle started.
 * @returns {number} Frame index in `[0, WHALE_ATLAS.frames - 1]`.
 */
export function whaleFrameAt(elapsedMs) {
  const ms = Number(elapsedMs)
  if (!Number.isFinite(ms) || ms <= 0) return 0
  const progress = ms / WHALE_ATLAS.cycleMs
  if (progress >= 1) return WHALE_ATLAS.frames - 1
  return Math.min(WHALE_ATLAS.frames - 1, Math.floor(progress * WHALE_ATLAS.frames))
}

/**
 * Fade envelope of one cycle: quick in, long hold, quick out.
 *
 * Same shape as the official `paint()` calculation (15x in / 10x out), exposed
 * so a test can prove the loop does not blink at the seam.
 *
 * @param {number} progress Cycle position in `[0, 1]`.
 * @returns {number} Alpha multiplier in `[0, 1]`.
 */
export function whaleFade(progress) {
  const p = Number(progress)
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return 0
  return Math.max(0, Math.min(1, p * 15, (1 - p) * 10))
}

/**
 * Scene width for a canvas, mirroring the official sizing rule.
 *
 * @param {number} width Canvas CSS width.
 * @param {number} height Canvas CSS height.
 * @returns {number} Width the atlas is drawn at, before centring.
 */
export function whaleSceneWidth(width, height) {
  const w = Number.isFinite(width) ? width : 0
  const h = Number.isFinite(height) ? height : 0
  if (w <= 0 || h <= 0) return 0
  return Math.min(Math.max(w * 0.94, 720), h * 1.6, 1120) * 1.12
}

/** Deterministic pseudo-random source (numerical recipes LCG), as the official one. */
function whaleRandomSource(seed) {
  let state = Number.isFinite(seed) ? seed : 2654435769
  return function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

/**
 * Draw the code lettering that fills the silhouette.
 *
 * @param {object} options
 * @param {string[]} [options.phrases] Lines to tile.
 * @param {number} [options.fontSize] Lettering size in CSS pixels.
 * @returns {object} `{ resize(canvas, width), paint(...), dispose() }`
 */
export function createWhaleLettering(options) {
  const config = options && typeof options === 'object' ? options : {}
  const phrases = Array.isArray(config.phrases) && config.phrases.length > 0 ? config.phrases : WHALE_PHRASES
  const fontSize = Number.isFinite(config.fontSize) ? config.fontSize : WHALE_FONT_SIZE

  const lettering = document.createElement('canvas')
  const mask = document.createElement('canvas')
  const ink = lettering.getContext('2d')
  const matte = mask.getContext('2d')
  if (ink === null || matte === null) return null

  mask.width = WHALE_ATLAS.width
  mask.height = WHALE_ATLAS.height
  const alpha = matte.createImageData(WHALE_ATLAS.width, WHALE_ATLAS.height)
  const stride = WHALE_ATLAS.width * WHALE_ATLAS.columns

  /** Coverage of one atlas pixel (green channel), matching the official read. */
  function coverage(pixels, frame, x, y) {
    const offsetX = (frame % WHALE_ATLAS.columns) * WHALE_ATLAS.width
    return pixels[((Math.floor(frame / WHALE_ATLAS.columns) * WHALE_ATLAS.height + y) * stride + offsetX + x) * 4 + 1]
  }

  return {
    resize(canvas, width) {
      const height = width * WHALE_ATLAS.height / WHALE_ATLAS.width
      const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2)
      lettering.width = Math.ceil(width * dpr)
      lettering.height = Math.ceil(height * dpr)
      ink.setTransform(dpr, 0, 0, dpr, 0, 0)
      const style = getComputedStyle(canvas)
      ink.fillStyle = style.getPropertyValue('--home-whale-code-ink') || 'currentColor'
      ink.font = '500 ' + fontSize + 'px ' + (style.fontFamily || 'monospace')
      ink.textBaseline = 'middle'
      const random = whaleRandomSource(2654435769)
      const words = []
      for (let y = fontSize; y < height; y += fontSize * 1.2) {
        for (let x = -random() * fontSize * 10; x < width;) {
          const text = phrases[Math.floor(random() * phrases.length)]
          const room = ink.measureText(text).width
          words.push({ text, x, y, alpha: 0.65 + random() * 0.35 })
          x += room + fontSize * (0.35 + random() * 0.65)
        }
      }
      ink.clearRect(0, 0, width, height)
      for (const word of words) {
        ink.globalAlpha = word.alpha
        ink.fillText(word.text, word.x, word.y)
      }
      ink.globalAlpha = 1
    },
    /**
     * Paint one frame of lettering clipped to the whale silhouette.
     *
     * @param {CanvasRenderingContext2D} ctx Target context.
     * @param {Uint8ClampedArray} pixels Decoded atlas pixels.
     * @param {number} frame Atlas frame index.
     * @param {number} left Scene left edge in CSS pixels.
     * @param {number} top Scene top edge in CSS pixels.
     * @param {number} width Scene width in CSS pixels.
     * @param {number} level Opacity multiplier.
     */
    paint(ctx, pixels, frame, left, top, width, level) {
      const data = alpha.data
      for (let y = 0; y < WHALE_ATLAS.height; y++) {
        for (let x = 0; x < WHALE_ATLAS.width; x++) {
          data[(y * WHALE_ATLAS.width + x) * 4 + 3] = coverage(pixels, frame, x, y)
        }
      }
      matte.putImageData(alpha, 0, 0)
      const height = width * WHALE_ATLAS.height / WHALE_ATLAS.width
      ctx.globalAlpha = level
      ctx.drawImage(lettering, left, top, width, height)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(mask, left, top, width, height)
      ctx.globalCompositeOperation = 'source-over'
    },
    dispose() {
      lettering.width = lettering.height = 0
      mask.width = mask.height = 0
    },
  }
}

/** Inert handle returned when the environment cannot animate. */
const NO_WHALE = Object.freeze({ play() {}, dispose() {} })

/**
 * Paint one frame as the pixel-dot silhouette.
 *
 * This is the official *first* fill (dots), and the one the requirement means by
 * 「像素鲸」: the lettering fill is the official second play. Both are shipped,
 * so the mask alternates between them the way clicking the home artwork does.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {Uint8ClampedArray} pixels Decoded atlas pixels.
 * @param {number} frame Atlas frame index.
 * @param {number} left Scene left edge.
 * @param {number} top Scene top edge.
 * @param {number} width Scene width.
 * @param {number} level Opacity multiplier.
 */
export function paintWhaleDots(ctx, pixels, frame, left, top, width, level) {
  const cell = width / WHALE_ATLAS.width
  const offsetX = (frame % WHALE_ATLAS.columns) * WHALE_ATLAS.width
  const offsetY = Math.floor(frame / WHALE_ATLAS.columns) * WHALE_ATLAS.height
  const stride = WHALE_ATLAS.width * WHALE_ATLAS.columns
  const base = ctx.globalAlpha
  for (let y = 0; y < WHALE_ATLAS.height; y++) {
    for (let x = 0; x < WHALE_ATLAS.width; x++) {
      const offset = ((offsetY + y) * stride + offsetX + x) * 4
      const coverage = pixels[offset + 1] / 255
      if (coverage < 0.015) continue
      ctx.globalAlpha = coverage * level
      ctx.beginPath()
      ctx.arc(left + (x + 0.5) * cell, top + (y + 0.5) * cell, (pixels[offset] / 255) * cell, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = base
}

/**
 * Attach the looping whale to one canvas.
 *
 * Owns its animation frames, observers and the decoded atlas; `dispose()` is
 * idempotent and releases all of it. A missing canvas context, a failed atlas
 * load or a dead URL degrades to an inert decoration — the mask still shows its
 * text, it never blocks dismissal.
 *
 * @param {HTMLCanvasElement} canvas Presentation canvas, sized by CSS.
 * @param {object} [options]
 * @param {string} [options.atlasUrl] URL of the vendored atlas.
 * @param {boolean} [options.static] Paint one still frame instead of looping.
 * @returns {{ play: () => void, dispose: () => void }} Playback control.
 */
export function attachWhale(canvas, options) {
  if (canvas === null || canvas === undefined || typeof canvas.getContext !== 'function') return NO_WHALE
  const context = canvas.getContext('2d')
  if (context === null) return NO_WHALE
  const config = options && typeof options === 'object' ? options : {}
  const atlasUrl = typeof config.atlasUrl === 'string' ? config.atlasUrl : ''
  const still = config.static === true
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
  const frozen = still || (media !== null && media.matches === true)

  const ctx = context
  const image = new Image()
  let pixels
  let lettering
  let started
  let loading = false
  let disposed = false
  let failed = false
  let frame = 0
  let layoutFrame = 0
  let last = -Infinity
  /* Official behaviour: the first play is dots, the second lettering. The mask
   * stays up for minutes, so it alternates rather than picking one forever —
   * 「像素鲸」 is the dots pass, and the code pass is what keeps a long mask from
   * being a static picture. */
  let fill = 'dots'

  function clear() {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
  }

  function stop() {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
    frame = 0
    started = undefined
    clear()
  }

  function paintAt(elapsedMs) {
    if (pixels === undefined) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width <= 0 || height <= 0) return
    const progress = Math.max(0, Math.min(1, elapsedMs / WHALE_ATLAS.cycleMs))
    const index = whaleFrameAt(elapsedMs)
    clear()
    ctx.fillStyle = getComputedStyle(canvas).color
    const sceneWidth = whaleSceneWidth(width, height)
    const sceneHeight = sceneWidth * WHALE_ATLAS.height / WHALE_ATLAS.width
    const left = (width - sceneWidth) / 2
    const top = height * 0.5 - sceneHeight / 2
    const level = Math.min(1, WHALE_OPACITY * 1.5) * whaleFade(progress)
    if (fill === 'code') {
      /* Built on first use: the dot pass needs no lettering canvas at all, and a
       * mask never left up past one cycle should not allocate one. */
      if (lettering === undefined) {
        lettering = createWhaleLettering({})
        if (lettering === null) {
          /* No second context available: stay on dots rather than showing a
           * blank mask for a whole cycle. */
          fill = 'dots'
          paintWhaleDots(ctx, pixels, index, left, top, sceneWidth, level)
          return
        }
        lettering.resize(canvas, sceneWidth)
      }
      lettering.paint(ctx, pixels, index, left, top, sceneWidth, level)
      return
    }
    paintWhaleDots(ctx, pixels, index, left, top, sceneWidth, level)
  }

  function tick(now) {
    frame = 0
    if (disposed || document.hidden) return
    if (started === undefined) started = now
    const elapsed = now - started
    if (elapsed - last + 0.5 >= 1000 / WHALE_ATLAS.frameRate) {
      last = elapsed
      paintAt(elapsed)
    }
    if (elapsed >= WHALE_ATLAS.cycleMs) {
      /* Loop: the mask can stay up for minutes, so one cycle is not enough.
       * Alternating the two official fills keeps a long mask from being the same
       * picture forever; the first pass — the one the user sees first, and the
       * one 「像素鲸」 names — is the dot silhouette. */
      started = now
      last = -Infinity
      fill = fill === 'dots' ? 'code' : 'dots'
      paintAt(0)
    }
    frame = requestAnimationFrame(tick)
  }

  function resize() {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (lettering !== undefined) lettering.resize(canvas, whaleSceneWidth(width, height))
    if (frozen) {
      /* Reduced motion still shows the artwork, just not moving: the still is
       * the fully-grown frame where the silhouette reads best. */
      paintAt(WHALE_ATLAS.cycleMs * 0.55)
      return
    }
    stop()
    started = undefined
    last = -Infinity
    /* Paint one frame now instead of waiting for the first animation frame: the
     * mask is a blocking screen, and a blank canvas for a frame or two reads as
     * broken artwork rather than as an animation about to start. */
    paintAt(0)
    if (typeof requestAnimationFrame === 'function') {
      frame = requestAnimationFrame(tick)
    }
  }

  function scheduleResize() {
    if (disposed || layoutFrame !== 0) return
    if (typeof requestAnimationFrame !== 'function') return
    layoutFrame = requestAnimationFrame(function () {
      layoutFrame = 0
      resize()
    })
  }

  image.onload = function () {
    if (disposed) return
    const source = document.createElement('canvas')
    source.width = image.naturalWidth
    source.height = image.naturalHeight
    try {
      if (source.width !== WHALE_ATLAS.width * WHALE_ATLAS.columns
        || source.height !== WHALE_ATLAS.height * Math.ceil(WHALE_ATLAS.frames / WHALE_ATLAS.columns)) {
        throw new Error('whale atlas dimensions do not match its frame geometry')
      }
      const reader = source.getContext('2d')
      if (reader === null) throw new Error('whale atlas canvas context unavailable')
      reader.drawImage(image, 0, 0)
      pixels = reader.getImageData(0, 0, source.width, source.height).data
    } catch (error) {
      failed = true
      stop()
      console.warn('[dsh-focus-island] strict mask artwork unavailable', error)
      return
    } finally {
      source.width = source.height = 0
      image.removeAttribute('src')
    }
    /* Lettering is built lazily by the code pass — the first pass is dots and
     * does not need it. */
    resize()
  }
  image.onerror = function () {
    failed = true
    console.warn('[dsh-focus-island] strict mask artwork could not be decoded')
  }

  let observer = null
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(scheduleResize)
    observer.observe(canvas)
  }

  return {
    play() {
      if (failed || disposed || atlasUrl === '') return
      if (pixels !== undefined) {
        resize()
        return
      }
      if (loading) return
      loading = true
      image.src = atlasUrl
    },
    dispose() {
      if (disposed) return
      disposed = true
      stop()
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(layoutFrame)
      layoutFrame = 0
      image.onload = null
      image.onerror = null
      image.removeAttribute('src')
      pixels = undefined
      if (lettering !== undefined) lettering.dispose()
      lettering = undefined
      if (observer !== null) observer.disconnect()
      observer = null
    },
  }
}
