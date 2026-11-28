/**
 * dsh-focus-island — visual half (client-side ESM, no JSX, no imports, no bundler).
 *
 * Exports: STYLE_ID, TOP_PX, BASE_RIGHT_PX, COPY, createWidget.
 * The host page provides React; the Lead provides `h`, `React` and a stable `api`.
 *
 * The component receives `{ rightInset, topInset }`:
 *   - rightInset: right sidebar width in px (0 closed, -1 fullscreen → hide)
 *   - topInset: measured bottom edge of the conversation header (+ gap);
 *               TOP_PX is only the fallback when the host cannot measure it.
 * Both offsets are CSS-transitioned when they change.
 *
 * Nothing here touches `document` at module scope: the only DOM reads happen
 * inside effects (layout measurement + focus) and are guarded.
 */

export const STYLE_ID = 'dsh-focus-island-style';
export const TOP_PX = 84;
export const BASE_RIGHT_PX = 16;

const PILL_W = 216;
const CARD_W = 300;
const PILL_H = 54;
const HIT = 34;
/* The capsule's single inner inset (ring top/left, bars left/right/bottom). */
const CAPSULE_PAD = 12;

const RING_SIZE = 30;
const RING_R = 12.5;
const RING_C = 2 * Math.PI * RING_R;

/* How long a mode swap is treated as a swap: the entrance animation runs for
 * 180ms and the in-place height transition stays off for the tail. */
const SWAP_MS = 260;

const DUR_MIN = 5;
const DUR_MAX = 180;
const DUR_STEP = 5;
const PRESETS = [5, 15, 30, 45, 60, 180];

const SCALE_OPTIONS = [1, 1.2, 1.4];
const SCALE_DEFAULT = 1.2;

const AUTO_REPEAT_MIN = 0;
const AUTO_REPEAT_MAX = 10;
const AUTO_REPEAT_DEFAULT = 2;

/* What「跳过严格模式」restarts at.
 *
 * The requirement is literal: leaving the strict mask is equivalent to opening
 * the island again, and the next round starts from five minutes. Restarting at
 * whatever long budget the user configured would bury the next mask behind
 * another half-hour, which is not what "从五分钟重新开始计时" asks for. */
const STRICT_RESTART_MINUTES = 5;

/** The wall clock only renders HH:MM, so it needs no per-second tick. */
const CLOCK_TICK_MS = 30000;

const ROOT_ID = 'dsh-focus-island';
const CONFIRM_TITLE_ID = 'dsh-focus-island-skip-title';
const CONFIRM_BODY_ID = 'dsh-focus-island-skip-body';
const MASK_TITLE_ID = 'dsh-focus-island-strict-title';
const MASK_LIST_ID = 'dsh-focus-island-strict-list';

/* ------------------------------------------------------------------ copy -- */

export const COPY = {
  zh: {
    'title': '惜时岛',
    'action.collapse': '收起',
    'action.expand': '展开',
    'action.skip': '跳过',
    'action.settings': '设置',
    'action.restart': '重新计时',
    'action.ack': '知道了',
    'skip.title': '跳过本次提醒？',
    'skip.body': '确认你知道这段时间仍被消耗，之后不会再计时，直到你下次发送消息。',
    'skip.cancel': '取消',
    'skip.confirm': '确认跳过',
    'skip.doneTitle': '结束本轮提醒？',
    'skip.doneBody': '这段时间已经计入。结束本轮后不会自动再提醒，直到你下次发送消息。',
    'finished.title': '你已在这个没有对话的窗口里停留 {n} 分钟',
    'finished.body': '这段时间一直在计入计时。休息一下，或者继续下一段。',
    'skipped.title': '本轮已跳过',
    'skipped.body': '已计入 {n} 分钟。下次发送消息会重新开始计时。',
    'settings.duration': '提醒间隔',
    'settings.durationHint': '到点提醒你，这段时间被 AI 一个人用掉了。',
    'settings.resources': '显示资源占用',
    'resources.title': '本机资源',
    'resources.cpu': 'CPU',
    'resources.gpu': 'GPU',
    'resources.mem': '内存',
    'resources.temp': 'GPU 温度',
    'resources.na': '--',
    'settings.interval': '间隔',
    'settings.autoRepeat': '自动再来',
    'settings.autoRepeatHint': '到点 {n} 分钟没处理，就自动再计时一轮',
    'settings.autoRepeatOff': '0 分钟 = 不自动再来，到点只提醒一次',
    'settings.box.duration': '提醒间隔',
    'settings.box.appearance': '外观与其他',
    'settings.box.notify': '通知',
    'settings.notify': '桌面通知',
    'settings.notifyHint': '需要允许系统通知',
    'settings.sound': '提示音',
    'action.test': '测试',
    'settings.strict': '严格模式',
    'settings.strictHint': '到点后整屏遮住，只剩官方像素鲸和正在运行的会话；跳过与重新计时都不提供',
    'strict.itemRunning': '深度求索中，用时 {d} ···',
    'strict.itemDone': '{d}',
    'strict.skipRound': '跳过本轮',
    'strict.skipRoundHint': '关掉这次遮罩并从 5 分钟重新计时，严格模式保持开启',
    'strict.skipAll': '退出所有严格模式',
    'strict.skipAllHint': '关掉这次遮罩、从 5 分钟重新计时，并关闭严格模式',
    'strict.untitled': '未命名会话',
    'strict.idle': '空闲中',
    'strict.itemIdle': '已停留 {d}',
    'strict.itemWaiting': '等待你的回答，已等 {d}',
    'pending.chip': '有提问待回答',
    'pending.short': '待回答',
    'settings.collapsedSize': '收缩大小',
    'settings.size.compact': '紧凑',
    'settings.size.normal': '标准',
    'settings.size.large': '大',
    'settings.language': '语言',
    'unit.min': '分钟',
    'unit.minutes': '分钟',
  },
  en: {
    'title': 'Focus Island',
    'action.collapse': 'Collapse',
    'action.expand': 'Expand',
    'action.skip': 'Skip',
    'action.settings': 'Settings',
    'action.restart': 'Restart',
    'action.ack': 'Got it',
    'skip.title': 'Skip this reminder?',
    'skip.body': 'Confirm that you accept this stretch is spent. The timer will not run again until you send your next message.',
    'skip.cancel': 'Cancel',
    'skip.confirm': 'Skip anyway',
    'skip.doneTitle': 'End this reminder?',
    'skip.doneBody': 'This stretch already counted. Ending it stops the auto-repeat until your next message.',
    'finished.title': 'You stayed in this conversation-less window for {n} minutes',
    'finished.body': 'The time kept counting. Take a break, or start the next stretch.',
    'skipped.title': 'This round was skipped',
    'skipped.body': '{n} minutes were counted before you skipped. Sending a message starts a new round.',
    'settings.duration': 'Remind me after',
    'settings.durationHint': 'You will be reminded when time is up — this stretch was spent alone with the AI.',
    'settings.resources': 'Show resource usage',
    'resources.title': 'This machine',
    'resources.cpu': 'CPU',
    'resources.gpu': 'GPU',
    'resources.mem': 'RAM',
    'resources.temp': 'GPU TEMP',
    'resources.na': '--',
    'settings.interval': 'Interval',
    'settings.autoRepeat': 'Auto-repeat',
    'settings.autoRepeatHint': 'If ignored for {n} minutes, a new round starts automatically',
    'settings.autoRepeatOff': '0 min = no auto-repeat, remind only once',
    'settings.box.duration': 'Reminder interval',
    'settings.box.appearance': 'Appearance & more',
    'settings.box.notify': 'Notifications',
    'settings.notify': 'Desktop notifications',
    'settings.notifyHint': 'Allow system notifications',
    'settings.sound': 'Sound',
    'action.test': 'Test',
    'settings.collapsedSize': 'Collapsed size',
    'settings.size.compact': 'Compact',
    'settings.size.normal': 'Standard',
    'settings.size.large': 'Large',
    'settings.language': 'Language',
    'settings.strict': 'Strict mode',
    'settings.strictHint': 'On time-up the whole screen is covered by the official pixel whale and the running sessions; no skip and no restart',
    'strict.itemRunning': 'Deep diving, {d} elapsed ···',
    'strict.itemDone': '{d}',
    'strict.skipRound': 'Skip this round',
    'strict.skipRoundHint': 'Dismiss this mask and restart the countdown at 5 minutes; strict mode stays on',
    'strict.skipAll': 'Turn strict mode off',
    'strict.skipAllHint': 'Dismiss this mask, restart the countdown at 5 minutes, and switch strict mode off',
    'strict.untitled': 'Untitled conversation',
    'strict.idle': 'Idle',
    'strict.itemIdle': 'Idle for {d}',
    'strict.itemWaiting': 'Waiting for your answer, {d}',
    'pending.chip': 'A question is waiting for you',
    'pending.short': 'Question',
    'unit.min': 'min',
    'unit.minutes': 'minutes',
  },
};

/* ----------------------------------------------------------------- state -- */

const EMPTY_STATE = {
  phase: 'idle',
  durationMinutes: 25,
  durationMs: 25 * 60 * 1000,
  elapsedMs: 0,
  watchedMs: 0,
  remainingMs: 25 * 60 * 1000,
  progress: 0,
  modelBusy: false,
  visible: true,
  typing: false,
  draftEmpty: true,
  sending: false,
  skipArmed: false,
  pauseReason: null,
};

const ICON_BOX = { gear: '0 0 24 24' };

/* Every icon is a 16-box outline drawn with the same stroke (1.5, round caps),
 * so they read as one family. The old skip glyph was a filled media-player
 * "next track" triangle plus a bar — a solid shape among outlines, which is
 * exactly why it looked out of place. It is now an outline skip-forward. */
const ICON_PATHS = {
  'chevron-down': 'M3.5 6L8 10.5 12.5 6',
  'chevron-up': 'M3.5 10L8 5.5 12.5 10',
  'skip': 'M3.8 4.9l5.4 3.1-5.4 3.1z M11.5 4.8v6.4',
  'gear': 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7 M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  'restart': 'M12.7 8a4.7 4.7 0 1 1-1.4-3.34 M13 2.7v3.4h-3.4',
  'minus': 'M4.5 8h7',
  'plus': 'M8 4.5v7 M4.5 8h7',
};

/* ------------------------------------------------------------------- css -- */

/* One type scale for the whole island — eight steps, nothing in between:
 *   2xs 10 · xs 11 · sm 12 · md 12.5 · lg 13 · xl 14 · 2xl 15 · hero 38
 * Steps below `hero` are declared once as CSS custom properties on the root
 * and always read through `var(--dfi-fs-*)`, so the capsule clock (2xl) and the
 * open countdown (hero) are the same kind of value as the rest instead of two
 * literals that happened to sit between the steps. `FS_*` below is only the
 * build-time copy of those numbers: the template interpolates it where a plain
 * number is wanted (no scale factor) and the root declares the same numbers as
 * tokens. Nothing may hard-code a font size in the CSS body. */
const FS_2XS = 10;
const FS_XS = 11;
const FS_SM = 12;
const FS_MD = 12.5;
const FS_LG = 13;
const FS_XL = 14;
const FS_2XL = 15;
const FS_HERO = 38;

/* Durations: role buckets, not per-property guesses. `fast` is every hover /
 * press / colour change, `base` the in-place growth, `slow` the larger
 * transforms, `sweep` the two indicator sweeps (bar fill, progress ring),
 * `deco` the one-shot reminder glow. */
const DUR_FAST = 140;
const DUR_BASE = 180;
const DUR_SLOW = 260;
const DUR_SWEEP = 480;
const DUR_DECO = 900;

/* Radii: the plugin only invents what the platform does not already ship.
 *
 * DSH's own scale is --dsw-radius-xs 4 / sm 8 / md 12 / lg 16 / xl 20 /
 * panel 28. Anything that is a normal surface uses those directly (card →
 * xl, settings box → md, buttons and chips → sm), so the island rounds like
 * the rest of the app and a theme change carries through. The chips were 6-7px
 * and the settings box 10px — three sizes the platform already has, which is
 * how the drift started.
 *
 * One value has no official equivalent and stays local: `track`, the radius of
 * the 4px-or-shorter resource bars (it was 1.5 / 2 / 3px in three places).
 * The switch is 50%: it is half its own height, which is geometry, not a step. */
