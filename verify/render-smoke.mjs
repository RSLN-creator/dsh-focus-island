// dsh-focus-island — 真实浏览器渲染判据（严格模式遮罩）。
//
// 为什么要有这个文件：`verify/widget-smoke.mjs` 的 hook runtime 不执行 CSS，
// `getBoundingClientRect` 是桩；遮罩「是不是真的整屏、鲸是不是真的画出来了、
// 右下角按钮是不是真的在右下角」这些问题在假 DOM 里全部无法回答。
//
// 本文件把生成后的 `lib/client.js` 真正加载进 Chromium，用真的 React DOM 渲染
// widget，再量真实计算样式与几何；鲸用真实 canvas 画，检查像素非空。
//
// 无浏览器时**跳过**（打印原因，绝不静默）；有浏览器时它就是权威判据。
//
// Run: node verify/render-smoke.mjs [--screenshots <dir>]

import { createRequire } from 'node:module'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
const require = createRequire(join(repo, 'package.json'))

/** 找一个可用的 Chromium/Edge；找不到就返回 null（调用方 skip）。 */
function findBrowser() {
  const bases = []
  if (process.env.LOCALAPPDATA) bases.push(join(process.env.LOCALAPPDATA, 'ms-playwright'))
  for (const base of bases) {
    let dirs = []
    try { dirs = require('node:fs').readdirSync(base).filter((d) => d.startsWith('chromium-')) } catch { continue }
    for (const dir of dirs) {
      for (const sub of ['chrome-win64', 'chrome-win']) {
        const exe = join(base, dir, sub, 'chrome.exe')
        if (existsSync(exe)) return exe
      }
    }
  }
  for (const exe of [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ]) if (existsSync(exe)) return exe
  return null
}

const exe = findBrowser()
if (exe === null) {
  console.log('render smoke: SKIPPED — 本机没有可用的 Chromium/Edge，真实渲染判据未执行')
  process.exit(0)
}

let chromium
try {
  ({ chromium } = require('playwright-core'))
} catch {
  /* playwright-core 只装在别的项目里；用绝对路径借用，不往本仓库加依赖。 */
  const borrowed = 'D:/9_Code_Workspace/dsh-webcode-bridge/package/dsh-webcode-bridge/node_modules/playwright-core'
  if (!existsSync(borrowed)) {
    console.log('render smoke: SKIPPED — playwright-core 不可用，真实渲染判据未执行')
    process.exit(0)
  }
  ;({ chromium } = require(borrowed))
}

const atlasSource = readFileSync(join(repo, 'lib', 'whale-atlas.js'), 'utf8')
const atlasMatch = atlasSource.match(/'data:image\/webp;base64,[^']+'/)
if (atlasMatch === null) {
  console.error('render smoke: FAILED — 内嵌鲸图集缺失')
  process.exit(1)
}
const atlasDataUrl = atlasMatch[0].slice(1, -1)

/**
 * The widget module, assembled the way `build.mjs` assembles the bundle.
 *
 * Rendering through `plugin.apply()` cannot work here: that path builds its own
 * core, so the page could never reach the finished/strict state deterministically.
 * Loading the three modules as one ES module and calling `createWidget()` with a
 * fixed api renders the *same code* with a state the test owns.
 */
function widgetModuleSource() {
  const strip = (text) => text
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    .replace(/^export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm, '')
    .replace(/^import\s+\{[^}]*\}\s+from\s+'\.\/[^']+'\s*;?\s*$/gm, '')
  return [
    strip(readFileSync(join(repo, 'lib', 'whale-atlas.js'), 'utf8')),
    strip(readFileSync(join(repo, 'lib', 'whale.js'), 'utf8')),
    strip(readFileSync(join(repo, 'lib', 'widget.js'), 'utf8')),
  ].join('\n')
}
const widgetSource = widgetModuleSource()
const shotIndex = process.argv.indexOf('--screenshots')
const shotDir = shotIndex >= 0 ? process.argv[shotIndex + 1] : null
if (shotDir !== null) mkdirSync(shotDir, { recursive: true })

