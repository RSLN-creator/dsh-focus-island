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

const DUR_MIN = 5;
const DUR_MAX = 180;
const DUR_STEP = 5;
const PRESETS = [5, 15, 30, 45, 60, 180];

const SCALE_OPTIONS = [1, 1.2, 1.4];
const SCALE_DEFAULT = 1.2;

const AUTO_REPEAT_MIN = 0;
const AUTO_REPEAT_MAX = 10;
const AUTO_REPEAT_DEFAULT = 2;

/** The wall clock only renders HH:MM, so it needs no per-second tick. */
const CLOCK_TICK_MS = 30000;

const ROOT_ID = 'dsh-focus-island';
const CONFIRM_TITLE_ID = 'dsh-focus-island-skip-title';
const CONFIRM_BODY_ID = 'dsh-focus-island-skip-body';

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

/* One type scale for the whole island — six steps, nothing in between:
 *   2xs 10 · xs 11 · sm 12 · md 12.5 · lg 13 · xl 14   (+ display clocks)
 * The smallest step is reserved for compact controls: the 紧凑/标准/大 and
 * 中文/English segmented buttons and the two 测试 buttons, so they read as a
 * clear tier below body labels instead of blending into them. */
const FS_2XS = 10;
const FS_XS = 11;
const FS_SM = 12;
const FS_MD = 12.5;
const FS_LG = 13;
const FS_XL = 14;