const R_TRACK = 2;

const CSS = `
/* --- design tokens -------------------------------------------------------
 * Everything visual that repeats is declared once, here, on the root:
 * type scale, animation durations and radii. The rules below only read them.
 * Two consequences the old build lacked:
 *   - reduced-motion can zero the motion tokens instead of fighting every
 *     rule with !important (one switch, not nineteen overrides);
 *   - changing a step (say "all chips 1px rounder") is one edit, not a grep.
 * Geometry that already scales (--dfi-scale, --dfi-w, --dfi-h, --dfi-p,
 * --dfi-off, --dfi-level-color) stays where it was: those are computed values,
 * not design constants. */
.dfi-root {
  --dfi-fs-2xs: ${FS_2XS}px;
  --dfi-fs-xs: ${FS_XS}px;
  --dfi-fs-sm: ${FS_SM}px;
  --dfi-fs-md: ${FS_MD}px;
  --dfi-fs-lg: ${FS_LG}px;
  --dfi-fs-xl: ${FS_XL}px;
  --dfi-fs-2xl: ${FS_2XL}px;
  --dfi-fs-hero: ${FS_HERO}px;

  --dfi-dur-fast: ${DUR_FAST}ms;
  --dfi-dur-base: ${DUR_BASE}ms;
  --dfi-dur-slow: ${DUR_SLOW}ms;
  --dfi-dur-sweep: ${DUR_SWEEP}ms;
  --dfi-dur-deco: ${DUR_DECO}ms;

  --dfi-radius-track: ${R_TRACK}px;
}
.dfi-root {
  position: fixed;
  top: ${TOP_PX}px;
  right: ${BASE_RIGHT_PX}px;
  z-index: 30;
  pointer-events: auto;
  box-sizing: border-box;
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif);
  color: var(--dsw-alias-label-primary);
  -webkit-font-smoothing: antialiased;
  -webkit-user-select: none;
  user-select: none;
  visibility: visible;
  transition: top var(--dfi-dur-fast) cubic-bezier(0.34, 1.3, 0.64, 1), right var(--dfi-dur-fast) cubic-bezier(0.34, 1.3, 0.64, 1), opacity var(--dfi-dur-base) cubic-bezier(0.22, 1, 0.36, 1), transform var(--dfi-dur-fast) cubic-bezier(0.34, 1.3, 0.64, 1), visibility 0s linear 0s;
  /* No permanent will-change: the root only moves when the user drags the
   * right column, and a standing hint pins it to a composited layer forever. */
}
.dfi-root[data-hidden='true'] {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
  pointer-events: none;
  visibility: hidden;
  transition: top var(--dfi-dur-fast) cubic-bezier(0.34, 1.3, 0.64, 1), right var(--dfi-dur-fast) cubic-bezier(0.34, 1.3, 0.64, 1), opacity var(--dfi-dur-base) cubic-bezier(0.22, 1, 0.36, 1), transform var(--dfi-dur-fast) cubic-bezier(0.34, 1.3, 0.64, 1), visibility 0s linear var(--dfi-dur-base);
}
/* While the right column is being dragged the island must track every frame. */
.dfi-root[data-dragging='true'] { transition: none; }
.dfi-root *, .dfi-root *::before, .dfi-root *::after { box-sizing: border-box; }

.dfi-card {
  position: relative;
  width: var(--dfi-w);
  height: var(--dfi-h);
  border: 0;
  /* Opaque official surface, no glass: --dsw-alias-bg-layer-1 is plain white
     in the light theme (#fff) and #232324 in the dark one. A backdrop-filter
     here forced the compositor to re-read and re-blur whatever sits behind the
     island on every frame — and the island floats over the scrolling
     conversation, so that was every scroll frame. The capsule is now painted
     once and never samples its backdrop. */
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-overlay));
  /* Pure projection, no hairline ring: the elevation tokens paint a 0.5px
     stroke into the shadow, which reads as a grey+white seam. The blur is kept
     deliberately small: the card morphs width/height, so a 16px shadow around
     a 300px surface is re-rasterised on every animation frame. */
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  /* The morph resizes this box every frame; containment stops that layout from
     propagating into the host page and lets the browser keep the island cheap. */
  contain: layout paint style;
  /* Height only, and only for in-place growth (opening the settings box). A
     width/height morph of the whole surface measured 69ms frames on this
     machine — every frame re-rasterised the clipped text. Mode switches are
     excluded below and carried by the scale entrance instead, which the
     compositor can do without touching layout at all. */
  transition: height var(--dfi-dur-base) cubic-bezier(0.22, 1, 0.36, 1);
  transform-origin: top right;
  /* No permanent will-change: keeping the card on its own composited layer
     for its whole life costs memory. */
}
/* The swap itself: the surface lands at its final size in one layout, then
   enters as a composited scale+fade from the pill's corner. Measured cost is
   one paint per frame at most, and no text is re-laid-out or re-wrapped. */
@keyframes dfi-open {
  from { opacity: 0.55; transform: scale(0.94); }
  to { opacity: 1; transform: none; }
}
.dfi-card[data-mode='expanded'] {
  animation: dfi-open var(--dfi-dur-base) cubic-bezier(0.22, 1, 0.36, 1) both;
}
.dfi-card[data-mode='collapsed'] {
  animation: dfi-open var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1) both;
}
/* While the mode is swapping, in-place height transitions must not fight the
   entrance animation (that would animate layout during the scale). */
.dfi-card[data-swapping='true'] {
  transition: none;
}
.dfi-card[data-mode='collapsed'] {
  --dfi-w: calc(${PILL_W}px * var(--dfi-scale, ${SCALE_DEFAULT}));
  border-radius: var(--dsw-radius-xl);
  corner-shape: round;
}
.dfi-card[data-mode='expanded'] {
  --dfi-w: ${CARD_W}px;
  border-radius: var(--dsw-radius-xl);
}
/* Hover only tints the surface: moving a blurred shadow on every pointer move
   forced a repaint of the whole card for a 1px lift nobody asked for. */
.dfi-card:hover {
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1));
}
[data-ds-dark-theme] .dfi-card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.34);
}

.dfi-content {
  position: absolute;
  top: 0;
  /* Right-anchored on purpose: the card's right edge is what stays still, so
     while the card morphs its width the already-laid-out content does not slide
     or re-wrap — the surface window opens and closes around it. */
  right: 0;
  width: var(--dfi-w);
  z-index: 1;
  contain: layout paint;
  transform-origin: top right;
  animation: dfi-in var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1) both;
}
/* The pill has no room to slide: it just settles in place. */
.dfi-card[data-mode='collapsed'] .dfi-content {
  animation-duration: var(--dfi-dur-fast);
}
.dfi-card[data-view='confirm'] .dfi-content { animation-name: dfi-softin; }
.dfi-card[data-view='finished'] .dfi-content { animation-name: dfi-warmin; }

.dfi-root button { font: inherit; }
.dfi-root input { font: inherit; }

/* --- collapsed pill ----------------------------------------------------- */

.dfi-pill {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  min-height: ${HIT}px;
  margin: 0;
  /* The capsule's bottom inset lives here, not on the last row: with the
     resource strip switched off the ring would otherwise sit flush with the
     capsule's bottom edge. The strip keeps zero bottom padding, so this is the
     same 12px gap in both states. */
  padding: 0 0 calc(${CAPSULE_PAD}px * var(--dfi-scale, ${SCALE_DEFAULT}));
  border: 0;
  border-radius: inherit;
  corner-shape: round;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  text-align: left;
  transition: background var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1), transform var(--dfi-dur-fast) cubic-bezier(0.34, 1.3, 0.64, 1);
}
.dfi-pill:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dfi-pill:active { background: var(--dsw-alias-interactive-bg-active); }

/* Capsule inner grid — one inset for everything: 12px × scale.
     ring top 12  ·  ring left 12  ·  bars left/right 12  ·  capsule bottom 12
   The row used to be a fixed 34px tall with the 30px ring centred inside it,
   so the ring sat just 2px under the capsule's top edge — that was the missing
   top margin. The row is now sized by its content (the ring) with the same
   12px inset above it as everything else, so the ring, the countdown and the
   chevron share one axis. Right padding still reserves the 34px chevron box so
   the wall clock cannot slide under it. */
.dfi-pillTop {
  display: flex;
  align-items: center;
  gap: calc(7px * var(--dfi-scale, ${SCALE_DEFAULT}));
  padding: calc(${CAPSULE_PAD}px * var(--dfi-scale, ${SCALE_DEFAULT})) ${HIT + 6}px 0 calc(${CAPSULE_PAD}px * var(--dfi-scale, ${SCALE_DEFAULT}));
}

/* Collapsed resource strip: four bare colored bars. No labels, no numbers —
   the capsule stays quiet and the length/color of each bar is the whole
   reading. Names and values live in the expanded card and in the pill's
   aria-label. */
.dfi-pillRes {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: calc(6px * var(--dfi-scale, ${SCALE_DEFAULT}));
  /* 7px top reproduces the ring→bars distance of the old build (its 2px row
     slack plus 7px); sides are the same 12px inset as the ring. The bottom
     inset is the capsule's own padding, so it survives this row being hidden. */
  padding: calc(7px * var(--dfi-scale, ${SCALE_DEFAULT})) calc(${CAPSULE_PAD}px * var(--dfi-scale, ${SCALE_DEFAULT})) 0;
}
.dfi-micro { display: block; min-width: 0; }
.dfi-microTrack {
  display: block;
  height: calc(5px * var(--dfi-scale, ${SCALE_DEFAULT}));
  border-radius: calc(var(--dfi-radius-track) * var(--dfi-scale, ${SCALE_DEFAULT}));
  background: var(--dsw-alias-bg-skeleton);
  overflow: hidden;
}
.dfi-microFill {
  display: block;
  height: 100%;
  border-radius: inherit;
  transform-origin: left center;
  transform: scaleX(var(--dfi-p, 0));
  background: var(--dfi-level-color, var(--dsw-alias-state-success-primary));
  transition: transform var(--dfi-dur-sweep) cubic-bezier(0.22, 1, 0.36, 1), background var(--dfi-dur-slow) cubic-bezier(0.22, 1, 0.36, 1);
}

.dfi-ringWrap {
  position: relative;
  flex: none;
  display: block;
  width: calc(${RING_SIZE}px * var(--dfi-scale, ${SCALE_DEFAULT}));
  height: calc(${RING_SIZE}px * var(--dfi-scale, ${SCALE_DEFAULT}));
  color: var(--dsw-alias-state-business-primary);
}
/* No perpetual decoration animation: the ring, the status dot and the pill used
   to run three 2.4s infinite loops forever, which kept the page out of its
   idle state — and with a blurred backdrop above a scrolling conversation that
   meant a repaint every frame, all the time. State is now carried by colour and
   arc length, which change only when a value changes. */
.dfi-ringWrap[data-state='paused'] { color: var(--dsw-alias-state-warn-primary); }
.dfi-ringWrap[data-state='finished'] { color: var(--dsw-alias-state-error-primary); }
.dfi-ringWrap[data-state='idle'] { color: var(--dsw-alias-state-business-primary); }
.dfi-ring { display: block; width: 100%; height: 100%; transform: rotate(-90deg); }
.dfi-ringTrack { fill: none; stroke: currentColor; stroke-width: 3; opacity: 0.18; }
.dfi-ringArc {
  fill: none;
  stroke: currentColor;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: ${RING_C.toFixed(2)};
  stroke-dashoffset: var(--dfi-off, 0);
  transition: stroke-dashoffset var(--dfi-dur-sweep) cubic-bezier(0.22, 1, 0.36, 1);
}

.dfi-clock {
  flex: none;
  font-size: calc(var(--dfi-fs-2xl) * var(--dfi-scale, ${SCALE_DEFAULT}));
  line-height: calc(20px * var(--dfi-scale, ${SCALE_DEFAULT}));
  font-weight: 600;
  letter-spacing: 0.1px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
}
.dfi-grow { flex: 1 1 auto; min-width: 0; }
.dfi-sysClock {
  flex: none;
  margin-right: 2px;
  font-size: calc(var(--dfi-fs-sm) * var(--dfi-scale, ${SCALE_DEFAULT}));
  line-height: calc(16px * var(--dfi-scale, ${SCALE_DEFAULT}));
  letter-spacing: 0.2px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary);
}
/* Absolute 34x34 in the capsule's top-right corner; the expanded card's
 * collapse button uses the exact same offset so the hit area never moves. */
.dfi-chevronBox {
  position: absolute;
  /* centred on the ring's axis: ring centre is CAPSULE_PAD + RING_SIZE/2 from
     the top edge, the box is HIT tall */
  top: calc((${CAPSULE_PAD + RING_SIZE / 2}px * var(--dfi-scale, ${SCALE_DEFAULT})) - ${HIT / 2}px);
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${HIT}px;
  height: ${HIT}px;
  color: var(--dsw-alias-label-secondary);
  transition: transform var(--dfi-dur-base) cubic-bezier(0.34, 1.3, 0.64, 1), color var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1);
}
.dfi-pill:hover .dfi-chevronBox { transform: translateY(1px); color: var(--dsw-alias-label-primary); }
.dfi-ico { display: block; flex: none; }

/* --- expanded card ------------------------------------------------------ */

.dfi-expHdr {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  height: ${HIT}px;
  padding: 0 ${HIT + 8}px 0 16px;
}
.dfi-liveDot {
  position: relative;
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  corner-shape: round;
  background: currentColor;
}
.dfi-liveDot[data-state='counting'] { color: var(--dsw-alias-state-business-primary); }
.dfi-liveDot[data-state='paused'] { color: var(--dsw-alias-state-warn-primary); }
.dfi-liveDot[data-state='finished'] { color: var(--dsw-alias-state-error-primary); }
.dfi-liveDot[data-state='idle'] { color: var(--dsw-alias-state-success-primary); }
/* Something is waiting on you. It outranks every countdown state, because it is
 * the only one the timer cannot resolve by itself. */
.dfi-liveDot[data-state='pending'] { color: var(--dsw-alias-state-warn-primary); }
/* The one-line notice inside the card, and the capsule's stand-in for the wall
 * clock: at 216px wide a whole sentence does not fit, so the capsule says
 * 「待回答」 and the card spells it out. */
.dfi-pending {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 16px 0;
  font-size: var(--dfi-fs-sm);
  line-height: 16px;
  font-weight: 600;
  color: var(--dsw-alias-state-warn-primary);
}
.dfi-sysClock[data-pending='true'] {
  color: var(--dsw-alias-state-warn-primary);
  font-weight: 600;
}
.dfi-title {
  font-size: var(--dfi-fs-sm);
  line-height: 18px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dfi-collapse {
  position: absolute;
  top: 0;
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${HIT}px;
  height: ${HIT}px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1), color var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1), transform var(--dfi-dur-fast) cubic-bezier(0.34, 1.3, 0.64, 1);
}
.dfi-collapse:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
  transform: scale(1.06);
}
.dfi-collapse:active { transform: scale(0.97); }

.dfi-main { padding: 2px 16px 0; }
.dfi-body { padding-bottom: 14px; }
.dfi-clockBig {
  font-size: var(--dfi-fs-hero);
  line-height: 44px;
  font-weight: 600;
  letter-spacing: -0.8px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
  text-align: center;
}

/* passive focus countdown */
.dfi-bar {
  position: relative;
  margin-top: 10px;
  height: 4px;
  border-radius: var(--dfi-radius-track);
  corner-shape: round;
  background: var(--dsw-alias-bg-skeleton);
  overflow: hidden;
}
.dfi-barFill {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  transform-origin: left center;
  transform: scaleX(var(--dfi-p, 0));
  background: var(--dsw-alias-state-business-primary);
  transition: transform var(--dfi-dur-sweep) cubic-bezier(0.22, 1, 0.36, 1);
}

.dfi-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  height: 28px;
  margin-top: 12px;
  padding: 0 16px;
}

/* --- buttons ------------------------------------------------------------ */

.dfi-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: var(--dfi-fs-sm);
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1), color var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1), transform var(--dfi-dur-fast) cubic-bezier(0.34, 1.3, 0.64, 1);
}
.dfi-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dfi-btn:active { transform: scale(0.97); }
.dfi-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.dfi-btn:disabled:hover { background: transparent; }
/* Restart is the recommended action, but a near-white solid block on a dark
 * card reads as a different design language from everything else in the island.
 * The official info fill (DeepSeek blue) keeps it in the same family as the
 * rest of the island's accent surfaces. */
.dfi-btnPrimary {
  background: var(--dsw-alias-button-info-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.dfi-btnPrimary:hover { background: var(--dsw-alias-button-info-hover); }
.dfi-btnDanger {
  background: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-label-primary-foreground);
}
.dfi-btnDanger:hover { background: var(--dsw-alias-state-error-secondary); }
.dfi-iconBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1), color var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1), transform var(--dfi-dur-fast) cubic-bezier(0.34, 1.3, 0.64, 1);
}
.dfi-iconBtn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
  transform: scale(1.06);
}
.dfi-iconBtn:active { transform: scale(0.97); }
.dfi-iconBtn[data-active='true'] {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-button-ghost-active-fill);
  box-shadow: inset 0 0 0 0.5px var(--dsw-alias-button-ghost-active-border);
}

/* --- resource block (card bottom) --------------------------------------- */

.dfi-res {
  margin-top: 12px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  padding: 10px 16px 0;
}
.dfi-resTitle {
  font-size: var(--dfi-fs-sm);
  line-height: 16px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: var(--dsw-alias-label-secondary);
}
.dfi-gauges {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.dfi-gauge { display: flex; flex-direction: column; min-width: 0; }
.dfi-gaugeLabel {
  font-size: var(--dfi-fs-xs);
  line-height: 14px;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dfi-gaugeVal {
  margin-top: 1px;
  font-size: var(--dfi-fs-md);
  line-height: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--dfi-level-color, var(--dsw-alias-label-secondary));
}
.dfi-gaugeTrack {
  margin-top: 3px;
  height: 3px;
  border-radius: var(--dfi-radius-track);
  corner-shape: round;
  background: var(--dsw-alias-bg-skeleton);
  overflow: hidden;
}
.dfi-gaugeFill {
  height: 100%;
  border-radius: inherit;
  transform-origin: left center;
  transform: scaleX(var(--dfi-p, 0));
  background: var(--dfi-level-color, var(--dsw-alias-state-success-primary));
  transition: transform var(--dfi-dur-sweep) cubic-bezier(0.22, 1, 0.36, 1), background var(--dfi-dur-slow) cubic-bezier(0.22, 1, 0.36, 1);
}
.dfi-gauge[data-level='ok'], .dfi-micro[data-level='ok'] { --dfi-level-color: var(--dsw-alias-state-success-primary); }
.dfi-gauge[data-level='warn'], .dfi-micro[data-level='warn'] { --dfi-level-color: var(--dsw-alias-state-warn-primary); }
.dfi-gauge[data-level='hot'], .dfi-micro[data-level='hot'] { --dfi-level-color: var(--dsw-alias-state-error-primary); }
.dfi-gauge[data-level='na'], .dfi-micro[data-level='na'] { --dfi-level-color: var(--dsw-alias-label-caption); }
.dfi-gauge[data-level='na'] .dfi-gaugeFill,
.dfi-micro[data-level='na'] .dfi-microFill { opacity: 0; }
/* A missing reading keeps its slot but dims the empty track, so "unknown" does
   not read as "0 %" now that the strip carries no numbers. */
.dfi-micro[data-level='na'] .dfi-microTrack { opacity: 0.45; }

/* --- settings (stacked boxes below the resource section) ----------------- */

.dfi-settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 16px 0;
  border: 0;
  background: transparent;
  overflow: visible;
}
.dfi-setBox {
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
}
.dfi-setBoxTitle {
  padding: 8px 10px 6px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  font-size: var(--dfi-fs-xs);
  line-height: 14px;
  font-weight: 500;
  letter-spacing: 0.3px;
  color: var(--dsw-alias-label-secondary);
}
.dfi-setRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 34px;
  padding: 0 10px;
}
.dfi-setRow + .dfi-setRow { border-top: 0.5px solid var(--dsw-alias-border-l2); }
.dfi-setRowEnd { justify-content: flex-end; }
.dfi-rowRight {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.dfi-setLabel {
  flex: 0 0 auto;
  font-size: var(--dfi-fs-lg);
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
}
.dfi-setValueText {
  flex: none;
  font-size: var(--dfi-fs-md);
  line-height: 18px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary);
}
.dfi-chipsRow {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px 8px;
  flex-wrap: wrap;
}
.dfi-setHint {
  padding: 0 10px 8px;
  font-size: var(--dfi-fs-xs);
  line-height: 17px;
  color: var(--dsw-alias-label-secondary);
}
.dfi-autoHint {
  padding: 0 10px 6px;
  font-size: var(--dfi-fs-xs);
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
}
.dfi-permHint {
  padding: 0 10px 6px;
  font-size: var(--dfi-fs-xs);
  line-height: 16px;
  color: var(--dsw-alias-label-caption);
}
.dfi-btnTest {
  height: 22px;
  padding: 0 8px;
  font-size: var(--dfi-fs-2xs);
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
}
.dfi-btnTest:hover { color: var(--dsw-alias-label-primary); }
.dfi-seg {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-1);
}
.dfi-segBtn {
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dfi-fs-2xs);
  line-height: 16px;
  cursor: pointer;
  transition: background var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1), color var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1);
}
.dfi-segBtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dfi-segBtn[data-active='true'] {
  background: var(--dsw-alias-button-ghost-active-fill);
  color: var(--dsw-alias-label-primary);
  box-shadow: inset 0 0 0 0.5px var(--dsw-alias-button-ghost-active-border);
}

.dfi-stepper {
  display: inline-flex;
  align-items: center;
  flex: none;
  height: 26px;
  padding: 2px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
}
.dfi-stepBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1), color var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1);
}
.dfi-stepBtn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dfi-stepBtn:disabled { opacity: 0.35; cursor: not-allowed; }
.dfi-stepValue {
  min-width: 52px;
  text-align: center;
  font-size: var(--dfi-fs-sm);
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
}
/* Editable step value: typing any integer in range is allowed, the +/- keys
   still move by one step. */
.dfi-stepInput {
  width: 46px;
  min-width: 0;
  padding: 0 2px;
  border: 0;
  background: transparent;
  text-align: center;
  font-size: var(--dfi-fs-sm);
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
  -moz-appearance: textfield;
  appearance: textfield;
}
.dfi-stepInput::-webkit-outer-spin-button,
.dfi-stepInput::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.dfi-stepUnit {
  padding-right: 4px;
  font-size: var(--dfi-fs-2xs);
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
}

.dfi-chip {
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dfi-fs-2xs);
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1), color var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1);
}
.dfi-chip:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dfi-chip[data-active='true'] {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-button-ghost-active-fill);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-button-ghost-active-border);
}

.dfi-switch {
  position: relative;
  flex: none;
  width: 36px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  corner-shape: round;
  background: var(--dsw-alias-border-l3);
  cursor: pointer;
  transition: background var(--dfi-dur-base) cubic-bezier(0.22, 1, 0.36, 1);
}
.dfi-switch[aria-checked='true'] { background: var(--dsw-alias-state-business-primary); }
.dfi-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  corner-shape: round;
  background: var(--dsw-alias-label-primary-foreground);
  box-shadow: 0 0 0 0.5px var(--dsw-alias-border-l2);
  transition: transform var(--dfi-dur-slow) cubic-bezier(0.34, 1.3, 0.64, 1);
}
.dfi-switch[aria-checked='true'] .dfi-knob { transform: translateX(16px); }

/* --- finished / confirm -------------------------------------------------
   Every reminder view is a plain column: the header keeps the card's own
   16px inset (no extra horizontal padding on the wrapper, or the title would
   sit 32px in while the normal view sits at 16px). Only the body is inset. */

.dfi-card[data-view='finished']::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--dsw-alias-state-warn-primary) 20%, transparent), transparent 68%);
  animation: dfi-warm var(--dfi-dur-deco) cubic-bezier(0.22, 1, 0.36, 1) both;
}
.dfi-card[data-view='finished']::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: inherit;
  pointer-events: none;
  box-shadow: inset 0 0 0 1px var(--dsw-alias-state-warn-primary);
  opacity: 0;
  animation: dfi-ringflash var(--dfi-dur-deco) cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* The wrapper carries NO horizontal padding: the shared .dfi-expHdr already
   insets itself by the card's 16px, so adding it here double-inset the title
   and made the reminder header sit 32px in while the normal view sat at 16px. */
.dfi-finish { padding: 0 0 16px; }
.dfi-finishTitle {
  margin: 2px 16px 0;
  font-size: var(--dfi-fs-xl);
  line-height: 20px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  text-align: center;
  text-wrap: balance;
}
.dfi-finishCopy {
  margin: 6px 16px 0;
  font-size: var(--dfi-fs-sm);
  line-height: 17px;
  color: var(--dsw-alias-label-secondary);
  text-align: center;
  text-wrap: pretty;
}

.dfi-confirm { padding: 0 0 16px; }
.dfi-confirmTitle {
  margin: 2px 16px 0;
  font-size: var(--dfi-fs-lg);
  line-height: 19px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  text-align: center;
  text-wrap: balance;
}
.dfi-confirmBody {
  margin: 6px 16px 0;
  font-size: var(--dfi-fs-sm);
  line-height: 17px;
  color: var(--dsw-alias-label-secondary);
  text-align: center;
  text-wrap: pretty;
}

.dfi-btnRow {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  height: 28px;
  margin: 14px 16px 0;
}

/* --- strict mask --------------------------------------------------------
   Full-screen cover for 严格模式. It is a sibling of the card, not a child:
   the card clips its own paint (contain/overflow), the mask has to escape it.
   Every visual value is a token — the same type scale and the same official
   surface fill as the card, so the mask reads as one more surface of the app
   rather than a second design language bolted on. */
.dfi-mask {
  position: fixed;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 24px 24px 72px;
  background: var(--dsw-alias-bg-base, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
  text-align: center;
  cursor: default;
}
/* The mask is the only surface on screen: the island card underneath would
   be a second, half-legible copy of the same information. */
.dfi-root[data-strict='true'] .dfi-card { display: none; }
.dfi-whale {
  display: block;
  width: min(560px, 76vw);
  height: min(315px, 42vh);
  /* The official canvas reads this for its code lettering ink; the fallback
     matches the official rule (secondary label, grayscale). */
  --home-whale-code-ink: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-secondary);
  filter: grayscale();
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
}
.dfi-maskTitle {
  margin: 4px 0 0;
  max-width: min(560px, 82vw);
  font-size: var(--dfi-fs-xl);
  line-height: 22px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
}
/* One row per running session. The list is capped and scrolls rather than
   growing without bound: the mask is a full screen, and twenty sessions must
   not push the whale off it. */
.dfi-maskList {
  margin: 14px 0 0;
  padding: 0;
  width: min(460px, 84vw);
  max-height: 40vh;
  overflow-y: auto;
  list-style: none;
  text-align: left;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.dfi-maskItem {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 2px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  font-size: var(--dfi-fs-lg);
  line-height: 18px;
}
.dfi-maskItem[data-current='true'] .dfi-maskName { font-weight: 600; }
.dfi-maskDot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  corner-shape: round;
  background: var(--dsw-alias-state-business-primary);
}
.dfi-maskItem[data-current='false'] .dfi-maskDot { background: var(--dsw-alias-label-caption); }
/* 「空闲中」 is a neutral fact, not an active turn: no business colour. */
.dfi-maskItem[data-idle='true'] .dfi-maskDot { background: var(--dsw-alias-label-caption); }
.dfi-maskItem[data-pending='true'] .dfi-maskDot { background: var(--dsw-alias-state-warn-primary); }
.dfi-maskItem[data-idle='true'] .dfi-maskName { color: var(--dsw-alias-label-secondary); }
.dfi-maskName {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
}
.dfi-maskUse {
  flex: none;
  font-size: var(--dfi-fs-sm);
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
}
.dfi-maskFoot {
  position: absolute;
  right: 24px;
  bottom: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
}
/* The way out, sized like an action rather than a hint: 34px tall keeps it on
   the same hit-height family as the island's own buttons. */
.dfi-maskSkip {
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
  font-size: var(--dfi-fs-md);
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--dfi-dur-fast) cubic-bezier(0.22, 1, 0.36, 1);
}
.dfi-maskSkip:hover { background: var(--dsw-alias-interactive-bg-active); }
/* The destructive-by-scope exit reads as the secondary of the two: it turns a
   protection the user opted into off, so it must not be the easiest target. */
.dfi-maskSkipAll {
  background: transparent;
  color: var(--dsw-alias-label-secondary);
}
.dfi-maskSkipAll:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

/* --- strict mode toggle (in the live card, not in settings) -------------
   One control, not a label plus a switch: the button's own text is「严格模式」
   and the knob rides at its right edge, so there is exactly one hit target
   for one boolean. The switch visuals are the island's own switch geometry
   (36x20, 16px knob, 2px inset) restated because this track lives inside a
   full-width row button. */
.dfi-strictRow {
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  padding: 0 10px;
}
.dfi-strictToggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: var(--dfi-fs-lg);
  line-height: 18px;
  text-align: left;
  cursor: pointer;
}
.dfi-strictLabel { white-space: nowrap; }
.dfi-strictTrack {
  position: relative;
  flex: none;
  width: 36px;
  height: 20px;
  border-radius: 50%;
  corner-shape: round;
  background: var(--dsw-alias-border-l3);
  transition: background var(--dfi-dur-base) cubic-bezier(0.22, 1, 0.36, 1);
}
.dfi-strictToggle[aria-checked='true'] .dfi-strictTrack { background: var(--dsw-alias-state-business-primary); }
.dfi-strictKnob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  corner-shape: round;
  background: var(--dsw-alias-label-primary-foreground);
  box-shadow: 0 0 0 0.5px var(--dsw-alias-border-l2);
  transition: transform var(--dfi-dur-slow) cubic-bezier(0.34, 1.3, 0.64, 1);
}
.dfi-strictToggle[aria-checked='true'] .dfi-strictKnob { transform: translateX(16px); }

.dfi-root button:focus-visible,
.dfi-root input:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: -2px;
}

@keyframes dfi-in {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: none; }
}
@keyframes dfi-softin {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: none; }
}
@keyframes dfi-warmin {
  from { opacity: 0; transform: translateY(-2px); }
  to { opacity: 1; transform: none; }
}
@keyframes dfi-warm {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes dfi-ringflash {
  0% { opacity: 0.7; }
  55% { opacity: 0.16; }
  100% { opacity: 0; }
}

/* Reduced motion is one switch, not nineteen overrides.
 *
 * The old rule listed every animated selector and slapped
 * "transition-duration: 0ms !important; animation: none !important" on it. It
 * missed the entrance animations that are declared with the animation
 * shorthand on .dfi-card / .dfi-content, so the two longest animations (the
 * 420ms/480ms capsule arrival) kept playing with the rest frozen — the opposite
 * of what the preference asks for, and impossible to notice by reading the list.
 *
 * Now every duration in the sheet reads a token, so zeroing the tokens turns
 * all of it off at once, entrance animations included. "animation: none" stays
 * for the two one-shot decorative layers (the reminder glow and its ring), which
 * exist only to draw the eye. */
@media (prefers-reduced-motion: reduce) {
  .dfi-root {
    --dfi-dur-fast: 0ms;
    --dfi-dur-base: 0ms;
    --dfi-dur-slow: 0ms;
    --dfi-dur-sweep: 0ms;
    --dfi-dur-deco: 0ms;
  }
  .dfi-card::before,
  .dfi-card::after {
    animation: none;
  }
}
`;