const failures = []
function check(condition, message) {
  if (condition) return
  failures.push(message)
  console.error('FAIL ' + message)
}

const browser = await chromium.launch({ headless: true, executablePath: exe })
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
    /* The official token sheet is not importable as a file URL with relative
     * font paths, so the test injects the same handful of semantic values the
     * widget reads. They are the official values (light: white surfaces / dark:
     * #232324), which is what the assertions compare against. */
    const tokens = theme === 'light'
      ? `:root{--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f5f6f8;--dsw-alias-label-primary:#1a1a1a;--dsw-alias-label-secondary:#6b6f76;--dsw-alias-label-tertiary:#8b8f96;--dsw-alias-label-primary-foreground:#fff;--dsw-alias-border-l2:#e6e8eb;--dsw-alias-border-l3:#d0d3d8;--dsw-alias-bg-skeleton:#eceef1;--dsw-alias-state-business-primary:#4d6bfe;--dsw-alias-state-warn-primary:#e8a13a;--dsw-alias-state-error-primary:#e5484d;--dsw-alias-state-success-primary:#30a46c;--dsw-alias-button-info-fill:#4d6bfe;--dsw-alias-button-info-hover:#3f5ae6;--dsw-alias-interactive-bg-hover:rgba(0,0,0,.05);--dsw-alias-interactive-bg-active:rgba(0,0,0,.09);--dsw-alias-button-ghost-active-fill:rgba(0,0,0,.06);--dsw-alias-button-ghost-active-border:rgba(0,0,0,.12);--dsw-radius-sm:8px;--dsw-radius-md:12px;--dsw-radius-xl:20px;}`
      : `:root{--dsw-alias-bg-base:#232324;--dsw-alias-bg-layer-1:#232324;--dsw-alias-bg-layer-2:#2b2b2d;--dsw-alias-label-primary:#f2f3f5;--dsw-alias-label-secondary:#a1a5ad;--dsw-alias-label-tertiary:#7d818a;--dsw-alias-label-primary-foreground:#1a1a1a;--dsw-alias-border-l2:#3a3a3d;--dsw-alias-border-l3:#4a4a4e;--dsw-alias-bg-skeleton:#333335;--dsw-alias-state-business-primary:#4d6bfe;--dsw-alias-state-warn-primary:#e8a13a;--dsw-alias-state-error-primary:#e5484d;--dsw-alias-state-success-primary:#30a46c;--dsw-alias-button-info-fill:#4d6bfe;--dsw-alias-button-info-hover:#3f5ae6;--dsw-alias-interactive-bg-hover:rgba(255,255,255,.07);--dsw-alias-interactive-bg-active:rgba(255,255,255,.12);--dsw-alias-button-ghost-active-fill:rgba(255,255,255,.09);--dsw-alias-button-ghost-active-border:rgba(255,255,255,.16);--dsw-radius-sm:8px;--dsw-radius-md:12px;--dsw-radius-xl:20px;}`

    await page.setContent(`<!DOCTYPE html><html lang="zh"${theme === 'dark' ? ' data-ds-dark-theme' : ''}><head><meta charset="utf-8"><style>${tokens}</style></head><body style="margin:0;background:var(--dsw-alias-bg-base)"><div id="mount"></div></body></html>`)

    const info = await page.evaluate(async ([code, atlas]) => {
      /* 真实 React 18 不可从本机任何包直接 require（它被打进前端 bundle），
       * 所以这里用一个**有状态**的极简 hook 运行时：它真的会重渲染、真的把
       * 树写进 DOM，只是不做协调。对「几何与像素」这类判据足够，而且不引入
       * 任何依赖。 */
      const hooks = []
      let cursor = 0
      let rerender = null
      /* Effects really run. `useEffect` is the only thing that attaches the
       * whale, so a no-op stub would make this harness unable to answer the one
       * question it exists for ("is the artwork actually on screen"). */
      const effectSlots = []
      let effectCursor = 0
      const pendingEffects = []
      function runPendingEffects() {
        const runs = pendingEffects.splice(0)
        for (const slot of runs) {
          try {
            const cleanup = slot.effect()
            slot.cleanup = typeof cleanup === 'function' ? cleanup : null
          } catch (error) {
            console.warn('effect failed:', error && error.message)
            slot.cleanup = null
          }
        }
      }
      const React = {
        Fragment: 'fragment',
        createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
        useState(initial) {
          const index = cursor++
          if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial
          return [hooks[index], (next) => {
            const value = typeof next === 'function' ? next(hooks[index]) : next
            if (!Object.is(value, hooks[index])) { hooks[index] = value; if (rerender) rerender() }
          }]
        },
        useEffect(effect, deps) {
          const index = effectCursor++
          const slot = effectSlots[index] || (effectSlots[index] = { deps: undefined, cleanup: null, effect })
          slot.effect = effect
          const changed = slot.deps === undefined || !deps || deps.length !== slot.deps.length
            || deps.some((dep, i) => !Object.is(dep, slot.deps[i]))
          if (!changed) return
          slot.deps = deps === undefined ? null : deps
          pendingEffects.push(slot)
        },
        useLayoutEffect(effect, deps) { React.useEffect(effect, deps) },
        useRef(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: initial === undefined ? null : initial }; return hooks[index] },
        useMemo(factory) { return factory() },
        useCallback(fn) { return fn },
        memo: (c) => c,
        useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
      }

      /* Evaluate the three modules as one body and take the widget factory. */
      const factory = new Function('React', 'document', 'window', 'console',
        code + '\nreturn createWidget;')(React, document, window, console)
      const attachWhaleFn = new Function('React', 'document', 'window', 'console',
        code + '\nreturn attachWhale;')(React, document, window, console)
      const atlasConst = new Function('React', 'document', 'window', 'console',
        code + '\nreturn WHALE_ATLAS_URL;')(React, document, window, console)

      /* The mask state the page must show: strict on, round finished, a real
         conversation name. The core is a fixed snapshot so the render is
         deterministic; the integration layer's own boot logic is covered by
         verify/strict-smoke.mjs. */
      const state = {
        phase: 'finished',
        durationMinutes: 5,
        durationMs: 5 * 60000,
        elapsedMs: 5 * 60000,
        watchedMs: 7 * 60000,
        remainingMs: 0,
        progress: 1,
        modelBusy: false,
        visible: true,
        typing: false,
        draftEmpty: true,
        sending: false,
        skipArmed: false,
        pauseReason: null,
      }
      const api = {
        core: {
          getState: () => Object.assign({}, state),
          subscribe: () => () => {},
          onUserSend() {}, skipArm() {}, skipConfirm() {}, skipCancel() {}, reset() {},
          setDurationMinutes() {}, pause() {}, start() {}, tick() {}, setPresence() {},
          snapshot: () => ({}), restore() {}, destroy() {},
        },
        t: (key, vars) => {
          const table = {
            'title': '惜时岛', 'action.collapse': '收起', 'action.expand': '展开', 'action.skip': '跳过',
            'action.settings': '设置', 'action.restart': '重新计时', 'action.ack': '知道了',
            'settings.strict': '严格模式',
            'settings.strictHint': '到点后整屏遮住……',
            'strict.line': '本窗口已停留 {n} 分钟', 'strict.itemMinutes': '{n} 分钟',
            'strict.skipRound': '跳过本轮', 'strict.skipRoundHint': '……',
            'strict.skipAll': '退出所有严格模式', 'strict.skipAllHint': '……',
            'strict.untitled': '未命名会话', 'unit.min': '分钟', 'unit.minutes': '分钟',
            'resources.title': '本机资源', 'resources.cpu': 'CPU', 'resources.gpu': 'GPU',
            'resources.mem': '内存', 'resources.temp': 'GPU 温度', 'resources.na': '--',
          }
          let text = table[key] === undefined ? key : table[key]
          if (vars) text = text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] === undefined ? m : String(vars[name])))
          return text
        },
        getLocale: () => 'zh', subscribeLocale: () => () => {}, setLocale() {},
        getResources: () => ({ cpu: 23, gpu: 61, mem: 47, temp: 64 }),
        subscribeResources: () => () => {},
        resourceMode: 'off', setResourceMode() {},
        persist() {}, loadPref: (key, fallback) => (key === 'strictMode' ? true : fallback),
        getNotifyEnabled: () => false, setNotifyEnabled() {}, getSoundEnabled: () => false, setSoundEnabled() {},
        getNotifyPermission: () => 'granted', requestNotifyPermission: () => Promise.resolve('granted'),
        testNotify() {}, testSound() {}, subscribeNotifyPrefs: () => () => {},
        getAutoRepeatMinutes: () => 0, setAutoRepeatMinutes() {},
        getSessionTitle: () => '电场电路期末复习资料整理',
        getRunningSessions: () => ([
          { title: '电场电路期末复习资料整理', current: true, startedAt: Date.now() - (19 * 60 + 25) * 1000 },
          { title: '数据结构实验', current: false, startedAt: Date.now() - (3 * 60 + 12) * 1000 },
          { title: '机器人竞赛视觉端', current: false, startedAt: Date.now() - 25 * 1000 },
        ]),
        attachWhale: attachWhaleFn,
        whaleAtlasUrl: atlasConst,
      }

      /* 用真 DOM 渲染：widget 返回的是元素描述，这里把它变成节点。 */
      const mount = document.getElementById('mount')
      function apply(node, parent) {
        if (node === null || node === undefined || node === false) return
        if (Array.isArray(node)) { node.forEach((child) => apply(child, parent)); return }
        if (typeof node === 'string' || typeof node === 'number') { parent.appendChild(document.createTextNode(String(node))); return }
        if (typeof node.type === 'function') { apply(node.type(node.props), parent); return }
        if (typeof node.type !== 'string') { apply(node.children, parent); return }
        const el = document.createElement(node.type)
        for (const [key, value] of Object.entries(node.props)) {
          if (key === 'children' || key === 'ref') continue
          /* React spells it `className`; the DOM attribute is `class`. Without
           * this mapping the class selectors silently match nothing and every
           * measurement below would read "not rendered". */
          if (key === 'className') {
            if (value !== null && value !== undefined && value !== false) el.setAttribute('class', String(value))
            continue
          }
          if (key === 'style' && value && typeof value === 'object') {
            for (const [name, v] of Object.entries(value)) {
              if (String(name).startsWith('--')) el.style.setProperty(name, String(v))
              else el.style[name] = String(v)
            }
            continue
          }
          if (key.startsWith('on') && typeof value === 'function') {
            el.addEventListener(key.slice(2).toLowerCase(), value)
            continue
          }
          if (value === false || value === null || value === undefined) continue
          if (value === true) { el.setAttribute(key, ''); continue }
          el.setAttribute(key, String(value))
        }
        if (node.props && node.props.ref && typeof node.props.ref === 'object') node.props.ref.current = el
        apply(node.children, el)
        parent.appendChild(el)
      }

      const widgetComponent = factory({ h: React.createElement, React, api })
      if (typeof widgetComponent !== 'function') throw new Error('createWidget did not return a component')

      function render() {
        cursor = 0
        effectCursor = 0
        mount.replaceChildren()
        try {
          apply(widgetComponent({ rightInset: 0, topInset: 86 }), mount)
        } catch (error) {
          mount.textContent = 'render failed: ' + (error && error.message ? error.message : String(error))
          throw error
        }
        runPendingEffects()
      }
      rerender = render
      render()

      /* Drive animation time from the test.
       *
       * The whale loop is timestamp-difference based, so what a screenshot
       * catches depends on when it happens to be taken — a single sample can
       * land on the first frames (tiny whale) or on the wrong pass. Replacing
       * rAF with a queue lets the test choose the timestamp, which makes both
       * official fills deterministic and separately measurable. */
      const rafQueue = []
      window.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length }
      window.cancelAnimationFrame = () => {}
      function step(t) {
        const due = rafQueue.splice(0)
        for (const fn of due) {
          try { fn(t) } catch (error) { console.warn('frame failed:', error && error.message) }
        }
      }

      const probe = document.createElement('canvas')
      const whale = document.querySelector('.dfi-whale')
      const mask = document.querySelector('.dfi-mask')
      const skip = document.querySelector('.dfi-maskSkip')
      const skipAll = document.querySelector('.dfi-maskSkipAll')
      const card = document.querySelector('.dfi-card')
      const rows = [...document.querySelectorAll('.dfi-maskItem')]
      if (mask === null || whale === null || skip === null || skipAll === null) {
        throw new Error('strict mask did not render; mount contains: ' + mount.innerHTML.slice(0, 400))
      }

      const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right } }
      const style = (el) => {
        const cs = getComputedStyle(el)
        return { bg: cs.backgroundColor, color: cs.color, fs: cs.fontSize, radius: cs.borderRadius, display: cs.display, position: cs.position }
      }

      function sampleWhale() {
        if (!whale.width || !whale.height) return { painted: 0, spanX: 0, spanY: 0 }
        if (probe.width !== whale.width || probe.height !== whale.height) {
          probe.width = whale.width
          probe.height = whale.height
        }
        const pctx = probe.getContext('2d')
        pctx.clearRect(0, 0, probe.width, probe.height)
        pctx.drawImage(whale, 0, 0)
        const data = pctx.getImageData(0, 0, probe.width, probe.height).data
        let painted = 0
        let minX = probe.width
        let maxX = -1
        let minY = probe.height
        let maxY = -1
        for (let y = 0; y < probe.height; y += 1) {
          for (let x = 0; x < probe.width; x += 1) {
            if (data[(y * probe.width + x) * 4 + 3] <= 8) continue
            painted += 1
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
        return { painted, spanX: maxX < 0 ? 0 : maxX - minX + 1, spanY: maxY < 0 ? 0 : maxY - minY + 1 }
      }


      /* The whale loop is timestamp-difference based, so the test owns the clock:
       * it advances in fixed steps and records the peak coverage of each pass.
       * Without this the result depends on when the screenshot happened to be
       * taken, which is how a "the whale is missing" false alarm happens. */
      let clockMs = 0
      function advance(ms) {
        clockMs += ms
        step(clockMs)
        return sampleWhale()
      }

      /* The atlas decodes asynchronously; give the image pipeline real time and
       * advance the animation clock in the same loop. */
      let firstPass = { painted: 0, spanX: 0, spanY: 0 }
      let secondPass = { painted: 0, spanX: 0, spanY: 0 }
      for (let i = 0; i < 60; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 40))
        const painted = advance(140)
        if (painted.painted > firstPass.painted) firstPass = painted
        if (firstPass.painted > 8000 && i > 6) break
      }
      /* Walk through the remaining cycles: the fill toggles each cycle, so the
       * peak after the first one belongs to the lettering pass. */
      for (let cycle = 0; cycle < 2; cycle += 1) {
        for (let i = 0; i < 45; i += 1) {
          const painted = advance(140)
          if (painted.painted > secondPass.painted) secondPass = painted
        }
      }

      const info = {
        viewport: { w: innerWidth, h: innerHeight },
        mask: Object.assign(rect(mask), style(mask)),
        whale: Object.assign(rect(whale), {
          pixels: firstPass.painted,
          second: secondPass.painted,
          spanX: firstPass.spanX,
          spanY: firstPass.spanY,
          canvasW: whale.width,
          canvasH: whale.height,
        }),
        skip: Object.assign(rect(skip), style(skip), { text: (skip.textContent || '').trim() }),
        skipAll: Object.assign(rect(skipAll), style(skipAll), { text: (skipAll.textContent || '').trim() }),
        sessions: rows.map((row) => ({
          name: (row.querySelector('.dfi-maskName') || {}).textContent || '',
          use: (row.querySelector('.dfi-maskUse') || {}).textContent || '',
          current: row.getAttribute('data-current') === 'true',
        })),
        listScrolls: (() => {
          const list = document.querySelector('.dfi-maskList')
          if (list === null) return false
          const cs = getComputedStyle(list)
          return cs.overflowY === 'auto'
        })(),
        titles: [...document.querySelectorAll('.dfi-maskTitle')].map((el) => (el.textContent || '').trim()),
        lines: [...document.querySelectorAll('.dfi-maskLine')].map((el) => (el.textContent || '').trim()),
        cardDisplay: card === null ? 'missing' : getComputedStyle(card).display,
        atlasBytes: atlas.length,
      }

      /* The no-session state, rendered in the same real browser: one 「空闲中」
         row with a stopwatch of its own, instead of a phantom session row
         claiming to be deep diving. */
      api.getRunningSessions = () => []
      render()
      await new Promise((resolve) => setTimeout(resolve, 40))
      const idleRows = [...document.querySelectorAll('.dfi-maskItem')]
      const idleRow = idleRows[0]
      info.idle = {
        rows: idleRows.length,
        name: idleRow === undefined ? '' : (idleRow.querySelector('.dfi-maskName') || {}).textContent || '',
        use: idleRow === undefined ? '' : (idleRow.querySelector('.dfi-maskUse') || {}).textContent || '',
        flag: idleRow === undefined ? '' : idleRow.getAttribute('data-idle'),
        dot: idleRow === undefined ? '' : getComputedStyle(idleRow.querySelector('.dfi-maskDot')).backgroundColor,
      }
      return info
    }, [widgetSource, atlasDataUrl])

    console.log(`\n[${theme}] viewport ${info.viewport.w}x${info.viewport.h}`)
    console.log(`  mask  ${info.mask.w}x${info.mask.h} @ (${info.mask.x},${info.mask.y}) bg=${info.mask.bg} position=${info.mask.position}`)
    console.log(`  whale ${info.whale.w}x${info.whale.h} canvas ${info.whale.canvasW}x${info.whale.canvasH} pass1=${info.whale.pixels} pass2=${info.whale.second}`)
    console.log(`  skip  ${info.skip.w.toFixed(1)}x${info.skip.h.toFixed(1)} @ (${info.skip.x.toFixed(1)},${info.skip.y.toFixed(1)}) text="${info.skip.text}"`)
    console.log(`  skipAll ${info.skipAll.w.toFixed(1)}x${info.skipAll.h.toFixed(1)} @ (${info.skipAll.x.toFixed(1)},${info.skipAll.y.toFixed(1)}) text="${info.skipAll.text}"`)
    info.sessions.forEach((row) => console.log(`  session ${row.current ? '*' : ' '} "${row.name}" ${row.use}`))
    console.log(`  idle  rows=${info.idle.rows} "${info.idle.name}" ${info.idle.use} dot=${info.idle.dot}`)
    console.log(`  card display=${info.cardDisplay}`)

    // The mask really covers the frame.
    check(Math.abs(info.mask.x) < 0.6 && Math.abs(info.mask.y) < 0.6, `遮罩没有从 (0,0) 开始（实测 ${info.mask.x},${info.mask.y}）`)
    check(Math.abs(info.mask.w - info.viewport.w) < 0.6, `遮罩宽度不等于视口（${info.mask.w} vs ${info.viewport.w}）`)
    check(Math.abs(info.mask.h - info.viewport.h) < 0.6, `遮罩高度不等于视口（${info.mask.h} vs ${info.viewport.h}）`)
    check(info.mask.position === 'fixed', `遮罩不是 fixed（实测 ${info.mask.position}）`)

    // Nothing of the island shows through.
    check(info.cardDisplay === 'none', `严格模式下卡片仍然显示（display=${info.cardDisplay}）`)

    // The whale is the official artwork and it is actually drawn — both passes.
    check(info.whale.w > 200 && info.whale.h > 100, `像素鲸画布太小（${info.whale.w}x${info.whale.h}）`)
    check(info.whale.pixels > 4000, `第一轮（点阵像素鲸）没有画出来（非透明像素 ${info.whale.pixels}）`)
    check(info.whale.second > 4000, `第二轮（代码字填充）没有画出来（非透明像素 ${info.whale.second}）`)
    /* The silhouette must be a shape inside the canvas, not the canvas filled.
     * This is what separates "coverage from the green channel" from "alpha
     * channel" (alpha is opaque everywhere in this atlas, so reading it paints a
     * solid rectangle — which a pixel count alone cannot tell apart). */
    check(info.whale.spanX < info.whale.canvasW * 0.98,
      `像素鲸横向铺满了画布（${info.whale.spanX} / ${info.whale.canvasW}）——剪影读错了通道，画成了实心块`)
    check(info.whale.spanY < info.whale.canvasH * 0.98,
      `像素鲸纵向铺满了画布（${info.whale.spanY} / ${info.whale.canvasH}）——剪影读错了通道，画成了实心块`)

    // Content: the running-session list is the whole content, each row with its
    // own run duration in the app's own wording. No title, no middle line.
    check(/^深度求索中，用时 \d+(分\d+秒|秒) ···$/.test(info.sessions[0].use),
      `第一行的用时不对（实测 "${info.sessions[0].use}"）`)
    check(info.sessions.length === 3, `运行中的会话没有全部列出（实测 ${info.sessions.length} 行）`)
    check(info.sessions[0].current && !info.sessions[1].current, '当前会话排在第一行且被标记')
    check(new Set(info.sessions.map((row) => row.use)).size === 3, '三行显示三个不同的用时，不是同一个数复制三遍')
    check(info.listScrolls, '会话列表可滚动，不会把鲸挤出屏幕')
    check(info.titles.length === 0 && info.lines.length === 0, '没有单独的标题行，也没有中间那句停留分钟')

    // No session running: one idle row with its own stopwatch, not a phantom one.
    check(info.idle.rows === 1, `没有会话时遮罩不止一行（实测 ${info.idle.rows} 行）`)
    check(info.idle.name === '空闲中', `没有会话时的状态不是「空闲中」（实测 "${info.idle.name}"）`)
    check(/^已停留 \d+分?\d*秒$|^已停留 \d+秒$/.test(info.idle.use), `空闲行没有自己的秒表（实测 "${info.idle.use}"）`)
    check(info.idle.flag === 'true', '空闲行没有 data-idle 标记，状态色会跟"运行中"混在一起')

    // Two exits, both in the bottom-right corner, the mode-scoped one secondary.
    check(info.skip.text === '跳过本轮', `本轮退出按钮文字不对（实测 "${info.skip.text}"）`)
    check(info.skipAll.text === '退出所有严格模式', `模式退出按钮文字不对（实测 "${info.skipAll.text}"）`)
    check(info.skip.w >= 70 && info.skip.h >= 30 && info.skip.h <= 44, `本轮退出按钮尺寸不合适（${info.skip.w}x${info.skip.h}）`)
    check(info.skipAll.w >= 100 && info.skipAll.h >= 30 && info.skipAll.h <= 44, `模式退出按钮尺寸不合适（${info.skipAll.w}x${info.skipAll.h}）`)
    check(info.skip.x < info.skipAll.x, '本轮退出在左，模式退出在右（更危险的那个不是最容易点的）')
    check(Math.abs((info.mask.x + info.mask.w) - info.skipAll.right - 24) < 1.5, `退出按钮不在右侧 24px 内（right=${info.skipAll.right}）`)
    check(Math.abs((info.mask.y + info.mask.h) - info.skipAll.bottom - 24) < 1.5, `退出按钮不在底部 24px 内（bottom=${info.skipAll.bottom}）`)
    check(info.skipAll.bg === 'rgba(0, 0, 0, 0)' || info.skipAll.bg === 'transparent',
      `模式退出应是次级按钮（实测背景 ${info.skipAll.bg}）`)

    if (shotDir !== null) {
      const file = join(shotDir, `strict-mask-${theme}.png`)
      await page.screenshot({ path: file })
      console.log(`  screenshot ${file}`)
      writeFileSync(join(shotDir, `strict-mask-${theme}.json`), JSON.stringify(info, null, 2))
    }

    await page.close()
  }
} finally {
  await browser.close()
}

if (failures.length > 0) {
  console.error(`\nrender smoke: FAILED (${failures.length} 项)`)
  process.exit(1)
}
console.log('\nrender smoke: OK — 遮罩真的整屏、鲸真的画出来、退出真的在右下角（明暗两套主题）')