const CSS = `
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
  transition: top 140ms cubic-bezier(0.34, 1.3, 0.64, 1), right 140ms cubic-bezier(0.34, 1.3, 0.64, 1), opacity 180ms cubic-bezier(0.22, 1, 0.36, 1), transform 140ms cubic-bezier(0.34, 1.3, 0.64, 1), visibility 0s linear 0s;
  /* No permanent will-change: the root only moves when the user drags the
   * right column, and a standing hint pins it to a composited layer forever. */
}
.dfi-root[data-hidden='true'] {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
  pointer-events: none;
  visibility: hidden;
  transition: top 140ms cubic-bezier(0.34, 1.3, 0.64, 1), right 140ms cubic-bezier(0.34, 1.3, 0.64, 1), opacity 180ms cubic-bezier(0.22, 1, 0.36, 1), transform 140ms cubic-bezier(0.34, 1.3, 0.64, 1), visibility 0s linear 180ms;
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
  transition: width 240ms cubic-bezier(0.22, 1, 0.36, 1), height 240ms cubic-bezier(0.22, 1, 0.36, 1);
  /* No permanent will-change: keeping the card on its own composited layer
     for its whole life costs memory. The width/height morph is short. */
}
.dfi-card[data-mode='collapsed'] {
  --dfi-w: calc(${PILL_W}px * var(--dfi-scale, ${SCALE_DEFAULT}));
  border-radius: var(--dsw-radius-xl, 16px);
  corner-shape: round;
}
.dfi-card[data-mode='expanded'] {
  --dfi-w: ${CARD_W}px;
  border-radius: var(--dsw-radius-xl, 16px);
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
  left: 0;
  width: var(--dfi-w);
  z-index: 1;
  contain: layout paint;
  transform-origin: top right;
  animation: dfi-in 260ms cubic-bezier(0.22, 1, 0.36, 1) 30ms both;
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
  transition: background 160ms cubic-bezier(0.22, 1, 0.36, 1), transform 160ms cubic-bezier(0.34, 1.3, 0.64, 1);
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
  border-radius: calc(3px * var(--dfi-scale, ${SCALE_DEFAULT}));
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
  transition: transform 420ms cubic-bezier(0.22, 1, 0.36, 1), background 260ms cubic-bezier(0.22, 1, 0.36, 1);
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
  transition: stroke-dashoffset 480ms cubic-bezier(0.22, 1, 0.36, 1);
}

.dfi-clock {
  flex: none;
  font-size: calc(15px * var(--dfi-scale, ${SCALE_DEFAULT}));
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
  font-size: calc(12px * var(--dfi-scale, ${SCALE_DEFAULT}));
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
  transition: transform 200ms cubic-bezier(0.34, 1.3, 0.64, 1), color 160ms cubic-bezier(0.22, 1, 0.36, 1);
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
.dfi-title {
  font-size: ${FS_SM}px;
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
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background 140ms cubic-bezier(0.22, 1, 0.36, 1), color 140ms cubic-bezier(0.22, 1, 0.36, 1), transform 140ms cubic-bezier(0.34, 1.3, 0.64, 1);
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
  font-size: 38px;
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
  border-radius: 2px;
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
  transition: transform 480ms cubic-bezier(0.22, 1, 0.36, 1);
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
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: ${FS_SM}px;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 140ms cubic-bezier(0.22, 1, 0.36, 1), color 140ms cubic-bezier(0.22, 1, 0.36, 1), transform 140ms cubic-bezier(0.34, 1.3, 0.64, 1);
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
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background 140ms cubic-bezier(0.22, 1, 0.36, 1), color 140ms cubic-bezier(0.22, 1, 0.36, 1), transform 140ms cubic-bezier(0.34, 1.3, 0.64, 1);
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
  font-size: ${FS_SM}px;
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
  font-size: ${FS_XS}px;
  line-height: 14px;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dfi-gaugeVal {
  margin-top: 1px;
  font-size: ${FS_MD}px;
  line-height: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--dfi-level-color, var(--dsw-alias-label-secondary));
}
.dfi-gaugeTrack {
  margin-top: 3px;
  height: 3px;
  border-radius: 1.5px;
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
  transition: transform 480ms cubic-bezier(0.22, 1, 0.36, 1), background 300ms cubic-bezier(0.22, 1, 0.36, 1);
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
  border-radius: var(--dsw-radius-md, 10px);
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
}
.dfi-setBoxTitle {
  padding: 8px 10px 6px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  font-size: ${FS_XS}px;
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
  font-size: ${FS_LG}px;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
}
.dfi-setValueText {
  flex: none;
  font-size: ${FS_MD}px;
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
  font-size: ${FS_XS}px;
  line-height: 17px;
  color: var(--dsw-alias-label-secondary);
}
.dfi-autoHint {
  padding: 0 10px 6px;
  font-size: ${FS_XS}px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
}
.dfi-permHint {
  padding: 0 10px 6px;
  font-size: ${FS_XS}px;
  line-height: 16px;
  color: var(--dsw-alias-label-caption);
}
.dfi-btnTest {
  height: 22px;
  padding: 0 8px;
  font-size: ${FS_2XS}px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
}
.dfi-btnTest:hover { color: var(--dsw-alias-label-primary); }
.dfi-seg {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-bg-layer-1);
}
.dfi-segBtn {
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: ${FS_2XS}px;
  line-height: 16px;
  cursor: pointer;
  transition: background 140ms cubic-bezier(0.22, 1, 0.36, 1), color 140ms cubic-bezier(0.22, 1, 0.36, 1);
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
  border-radius: var(--dsw-radius-sm, 8px);
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
  transition: background 140ms cubic-bezier(0.22, 1, 0.36, 1), color 140ms cubic-bezier(0.22, 1, 0.36, 1);
}
.dfi-stepBtn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dfi-stepBtn:disabled { opacity: 0.35; cursor: not-allowed; }
.dfi-stepValue {
  min-width: 52px;
  text-align: center;
  font-size: ${FS_SM}px;
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
  font-size: ${FS_SM}px;
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
  font-size: ${FS_2XS}px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
}

.dfi-chip {
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: ${FS_2XS}px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background 140ms cubic-bezier(0.22, 1, 0.36, 1), color 140ms cubic-bezier(0.22, 1, 0.36, 1);
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
  border-radius: 10px;
  corner-shape: round;
  background: var(--dsw-alias-border-l3);
  cursor: pointer;
  transition: background 180ms cubic-bezier(0.22, 1, 0.36, 1);
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
  transition: transform 220ms cubic-bezier(0.34, 1.3, 0.64, 1);
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
  animation: dfi-warm 900ms cubic-bezier(0.22, 1, 0.36, 1) both;
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
  animation: dfi-ringflash 1100ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* The wrapper carries NO horizontal padding: the shared .dfi-expHdr already
   insets itself by the card's 16px, so adding it here double-inset the title
   and made the reminder header sit 32px in while the normal view sat at 16px. */
.dfi-finish { padding: 0 0 16px; }
.dfi-finishTitle {
  margin: 2px 16px 0;
  font-size: ${FS_XL}px;
  line-height: 20px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  text-align: center;
  text-wrap: balance;
}
.dfi-finishCopy {
  margin: 6px 16px 0;
  font-size: ${FS_SM}px;
  line-height: 17px;
  color: var(--dsw-alias-label-secondary);
  text-align: center;
  text-wrap: pretty;
}

.dfi-confirm { padding: 0 0 16px; }
.dfi-confirmTitle {
  margin: 2px 16px 0;
  font-size: ${FS_LG}px;
  line-height: 19px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  text-align: center;
  text-wrap: balance;
}
.dfi-confirmBody {
  margin: 6px 16px 0;
  font-size: ${FS_SM}px;
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

.dfi-root button:focus-visible,
.dfi-root input:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: -2px;
}

@keyframes dfi-in {
  from { opacity: 0; transform: translateY(4px); }
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

@media (prefers-reduced-motion: reduce) {
  .dfi-root,
  .dfi-card,
  .dfi-content,
  .dfi-pill,
  .dfi-chevronBox,
  .dfi-barFill,
  .dfi-gaugeFill,
  .dfi-microFill,
  .dfi-segBtn,
  .dfi-btn,
  .dfi-ringArc,
  .dfi-card::before,
  .dfi-card::after,
  .dfi-chip,
  .dfi-iconBtn,
  .dfi-collapse,
  .dfi-stepBtn,
  .dfi-switch,
  .dfi-knob {
    transition-duration: 0ms !important;
    animation: none !important;
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

function viewKey(armed, phase) {
  if (armed) return 'confirm';
  if (phase === 'finished' || phase === 'skipped') return 'finished';
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

    const contentRef = useRef(null);
    const cancelRef = useRef(null);
    const bootRef = useRef(false);
    const prevPhaseRef = useRef(coreState.phase);

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
    const finished = phase === 'finished' || phase === 'skipped';
    const armed = !!state.skipArmed;
    const view = armed ? 'confirm' : (finished ? 'finished' : 'normal');
    const mode = expanded ? 'expanded' : 'collapsed';
    const p = clamp01(state.progress);
    const remaining = Number.isFinite(Number(state.remainingMs)) ? Number(state.remainingMs) : Number(state.durationMs) || 0;
    const clockText = formatClock(remaining);
    const wallText = formatWallClock(clock);
    const durationMinutes = clampDuration(Number(state.durationMinutes) || 25);
    const watchedMs = Math.max(0, Number(state.watchedMs) || 0);
    const elapsedMs = Math.max(0, Number(state.elapsedMs) || 0);
    const finishedMinutes = Math.max(1, Math.round((watchedMs || elapsedMs || durationMinutes * 60000) / 60000));
    const dotState = paused ? 'paused' : (finished ? 'finished' : (phase === 'idle' ? 'idle' : 'counting'));
    const rightPx = BASE_RIGHT_PX + (hidden ? 0 : Math.max(0, rightInset));
    const scaleValue = clampScale(collapsedScale);
    const notifyPermission = readNotifyPermission();
    const autoRepeatMinutes = readAutoRepeatMinutes(autoRepeatFallback);
    const cardKey = 'content-' + mode + '-' + view + '-' + (settingsOpen ? 'setup' : 'plain') + '-' + resourceMode + '-' + locale;
    const showResources = expanded && view === 'normal' && resourceMode === 'system';
    const showPillResources = !expanded && resourceMode === 'system';

    function setExpandedPref(value) {
      setExpanded(value);
      persistPref('expanded', value);
      if (!value) setSettingsOpen(false);
    }

    function onKeyDown(event) {
      if (!event || event.key !== 'Escape') return;
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
        h('span', { key: 'wall', className: 'dfi-sysClock' }, wallText)
      );
      const summary = showPillResources ? resourceSummary() : '';
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
        showPillResources ? renderPillResources() : null
      );
    }

    function resourceItems() {
      /* Always render the freshest sample: the host re-renders on every poll,
         and the 1 s wall clock re-render keeps values live between polls. */
      const sample = readResources() || resources || {};
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
    function resourceSummary() {
      return resourceItems().map(function (item) {
        return item.label + ' ' + (item.has
          ? Math.round(item.value) + (item.unit === '°C' ? '°C' : '%')
          : t('resources.na'));
      }).join(' · ');
    }

    function renderPillResources() {
      /* Bare bars only: a label and a number per segment would turn the capsule
         into a miniature dashboard. Length + color carry the reading; the
         numbers stay reachable on hover (title) and in the pill's aria-label. */
      const summary = resourceSummary();
      return h('span', { key: 'pillRes', className: 'dfi-pillRes', title: summary },
        resourceItems().map(function (item) {
          return h('span', { key: item.key, className: 'dfi-micro', 'data-level': item.level },
            h('span', { key: 'track', className: 'dfi-microTrack' },
              h('span', { key: 'fill', className: 'dfi-microFill', style: { '--dfi-p': item.value / 100 } })
            )
          );
        })
      );
    }

    function gauges() {
      return h('div', { key: 'gauges', className: 'dfi-gauges' }, resourceItems().map(function (item) {
        return h('div', { key: item.key, className: 'dfi-gauge', 'data-level': item.level },
          h('span', { key: 'label', className: 'dfi-gaugeLabel' }, item.label),
          h('span', { key: 'value', className: 'dfi-gaugeVal' }, item.text),
          h('div', { key: 'track', className: 'dfi-gaugeTrack' },
            h('div', { key: 'fill', className: 'dfi-gaugeFill', style: { '--dfi-p': item.value / 100 } })
          )
        );
      }));
    }

    function renderResourceBlock() {
      return h('div', { key: 'resources', className: 'dfi-res' },
        h('div', { key: 'title', className: 'dfi-resTitle' }, t('resources.title')),
        gauges()
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
          )
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
      /* resources stay above settings, so opening settings never shifts them */
      if (showResources) children.push(renderResourceBlock());
      if (settingsOpen) children.push(renderSettings());
      return h('div', { key: 'normal', className: 'dfi-body' }, children);
    }

    function renderFinished() {
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
        h('div', { key: 'message', className: 'dfi-finishTitle' }, t('finished.title', { n: finishedMinutes })),
        h('div', { key: 'copy', className: 'dfi-finishCopy' }, t('finished.body')),
        h('div', { key: 'buttons', className: 'dfi-btnRow' },
          h('button', { key: 'restart', type: 'button', className: 'dfi-btn dfi-btnPrimary', onClick: onRestart }, t('action.restart')),
          h('button', { key: 'skip', type: 'button', className: 'dfi-btn', onClick: onSkip }, t('action.skip'))
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

    const body = mode === 'collapsed'
      ? renderCollapsed()
      : (view === 'confirm'
        ? renderConfirm()
        : (view === 'finished' ? renderFinished() : renderNormal()));

    return h('div', {
      key: 'focus-island',
      id: ROOT_ID,
      className: 'dfi-root',
      'data-hidden': hidden ? 'true' : 'false',
      'data-dragging': dragging ? 'true' : 'false',
      'data-mode': mode,
      'data-view': view,
      role: 'region',
      'aria-label': theme + ' · ' + clockText + ' ' + t('unit.minutes'),
      'aria-hidden': hidden ? 'true' : undefined,
      onKeyDown: onKeyDown,
      style: { top: topInset + 'px', right: rightPx + 'px' },
    },
      h('style', { key: 'style', id: STYLE_ID }, CSS),
      h('div', {
        key: 'card',
        id: ROOT_ID + '-card',
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