/* ----------------------------------------------------------------- utils -- */

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n > 1 && n <= 100) return n / 100;
  if (n < 0) return 0;
  return n > 1 ? 1 : n;
}

function clampDuration(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 25;
  return Math.min(DUR_MAX, Math.max(DUR_MIN, n));
}

function clampScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return SCALE_DEFAULT;
  let best = SCALE_DEFAULT;
  for (const option of SCALE_OPTIONS) {
    if (Math.abs(option - n) < Math.abs(best - n)) best = option;
  }
  return best;
}

function clampAutoRepeat(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return AUTO_REPEAT_DEFAULT;
  return Math.min(AUTO_REPEAT_MAX, Math.max(AUTO_REPEAT_MIN, n));
}

function formatClock(ms) {
  const total = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

/**
 * Run duration in the app's own wording (`19分25秒` / `25秒` / `1时02分`).
 *
 * Matches the official `duration.compactMinutes` / `compactSeconds` strings, so
 * the mask's line reads like the conversation's own「深度求索中，用时 19分25秒 ···」
 * rather than a second time format invented here.
 */
function formatRunDuration(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return hours + '时' + String(minutes).padStart(2, '0') + '分';
  }
  if (minutes > 0) return minutes + '分' + String(seconds).padStart(2, '0') + '秒';
  return Math.max(1, seconds) + '秒';
}

function formatWallClock(date) {
  const hours = date && typeof date.getHours === 'function' ? date.getHours() : 0;
  const minutes = date && typeof date.getMinutes === 'function' ? date.getMinutes() : 0;
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}

function normalizeState(raw) {
  const out = Object.assign({}, EMPTY_STATE);
  if (raw && typeof raw === 'object') {
    Object.keys(EMPTY_STATE).forEach(function (key) {
      if (raw[key] !== undefined && raw[key] !== null) out[key] = raw[key];
    });
    if (!Number.isFinite(Number(out.remainingMs))) out.remainingMs = out.durationMs;
    if (!Number.isFinite(Number(out.durationMinutes))) out.durationMinutes = 25;
  }
  out.phase = typeof out.phase === 'string' ? out.phase : 'idle';
  return out;
}

/* Three views, and `skipped` is its own one.
 *
 * It used to be folded into `finished`, so after "skip" the card said "you
 * stayed here for 3 minutes" — a sentence that contradicts the action the user
 * just took. The state machine has always kept the two apart; only the view
 * layer collapsed them. Now `skipped` renders a settled card with the time that
 * was actually counted, no reminder copy, and no skip button (there is nothing
 * left to skip).
 */
function viewKey(armed, phase) {
  if (armed) return 'confirm';
  if (phase === 'skipped') return 'skipped';
  if (phase === 'finished') return 'finished';
  return 'normal';
}

/* --------------------------------------------------------------- factory -- */

export function createWidget(init) {
  const options = init || {};
  const h = options.h;
  const React = options.React;
  const api = options.api || {};

  if (typeof h !== 'function') throw new TypeError('createWidget: `h` must be React.createElement');
  if (!React || typeof React.useState !== 'function' || typeof React.useEffect !== 'function') {
    throw new TypeError('createWidget: `React` is required');
  }

  const useState = React.useState;
  const useEffect = React.useEffect;
  const useLayoutEffect = typeof React.useLayoutEffect === 'function' ? React.useLayoutEffect : React.useEffect;
  const useRef = React.useRef;
  /* Memoising the static subtrees is the difference between rebuilding the
   * whole settings panel every second (the countdown ticks) and rebuilding it
   * only when one of its own values changes. */
  const useMemo = typeof React.useMemo === 'function' ? React.useMemo : function (factory) { return factory(); };

  const core = api.core && typeof api.core === 'object' ? api.core : null;

  function safe(fn, fallback) {
    try {
      const value = fn();
      return value === undefined || value === null ? fallback : value;
    } catch (err) {
      return fallback;
    }
  }

  function readCore() {
    if (!core || typeof core.getState !== 'function') return normalizeState(null);
    return normalizeState(safe(function () { return core.getState(); }, null));
  }

  function getLocale() {
    if (typeof api.getLocale === 'function') {
      const live = safe(function () { return api.getLocale(); }, null);
      if (live === 'zh' || live === 'en') return live;
    }
    return api.locale === 'en' ? 'en' : 'zh';
  }

  function loadPref(key, fallback) {
    if (typeof api.loadPref !== 'function') return fallback;
    const stored = safe(function () { return api.loadPref(key, fallback); }, undefined);
    return stored === undefined || stored === null || stored === '' ? fallback : stored;
  }

  function persistPref(key, value) {
    if (typeof api.persist !== 'function') return;
    safe(function () { api.persist(key, value); }, null);
  }

  function readResources() {
    if (typeof api.getResources !== 'function') return null;
    const next = safe(function () { return api.getResources(); }, null);
    return next && typeof next === 'object' ? next : null;
  }

  function readNotifyEnabled() {
    if (typeof api.getNotifyEnabled !== 'function') return true;
    return safe(function () { return api.getNotifyEnabled(); }, true) !== false;
  }

  function readSoundEnabled() {
    if (typeof api.getSoundEnabled !== 'function') return true;
    return safe(function () { return api.getSoundEnabled(); }, true) !== false;
  }

  function readNotifyPermission() {
    if (typeof api.getNotifyPermission !== 'function') return 'default';
    const value = safe(function () { return api.getNotifyPermission(); }, 'default');
    if (value === 'granted' || value === 'denied' || value === 'unsupported') return value;
    return 'default';
  }

  function readAutoRepeatMinutes(fallback) {
    if (typeof api.getAutoRepeatMinutes !== 'function') return clampAutoRepeat(fallback);
    return clampAutoRepeat(safe(function () { return api.getAutoRepeatMinutes(); }, fallback));
  }

  function makeT(locale) {
    const dict = COPY[locale] || COPY.zh;
    const fallbackDict = COPY.zh;
    return function t(key, vars) {
      let text = null;
      if (typeof api.t === 'function') {
        const translated = safe(function () { return api.t(key, vars); }, null);
        if (typeof translated === 'string' && translated && translated !== key) text = translated;
      }
      if (text === null) {
        text = dict[key];
        if (text === undefined) text = fallbackDict[key];
        if (text === undefined) text = key;
      }
      if (vars) {
        text = String(text).replace(/\{(\w+)\}/g, function (match, name) {
          const value = vars[name];
          return value === undefined || value === null ? match : String(value);
        });
      }
      return text;
    };
  }

  function makeIcon(name, size) {
    const d = ICON_PATHS[name] || '';
    return h('svg', {
      key: 'ico-' + name,
      className: 'dfi-ico',
      width: size || 14,
      height: size || 14,
      viewBox: ICON_BOX[name] || '0 0 16 16',
      'aria-hidden': 'true',
      focusable: 'false',
    }, h('path', {
      d: d,
      /* one stroke family for every icon, including skip */
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: name === 'gear' ? 2 : 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }));
  }

  /* ------------------------------------------------------------ component -- */

  return function FocusIsland(props) {
    const given = props || {};
    const rightInset = typeof given.rightInset === 'number' ? given.rightInset : 0;
    const hidden = rightInset < 0;
    const dragging = given.dragging === true;
    const topInset = typeof given.topInset === 'number' && Number.isFinite(given.topInset)
      ? given.topInset
      : TOP_PX;

    const [coreState, setCoreState] = useState(readCore);
    const [expanded, setExpanded] = useState(function () { return !!loadPref('expanded', false); });
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [resources, setResources] = useState(readResources);
    const [resourceMode, setResourceMode] = useState(function () {
      const pref = loadPref('resourceMode', null);
      if (pref === 'system' || pref === 'off') return pref;
      return api.resourceMode === 'system' ? 'system' : 'off';
    });
    const [collapsedScale, setCollapsedScale] = useState(function () {
      return clampScale(loadPref('collapsedScale', SCALE_DEFAULT));
    });
    const [notifyEnabled, setNotifyEnabled] = useState(readNotifyEnabled);
    const [soundEnabled, setSoundEnabled] = useState(readSoundEnabled);
    const [autoRepeatFallback, setAutoRepeatFallback] = useState(AUTO_REPEAT_DEFAULT);
    const [clock, setClock] = useState(function () { return new Date(); });
    const [locale, setLocale] = useState(getLocale);
    const [height, setHeight] = useState(PILL_H);
    /* 严格模式 is a persisted preference, off by default: a plugin that covers
       the whole screen must never do it because someone was exploring settings. */
    const [strictMode, setStrictMode] = useState(function () { return loadPref('strictMode', false) === true; });
    /* The strict mask's own one-second pulse. Once the budget is spent the core
     * publishes nothing, so without this clock the per-session durations and the
     * idle counter would only move when the 30 s wall clock redraws — which is
     * what "the timers froze" looked like. */
    const [maskClock, setMaskClock] = useState(0);

    const contentRef = useRef(null);
    const cardRef = useRef(null);
    const cancelRef = useRef(null);
    const whaleRef = useRef(null);
    const bootRef = useRef(false);
    const prevPhaseRef = useRef(coreState.phase);
    /* When this mask opened, and the last seen pending-interaction flag: both
     * outlive a render, and neither is allowed to trigger one. */
    const maskOpenedRef = useRef(0);
    const pendingRef = useRef(false);

    const t = makeT(locale);
    const theme = t('title');

    /* wall clock: the only local timer this widget owns */
    useEffect(function () {
      if (typeof setInterval !== 'function') return undefined;
      const handle = setInterval(function () { setClock(new Date()); }, CLOCK_TICK_MS);
      return function () {
        if (typeof clearInterval === 'function') clearInterval(handle);
      };
    }, []);

    /* core subscription — state always comes from here, never from a local timer */
    useEffect(function () {
      if (!core || typeof core.subscribe !== 'function') return undefined;
      setCoreState(readCore());
      const off = safe(function () {
        return core.subscribe(function (next) {
          setCoreState(next && typeof next === 'object' ? normalizeState(next) : readCore());
        });
      }, null);
      return function () {
        if (typeof off === 'function') safe(function () { off(); }, null);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* locale can change at runtime */
    useEffect(function () {
      if (typeof api.subscribeLocale !== 'function') return undefined;
      setLocale(getLocale());
      const off = safe(function () {
        return api.subscribeLocale(function () { setLocale(getLocale()); });
      }, null);
      return function () {
        if (typeof off === 'function') safe(function () { off(); }, null);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* resource samples (~3s cadence) */
    useEffect(function () {
      if (typeof api.getResources !== 'function') return undefined;
      setResources(readResources());
      if (typeof api.subscribeResources !== 'function') return undefined;
      const off = safe(function () {
        return api.subscribeResources(function () { setResources(readResources()); });
      }, null);
      return function () {
        if (typeof off === 'function') safe(function () { off(); }, null);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* notification / sound preferences: the integration layer owns the values */
    useEffect(function () {
      if (typeof api.subscribeNotifyPrefs !== 'function') return undefined;
      const sync = function () {
        setNotifyEnabled(readNotifyEnabled());
        setSoundEnabled(readSoundEnabled());
      };
      sync();
      const off = safe(function () { return api.subscribeNotifyPrefs(sync); }, null);
      return function () {
        if (typeof off === 'function') safe(function () { off(); }, null);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* entering the finished phase opens the card so the reminder is visible */
    useEffect(function () {
      const previous = prevPhaseRef.current;
      prevPhaseRef.current = coreState.phase;
      const finishedNow = coreState.phase === 'finished' || coreState.phase === 'skipped';
      const justFinished = finishedNow && previous !== 'finished' && previous !== 'skipped';
      const bootFinished = !bootRef.current && finishedNow;
      bootRef.current = true;
      if (justFinished || bootFinished) {
        setExpanded(true);
        persistPref('expanded', true);
        setSettingsOpen(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [coreState.phase]);

    /* measure the active view so the capsule/card morphs to its real height */
    useLayoutEffect(function () {
      const el = contentRef.current;
      if (!el || typeof el.getBoundingClientRect !== 'function') return undefined;
      let mounted = true;
      const measure = function () {
        if (!mounted) return;
        /* offsetHeight ignores transforms, so the mount animation (which may
           scale the content) cannot bias the measured height. */
        const raw = typeof el.offsetHeight === 'number' && el.offsetHeight > 0
          ? el.offsetHeight
          : (typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect().height : 0);
        const next = Math.ceil(raw);
        if (next > 0) setHeight(function (prev) { return Math.abs(prev - next) < 0.6 ? prev : next; });
      };
      measure();
      let observer = null;
      if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(measure);
        observer.observe(el);
      }
      return function () {
        mounted = false;
        if (observer) observer.disconnect();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expanded, viewKey(coreState.skipArmed, coreState.phase), settingsOpen, locale, resourceMode, collapsedScale, readNotifyPermission()]);

    /* skip confirmation takes focus for keyboard users */
    useEffect(function () {
      const el = cancelRef.current;
      if (coreState.skipArmed && el && typeof el.focus === 'function') {
        safe(function () { el.focus({ preventScroll: true }); }, null);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [coreState.skipArmed]);

    const state = coreState;
    const phase = state.phase;
    const paused = phase === 'paused';
    const skipped = phase === 'skipped';
    const finished = phase === 'finished';
    /* A round that is over in either direction (budget spent, or explicitly
     * skipped) is treated the same when deciding whether to unfold the card —
     * both end the count, and neither should sit collapsed and unnoticed. */
    const roundOver = finished || skipped;
    const armed = !!state.skipArmed;
    const view = armed ? 'confirm' : (skipped ? 'skipped' : (finished ? 'finished' : 'normal'));
    const mode = expanded ? 'expanded' : 'collapsed';

    /* A mode swap lands the surface at its final size in a single layout, so the
     * height transition must stay out of the way while the entrance animation
     * plays. Toggled as a DOM attribute (not React state) so the swap costs no
     * extra render. */
    useLayoutEffect(function () {
      const el = cardRef.current;
      if (!el || typeof el.setAttribute !== 'function' || typeof setTimeout !== 'function') return undefined;
      el.setAttribute('data-swapping', 'true');
      const handle = setTimeout(function () {
        el.removeAttribute('data-swapping');
      }, SWAP_MS);
      return function () {
        if (typeof clearTimeout === 'function') clearTimeout(handle);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    /* Strict mode's mask is up exactly while the round is over.
     *
     * `finished` only: a `skipped` round is a round the user already ended, and
     * covering the screen after an explicit skip would be the plugin arguing
     * with the person using it. In strict mode skip is not offered at all, so
     * the mask cannot be reached that way — this guard covers a round that was
     * skipped *before* strict mode was switched on. */
    const strictMask = strictMode && phase === 'finished';
    const p = clamp01(state.progress);

    /* Session facts come from the host component when it supplies them (it owns
     * the subscription to the session store); the api path stays for the widget
     * tests and for a host that only injects the getter. */
    const sessions = activeSessions(Array.isArray(given.sessions) ? given.sessions : null);
    const hasPending = sessions.some(function (entry) { return entry.pending === true; });

    /* One pulse per second while the mask is up: every row is a live duration. */
    useEffect(function () {
      if (!strictMask || typeof setInterval !== 'function') return undefined;
      const handle = setInterval(function () { setMaskClock(Date.now()); }, 1000);
      return function () {
        if (typeof clearInterval === 'function') clearInterval(handle);
      };
    }, [strictMask]);

    /* The idle row counts from the moment the mask opened — the budget is spent,
     * so this is the only clock that can still say "you have been stuck here". */
    useEffect(function () {
      if (!strictMask) {
        maskOpenedRef.current = 0;
        setMaskClock(0);
        return;
      }
      if (maskOpenedRef.current === 0) maskOpenedRef.current = Date.now();
    }, [strictMask]);

    /* A pending question outranks the mask.
     *
     * The question card lives in the conversation's composer seat — under the
     * mask, never above it — so leaving the mask up hides the one thing that can
     * unblock the session. That is how a strict round turned into a dead end:
     * the model asked, and nothing on screen said so. Dismissing the round is
     * exactly the exit「跳过本轮」already offers (5 minutes again, strict mode
     * still on), and nothing is answered on the user's behalf. */
    useEffect(function () {
      if (!strictMask || !hasPending) return;
      onStrictSkip();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [strictMask, hasPending]);

    /* Outside the mask, a pending question is a one-per-edge alert. */
    useEffect(function () {
      const was = pendingRef.current;
      pendingRef.current = hasPending;
      if (!hasPending || was) return;
      if (typeof api.notifyPending === 'function') safe(function () { api.notifyPending(); }, null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasPending]);

    const remaining = Number.isFinite(Number(state.remainingMs)) ? Number(state.remainingMs) : Number(state.durationMs) || 0;
    const clockText = formatClock(remaining);
    const wallText = formatWallClock(clock);
    const durationMinutes = clampDuration(Number(state.durationMinutes) || 25);
    const watchedMs = Math.max(0, Number(state.watchedMs) || 0);
    const elapsedMs = Math.max(0, Number(state.elapsedMs) || 0);
    /* Two different numbers, and the two endings need different ones.
     *
     * `watchedMs` is wall-clock time in a conversation-less window — it can
     * exceed the budget (the reminder sat unanswered for ten minutes).
     * `elapsedMs` is what the machine actually counted against the budget.
     * "You stayed for N minutes" wants the first; "N minutes were counted"
     * wants the second, or a skipped round claims more time than it booked. */
    const watchedMinutes = Math.max(1, Math.round((watchedMs || elapsedMs || durationMinutes * 60000) / 60000));
    const countedMinutes = Math.max(1, Math.round((elapsedMs || watchedMs || durationMinutes * 60000) / 60000));
    const dotState = hasPending ? 'pending' : (paused ? 'paused' : (roundOver ? 'finished' : (phase === 'idle' ? 'idle' : 'counting')));
    const rightPx = BASE_RIGHT_PX + (hidden ? 0 : Math.max(0, rightInset));
    const scaleValue = clampScale(collapsedScale);
    const notifyPermission = readNotifyPermission();
    const autoRepeatMinutes = readAutoRepeatMinutes(autoRepeatFallback);
    const cardKey = 'content-' + mode + '-' + view + '-' + (settingsOpen ? 'setup' : 'plain') + '-' + resourceMode + '-' + locale;
    const showResources = expanded && view === 'normal' && resourceMode === 'system';
    const showPillResources = !expanded && resourceMode === 'system';

    /* Static subtrees are computed once per input change, not once per tick.
     * The countdown publishes every second; without this the settings panel
     * and the four gauges would be rebuilt and reconciled 60x a minute. */
    const resourceItemsMemo = useMemo(function () { return resourceItems(); }, [resources, locale]);
    const resourceSummaryMemo = useMemo(function () { return resourceSummary(resourceItemsMemo); }, [resourceItemsMemo]);
    const resourceBlockMemo = useMemo(function () {
      return showResources ? renderResourceBlock(resourceItemsMemo) : null;
    }, [showResources, resourceItemsMemo, locale]);
    const settingsTreeMemo = useMemo(function () {
      return settingsOpen ? renderSettings() : null;
    }, [settingsOpen, locale, durationMinutes, autoRepeatMinutes, resourceMode, scaleValue, notifyEnabled, soundEnabled, notifyPermission]);

    function setExpandedPref(value) {
      setExpanded(value);
      persistPref('expanded', value);
      if (!value) setSettingsOpen(false);
    }

    function onKeyDown(event) {
      if (!event || event.key !== 'Escape') return;
      /* The mask is deliberate: Escape must not be a quiet second exit, or
       * "strict" would be one keystroke away from ordinary mode. */
      if (strictMask) {
        event.preventDefault();
        return;
      }
      if (armed) {
        event.preventDefault();
        if (core && typeof core.skipCancel === 'function') safe(function () { core.skipCancel(); }, null);
        return;
      }
      if (settingsOpen) {
        event.preventDefault();
        setSettingsOpen(false);
        return;
      }
      if (expanded) {
        event.preventDefault();
        setExpandedPref(false);
      }
    }

    function onSkip() {
      setSettingsOpen(false);
      if (core && typeof core.skipArm === 'function') safe(function () { core.skipArm(); }, null);
    }

    function onSkipCancel() {
      if (core && typeof core.skipCancel === 'function') safe(function () { core.skipCancel(); }, null);
    }

    function onSkipConfirm() {
      if (core && typeof core.skipConfirm === 'function') safe(function () { core.skipConfirm(); }, null);
    }

    function onRestart() {
      if (core && typeof core.reset === 'function') safe(function () { core.reset(); }, null);
      setExpandedPref(true);
    }

    /**
     * 「跳过本轮」— 关掉这一面遮罩，从五分钟重新计时，**严格模式仍然开着**。
     *
     * The requirement is that this behaves like reopening the island and
     * counting five minutes again, so it does exactly that: drop the mask, then
     * (a) rearm the budget to five minutes and (b) hard-reset the countdown.
     * Both the core and the persisted preference are updated, otherwise the
     * next reload would restore the old long interval and the mask would come
     * back at a time nobody chose.
     */
    function onStrictSkip() {
      if (core && typeof core.setDurationMinutes === 'function') safe(function () { core.setDurationMinutes(STRICT_RESTART_MINUTES); }, null);
      persistPref('durationMinutes', STRICT_RESTART_MINUTES);
      if (core && typeof core.reset === 'function') safe(function () { core.reset(); }, null);
      setExpandedPref(true);
    }

    /**
     * 「退出所有严格模式」— 同一轮重计，并且把严格模式本身关掉。
     *
     * Two exits, not one, because the two things a person can mean by "let me
     * out" are different: "not now, keep the rule" and "stop doing this to me".
     * A single button has to guess, and guessing wrong either traps the user in
     * a mode they just asked to leave or silently disables a mode they wanted.
     */
    function onStrictSkipAll() {
      setStrictMode(false);
      persistPref('strictMode', false);
      if (api && typeof api.setStrictMode === 'function') safe(function () { api.setStrictMode(false); }, null);
      onStrictSkip();
    }

    function toggleStrict() {
      const next = !strictMode;
      setStrictMode(next);
      persistPref('strictMode', next);
      if (typeof api.setStrictMode === 'function') safe(function () { api.setStrictMode(next); }, null);
      /* Leave the panel once the mode changes: its whole effect is on a surface
         this panel covers, so keeping it open hides the thing that just
         changed. */
      setSettingsOpen(false);
      if (!next) setExpanded(true);
    }

    function applyDuration(nextValue) {
      const next = clampDuration(nextValue);
      if (next === durationMinutes) return;
      if (core && typeof core.setDurationMinutes === 'function') safe(function () { core.setDurationMinutes(next); }, null);
      persistPref('durationMinutes', next);
      setCoreState(function (prev) {
        const counting = prev.phase === 'counting' || prev.phase === 'idle';
        return Object.assign({}, prev, {
          durationMinutes: next,
          durationMs: next * 60000,
          remainingMs: counting ? next * 60000 : prev.remainingMs,
          progress: counting ? 0 : prev.progress,
        });
      });
    }

    function toggleResources() {
      const next = resourceMode === 'system' ? 'off' : 'system';
      setResourceMode(next);
      persistPref('resourceMode', next);
      if (typeof api.setResourceMode === 'function') safe(function () { api.setResourceMode(next); }, null);
    }

    function applyAutoRepeat(nextValue) {
      const next = clampAutoRepeat(nextValue);
      setAutoRepeatFallback(next);
      if (typeof api.setAutoRepeatMinutes === 'function') safe(function () { api.setAutoRepeatMinutes(next); }, null);
    }

    function chooseScale(nextValue) {
      const next = clampScale(nextValue);
      setCollapsedScale(next);
      persistPref('collapsedScale', next);
    }

    function chooseLocale(nextValue) {
      const next = nextValue === 'en' ? 'en' : 'zh';
      if (typeof api.setLocale === 'function') safe(function () { api.setLocale(next); }, null);
      setLocale(next);
    }

    function toggleNotify() {
      const next = !notifyEnabled;
      setNotifyEnabled(next);
      if (typeof api.setNotifyEnabled === 'function') safe(function () { api.setNotifyEnabled(next); }, null);
    }

    function toggleSound() {
      const next = !soundEnabled;
      setSoundEnabled(next);
      if (typeof api.setSoundEnabled === 'function') safe(function () { api.setSoundEnabled(next); }, null);
    }

    function testNotify() {
      if (typeof api.testNotify !== 'function') return;
      safe(function () { api.testNotify(); }, null);
    }

    function testSound() {
      if (typeof api.testSound !== 'function') return;
      safe(function () { api.testSound(); }, null);
    }

    function iconButton(key, iconName, label, onClick, active) {
      return h('button', {
        key: key,
        type: 'button',
        className: 'dfi-iconBtn',
        onClick: onClick,
        title: label,
        'aria-label': label,
        'data-active': active ? 'true' : 'false',
      }, makeIcon(iconName, 14));
    }

    function switchButton(key, label, checked, onClick) {
      return h('button', {
        key: key,
        type: 'button',
        role: 'switch',
        className: 'dfi-switch',
        'aria-checked': checked,
        'aria-label': label,
        onClick: onClick,
      }, h('span', { key: 'knob', className: 'dfi-knob' }));
    }

    function renderRing() {
      return h('span', { key: 'ring', className: 'dfi-ringWrap', 'data-state': dotState, 'aria-hidden': 'true' },
        h('svg', { className: 'dfi-ring', width: RING_SIZE, height: RING_SIZE, viewBox: '0 0 ' + RING_SIZE + ' ' + RING_SIZE, focusable: 'false' },
          h('circle', { key: 'track', className: 'dfi-ringTrack', cx: RING_SIZE / 2, cy: RING_SIZE / 2, r: RING_R }),
          h('circle', {
            key: 'arc',
            className: 'dfi-ringArc',
            cx: RING_SIZE / 2,
            cy: RING_SIZE / 2,
            r: RING_R,
            style: { '--dfi-off': String(RING_C * (1 - p)) },
          })
        )
      );
    }

    function renderCollapsed() {
      const top = h('span', { key: 'top', className: 'dfi-pillTop' },
        renderRing(),
        h('span', { key: 'clock', className: 'dfi-clock' }, clockText),
        h('span', { key: 'grow', className: 'dfi-grow' }),
        h('span', { key: 'wall', className: 'dfi-sysClock', 'data-pending': hasPending ? 'true' : 'false' },
          hasPending ? t('pending.short') : wallText)
      );
      const summary = showPillResources ? resourceSummaryMemo : '';
      return h('button', {
        key: 'pill',
        type: 'button',
        className: 'dfi-pill',
        onClick: function () { setExpandedPref(true); },
        'aria-label': t('action.expand') + ' · ' + theme + ' · ' + clockText + ' · ' + wallText
          + (summary === '' ? '' : ' · ' + summary),
        'aria-expanded': false,
        'aria-controls': ROOT_ID + '-card',
        title: t('action.expand'),
      },
        top,
        /* absolute top-right hit area: exactly the expanded card's collapse box */
        h('span', { key: 'chevron', className: 'dfi-chevronBox' }, makeIcon('chevron-down', 12)),
        showPillResources ? renderPillResources(resourceItemsMemo, resourceSummaryMemo) : null
      );
    }

    function resourceItems() {
      /* Read the state sample, not api.getResources() directly: the
         subscription already delivers every poll, and reading state is what
         makes the memo below stable between countdown ticks. */
      const sample = resources || {};
      const items = [
        { key: 'cpu', label: t('resources.cpu'), value: sample.cpu, unit: '%', warn: 60, hot: 85 },
        { key: 'gpu', label: t('resources.gpu'), value: sample.gpu, unit: '%', warn: 60, hot: 85 },
        { key: 'mem', label: t('resources.mem'), value: sample.mem, unit: '%', warn: 60, hot: 85 },
        { key: 'temp', label: t('resources.temp'), value: sample.temp, unit: '°C', warn: 60, hot: 80 },
      ];
      return items.map(function (item) {
        const has = Number.isFinite(Number(item.value));
        const value = has ? Math.max(0, Math.min(100, Number(item.value))) : 0;
        const level = !has ? 'na' : (value >= item.hot ? 'hot' : (value >= item.warn ? 'warn' : 'ok'));
        const text = !has ? t('resources.na') : (item.unit === '°C' ? Math.round(value) + '°C' : Math.round(value) + '%');
        return Object.assign({}, item, { has: has, value: value, level: level, text: text });
      });
    }

    /** One-line "CPU 43% · GPU 97% · …" summary — the strip's only text form. */
    function resourceSummary(items) {
      return items.map(function (item) {
        return item.label + ' ' + (item.has
          ? Math.round(item.value) + (item.unit === '°C' ? '°C' : '%')
          : t('resources.na'));
      }).join(' · ');
    }

    function renderPillResources(items, summary) {
      /* Bare bars only: a label and a number per segment would turn the capsule
         into a miniature dashboard. Length + color carry the reading; the
         numbers stay reachable on hover (title) and in the pill's aria-label. */
      return h('span', { key: 'pillRes', className: 'dfi-pillRes', title: summary },
        items.map(function (item) {
          return h('span', { key: item.key, className: 'dfi-micro', 'data-level': item.level },
            h('span', { key: 'track', className: 'dfi-microTrack' },
              h('span', { key: 'fill', className: 'dfi-microFill', style: { '--dfi-p': item.value / 100 } })
            )
          );
        })
      );
    }

    function gauges(items) {
      return h('div', { key: 'gauges', className: 'dfi-gauges' }, items.map(function (item) {
        return h('div', { key: item.key, className: 'dfi-gauge', 'data-level': item.level },
          h('span', { key: 'label', className: 'dfi-gaugeLabel' }, item.label),
          h('span', { key: 'value', className: 'dfi-gaugeVal' }, item.text),
          h('div', { key: 'track', className: 'dfi-gaugeTrack' },
            h('div', { key: 'fill', className: 'dfi-gaugeFill', style: { '--dfi-p': item.value / 100 } })
          )
        );
      }));
    }

    function renderResourceBlock(items) {
      return h('div', { key: 'resources', className: 'dfi-res' },
        h('div', { key: 'title', className: 'dfi-resTitle' }, t('resources.title')),
        gauges(items)
      );
    }

    function renderStepper(keyPrefix, value, min, max, step, label, onStep) {
      /* The middle is a real number field: any integer in [min, max] can be
         typed; blur/Enter commits, Escape and out-of-range input fall back to
         the stored value. `key` follows the value so a +/- click or a commit
         remounts the field with the clamped number. */
      function commit(event) {
        const target = event && event.target ? event.target : null;
        if (!target) return;
        const parsed = Math.round(Number(target.value));
        const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
        target.value = String(next);
        if (next !== value) onStep(next);
      }
      return h('div', { key: keyPrefix + '-stepper', className: 'dfi-stepper' },
        h('button', {
          key: 'minus',
          type: 'button',
          className: 'dfi-stepBtn',
          'aria-label': label + ' −' + step,
          disabled: value <= min,
          onClick: function () { onStep(value - step); },
        }, makeIcon('minus', 12)),
        h('input', {
          key: 'value-' + value,
          type: 'number',
          className: 'dfi-stepInput',
          min: min,
          max: max,
          step: step,
          defaultValue: String(value),
          'aria-label': label,
          onBlur: commit,
          onKeyDown: function (event) {
            if (event.key === 'Enter') event.target.blur();
            if (event.key === 'Escape') event.target.blur();
          },
        }),
        h('span', { key: 'unit', className: 'dfi-stepUnit' }, t('unit.min')),
        h('button', {
          key: 'plus',
          type: 'button',
          className: 'dfi-stepBtn',
          'aria-label': label + ' +' + step,
          disabled: value >= max,
          onClick: function () { onStep(value + step); },
        }, makeIcon('plus', 12))
      );
    }

    function renderSeg(key, options, current, onPick) {
      return h('div', { key: key + '-seg', className: 'dfi-seg' }, options.map(function (option) {
        const active = option.value === current;
        return h('button', {
          key: key + '-' + option.value,
          type: 'button',
          className: 'dfi-segBtn',
          'data-active': active ? 'true' : 'false',
          'aria-pressed': active,
          onClick: function () { onPick(option.value); },
        }, option.label);
      }));
    }

    function renderSettings() {
      const presets = PRESETS.map(function (minutes) {
        const active = minutes === durationMinutes;
        return h('button', {
          key: 'preset-' + minutes,
          type: 'button',
          className: 'dfi-chip',
          'data-active': active ? 'true' : 'false',
          'aria-pressed': active,
          'aria-label': t('settings.duration') + ' ' + minutes + ' ' + t('unit.min'),
          onClick: function () { applyDuration(minutes); },
        }, String(minutes));
      });
      const sizeOptions = SCALE_OPTIONS.map(function (value) {
        const key = value === 1 ? 'settings.size.compact' : (value === 1.2 ? 'settings.size.normal' : 'settings.size.large');
        return { value: value, label: t(key) };
      });
      const localeOptions = [
        { value: 'zh', label: '中文' },
        { value: 'en', label: 'English' },
      ];

      return h('div', { key: 'settings', className: 'dfi-settings' },
        h('div', { key: 'boxDuration', className: 'dfi-setBox' },
          h('div', { key: 'title', className: 'dfi-setBoxTitle' }, t('settings.box.duration')),
          h('div', { key: 'row', className: 'dfi-setRow' },
            h('span', { key: 'label', className: 'dfi-setLabel' }, t('settings.interval')),
            renderStepper('duration', durationMinutes, DUR_MIN, DUR_MAX, DUR_STEP, t('settings.duration'), applyDuration)
          ),
          h('div', { key: 'presets', className: 'dfi-chipsRow' }, presets),
          h('div', { key: 'autoRepeatRow', className: 'dfi-setRow' },
            h('span', { key: 'label', className: 'dfi-setLabel' }, t('settings.autoRepeat')),
            renderStepper('autoRepeat', autoRepeatMinutes, AUTO_REPEAT_MIN, AUTO_REPEAT_MAX, 1, t('settings.autoRepeat'), applyAutoRepeat)
          ),
          h('div', { key: 'autoRepeatHint', className: 'dfi-autoHint' },
            autoRepeatMinutes === 0
              ? t('settings.autoRepeatOff')
              : t('settings.autoRepeatHint', { n: autoRepeatMinutes })),
          h('div', { key: 'hint', className: 'dfi-setHint' }, t('settings.durationHint'))
        ),
        h('div', { key: 'boxAppearance', className: 'dfi-setBox' },
          h('div', { key: 'title', className: 'dfi-setBoxTitle' }, t('settings.box.appearance')),
          h('div', { key: 'resourcesRow', className: 'dfi-setRow' },
            h('span', { key: 'label', className: 'dfi-setLabel' }, t('settings.resources')),
            h('button', {
              key: 'switch',
              type: 'button',
              role: 'switch',
              className: 'dfi-switch',
              'aria-checked': resourceMode === 'system',
              'aria-label': t('settings.resources'),
              onClick: toggleResources,
            }, h('span', { key: 'knob', className: 'dfi-knob' }))
          ),
          h('div', { key: 'scaleRow', className: 'dfi-setRow' },
            h('span', { key: 'label', className: 'dfi-setLabel' }, t('settings.collapsedSize')),
            renderSeg('scale', sizeOptions, scaleValue, chooseScale)
          ),
          h('div', { key: 'localeRow', className: 'dfi-setRow' },
            h('span', { key: 'label', className: 'dfi-setLabel' }, t('settings.language')),
            renderSeg('locale', localeOptions, locale, chooseLocale)
          ),
          /* 严格模式 opens its own box: it is the only setting whose effect is
             "cover the entire screen", and it comes with a hint the user needs
             to read before turning it on. */
          renderStrictRow(),
          h('div', { key: 'strictHint', className: 'dfi-setHint' }, t('settings.strictHint'))
        ),
        h('div', { key: 'boxNotify', className: 'dfi-setBox' },
          h('div', { key: 'title', className: 'dfi-setBoxTitle' }, t('settings.box.notify')),
          h('div', { key: 'notifyRow', className: 'dfi-setRow' },
            h('span', { key: 'label', className: 'dfi-setLabel' }, t('settings.notify')),
            h('span', { key: 'right', className: 'dfi-rowRight' },
              h('button', {
                key: 'test',
                type: 'button',
                className: 'dfi-btn dfi-btnTest',
                onClick: testNotify,
              }, t('action.test')),
              switchButton('notifySwitch', t('settings.notify'), notifyEnabled, toggleNotify)
            )
          ),
          notifyPermission === 'granted'
            ? null
            : h('div', { key: 'hint', className: 'dfi-permHint' }, t('settings.notifyHint')),
          h('div', { key: 'soundRow', className: 'dfi-setRow' },
            h('span', { key: 'label', className: 'dfi-setLabel' }, t('settings.sound')),
            h('span', { key: 'right', className: 'dfi-rowRight' },
              h('button', {
                key: 'test',
                type: 'button',
                className: 'dfi-btn dfi-btnTest',
                onClick: testSound,
              }, t('action.test')),
              switchButton('soundSwitch', t('settings.sound'), soundEnabled, toggleSound)
            )
          )
        )
      );
    }

    function renderNormal() {
      const children = [
        h('div', { key: 'hdr', className: 'dfi-expHdr' },
          h('span', { key: 'dot', className: 'dfi-liveDot', 'data-state': dotState }),
          h('span', { key: 'title', className: 'dfi-title' }, theme),
          h('button', {
            key: 'collapse',
            type: 'button',
            className: 'dfi-collapse',
            onClick: function () { setExpandedPref(false); },
            title: t('action.collapse'),
            'aria-label': t('action.collapse'),
          }, makeIcon('chevron-up', 14))
        ),
        h('div', { key: 'main', className: 'dfi-main' },
          h('div', { key: 'clock', className: 'dfi-clockBig' }, clockText),
          h('div', { key: 'bar', className: 'dfi-bar' },
            h('div', { key: 'fill', className: 'dfi-barFill', style: { '--dfi-p': p } })
          )
        ),
      ];
      children.push(h('div', { key: 'actions', className: 'dfi-actions' },
        /* Both actions are icon-only 28x28 buttons, one visual weight: the
           skip label used to add a second word for the same action. */
        iconButton('skip', 'skip', t('action.skip'), onSkip, false),
        iconButton('settings', 'gear', t('action.settings'), function () { setSettingsOpen(!settingsOpen); }, settingsOpen)
      ));
      /* A pending question sits above the gauges: it is the only line on this
         card that asks the reader to do something. */
      if (hasPending) {
        children.push(h('div', { key: 'pending', className: 'dfi-pending', role: 'status' },
          h('span', { key: 'dot', className: 'dfi-liveDot', 'data-state': 'pending', 'aria-hidden': 'true' }),
          t('pending.chip')
        ));
      }
      /* resources stay above settings, so opening settings never shifts them */
      if (resourceBlockMemo !== null) children.push(resourceBlockMemo);
      if (settingsTreeMemo !== null) children.push(settingsTreeMemo);
      return h('div', { key: 'normal', className: 'dfi-body' }, children);
    }

    /**
     * 「严格模式」设置行：文字就是这四个字，右侧跟一个开关控件。
     *
     * It lives inside 设置 → 外观与其他, not on the card face: the card is what
     * you look at while working, and a switch that can blank the whole screen
     * does not belong at arm's length from a stray click. Turning it on also
     * collapses the settings panel, so the state is not hidden behind a panel
     * that the next render closes anyway.
     *
     * The whole row is one button carrying `role="switch"`, so the label and the
     * track are a single target — two hit areas for one boolean is how a switch
     * ends up disagreeing with itself.
     */
    function renderStrictRow() {
      return h('div', { key: 'strictRow', className: 'dfi-setRow dfi-strictRow' },
        h('button', {
          key: 'strictToggle',
          type: 'button',
          role: 'switch',
          className: 'dfi-strictToggle',
          'aria-checked': strictMode,
          'aria-label': t('settings.strict'),
          title: t('settings.strictHint'),
          onClick: toggleStrict,
        },
          h('span', { key: 'label', className: 'dfi-setLabel dfi-strictLabel' }, t('settings.strict')),
          h('span', { key: 'track', className: 'dfi-strictTrack' },
            h('span', { key: 'knob', className: 'dfi-strictKnob' })
          )
        )
      );
    }

    /* The "round is over" card, for both endings.
     *
     * `finished` = the budget ran out; `skipped` = you ended it yourself. They
     * share one layout on purpose (same header, same primary action) but not
     * one sentence: telling someone who just pressed "skip" that they "stayed
     * for 3 minutes" is the kind of contradiction that made the old build feel
     * unreliable. The skip button is only offered in the `finished` case —
     * there is nothing left to skip in the skipped case, and the missing button
     * is what the old view got wrong by reusing the reminder for both. */
    function renderRoundOver() {
      const isSkipped = phase === 'skipped';
      return h('div', { key: 'finished', className: 'dfi-finish' },
        h('div', { key: 'hdr', className: 'dfi-expHdr' },
          h('span', { key: 'dot', className: 'dfi-liveDot', 'data-state': 'finished' }),
          h('span', { key: 'title', className: 'dfi-title' }, theme),
          h('button', {
            key: 'collapse',
            type: 'button',
            className: 'dfi-collapse',
            onClick: function () { setExpandedPref(false); },
            title: t('action.collapse'),
            'aria-label': t('action.collapse'),
          }, makeIcon('chevron-up', 14))
        ),
        h('div', { key: 'message', className: 'dfi-finishTitle' },
          t(isSkipped ? 'skipped.title' : 'finished.title', { n: isSkipped ? countedMinutes : watchedMinutes })),
        h('div', { key: 'copy', className: 'dfi-finishCopy' },
          t(isSkipped ? 'skipped.body' : 'finished.body', { n: countedMinutes })),
        h('div', { key: 'buttons', className: 'dfi-btnRow' },
          h('button', { key: 'restart', type: 'button', className: 'dfi-btn dfi-btnPrimary', onClick: onRestart }, t('action.restart')),
          isSkipped ? null : h('button', { key: 'skip', type: 'button', className: 'dfi-btn', onClick: onSkip }, t('action.skip'))
        )
      );
    }

    /* The reminder view reuses the same two-step control, but it is not
     * "skip the countdown" (that is already over) — it drops the reminder.
     * Same arm/confirm mechanics, different wording, so the button is not a
     * dead end any more. */
    function renderConfirm() {
      const wasFinished = phase === 'finished';
      return h('div', {
        key: 'confirm',
        className: 'dfi-confirm',
        role: 'alertdialog',
        'aria-labelledby': CONFIRM_TITLE_ID,
        'aria-describedby': CONFIRM_BODY_ID,
      },
        h('div', { key: 'hdr', className: 'dfi-expHdr' },
          h('span', { key: 'dot', className: 'dfi-liveDot', 'data-state': wasFinished ? 'finished' : 'paused' }),
          h('span', { key: 'title', className: 'dfi-title' }, theme),
          h('button', {
            key: 'collapse',
            type: 'button',
            className: 'dfi-collapse',
            onClick: function () { setExpandedPref(false); },
            title: t('action.collapse'),
            'aria-label': t('action.collapse'),
          }, makeIcon('chevron-up', 14))
        ),
        h('div', { key: 'title', className: 'dfi-confirmTitle', id: CONFIRM_TITLE_ID },
          t(wasFinished ? 'skip.doneTitle' : 'skip.title')),
        h('div', { key: 'body', className: 'dfi-confirmBody', id: CONFIRM_BODY_ID },
          t(wasFinished ? 'skip.doneBody' : 'skip.body')),
        h('div', { key: 'buttons', className: 'dfi-btnRow' },
          h('button', {
            key: 'cancel',
            type: 'button',
            className: 'dfi-btn',
            ref: cancelRef,
            onClick: onSkipCancel,
          }, t('skip.cancel')),
          h('button', {
            key: 'confirm',
            type: 'button',
            className: 'dfi-btn dfi-btnDanger',
            onClick: onSkipConfirm,
          }, t('skip.confirm'))
        )
      );
    }

    /**
     * 严格模式 的遮罩：整屏铺满，只留官方像素鲸 + 正在运行的会话 + 各自的用时，
     * 右下角两个退出选项。没有跳过、没有重新计时、没有收起——这正是这个模式唯一
     * 存在的理由，给一个后门就等于没有严格模式。
     *
     * 每一行显示**这个会话自己的**用时，用的是官方那句
     * 「深度求索中，用时 19分25秒 ···」的格式与文案键，而不是把本窗口的停留时间
     * 复制到每一行上。官方那行读的是当前会话的 turn 时间轴，overlay 座位拿不到，
     * 所以 start 由集成层按 running 边沿记录（真实测量，不是估算）。
     *
     * 没有会话在跑的时候不再凭空造一行「未命名会话 · 深度求索中」：那一行之前是
     * 兜底占位，读起来却像有个会话正在生成。现在改成官方的中性状态「空闲中」，
     * 右侧是遮罩打开以来一直走的停留时长——空转的那段时间照样看得见。
     */
    function renderStrictMask() {
      const rows = maskRows();
      return h('div', {
        key: 'strictMask',
        className: 'dfi-mask',
        role: 'alertdialog',
        'aria-modal': 'true',
        'aria-label': t('settings.strict'),
        'aria-describedby': MASK_LIST_ID,
      },
        h('canvas', {
          key: 'whale',
          ref: whaleRef,
          className: 'dfi-whale',
          'aria-hidden': 'true',
        }),
        h('ul', { key: 'sessions', id: MASK_LIST_ID, className: 'dfi-maskList' }, rows.map(function (entry, index) {
          return h('li', {
            key: 'session-' + index,
            className: 'dfi-maskItem',
            'data-current': entry.current ? 'true' : 'false',
            'data-idle': entry.idle ? 'true' : 'false',
            'data-pending': entry.pending ? 'true' : 'false',
          },
            h('span', { key: 'dot', className: 'dfi-maskDot', 'aria-hidden': 'true' }),
            h('span', { key: 'name', className: 'dfi-maskName', title: entry.title }, entry.title),
            h('span', { key: 'use', className: 'dfi-maskUse' }, entry.text)
          );
        })),
        h('div', { key: 'foot', className: 'dfi-maskFoot' },
          h('button', {
            key: 'skipStrictRound',
            type: 'button',
            className: 'dfi-maskSkip',
            onClick: onStrictSkip,
            title: t('strict.skipRoundHint'),
          }, t('strict.skipRound')),
          h('button', {
            key: 'skipStrictAll',
            type: 'button',
            className: 'dfi-maskSkip dfi-maskSkipAll',
            onClick: onStrictSkipAll,
            title: t('strict.skipAllHint'),
          }, t('strict.skipAll'))
        )
      );
    }

    /**
     * The mask's rows, with a duration that is recomputed on every pulse.
     *
     * No session at all is a state of its own, not a missing one: 「空闲中」 plus
     * the time this mask has been sitting on screen.
     */
    function maskRows() {
      const now = maskClock > 0 ? maskClock : Date.now();
      if (sessions.length === 0) {
        const openedAt = maskOpenedRef.current > 0 ? maskOpenedRef.current : now;
        return [{
          title: t('strict.idle'),
          current: true,
          idle: true,
          pending: false,
          text: t('strict.itemIdle', { d: formatRunDuration(Math.max(0, now - openedAt)) }),
        }];
      }
      return sessions.map(function (entry) {
        /* A waiting session is timed from the moment it started waiting: its
           turn is not running, and its generation clock would be a lie. */
        const since = entry.pending
          ? (entry.pendingSince !== null ? entry.pendingSince : entry.startedAt)
          : entry.startedAt;
        /* Floor of 1s, as the official line does (`Math.max(1e3, now - start)`). */
        const elapsed = since === null || since === undefined ? 0 : Math.max(1000, now - since);
        return {
          title: entry.title,
          current: entry.current,
          idle: false,
          pending: entry.pending === true,
          text: entry.pending
            ? t('strict.itemWaiting', { d: formatRunDuration(elapsed) })
            : t('strict.itemRunning', { d: formatRunDuration(elapsed) }),
        };
      });
    }

    /** Sessions running or waiting on you, current conversation first. */
    function activeSessions(supplied) {
      const raw = supplied !== null && supplied !== undefined
        ? supplied
        : (typeof api.getRunningSessions === 'function'
          ? safe(function () { return api.getRunningSessions(); }, null)
          : null);
      const list = Array.isArray(raw) ? raw : [];
      const out = [];
      for (let i = 0; i < list.length; i += 1) {
        const entry = list[i];
        if (!entry || typeof entry !== 'object') continue;
        const rawTitle = typeof entry.title === 'string' ? entry.title.trim() : '';
        const startedAt = Number(entry.startedAt);
        const pendingSince = Number(entry.pendingSince);
        out.push({
          title: rawTitle === '' ? t('strict.untitled') : rawTitle,
          current: entry.current === true,
          pending: entry.pending === true,
          startedAt: Number.isFinite(startedAt) && startedAt > 0 ? startedAt : null,
          pendingSince: Number.isFinite(pendingSince) && pendingSince > 0 ? pendingSince : null,
        });
      }
      /* Sorted here rather than trusting the caller, so the order is this
         component's contract and cannot drift with the host's iteration order. */
      const current = out.filter(function (entry) { return entry.current; });
      const others = out.filter(function (entry) { return !entry.current; });
      return current.concat(others);
    }

    /* Whale lifecycle: one attach while the mask is up, disposed the moment it
     * is not. The canvas is owned by React, so the effect must not touch it
     * after unmount — `attachWhale` returns an idempotent disposer for that.
     *
     * The renderer is injected (`api.attachWhale`) rather than imported: this
     * module is loaded on its own by the widget tests and concatenated into the
     * bundle by build.mjs, and a relative import would be a bare undefined name
     * in the second case. Injecting it also means a stripped-down host can pass
     * a no-op and the mask still renders. */
    useEffect(function () {
      if (!strictMask) return undefined;
      const canvas = whaleRef.current;
      if (!canvas) return undefined;
      const attach = typeof api.attachWhale === 'function' ? api.attachWhale : null;
      if (attach === null) return undefined;
      let handle = null;
      try {
        handle = attach(canvas, { atlasUrl: typeof api.whaleAtlasUrl === 'string' ? api.whaleAtlasUrl : '' });
        if (handle && typeof handle.play === 'function') handle.play();
      } catch (error) {
        /* A missing canvas/atlas must not block the mask's own exit button. */
        handle = null;
      }
      return function () {
        if (handle !== null && typeof handle.dispose === 'function') safe(function () { handle.dispose(); }, null);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [strictMask]);

    const body = mode === 'collapsed'
      ? renderCollapsed()
      : (view === 'confirm'
        ? renderConfirm()
        : (view === 'skipped' || view === 'finished'
          ? (strictMask ? null : renderRoundOver())
          : renderNormal()));

    return h('div', {
      key: 'focus-island',
      id: ROOT_ID,
      className: 'dfi-root',
      /* A fullscreen right sidebar hides the island, but it must never hide a
       * strict mask: the mask is the whole point of the mode, and "the panel
       * happened to be open" is not a reason to let the user off. */
      'data-hidden': hidden && !strictMask ? 'true' : 'false',
      'data-dragging': dragging ? 'true' : 'false',
      'data-mode': mode,
      'data-view': view,
      'data-strict': strictMask ? 'true' : 'false',
      'data-pending': hasPending ? 'true' : 'false',
      role: strictMask ? 'dialog' : 'region',
      'aria-label': theme + ' · ' + clockText + ' ' + t('unit.minutes'),
      'aria-hidden': hidden && !strictMask ? 'true' : undefined,
      onKeyDown: onKeyDown,
      /* The mask covers the frame, so the island's own offsets would only move
         an invisible card. Position styles are kept for the card case. */
      style: { top: topInset + 'px', right: rightPx + 'px' },
    },
      h('style', { key: 'style', id: STYLE_ID }, CSS),
      strictMask ? renderStrictMask() : null,
      h('div', {
        key: 'card',
        id: ROOT_ID + '-card',
        ref: cardRef,
        className: 'dfi-card',
        'data-mode': mode,
        'data-view': view,
        style: { '--dfi-h': height + 'px', '--dfi-scale': String(scaleValue) },
      },
        h('div', {
          key: cardKey,
          className: 'dfi-content',
          ref: contentRef,
          'data-mode': mode,
        }, body)
      )
    );
  };
}

