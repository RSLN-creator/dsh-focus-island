/**
 * Smoke test for lib/widget.js — node ESM, no DOM, no React dependency.
 *
 * Proves that the module imports without DOM access, exports the contract,
 * ships token-only CSS, and renders every visual state through a tiny hook
 * runtime (useState/useRef/useEffect) so clicks, Escape, persisted prefs,
 * live resource samples can be exercised without a
 * browser.
 *
 * Run: node verify/widget-smoke.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { STYLE_ID, TOP_PX, BASE_RIGHT_PX, COPY, createWidget } from '../lib/widget.js';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'lib', 'widget.js'), 'utf8');

let passed = 0;
function ok(condition, message) {
  if (!condition) {
    console.error('FAIL: ' + message);
    process.exitCode = 1;
    return;
  }
  passed += 1;
}
function eq(actual, expected, message) {
  ok(Object.is(actual, expected), message + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
}
function same(actual, expected, message) {
  eq(JSON.stringify(actual), JSON.stringify(expected), message);
}

/* ------------------------------------------------------------- element tree -- */

function createElement(type, props, ...children) {
  return { type, props: props || {}, children };
}

function walk(node, visit) {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) { node.forEach((child) => walk(child, visit)); return; }
  if (typeof node !== 'object') return;
  visit(node);
  (node.children || []).forEach((child) => walk(child, visit));
}

function collect(tree, predicate) {
  const found = [];
  walk(tree, (node) => { if (predicate(node)) found.push(node); });
  return found;
}

function flat(tree) {
  const found = [];
  walk(tree, (node) => found.push(node));
  return found;
}

function byClass(tree, className) {
  return collect(tree, (node) => typeof node.props.className === 'string'
    && node.props.className.split(/\s+/).includes(className));
}

function classIndex(tree, className) {
  return flat(tree).findIndex((node) => typeof node.props.className === 'string'
    && node.props.className.split(/\s+/).includes(className));
}

function textOf(tree) {
  const parts = [];
  walk(tree, (node) => {
    (node.children || []).forEach((child) => { if (typeof child === 'string') parts.push(child); });
  });
  return parts.join(' ').trim();
}

function buttonByLabel(tree, label) {
  return collect(tree, (node) => node.type === 'button' && node.props['aria-label'] === label)[0] || null;
}

function buttonByText(tree, label) {
  return collect(tree, (node) => node.type === 'button' && textOf(node) === label)[0] || null;
}

/** Text of the rendered content only — the in-tree <style> is not UI copy. */
function uiText(tree) {
  const parts = [];
  walk(tree, (node) => {
    if (node.type === 'style') return;
    (node.children || []).forEach((child) => { if (typeof child === 'string') parts.push(child); });
  });
  return parts.join(' ').trim();
}

function autoRepeatRow(tree) {
  return collect(tree, (node) => typeof node.props.className === 'string'
    && node.props.className.split(/\s+/).includes('dfi-setRow')
    && textOf(node).includes('自动再来'))[0] || null;
}

/* ------------------------------------------------------------ fake core/api -- */

const BASE_STATE = {
  phase: 'counting',
  durationMinutes: 25,
  durationMs: 25 * 60 * 1000,
  elapsedMs: 10 * 60000 + 23000,
  watchedMs: 10 * 60000 + 23000,
  remainingMs: 25 * 60000 - (10 * 60000 + 23000),
  progress: (10 * 60000 + 23000) / (25 * 60000),
  modelBusy: true,
  visible: true,
  typing: false,
  draftEmpty: true,
  sending: false,
  skipArmed: false,
  pauseReason: null,
};

function makeCore(initial) {
  const state = Object.assign({}, BASE_STATE, initial || {});
  const listeners = new Set();
  const calls = [];
  function emit() {
    const snapshot = Object.assign({}, state);
    for (const listener of listeners) listener(snapshot);
  }
  const core = {
    getState: () => Object.assign({}, state),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    onUserSend() { calls.push(['onUserSend']); },
    skipArm() { calls.push(['skipArm']); state.skipArmed = true; emit(); },
    skipConfirm() { calls.push(['skipConfirm']); state.phase = 'skipped'; state.skipArmed = false; emit(); },
    skipCancel() { calls.push(['skipCancel']); state.skipArmed = false; emit(); },
    reset() { calls.push(['reset']); state.phase = 'counting'; state.skipArmed = false; emit(); },
    setDurationMinutes(minutes) {
      calls.push(['setDurationMinutes', minutes]);
      state.durationMinutes = minutes;
      state.durationMs = minutes * 60000;
      emit();
    },
    setPresence() { },
    tick() { },
    calls,
  };
  core.emit = (patch) => { Object.assign(state, patch); emit(); };
  return core;
}

function makeApi(options) {
  const opts = options || {};
  const core = opts.core || makeCore(opts.state);
  const prefs = Object.assign({}, opts.prefs || {});
  const persisted = [];
  let sample = opts.resources === undefined
    ? { cpu: 23, gpu: 61, mem: 47, temp: 64, updatedAt: 1 }
    : opts.resources;
  let notifyEnabled = opts.notifyEnabled === undefined ? true : opts.notifyEnabled !== false;
  let soundEnabled = opts.soundEnabled === undefined ? true : opts.soundEnabled !== false;
  let notifyPermission = opts.notifyPermission || 'default';
  let autoRepeat = opts.autoRepeat === undefined ? 2 : Math.min(10, Math.max(0, Math.round(Number(opts.autoRepeat) || 0)));
  const autoRepeatCalls = [];
  const notifyCalls = [];
  const notifyListeners = new Set();
  const resourceListeners = new Set();
  let locale = opts.locale || 'zh';
  const localeListeners = new Set();

  function emitNotify() {
    for (const listener of notifyListeners) listener();
  }

  const api = {
    core,
    locale,
    getLocale: () => locale,
    setLocale(next) {
      locale = next === 'en' ? 'en' : 'zh';
      api.locale = locale;
      for (const listener of localeListeners) listener(locale);
    },
    subscribeLocale(listener) { localeListeners.add(listener); return () => localeListeners.delete(listener); },
    getResources: () => sample,
    subscribeResources(listener) { resourceListeners.add(listener); return () => resourceListeners.delete(listener); },
    resourceMode: opts.resourceMode || 'system',
    setResourceMode(mode) { persisted.push(['resourceMode', mode]); api.resourceMode = mode; },
    persist(key, value) { persisted.push([key, value]); prefs[key] = value; },
    loadPref(key, fallback) { return Object.prototype.hasOwnProperty.call(prefs, key) ? prefs[key] : fallback; },
    getNotifyEnabled: () => notifyEnabled,
    setNotifyEnabled(enabled) {
      notifyCalls.push(['setNotifyEnabled', enabled !== false]);
      notifyEnabled = enabled !== false;
      emitNotify();
    },
    getSoundEnabled: () => soundEnabled,
    setSoundEnabled(enabled) {
      notifyCalls.push(['setSoundEnabled', enabled !== false]);
      soundEnabled = enabled !== false;
      emitNotify();
    },
    getNotifyPermission: () => notifyPermission,
    requestNotifyPermission: () => Promise.resolve(notifyPermission),
    testNotify() { notifyCalls.push(['testNotify']); },
    testSound() { notifyCalls.push(['testSound']); },
    notifyPending() { notifyCalls.push(['notifyPending']); },
    subscribeNotifyPrefs(listener) { notifyListeners.add(listener); return () => notifyListeners.delete(listener); },
    notifyCalls,
    getAutoRepeatMinutes: () => autoRepeat,
    setAutoRepeatMinutes(minutes) {
      autoRepeatCalls.push(['setAutoRepeatMinutes', minutes]);
      autoRepeat = Math.min(10, Math.max(0, Math.round(Number(minutes)) || 0));
    },
    autoRepeatCalls,
    getSessionTitle: () => (opts.sessionTitle === undefined ? '' : opts.sessionTitle),
    getRunningSessions: () => (Array.isArray(opts.runningSessions)
      ? opts.runningSessions
      : [{ title: opts.sessionTitle === undefined ? '' : opts.sessionTitle, current: true, startedAt: fakeNow.getTime() - 25 * 60 * 1000 }]),
    setNotifyPermission(next) { notifyPermission = next; emitNotify(); },
    persisted,
    setSample(next) {
      sample = next;
      for (const listener of resourceListeners) listener(next);
    },
    emitLocale(next) {
      locale = next;
      for (const listener of localeListeners) listener(next);
    },
  };
  return api;
}

/* ---------------------------------------------------------- hook runtime --- */

function mount(api, props) {
  const hooks = {};
  const fakeReact = {
    createElement,
    useState: (...args) => hooks.useState(...args),
    useRef: (...args) => hooks.useRef(...args),
    useEffect: (...args) => hooks.useEffect(...args),
    useLayoutEffect: (...args) => hooks.useLayoutEffect(...args),
  };
  const Component = createWidget({ h: createElement, React: fakeReact, api });

  const slots = [];
  let cursor = 0;
  let tree = null;
  let dirty = false;
  const pending = [];

  function useState(initial) {
    const index = cursor++;
    if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
    const slot = slots[index];
    return [slot.value, (next) => {
      const value = typeof next === 'function' ? next(slot.value) : next;
      if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; }
    }];
  }
  function useRef(initial) {
    const index = cursor++;
    if (!slots[index]) slots[index] = { current: initial === undefined ? null : initial };
    return slots[index];
  }
  function useSideEffect(effect, deps) {
    const index = cursor++;
    if (!slots[index]) slots[index] = { deps: undefined, cleanup: null, pending: null };
    const slot = slots[index];
    const changed = !slot.deps || !deps || deps.length !== slot.deps.length
      || deps.some((dep, i) => !Object.is(dep, slot.deps[i]));
    if (!changed) return;
    if (typeof slot.cleanup === 'function') { const cleanup = slot.cleanup; slot.cleanup = null; cleanup(); }
    slot.deps = deps;
    slot.pending = effect;
    pending.push(slot);
  }
  Object.assign(hooks, { useState, useRef, useEffect: useSideEffect, useLayoutEffect: useSideEffect });

  function attachRefs(node) {
    walk(node, (element) => {
      const ref = element.props ? element.props.ref : null;
      if (!ref || typeof ref !== 'object') return;
      const mode = element.props['data-mode'];
      const height = mode === 'collapsed' ? 48 : 220;
      ref.current = {
        offsetHeight: height,
        getBoundingClientRect: () => ({ height, width: mode === 'collapsed' ? 259 : 300 }),
        focus() {},
      };
    });
  }

  function render() {
    cursor = 0;
    pending.length = 0;
    tree = Component(props || {});
    attachRefs(tree);
    for (const slot of pending) {
      const effect = slot.pending;
      slot.pending = null;
      if (typeof effect !== 'function') continue;
      const cleanup = effect();
      slot.cleanup = typeof cleanup === 'function' ? cleanup : null;
    }
  }

  function flush(limit) {
    let guard = 0;
    const max = limit || 30;
    while (true) {
      dirty = false;
      render();
      if (!dirty) break;
      guard += 1;
      if (guard > max) throw new Error('smoke runtime: render loop did not settle');
    }
    return tree;
  }

  function findViewById(id) {
    return collect(tree, (node) => node.props.id === id)[0] || null;
  }
  function clickLabel(label) {
    const button = buttonByLabel(tree, label);
    if (!button) throw new Error('no button labelled ' + label);
    button.props.onClick({});
    return flush();
  }
  function clickText(label) {
    const button = buttonByText(tree, label);
    if (!button) throw new Error('no button with text ' + label);
    button.props.onClick({});
    return flush();
  }
  function clickClass(className) {
    const node = byClass(tree, className)[0];
    if (!node) throw new Error('no node with class ' + className);
    node.props.onClick({});
    return flush();
  }
  function setInput(className, value) {
    const node = collect(tree, (element) => element.type === 'input'
      && String(element.props.className).split(/\s+/).includes(className))[0];
    if (!node) throw new Error('no input.' + className);
    node.props.onChange({ target: { value } });
    return flush();
  }
  function pressKey(keyName) {
    const root = findViewById('dsh-focus-island');
    if (!root) throw new Error('no island root');
    root.props.onKeyDown({ key: keyName, preventDefault() {} });
    return flush();
  }
  function unmount() {
    for (const slot of slots) {
      if (typeof slot.cleanup === 'function') { slot.cleanup(); slot.cleanup = null; }
    }
  }

  flush();
  return {
    get tree() { return tree; },
    flush,
    click: clickLabel,
    clickText,
    clickClass,
    setInput,
    pressKey,
    unmount,
    root: () => findViewById('dsh-focus-island'),
    card: () => findViewById('dsh-focus-island-card'),
  };
}

/* --------------------------------------------------------------- fake clock -- */

const realDate = globalThis.Date;
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
let fakeNow = new realDate('2026-11-04T09:20:00');
const intervals = new Set();

class FakeDate extends realDate {
  constructor(...args) {
    if (args.length === 0) super(fakeNow.getTime());
    else super(...args);
  }
  static now() { return fakeNow.getTime(); }
}

globalThis.Date = FakeDate;
globalThis.setInterval = (fn, ms) => { const handle = { fn, ms }; intervals.add(handle); return handle; };
globalThis.clearInterval = (handle) => { intervals.delete(handle); };

/* ------------------------------------------------------------------- checks -- */

// exports and constants
eq(STYLE_ID, 'dsh-focus-island-style', 'STYLE_ID');
eq(TOP_PX, 84, 'TOP_PX fallback clears the conversation header');
eq(BASE_RIGHT_PX, 16, 'BASE_RIGHT_PX');
ok(typeof createWidget === 'function', 'createWidget is a function');

// copy tables
same(Object.keys(COPY.zh).sort(), Object.keys(COPY.en).sort(), 'zh/en copy key parity');
const REQUIRED = [
  'title', 'action.collapse', 'action.expand', 'action.skip', 'action.settings', 'action.restart',
  'skip.title', 'skip.body', 'skip.cancel', 'skip.confirm', 'finished.title', 'finished.body',
  'settings.duration', 'settings.durationHint', 'settings.resources',
  'settings.interval', 'settings.autoRepeat', 'settings.autoRepeatHint', 'settings.autoRepeatOff',
  'settings.box.duration',
  'settings.box.appearance', 'settings.box.notify', 'settings.notify', 'settings.notifyHint',
  'settings.sound', 'action.test', 'settings.collapsedSize', 'settings.size.compact',
  'settings.size.normal', 'settings.size.large', 'settings.language',
  'resources.title', 'resources.cpu', 'resources.gpu', 'resources.mem', 'resources.temp',
  'resources.na', 'unit.min', 'unit.minutes',
];
REQUIRED.forEach((key) => {
  ok(Object.prototype.hasOwnProperty.call(COPY.zh, key), 'zh copy has ' + key);
  ok(Object.prototype.hasOwnProperty.call(COPY.en, key), 'en copy has ' + key);
});
eq(COPY.zh.title, '惜时岛', 'zh title');
eq(COPY.en.title, 'Focus Island', 'en title');
eq(COPY.zh['settings.duration'], '提醒间隔', 'duration label');
eq(COPY.zh['settings.autoRepeat'], '自动再来', 'auto-repeat label');
ok(COPY.zh['settings.autoRepeatHint'].includes('{n}'), 'auto-repeat hint has the minute template');
ok(COPY.zh['settings.autoRepeatHint'].includes('自动再计时一轮'), 'auto-repeat hint copy');
eq(COPY.en['settings.autoRepeat'], 'Auto-repeat', 'auto-repeat label (en)');
eq(COPY.zh['resources.temp'], 'GPU 温度', 'temperature is GPU temperature (zh)');
eq(COPY.en['resources.temp'], 'GPU TEMP', 'temperature is GPU temperature (en)');
eq(COPY.en['resources.mem'], 'RAM', 'memory label (en)');
eq(COPY.zh['resources.na'], '--', 'missing placeholder');
eq(COPY.zh['settings.box.appearance'], '外观与其他', 'appearance box title');
eq(COPY.zh['settings.box.notify'], '通知', 'notification box title');
eq(COPY.zh['settings.notify'], '桌面通知', 'desktop notification label');
eq(COPY.zh['settings.notifyHint'], '需要允许系统通知', 'permission hint copy');
eq(COPY.zh['settings.sound'], '提示音', 'sound label');
eq(COPY.zh['action.test'], '测试', 'test button copy');
eq(COPY.en['action.test'], 'Test', 'test button copy (en)');
eq(COPY.zh['settings.size.normal'], '标准', 'collapsed size option');
ok(COPY.zh['finished.title'].includes('{n}'), 'finished.title template var');

// source hygiene
ok(!/document\s*\./.test(source), 'module never touches document.*');
ok(!/\bwindow\s*\./.test(source), 'module never touches window.*');
ok(!/statusText|dfi-status|dfi-underline/.test(source), 'no status text row and no pill progress bar');
ok(source.includes("setInterval(function () { setClock(new Date()); }, CLOCK_TICK_MS)"), 'one local wall-clock interval');
ok(!/getResourceMode/.test(source), 'no extra api dependencies (getResourceMode unused)');

// CSS
const styleProbe = mount(makeApi({ prefs: { expanded: false } }));
const styleNodes = collect(styleProbe.tree, (node) => node.type === 'style');
eq(styleNodes.length, 1, 'exactly one in-tree <style> element');
const css = String(styleNodes[0].children[0]);
/* Rules only: several assertions below are "this must not appear anywhere",
 * and comment prose legitimately mentions the very words they forbid. */
const cssRules = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
eq(styleNodes[0].props.id, STYLE_ID, 'style carries STYLE_ID');
ok(/prefers-reduced-motion:\s*reduce/.test(css), 'reduced-motion fallback');
ok(/@keyframes dfi-/.test(css), 'keyframes present');
ok(!/#[0-9a-fA-F]{3,8}\b/.test(cssRules), 'no hardcoded hex colors');
ok(!/1px solid var\(--dsw-alias-border/.test(css), 'neutral borders are hairlines');
ok(/var\(--dsw-alias-/.test(css), 'uses theme aliases');
ok(/stroke-dashoffset/.test(css), 'progress ring drifts via stroke-dashoffset');
ok(/\.dfi-ringWrap \{[^}]*color: var\(--dsw-alias-state-business-primary\);/.test(css), 'counting ring uses the same accent as the countdown bar');
ok(/\.dfi-barFill \{[\s\S]*background: var\(--dsw-alias-state-business-primary\);/.test(css) && !/linear-gradient\(90deg, color-mix/.test(css), 'bar fill is one solid accent, no second gradient colour');
ok(/\.dfi-switch\[aria-checked='true'\] \{ background: var\(--dsw-alias-state-business-primary\); \}/.test(css), 'switches use the same accent as the ring and the bar');
ok(/\.dfi-card \{[\s\S]*contain: layout paint style;/.test(css), 'card contains layout and paint work');
ok(!/\.dfi-card:hover \{[^}]*box-shadow/.test(css), 'hover no longer repaints a larger shadow');
ok(/\.dfi-card \{[\s\S]*background: var\(--dsw-alias-bg-layer-1, var\(--dsw-alias-bg-overlay\)\)/.test(css), 'card paints the opaque official surface');
ok(!/backdrop-filter/.test(cssRules), 'no backdrop-filter: the card never samples what is behind it');
ok(!/specific-menu/.test(cssRules), 'card does not use the translucent menu token');
ok(/\.dfi-pill:active \{ background: var\(--dsw-alias-interactive-bg-active\); \}/.test(css), 'pill press changes background only');
ok(!/\.dfi-pill:active[^}]*transform/.test(css), 'pill press never scales the full capsule');
ok(!/@keyframes dfi-softin \{ from \{ opacity: 0; transform: scale/.test(css), 'content cross-fade does not scale the card face');
ok(!/infinite/.test(cssRules), 'no perpetual animation keeps the page out of its idle state');
ok(!/dfi-probe|MORPH_PROBE|PROBE_WINDOW_MS/.test(source), 'debug probe stays out of the shipped widget');
ok(!/will-change/.test(cssRules), 'no standing will-change pins the island to a composited layer');
ok(!/color-mix\(in srgb, var\(--dsw-alias-bg/.test(cssRules), 'card fill is a solid colour, not a mixed alpha');
ok(/\.dfi-gauge\[data-level='warn'\], \.dfi-micro\[data-level='warn'\] \{ --dfi-level-color: var\(--dsw-alias-state-warn-primary\); \}/.test(css), 'amber threshold token');
ok(/\.dfi-gauge\[data-level='hot'\], \.dfi-micro\[data-level='hot'\] \{ --dfi-level-color: var\(--dsw-alias-state-error-primary\); \}/.test(css), 'red threshold token');
ok(/text-align: center/.test(css), 'expanded countdown centered');
ok(/\.dfi-pillRes \{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/.test(css), 'collapsed micro row is a 4-column strip');
ok(/\.dfi-pillRes \{[\s\S]*var\(--dfi-scale/.test(css), 'micro row scales with collapsedScale');
ok(!/\.dfi-microLabel|\.dfi-microVal|\.dfi-microTop/.test(css), 'collapsed strip has no label/value text styles');
ok(/\.dfi-pill \{[\s\S]*padding: 0 0 calc\(12px \* var\(--dfi-scale, 1\.2\)\)/.test(css), 'capsule owns the bottom 12px inset, so hiding the strip cannot remove it');
ok(/\.dfi-pillTop \{[\s\S]*padding: calc\(12px \* var\(--dfi-scale, 1\.2\)\) 40px 0 calc\(12px \* var\(--dfi-scale, 1\.2\)\)/.test(css), 'ring sits on the shared 12px inset (top and left)');
ok(!/\.dfi-pillTop \{[\s\S]*height: calc\(34px/.test(css), 'the 34px row no longer pins the ring against the top edge');
ok(/\.dfi-pillRes \{[\s\S]*padding: calc\(7px \* var\(--dfi-scale, 1\.2\)\) calc\(12px \* var\(--dfi-scale, 1\.2\)\) 0/.test(css), 'bars keep the 7px top gap and share the 12px side inset');
ok(/\.dfi-chevronBox \{[\s\S]*top: calc\(\(27px \* var\(--dfi-scale, 1\.2\)\) - 17px\)/.test(css), 'chevron box centres on the ring axis');
ok(/\.dfi-card\[data-mode='collapsed'\] \{[\s\S]*calc\(216px \* var\(--dfi-scale/.test(css), 'capsule width scales with collapsedScale');
ok(/\.dfi-ringWrap \{[\s\S]*calc\(30px \* var\(--dfi-scale/.test(css), 'ring scales with collapsedScale');
ok(/\.dfi-clock \{[\s\S]*calc\(var\(--dfi-fs-2xl\) \* var\(--dfi-scale/.test(css), 'capsule clock font scales with collapsedScale');
ok(/\.dfi-microTrack \{[\s\S]*calc\(5px \* var\(--dfi-scale/.test(css), 'micro bar height scales with collapsedScale');
ok(/\.dfi-chevronBox \{[^}]*position: absolute;[^}]*top: calc\(\(27px[^}]*width: 34px;[^}]*height: 34px;/.test(css), 'collapsed chevron is a 34x34 hit area parked on the ring axis');
ok(/\.dfi-collapse \{[\s\S]*position: absolute;[\s\S]*top: 0;[\s\S]*right: 0;[\s\S]*width: 34px;[\s\S]*height: 34px;/.test(css), 'expanded collapse is the same absolute 34x34 corner');
ok(/transition: top var\(--dfi-dur-fast\)[^;]*right var\(--dfi-dur-fast\)/.test(css), 'top/right use the fast duration token');
ok(/\.dfi-root\[data-dragging='true'\] \{ transition: none; \}/.test(css), 'dragging disables the position transition');
ok(/\.dfi-settings \{[\s\S]*margin: 12px 16px 0/.test(css), 'settings uses the card 16px side padding');
ok(/\.dfi-setBox \{[\s\S]*border: 0\.5px solid var\(--dsw-alias-border-l2\);[\s\S]*background: var\(--dsw-alias-bg-layer-2\)/.test(css), 'settings boxes have a 0.5px border and raised fill');
ok(/\.dfi-setBoxTitle \{[\s\S]*border-bottom: 0\.5px solid var\(--dsw-alias-border-l2\)/.test(css), 'settings box title divider');
ok(/\.dfi-setRow \{[\s\S]*min-height: 34px/.test(css), 'settings rows are 34px');
ok(/\.dfi-settings \{[\s\S]*gap: 8px/.test(css), 'settings boxes are 8px apart');
ok(/\.dfi-setBoxTitle \{[\s\S]*padding: 8px 10px 6px;[\s\S]*font-size: var\(--dfi-fs-xs\);[\s\S]*font-weight: 500/.test(css), 'box titles are compact xs/500');
ok(/\.dfi-setRow \{[\s\S]*padding: 0 10px/.test(css), 'settings rows use 10px inset padding');
ok(/\.dfi-chipsRow \{[\s\S]*gap: 6px;[\s\S]*padding: 0 10px 8px/.test(css), 'preset chips sit 6px apart');
ok(/\.dfi-chip \{[\s\S]*padding: 0 8px;[\s\S]*border-radius: var\(--dsw-radius-sm\);[\s\S]*font-size: var\(--dfi-fs-2xs\)/.test(css), 'preset chips are 2xs / 24px on the platform sm radius');
ok(/\.dfi-chip\[data-active='true'\] \{[\s\S]*inset 0 0 0 1px var\(--dsw-alias-button-ghost-active-border\)/.test(css), 'active chip has a 1px border');
ok(/\.dfi-seg \{[\s\S]*gap: 4px/.test(css), 'segmented control gap is 4px');
ok(/\.dfi-segBtn \{[\s\S]*height: 24px;[\s\S]*padding: 0 8px;[\s\S]*font-size: var\(--dfi-fs-2xs\)/.test(css), 'segment buttons are 2xs / 24px');
ok(/\.dfi-btnTest \{[\s\S]*height: 22px;[\s\S]*padding: 0 8px;[\s\S]*font-size: var\(--dfi-fs-2xs\)/.test(css), 'test button is 2xs / 22px');
ok(/\.dfi-stepper \{[\s\S]*height: 26px/.test(css) && /\.dfi-stepBtn \{[\s\S]*width: 22px;[\s\S]*height: 22px/.test(css), 'stepper buttons are 22x22');
ok(/\.dfi-stepInput \{[\s\S]*font-size: var\(--dfi-fs-sm\)/.test(css), 'stepper input is sm');
ok(!/\.dfi-opacityVal \{[\s\S]*font-size/.test(css), 'no opacity slider styles remain');
ok(/\.dfi-rowRight \{[\s\S]*align-items: center;[\s\S]*gap: 8px/.test(css), 'switch rows group test + switch with an 8px gap');
ok(!/--dsw-elevation-panel|--dsw-elevation-prominent|--dsw-elevation-stroke-color/.test(css), 'card shadow no longer uses the elevation hairline tokens');
ok(/\.dfi-card \{[\s\S]*box-shadow: 0 1px 4px rgba\(0, 0, 0, 0\.05\);/.test(css), 'light card keeps one cheap projection');
ok(/\[data-ds-dark-theme\] \.dfi-card \{[\s\S]*0 2px 8px rgba\(0, 0, 0, 0\.34\)/.test(css), 'dark card keeps one cheap projection');
ok(!/\.dfi-card:hover \{[\s\S]{0,120}var\(--dsw-elevation/.test(css), 'hover does not restore the hairline ring');
ok(/\.dfi-permHint \{[\s\S]*var\(--dsw-alias-label-caption\)/.test(css), 'permission hint is small grey text');
ok(/\.dfi-autoHint \{[\s\S]*font-size: var\(--dfi-fs-xs\);[\s\S]*color: var\(--dsw-alias-label-secondary\)/.test(css), 'auto-repeat hint is xs secondary');
ok(/\.dfi-root button:focus-visible,[\s\S]*outline-offset: -2px/.test(css), 'keyboard focus ring stays inset');
ok(!/\.dfi-root \{[^}]*border:/.test(css), 'outer root paints no frame');
ok(!/\.dfi-content \{[^}]*border:/.test(css), 'content wrapper paints no frame');
ok(/\.dfi-pill \{[^}]*border: 0;/.test(css), 'capsule explicitly paints no border');
ok(/\.dfi-clockBig \{[\s\S]*font-size: var\(--dfi-fs-hero\)/.test(css), 'single countdown stays on the hero step');

/* Every view shares one header geometry. The reminder views used to put 16px
 * of horizontal padding on their wrapper while the header also insets itself,
 * so the title sat 32px in and jumped left when the reminder appeared. */
ok(/\.dfi-finish \{ padding: 0 0 16px; \}/.test(css), 'finished wrapper adds no horizontal padding');
ok(/\.dfi-confirm \{ padding: 0 0 16px; \}/.test(css), 'confirm wrapper adds no horizontal padding');
ok(/\.dfi-btnRow \{[\s\S]*margin: 14px 16px 0;/.test(css), 'reminder action rows sit on the same 16px inset');
ok(/\.dfi-expHdr \{[\s\S]*padding: 0 42px 0 16px;/.test(css), 'one header inset for every view');

/* One type scale, declared once and only ever read back.
 *
 * Every rule now says var(--dfi-fs-*), so the checks below resolve the token
 * instead of matching a literal — and one of them fails if a literal ever
 * reappears, which is the invariant the old version could not express. */
const declared = [];
const tokenValue = {};
for (const m of css.matchAll(/--dfi-fs-([a-z0-9]+):\s*([\d.]+)px;/g)) {
  tokenValue[m[1]] = Number(m[2]);
}
ok(Object.keys(tokenValue).length >= 8, 'the type scale is declared (' + Object.keys(tokenValue).length + ' steps)');
for (const block of css.split('}')) {
  const sel = /\.dfi-([A-Za-z]+)\s*\{/.exec(block);
  const size = /font-size: var\(--dfi-fs-([a-z0-9]+)\);/.exec(block);
  if (sel && size) declared.push([sel[1], tokenValue[size[1]]]);
}
ok(declared.length > 8, 'font sizes were actually collected (' + declared.length + ')');
const literalSizes = [];
for (const block of cssRules.split('}')) {
  const sel = /\.dfi-([A-Za-z]+)\s*\{/.exec(block);
  const size = /font-size: (?!var\(--dfi-fs-|calc\(var\(--dfi-fs-)[^;]*;/.exec(block);
  if (sel && size) literalSizes.push(sel[1] + ' -> ' + size[0]);
}
eq(literalSizes.length, 0, 'no rule carries a literal font size: ' + JSON.stringify(literalSizes));
const allowed = new Set([10, 11, 12, 12.5, 13, 14, 15, 38]);
const stray = declared.filter(([, v]) => !allowed.has(v));
eq(stray.length, 0, 'every font size is on the type scale (10 / 11 / 12 / 12.5 / 13 / 14 / 15 / 38): ' + JSON.stringify(stray));
const sizeOf = (name) => (declared.find(([sel]) => sel === name) || [null, null])[1];
ok(sizeOf('seg') === null || sizeOf('seg') === 11, 'segmented control does not add a size of its own');
eq(sizeOf('segBtn'), 10, '紧凑/标准/大 and 中文/English sit on the smallest step');
eq(sizeOf('btnTest'), 10, 'the two 测试 buttons sit on the smallest step');
eq(sizeOf('chip'), 10, 'preset chips sit on the smallest step');
styleProbe.unmount();

// collapsed pill with the resource strip
const collapsedApi = makeApi({ prefs: { expanded: false } });
const collapsed = mount(collapsedApi);
const collapsedRoot = collapsed.root();
eq(collapsedRoot.props['data-mode'], 'collapsed', 'collapsed root mode');
eq(collapsedRoot.props['data-hidden'], 'false', 'collapsed not hidden');
eq(collapsedRoot.props['data-dragging'], 'false', 'not dragging by default');
eq(collapsedRoot.props.style.top, '84px', 'TOP_PX fallback for the top offset');
eq(collapsedRoot.props.style.right, '16px', 'right base offset');
eq(collapsed.card().props.style['--dfi-scale'], '1.2', 'collapsedScale defaults to 1.2');
eq(collapsed.card().props.style['--dfi-h'], '48px', 'measured capsule height');
eq(byClass(collapsed.tree, 'dfi-pill').length, 1, 'collapsed pill present');
eq(collect(collapsed.tree, (node) => node.type === 'button').length, 1, 'whole pill is the only button');
eq(byClass(collapsed.tree, 'dfi-ringWrap').length, 1, 'collapsed progress ring');
eq(byClass(collapsed.tree, 'dfi-clock').length, 1, 'collapsed countdown');
ok(/^\d{2}:\d{2}$/.test(textOf(byClass(collapsed.tree, 'dfi-clock')[0])), 'collapsed countdown is mm:ss');
const wallNode = byClass(collapsed.tree, 'dfi-sysClock')[0];
eq(textOf(wallNode), '09:20', 'collapsed system clock seeded from the clock');
eq(byClass(collapsed.tree, 'dfi-pillTop').length, 1, 'pill top row');
eq(byClass(collapsed.tree, 'dfi-pillRes').length, 1, 'pill second row with resources');
eq(byClass(collapsed.tree, 'dfi-micro').length, 4, 'four micro resource segments');
eq(byClass(collapsed.tree, 'dfi-microLabel').length, 0, 'no text label in the collapsed strip');
eq(byClass(collapsed.tree, 'dfi-microVal').length, 0, 'no numeric value in the collapsed strip');
eq(byClass(collapsed.tree, 'dfi-microFill').length, 4, 'four micro fills');
const pillStrip = byClass(collapsed.tree, 'dfi-pillRes')[0];
ok(/^CPU \d+% · GPU \d+% · 内存 \d+% · GPU 温度 \d+°C$/.test(pillStrip.props.title), 'strip keeps a hover summary');
ok(byClass(collapsed.tree, 'dfi-pill')[0].props['aria-label'].includes('CPU'), 'pill aria-label keeps the reading');
eq(byClass(collapsed.tree, 'dfi-status').length, 0, 'no status text row');
eq(byClass(collapsed.tree, 'dfi-underline').length, 0, 'no bottom progress bar');
eq(intervals.size, 1, 'exactly one local timer while mounted');

// the wall clock ticks once per second
fakeNow = new realDate('2026-11-04T09:21:00');
for (const handle of intervals) handle.fn();
collapsed.flush();
eq(textOf(byClass(collapsed.tree, 'dfi-sysClock')[0]), '09:21', 'system clock follows its 1 s interval');
fakeNow = new realDate('2026-11-04T09:20:00');
for (const handle of intervals) handle.fn();
collapsed.flush();

// host-provided offsets and dragging prop
const insetApi = makeApi({ prefs: { expanded: true } });
const inset = mount(insetApi, { rightInset: 420, topInset: 86, dragging: true });
eq(inset.root().props.style.top, '86px', 'topInset drives top');
eq(inset.root().props.style.right, '436px', 'rightInset shifts right');
eq(inset.root().props['data-dragging'], 'true', 'dragging adds data-dragging');
inset.unmount();

// expanded card
const expandedApi = makeApi({ prefs: { expanded: true } });
const expanded = mount(expandedApi, { rightInset: 0, topInset: 86 });
eq(expanded.root().props['data-mode'], 'expanded', 'expanded root mode');
eq(byClass(expanded.tree, 'dfi-clockBig').length, 1, 'big countdown');
eq(byClass(expanded.tree, 'dfi-barFill').length, 1, 'passive progress bar fill');
eq(byClass(expanded.tree, 'dfi-status').length, 0, 'no status text row in expanded');
const actionLabels = collect(expanded.tree, (node) => node.type === 'button').map((node) => node.props['aria-label']).filter(Boolean);
ok(actionLabels.includes('跳过'), 'skip action');
ok(actionLabels.includes('设置'), 'settings action');
const skipBtn = collect(expanded.tree, (node) => node.type === 'button' && node.props['aria-label'] === '跳过')[0];
ok(skipBtn && skipBtn.props.className === 'dfi-iconBtn' && textOf(skipBtn) === '', 'skip is an icon-only button, matching settings');
ok(actionLabels.includes('收起'), 'collapse action');
eq(byClass(expanded.tree, 'dfi-collapse').length, 1, 'top-right collapse hit area');
eq(byClass(expanded.tree, 'dfi-res').length, 1, 'resource section present');
eq(textOf(byClass(expanded.tree, 'dfi-resTitle')[0]), '本机资源', 'resource section title');
same(byClass(expanded.tree, 'dfi-gaugeLabel').map((node) => textOf(node)), ['CPU', 'GPU', '内存', 'GPU 温度'], 'gauge labels');
eq(byClass(expanded.tree, 'dfi-gaugeVal').map((node) => textOf(node)).join(','), '23%,61%,47%,64°C', 'gauge values carry units');
same(byClass(expanded.tree, 'dfi-gauge').map((node) => node.props['data-level']), ['ok', 'warn', 'ok', 'warn'], 'gauge colour levels');
ok(!textOf(expanded.tree).includes('N/A'), 'no N/A text');

// live samples, no caching
expandedApi.setSample({ cpu: 91, gpu: 5, mem: 62, temp: 85, updatedAt: 2 });
expanded.flush();
eq(byClass(expanded.tree, 'dfi-gaugeVal').map((node) => textOf(node)).join(','), '91%,5%,62%,85°C', 'values update from api.getResources()');
same(byClass(expanded.tree, 'dfi-gauge').map((node) => node.props['data-level']), ['hot', 'ok', 'warn', 'hot'], 'threshold colours (>=60 amber, >=85 red, >=80 temp)');
expandedApi.setSample({ cpu: 23, updatedAt: 3 });
expanded.flush();
eq(byClass(expanded.tree, 'dfi-gaugeVal').map((node) => textOf(node)).join(','), '23%,--,--,--', 'missing values render --');
same(byClass(expanded.tree, 'dfi-gauge').map((node) => node.props['data-level']), ['ok', 'na', 'na', 'na'], 'missing values are grey');
expandedApi.setSample({ cpu: 23, gpu: 61, mem: 47, temp: 64, updatedAt: 4 });
expanded.flush();

// settings: four boxes below the resource section
expanded.click('设置');
eq(byClass(expanded.tree, 'dfi-settings').length, 1, 'settings panel opens in-card');
eq(byClass(expanded.tree, 'dfi-setBox').length, 3, 'three settings boxes');
same(byClass(expanded.tree, 'dfi-setBoxTitle').map((node) => textOf(node)), ['提醒间隔', '外观与其他', '通知'], 'settings box titles');
ok(classIndex(expanded.tree, 'dfi-res') < classIndex(expanded.tree, 'dfi-settings'), 'resource section stays above the settings panel');
const slider = collect(expanded.tree, (node) => node.type === 'input' && node.props.type === 'range')[0];
eq(slider, undefined, 'no opacity range control any more');
eq(byClass(expanded.tree, 'dfi-chip').length, 6, 'six duration presets');
eq(byClass(expanded.tree, 'dfi-chip').map((node) => textOf(node)).join(','), '5,15,30,45,60,180', 'preset values');
same(byClass(expanded.tree, 'dfi-stepInput').map((node) => [node.props.min, node.props.max]), [[5, 180], [0, 10]], 'duration is free 5-180 and auto-repeat is free 0-10');
eq(byClass(expanded.tree, 'dfi-switch').length, 3, 'resource + notification + sound switches');
same(byClass(expanded.tree, 'dfi-switch').map((node) => node.props['aria-label']), ['显示资源占用', '桌面通知', '提示音'], 'switch labels');
ok(byClass(expanded.tree, 'dfi-switch').every((node) => node.props['aria-checked'] === true), 'all three switches default on');
eq(byClass(expanded.tree, 'dfi-permHint').length, 1, 'permission hint shown while not granted');
eq(textOf(byClass(expanded.tree, 'dfi-permHint')[0]), '需要允许系统通知', 'permission hint copy');
const testButtons = collect(expanded.tree, (node) => node.type === 'button' && textOf(node) === '测试');
eq(testButtons.length, 2, 'one test button per notification row');
// test button + switch live in the same row, test on the left
const rowRights = byClass(expanded.tree, 'dfi-rowRight');
eq(rowRights.length, 2, 'test button and switch share each notification row');
rowRights.forEach(function (row) {
  const nodes = flat(row);
  const testIndex = nodes.findIndex((node) => node.type === 'button' && textOf(node) === '测试');
  const switchIndex = nodes.findIndex((node) => node.type === 'button' && node.props.role === 'switch');
  ok(testIndex >= 0 && switchIndex > testIndex, 'test button sits left of the switch with an 8px gap');
});
['桌面通知', '提示音'].forEach(function (label) {
  const row = collect(expanded.tree, (node) => typeof node.props.className === 'string'
    && node.props.className.split(/\s+/).includes('dfi-setRow')
    && textOf(node).includes(label))[0];
  ok(row && byClass(row, 'dfi-rowRight').length === 1, label + ' row keeps test and switch inline');
});
testButtons[0].props.onClick({});
expanded.flush();
ok(expandedApi.notifyCalls.some((entry) => entry[0] === 'testNotify'), 'notification test calls api.testNotify');
collect(expanded.tree, (node) => node.type === 'button' && textOf(node) === '测试')[1].props.onClick({});
expanded.flush();
ok(expandedApi.notifyCalls.some((entry) => entry[0] === 'testSound'), 'sound test calls api.testSound');
// toggling the two notification switches calls the integration api
expanded.click('桌面通知');
ok(expandedApi.notifyCalls.some((entry) => entry[0] === 'setNotifyEnabled' && entry[1] === false), 'notification switch calls api.setNotifyEnabled');
eq(byClass(expanded.tree, 'dfi-switch')[1].props['aria-checked'], false, 'notification switch follows the disabled state');
expanded.click('桌面通知');
eq(byClass(expanded.tree, 'dfi-switch')[1].props['aria-checked'], true, 'notification switch toggles back on');
expanded.click('提示音');
ok(expandedApi.notifyCalls.some((entry) => entry[0] === 'setSoundEnabled' && entry[1] === false), 'sound switch calls api.setSoundEnabled');
expanded.click('提示音');
// granting permission removes the hint
expandedApi.setNotifyPermission('granted');
expanded.flush();
eq(byClass(expanded.tree, 'dfi-permHint').length, 0, 'permission hint disappears once granted');
ok(textOf(expanded.tree).includes('到点提醒你'), 'duration hint copy');
eq(byClass(expanded.tree, 'dfi-seg').length, 2, 'collapsed-size and language segmented controls');
const segLabels = byClass(expanded.tree, 'dfi-segBtn').map((node) => textOf(node));
ok(segLabels.includes('紧凑') && segLabels.includes('标准') && segLabels.includes('大'), 'collapsed size options');
ok(segLabels.includes('中文') && segLabels.includes('English'), 'language options');

// auto-repeat row: default 2, inside the reminder box, writes through the api
const autoRow = autoRepeatRow(expanded.tree);
ok(autoRow, 'auto-repeat row present');
eq(byClass(autoRow, 'dfi-stepBtn').length, 2, 'auto-repeat stepper has minus and plus');
eq(byClass(autoRow, 'dfi-stepInput')[0].props.defaultValue, '2', 'auto-repeat defaults to 2 minutes');
const autoHint = byClass(expanded.tree, 'dfi-autoHint')[0];
ok(autoHint, 'auto-repeat hint present');
eq(textOf(autoHint), '到点 2 分钟没处理，就自动再计时一轮', 'auto-repeat hint uses the current value');
const durationBox = byClass(expanded.tree, 'dfi-setBox')[0];
const boxNodes = flat(durationBox);
const idxChips = boxNodes.findIndex((node) => String(node.props.className || '').split(/\s+/).includes('dfi-chipsRow'));
const idxAuto = boxNodes.indexOf(autoRow);
const idxAutoHint = boxNodes.indexOf(autoHint);
const idxDurationHint = boxNodes.findIndex((node) => String(node.props.className || '').split(/\s+/).includes('dfi-setHint'));
ok(idxChips < idxAuto && idxAuto < idxAutoHint && idxAutoHint < idxDurationHint, 'auto-repeat sits after the presets and before the hint line');
byClass(autoRepeatRow(expanded.tree), 'dfi-stepBtn')[1].props.onClick({});
expanded.flush();
ok(expandedApi.autoRepeatCalls.some((entry) => entry[0] === 'setAutoRepeatMinutes' && entry[1] === 3), 'plus calls api.setAutoRepeatMinutes(3)');
eq(byClass(autoRepeatRow(expanded.tree), 'dfi-stepInput')[0].props.defaultValue, '3', 'display follows the new value');
eq(textOf(byClass(expanded.tree, 'dfi-autoHint')[0]), '到点 3 分钟没处理，就自动再计时一轮', 'hint follows the new value');
byClass(autoRepeatRow(expanded.tree), 'dfi-stepBtn')[0].props.onClick({});
expanded.flush();
ok(expandedApi.autoRepeatCalls.some((entry) => entry[0] === 'setAutoRepeatMinutes' && entry[1] === 2), 'minus calls api.setAutoRepeatMinutes(2)');

// clamp 1..60 and custom initial value
const lowApi = makeApi({ prefs: { expanded: true }, autoRepeat: 0 });
const low = mount(lowApi, { rightInset: 0, topInset: 86 });
low.click('设置');
eq(byClass(autoRepeatRow(low.tree), 'dfi-stepInput')[0].props.defaultValue, '0', 'reads the current value from api.getAutoRepeatMinutes()');
ok(byClass(autoRepeatRow(low.tree), 'dfi-stepBtn')[0].props.disabled === true, 'minus is disabled at 0');
byClass(autoRepeatRow(low.tree), 'dfi-stepBtn')[0].props.onClick({});
low.flush();
ok(lowApi.autoRepeatCalls.every((entry) => entry[0] !== 'setAutoRepeatMinutes' || entry[1] >= 0), 'auto-repeat never drops below 0');
eq(byClass(autoRepeatRow(low.tree), 'dfi-stepInput')[0].props.defaultValue, '0', 'clamped at the lower bound');
low.unmount();
const highApi = makeApi({ prefs: { expanded: true }, autoRepeat: 10 });
const high = mount(highApi, { rightInset: 0, topInset: 86 });
high.click('设置');
eq(byClass(autoRepeatRow(high.tree), 'dfi-stepInput')[0].props.defaultValue, '10', 'reads 10 minutes');
ok(byClass(autoRepeatRow(high.tree), 'dfi-stepBtn')[1].props.disabled === true, 'plus is disabled at 10');
byClass(autoRepeatRow(high.tree), 'dfi-stepBtn')[1].props.onClick({});
high.flush();
ok(highApi.autoRepeatCalls.every((entry) => entry[0] !== 'setAutoRepeatMinutes' || entry[1] <= 10), 'auto-repeat never exceeds 10');
eq(byClass(autoRepeatRow(high.tree), 'dfi-stepInput')[0].props.defaultValue, '10', 'clamped at the upper bound');
high.unmount();

// duration preset applies through the core and persists
const chips = byClass(expanded.tree, 'dfi-chip');
chips[3].props.onClick({});
expanded.flush();
ok(expandedApi.persisted.some((entry) => entry[0] === 'durationMinutes' && entry[1] === 45), 'duration persisted');
ok(expandedApi.core.calls.some((entry) => entry[0] === 'setDurationMinutes' && entry[1] === 45), 'duration applied through core');

// the opaque surface is fixed: nothing is persisted for it, nothing can change it
eq(expanded.card().props.style['--dfi-bg'], undefined, 'card carries no alpha variable');

// collapsedScale segmented control
expanded.clickText('大');
ok(expandedApi.persisted.some((entry) => entry[0] === 'collapsedScale' && entry[1] === 1.4), 'collapsedScale persisted');
eq(expanded.card().props.style['--dfi-scale'], '1.4', 'card scale follows the setting');
expanded.clickText('标准');
eq(expanded.card().props.style['--dfi-scale'], '1.2', 'standard scale restores 1.2');

// language switch
expanded.clickText('English');
ok(expandedApi.locale === 'en', 'language switch calls api.setLocale');
ok(textOf(expanded.tree).includes('Appearance & more'), 'settings re-render in English');
expanded.clickText('中文');
ok(expandedApi.locale === 'zh', 'language switch back to zh');

// resource switch hides both rows
expanded.click('显示资源占用');
ok(expandedApi.persisted.some((entry) => entry[0] === 'resourceMode' && entry[1] === 'off'), 'resource mode persisted');
eq(byClass(expanded.tree, 'dfi-res').length, 0, 'expanded resource block hidden when off');
expanded.click('显示资源占用');
expanded.flush();
eq(byClass(expanded.tree, 'dfi-res').length, 1, 'resource block returns when on');

// collapse / expand share the top-right corner
expanded.click('收起');
eq(expanded.root().props['data-mode'], 'collapsed', 'collapse via the corner button');
ok(expandedApi.persisted.some((entry) => entry[0] === 'expanded' && entry[1] === false), 'collapsed pref persisted');
eq(byClass(expanded.tree, 'dfi-pillRes').length, 1, 'collapsed shows resources again');
expanded.clickClass('dfi-pill');
eq(expanded.root().props['data-mode'], 'expanded', 'pill click expands');

// escape closes settings, then collapses
expanded.click('设置');
expanded.pressKey('Escape');
eq(byClass(expanded.tree, 'dfi-settings').length, 0, 'Escape closes settings');
expanded.pressKey('Escape');
eq(expanded.root().props['data-mode'], 'collapsed', 'Escape collapses');

// skip confirmation flow
const confirmApi = makeApi({ prefs: { expanded: true } });
const confirm = mount(confirmApi, { rightInset: 0, topInset: 86 });
confirm.click('跳过');
ok(confirmApi.core.calls.some((entry) => entry[0] === 'skipArm'), 'skip arms before confirming');
eq(confirm.root().props['data-view'], 'confirm', 'confirm view');
eq(byClass(confirm.tree, 'dfi-confirm').length, 1, 'in-card confirm block');
eq(byClass(confirm.tree, 'dfi-btnDanger').length, 1, 'confirm primary uses the danger fill');
const cancelButton = buttonByText(confirm.tree, '取消');
ok(cancelButton && typeof cancelButton.props.ref === 'object', 'cancel button gets the focus ref');
confirm.clickText('取消');
ok(confirmApi.core.calls.some((entry) => entry[0] === 'skipCancel'), 'cancel calls skipCancel');
eq(confirm.root().props['data-view'], 'normal', 'cancel returns to the previous view');
confirm.unmount();

// passive finished state (unchanged warm style)
const finishedApi = makeApi({ prefs: { expanded: false }, state: { phase: 'finished', watchedMs: 31 * 60000, elapsedMs: 25 * 60000, remainingMs: 0, progress: 1, modelBusy: false } });
const finished = mount(finishedApi, { rightInset: 0, topInset: 86 });
eq(finished.root().props['data-mode'], 'expanded', 'finished auto-expands the card');
eq(finished.root().props['data-view'], 'finished', 'finished view');
ok(textOf(finished.tree).includes('你已在这个没有对话的窗口里停留 31 分钟'), 'finished reminder copy');
ok(byClass(finished.tree, 'dfi-btnPrimary').length === 1, 'finished restart is the primary action');
ok(byClass(finished.tree, 'dfi-liveDot').some((node) => node.props['data-state'] === 'finished'), 'finished dot is red');
finished.unmount();

/* The reminder's "跳过" used to be a dead button: `skipArm()` only armed while
 * counting/paused, so the reminder view armed nothing and the confirm screen
 * never appeared. Clicking it must now reach the core exactly like in normal
 * view, and the confirm screen must be the reminder-worded one. */
const skipFromReminderApi = makeApi({ prefs: { expanded: false }, state: { phase: 'finished', watchedMs: 31 * 60000, elapsedMs: 25 * 60000, remainingMs: 0, progress: 1, modelBusy: false } });
const skipFromReminder = mount(skipFromReminderApi, { rightInset: 0, topInset: 86 });
const reminderSkip = collect(skipFromReminder.tree, (node) => node.type === 'button' && textOf(node) === '跳过')[0];
ok(reminderSkip !== undefined, 'the reminder offers a skip button');
reminderSkip.props.onClick({});
skipFromReminder.flush();
ok(skipFromReminderApi.core.calls.some((entry) => entry[0] === 'skipArm'), 'reminder skip arms the confirmation');
eq(skipFromReminder.root().props['data-view'], 'confirm', 'reminder skip opens the confirmation');
ok(textOf(skipFromReminder.tree).includes('结束本轮提醒'), 'the confirmation is worded for the reminder, not for a running countdown');
ok(!textOf(skipFromReminder.tree).includes('跳过本次提醒？'), 'the reminder does not reuse the countdown wording');
collect(skipFromReminder.tree, (node) => node.type === 'button' && textOf(node) === '取消')[0].props.onClick({});
skipFromReminder.flush();
ok(textOf(skipFromReminder.tree).includes('你已在这个没有对话的窗口里停留 31 分钟'), 'cancel returns to the reminder');
skipFromReminder.unmount();

/* A skipped round is its own view now, not a rose-tinted copy of the reminder.
 *
 * The old `viewKey()` folded `skipped` into `finished`, so a user who pressed
 * "skip" was immediately told "you stayed here for 31 minutes" — the opposite
 * of what they had just asked for. Three things must hold: the view is its own
 * name, the copy does not claim the budget was spent, and there is no skip
 * button left (there is nothing to skip). */
const skippedApi = makeApi({ prefs: { expanded: false }, state: { phase: 'skipped', watchedMs: 31 * 60000, elapsedMs: 12 * 60000, remainingMs: 13 * 60000, progress: 0.48, modelBusy: false } });
const skipped = mount(skippedApi, { rightInset: 0, topInset: 86 });
eq(skipped.root().props['data-mode'], 'expanded', 'a skipped round also unfolds the card');
eq(skipped.root().props['data-view'], 'skipped', 'skipped is its own view, not finished');
ok(textOf(skipped.tree).includes('本轮已跳过'), 'skipped copy states the round was skipped');
ok(!textOf(skipped.tree).includes('你已在这个没有对话的窗口里停留'), 'skipped copy never claims the budget was spent');
ok(!textOf(skipped.tree).includes('31 分钟'), 'skipped copy reports the counted time, not the watched time');
ok(textOf(skipped.tree).includes('12 分钟'), 'skipped copy reports the time that actually counted');
ok(byClass(skipped.tree, 'dfi-btnPrimary').length === 1, 'skipped offers restart as the primary action');
eq(collect(skipped.tree, (node) => node.type === 'button' && textOf(node) === '跳过').length, 0, 'no skip button once the round is already skipped');
skipped.unmount();

// hidden fullscreen right sidebar
const hiddenApi = makeApi({});
const hidden = mount(hiddenApi, { rightInset: -1, topInset: 86 });
eq(hidden.root().props['data-hidden'], 'true', 'rightInset -1 hides the island');
eq(hidden.root().props['aria-hidden'], 'true', 'hidden island is aria-hidden');
hidden.unmount();

/* ---------------------------------------------------------- 严格模式 ------ */

/* The switch lives in 设置 → 外观与其他, not on the card face. Two reasons the
 * checks below pin this: the mode can blank the whole screen, so it must not sit
 * at arm's length from a stray click while you are working; and the user asked
 * for exactly this placement. */
const strictCardApi = makeApi({ prefs: { expanded: true } });
const strictCard = mount(strictCardApi, { rightInset: 0, topInset: 86 });
eq(byClass(strictCard.tree, 'dfi-strictRow').length, 0, 'no 严格模式 row on the card face (expanded, settings closed)');
ok(!uiText(strictCard.tree).includes('严格模式'), 'the live card never shows the strict-mode control');
strictCard.click('设置');
const strictRow = byClass(strictCard.tree, 'dfi-strictRow')[0];
ok(strictRow !== undefined, '严格模式 row appears inside the settings panel');
const appearanceBox = byClass(strictCard.tree, 'dfi-setBox')[1];
ok(appearanceBox !== undefined && classIndex(appearanceBox, 'dfi-strictRow') >= 0, 'it belongs to the 外观与其他 box');
const strictToggle = byClass(strictCard.tree, 'dfi-strictToggle')[0];
eq(textOf(byClass(strictToggle, 'dfi-strictLabel')[0]), '严格模式', 'the button text is exactly 严格模式');
eq(strictToggle.props.role, 'switch', 'the row is the switch control');
eq(strictToggle.props['aria-checked'], false, 'strict mode is off by default');
eq(byClass(strictToggle, 'dfi-strictTrack').length, 1, 'the row carries a switch track');
eq(byClass(strictToggle, 'dfi-strictKnob').length, 1, 'the track carries a knob');
ok(classIndex(strictCard.tree, 'dfi-localeRow') < classIndex(strictCard.tree, 'dfi-strictRow'), 'the row sits under the language row');
ok(textOf(strictCard.tree).includes('到点后整屏遮住'), 'the hint next to it explains what turning it on does');
eq(byClass(strictCard.tree, 'dfi-mask').length, 0, 'no mask while strict mode is off');

// turning it on persists and closes the panel (its effect is behind that panel)
strictCard.click('严格模式');
ok(strictCardApi.persisted.some((entry) => entry[0] === 'strictMode' && entry[1] === true), 'strict mode persisted on');
eq(byClass(strictCard.tree, 'dfi-settings').length, 0, 'turning it on closes the settings panel');
eq(byClass(strictCard.tree, 'dfi-mask').length, 0, 'turning it on does not mask a running countdown');
strictCard.click('设置');
eq(byClass(strictCard.tree, 'dfi-strictToggle')[0].props['aria-checked'], true, 'switch reads back the on state');
strictCard.unmount();

// collapsed: the capsule never shows the control either
const strictPillApi = makeApi({ prefs: { expanded: false, strictMode: true } });
const strictPill = mount(strictPillApi, { rightInset: 0, topInset: 86 });
eq(byClass(strictPill.tree, 'dfi-strictRow').length, 0, 'the collapsed capsule shows no strict-mode row');
ok(!uiText(strictPill.tree).includes('严格模式'), 'the capsule never shows the strict-mode control');
strictPill.unmount();

// strict + finished → the full-screen mask, and nothing else
const strictMaskApi = makeApi({
  prefs: { expanded: false, strictMode: true },
  sessionTitle: '电场电路期末复习资料整理',
  state: { phase: 'finished', watchedMs: 31 * 60000, elapsedMs: 25 * 60000, remainingMs: 0, progress: 1, modelBusy: false },
});
const strictMask = mount(strictMaskApi, { rightInset: 0, topInset: 86 });
eq(strictMask.root().props['data-strict'], 'true', 'root flags the strict mask');
eq(strictMask.root().props.role, 'dialog', 'the mask is a dialog');
eq(byClass(strictMask.tree, 'dfi-mask').length, 1, 'exactly one mask');
const mask = byClass(strictMask.tree, 'dfi-mask')[0];
eq(mask.props['aria-modal'], 'true', 'the mask is modal');
eq(byClass(strictMask.tree, 'dfi-whale').length, 1, 'the official pixel whale canvas is the artwork');
eq(byClass(strictMask.tree, 'dfi-whale')[0].type, 'canvas', 'the artwork is a canvas, not a redrawn SVG');
/* Running sessions are the whole content now: the middle "this window watched
 * N minutes" line was removed by the user, and each row carries its OWN run
 * duration in the app's own wording (深度求索中，用时 19分25秒 ···). */
const sessionRows = byClass(strictMask.tree, 'dfi-maskItem');
eq(sessionRows.length, 1, 'the default single session is still listed as one row');
eq(textOf(byClass(sessionRows[0], 'dfi-maskName')[0]), '电场电路期末复习资料整理', 'its row carries the conversation name');
ok(/^深度求索中，用时 \d+(分\d+秒|秒) ···$/.test(textOf(byClass(sessionRows[0], 'dfi-maskUse')[0])),
  'its row carries that session run duration, in the official wording');
eq(byClass(strictMask.tree, 'dfi-maskTitle').length, 0, 'no separate title above the list');
eq(byClass(strictMask.tree, 'dfi-maskLine').length, 0, 'the middle "watched N minutes" line is gone');
eq(byClass(strictMask.tree, 'dfi-maskFoot').length, 1, 'the exits live in the footer');
/* Two exits, different scopes: "not this round" vs "not this mode". One button
 * had to guess which one the user meant, and guessing wrong either traps them
 * in the mode or silently disables it. */
const maskButtons = collect(strictMask.tree, (node) => node.type === 'button');
eq(maskButtons.length, 2, 'the mask offers exactly two exits');
same(maskButtons.map((node) => textOf(node)), ['跳过本轮', '退出所有严格模式'], 'the two exits are named for their scope');
// the card is gone: no skip, no restart, no collapse behind the mask
eq(byClass(strictMask.tree, 'dfi-finish').length, 0, 'the reminder card is replaced, not stacked');
ok(!textOf(strictMask.tree).includes('重新计时'), 'strict mode never offers a restart');
ok(!textOf(strictMask.tree).includes('跳过本次提醒'), 'strict mode never offers the countdown skip');

// Escape is not a second exit
strictMask.pressKey('Escape');
eq(byClass(strictMask.tree, 'dfi-mask').length, 1, 'Escape does not dismiss the mask');

/* 「跳过本轮」restarts at five minutes and leaves strict mode ON. */
byClass(strictMask.tree, 'dfi-maskSkip')[0].props.onClick({});
strictMask.flush();
ok(strictMaskApi.core.calls.some((entry) => entry[0] === 'setDurationMinutes' && entry[1] === 5), 'the round exit rearms a 5 minute round');
ok(strictMaskApi.core.calls.some((entry) => entry[0] === 'reset'), 'the round exit resets the countdown');
ok(strictMaskApi.persisted.some((entry) => entry[0] === 'durationMinutes' && entry[1] === 5), '5 minutes is persisted, so a reload keeps it');
ok(!strictMaskApi.persisted.some((entry) => entry[0] === 'strictMode' && entry[1] === false), 'the round exit leaves strict mode switched on');
eq(byClass(strictMask.tree, 'dfi-mask').length, 0, 'the mask is gone');
strictMask.unmount();

/* 「退出所有严格模式」does the same reset AND switches the mode off. */
const strictAllApi = makeApi({
  prefs: { expanded: false, strictMode: true },
  sessionTitle: '电场电路期末复习资料整理',
  state: { phase: 'finished', watchedMs: 31 * 60000, elapsedMs: 25 * 60000, remainingMs: 0, progress: 1, modelBusy: false },
});
const strictAll = mount(strictAllApi, { rightInset: 0, topInset: 86 });
byClass(strictAll.tree, 'dfi-maskSkipAll')[0].props.onClick({});
strictAll.flush();
ok(strictAllApi.core.calls.some((entry) => entry[0] === 'setDurationMinutes' && entry[1] === 5), 'the mode exit still rearms a 5 minute round');
ok(strictAllApi.core.calls.some((entry) => entry[0] === 'reset'), 'the mode exit still resets the countdown');
ok(strictAllApi.persisted.some((entry) => entry[0] === 'strictMode' && entry[1] === false), 'the mode exit turns strict mode off');
eq(byClass(strictAll.tree, 'dfi-mask').length, 0, 'the mask is gone');
strictAll.unmount();

/* Multiple running sessions are all listed, current one first, and each one
 * shows its OWN duration — 19分25秒 for one, 25秒 for another, never one shared
 * number copied down the list. */
const nowMs = fakeNow.getTime();
const multiApi = makeApi({
  prefs: { expanded: false, strictMode: true },
  sessionTitle: '电站复习',
  runningSessions: [
    { title: '电站复习', current: false, startedAt: nowMs - (3 * 60 + 12) * 1000 },
    { title: '电场电路期末复习资料整理', current: true, startedAt: nowMs - (19 * 60 + 25) * 1000 },
    { title: '数据结构实验', current: false, startedAt: nowMs - 25 * 1000 },
  ],
  state: { phase: 'finished', watchedMs: 31 * 60000, elapsedMs: 25 * 60000, remainingMs: 0, progress: 1, modelBusy: false },
});
const multi = mount(multiApi, { rightInset: 0, topInset: 86 });
const multiRows = byClass(multi.tree, 'dfi-maskItem');
eq(multiRows.length, 3, 'all three running sessions are listed');
same(byClass(multi.tree, 'dfi-maskName').map((node) => textOf(node)),
  ['电场电路期末复习资料整理', '电站复习', '数据结构实验'],
  'the current conversation is listed first, the rest keep their order');
eq(multiRows.filter((node) => node.props['data-current'] === 'true').length, 1, 'exactly one row is marked current');
same(byClass(multi.tree, 'dfi-maskUse').map((node) => textOf(node)),
  ['深度求索中，用时 19分25秒 ···', '深度求索中，用时 3分12秒 ···', '深度求索中，用时 25秒 ···'],
  'each row reports that session\'s own run duration, in the official wording');
multi.unmount();

// strict + a fullscreen right sidebar: the mask must still cover the frame
const strictHiddenApi = makeApi({
  prefs: { expanded: false, strictMode: true },
  state: { phase: 'finished', watchedMs: 31 * 60000, elapsedMs: 25 * 60000, remainingMs: 0, progress: 1, modelBusy: false },
});
const strictHidden = mount(strictHiddenApi, { rightInset: -1, topInset: 86 });
eq(strictHidden.root().props['data-hidden'], 'false', 'a fullscreen right panel cannot hide the strict mask');
eq(byClass(strictHidden.tree, 'dfi-mask').length, 1, 'the mask is still up');
strictHidden.unmount();

// strict + a skipped round: no mask (the user already ended that round)
const strictSkippedApi = makeApi({
  prefs: { expanded: false, strictMode: true },
  state: { phase: 'skipped', watchedMs: 31 * 60000, elapsedMs: 12 * 60000, remainingMs: 13 * 60000, progress: 0.48, modelBusy: false },
});
const strictSkipped = mount(strictSkippedApi, { rightInset: 0, topInset: 86 });
eq(byClass(strictSkipped.tree, 'dfi-mask').length, 0, 'a round skipped before strict mode was switched on is not masked');
eq(strictSkipped.root().props['data-strict'], 'false', 'root does not claim a mask');
strictSkipped.unmount();

// strict + counting: no mask, and the switch reads back the persisted value
const strictCountingApi = makeApi({ prefs: { expanded: true, strictMode: true }, sessionTitle: '未命名' });
const strictCounting = mount(strictCountingApi, { rightInset: 0, topInset: 86 });
eq(byClass(strictCounting.tree, 'dfi-mask').length, 0, 'a running countdown is not masked');
strictCounting.click('设置');
eq(byClass(strictCounting.tree, 'dfi-strictToggle')[0].props['aria-checked'], true, 'the switch restores from prefs');
strictCounting.unmount();

// English copy
const strictEnApi = makeApi({
  prefs: { expanded: false, strictMode: true },
  locale: 'en',
  sessionTitle: 'Field theory review',
  runningSessions: [{ title: 'Field theory review', current: true, startedAt: fakeNow.getTime() - 90 * 1000 }],
  state: { phase: 'finished', watchedMs: 31 * 60000, elapsedMs: 25 * 60000, remainingMs: 0, progress: 1, modelBusy: false },
});
const strictEn = mount(strictEnApi, { rightInset: 0, topInset: 86 });
same(collect(strictEn.tree, (node) => node.type === 'button').map((node) => textOf(node)),
  ['Skip this round', 'Turn strict mode off'], 'both exits are localised');
eq(textOf(byClass(strictEn.tree, 'dfi-maskName')[0]), 'Field theory review', 'the conversation name is untranslated');
ok(textOf(byClass(strictEn.tree, 'dfi-maskUse')[0]).startsWith('Deep diving, '), 'the run line is localised');
strictEn.unmount();

// a missing session name falls back to the localised placeholder
const strictNoNameApi = makeApi({
  prefs: { expanded: false, strictMode: true },
  runningSessions: [{ title: '', current: true, startedAt: fakeNow.getTime() - 60 * 1000 }],
  state: { phase: 'finished', watchedMs: 31 * 60000, elapsedMs: 25 * 60000, remainingMs: 0, progress: 1, modelBusy: false },
});
const strictNoName = mount(strictNoNameApi, { rightInset: 0, topInset: 86 });
eq(textOf(byClass(strictNoName.tree, 'dfi-maskName')[0]), '未命名会话', 'an unnamed conversation gets a placeholder');
strictNoName.unmount();

/* ------------------------------------------------- no session: 空闲中 -------- */

/** Fire every 1 s interval the widget owns (the mask's own pulse) once. */
function pulseMask() {
  for (const handle of [...intervals]) {
    if (handle.ms === 1000) handle.fn();
  }
}

/* Nothing is running: the mask must say so instead of inventing a session row
 * that claims to be deep diving. */
const idleApi = makeApi({
  prefs: { expanded: false, strictMode: true },
  runningSessions: [],
  state: { phase: 'finished', watchedMs: 31 * 60000, elapsedMs: 25 * 60000, remainingMs: 0, progress: 1, modelBusy: false },
});
const idle = mount(idleApi, { rightInset: 0, topInset: 86 });
const idleRows = byClass(idle.tree, 'dfi-maskItem');
eq(idleRows.length, 1, 'an idle mask still has exactly one row');
eq(idleRows[0].props['data-idle'], 'true', 'that row is flagged idle');
eq(textOf(byClass(idle.tree, 'dfi-maskName')[0]), '空闲中', 'the idle row says 空闲中, not a session name');
ok(/^已停留 \d+秒$/.test(textOf(byClass(idle.tree, 'dfi-maskUse')[0])),
  'the idle row carries a stopwatch of its own, not a run duration');
ok(!uiText(idle.tree).includes('深度求索中'), 'an idle mask never claims a session is deep diving');
ok(!uiText(idle.tree).includes('未命名会话'), 'nor does it invent an untitled session');
// the idle stopwatch keeps moving: one pulse per second, no frozen numbers
fakeNow = new realDate(fakeNow.getTime() + 3000);
pulseMask();
idle.flush();
eq(textOf(byClass(idle.tree, 'dfi-maskUse')[0]), '已停留 3秒', 'the idle stopwatch advances every second');
idle.unmount();

/* A running session's row is live too: the mask used to redraw only when the
 * 30 s wall clock did, which read as a frozen timer. */
const tickApi = makeApi({
  prefs: { expanded: false, strictMode: true },
  runningSessions: [{ title: '电站复习', current: true, startedAt: fakeNow.getTime() - 25 * 1000 }],
  state: { phase: 'finished', watchedMs: 31 * 60000, elapsedMs: 25 * 60000, remainingMs: 0, progress: 1, modelBusy: false },
});
const ticking = mount(tickApi, { rightInset: 0, topInset: 86 });
eq(textOf(byClass(ticking.tree, 'dfi-maskUse')[0]), '深度求索中，用时 25秒 ···', 'the row starts at the measured run time');
fakeNow = new realDate(fakeNow.getTime() + 5000);
pulseMask();
ticking.flush();
eq(textOf(byClass(ticking.tree, 'dfi-maskUse')[0]), '深度求索中，用时 30秒 ···', 'the run duration advances while the mask is up');
ticking.unmount();

/* ------------------------------------------------- pending question --------- */

/* A question lives in the composer seat, under the mask. The mask has to yield,
 * or the session is stuck behind a screen that cannot answer anything. */
const pendingMaskApi = makeApi({
  prefs: { expanded: false, strictMode: true },
  runningSessions: [{
    title: '电场电路期末复习资料整理',
    current: true,
    startedAt: fakeNow.getTime() - 60000,
    pending: true,
    pendingSince: fakeNow.getTime() - 20000,
  }],
  state: { phase: 'finished', watchedMs: 31 * 60000, elapsedMs: 25 * 60000, remainingMs: 0, progress: 1, modelBusy: false },
});
const pendingMask = mount(pendingMaskApi, { rightInset: 0, topInset: 86 });
eq(byClass(pendingMask.tree, 'dfi-mask').length, 0, 'a pending question dismisses the strict mask');
eq(pendingMask.root().props['data-strict'], 'false', 'root stops claiming the mask');
ok(pendingMaskApi.core.calls.some((entry) => entry[0] === 'reset'), 'dismissing the mask restarts the round, so the rule is kept');
ok(pendingMaskApi.notifyCalls.some((entry) => entry[0] === 'notifyPending'), 'and the user is alerted that something is waiting');
eq(pendingMask.root().props['data-pending'], 'true', 'the island flags the pending question');
const pendingChip = byClass(pendingMask.tree, 'dfi-pending');
eq(pendingChip.length, 1, 'the card carries one pending line');
eq(textOf(pendingChip[0]), '有提问待回答', 'the line says a question is waiting');
eq(byClass(pendingMask.tree, 'dfi-liveDot')[0].props['data-state'], 'pending', 'the live dot carries the pending state');
pendingMask.unmount();

/* The capsule is 216px wide: it swaps the wall clock for a two-character word
 * rather than trying to fit the sentence. */
const pendingPillApi = makeApi({
  prefs: { expanded: false, strictMode: false },
  runningSessions: [{ title: '电站复习', current: true, startedAt: fakeNow.getTime() - 60000, pending: true, pendingSince: fakeNow.getTime() - 5000 }],
});
const pendingPill = mount(pendingPillApi, { rightInset: 0, topInset: 86 });
eq(textOf(byClass(pendingPill.tree, 'dfi-sysClock')[0]), '待回答', 'the capsule says 待回答 in place of the wall clock');
eq(byClass(pendingPill.tree, 'dfi-sysClock')[0].props['data-pending'], 'true', 'and marks it as the pending variant');
pendingPill.unmount();

/* Waiting is timed from the wait, not from the (stopped) turn. */
const pendingWaitApi = makeApi({
  prefs: { expanded: false, strictMode: true },
  runningSessions: [{ title: '电站复习', current: true, startedAt: fakeNow.getTime() - 60000, pending: true, pendingSince: fakeNow.getTime() - 12000 }],
  state: { phase: 'finished', watchedMs: 31 * 60000, elapsedMs: 25 * 60000, remainingMs: 0, progress: 1, modelBusy: false },
});
const pendingWait = mount(pendingWaitApi, { rightInset: 0, topInset: 86 });
// the mask is gone (auto-skip); the row wording is asserted through the row builder
eq(byClass(pendingWait.tree, 'dfi-mask').length, 0, 'a waiting session also dismisses the mask');
pendingWait.unmount();

// English idle copy
const idleEnApi = makeApi({
  prefs: { expanded: false, strictMode: true },
  locale: 'en',
  runningSessions: [],
  state: { phase: 'finished', watchedMs: 31 * 60000, elapsedMs: 25 * 60000, remainingMs: 0, progress: 1, modelBusy: false },
});
const idleEn = mount(idleEnApi, { rightInset: 0, topInset: 86 });
eq(textOf(byClass(idleEn.tree, 'dfi-maskName')[0]), 'Idle', 'the idle row is localised');
ok(/^Idle for \d+/.test(textOf(byClass(idleEn.tree, 'dfi-maskUse')[0])), 'the idle stopwatch is localised');
idleEn.unmount();

// the stylesheet backs the mask with tokens only
ok(/\.dfi-mask \{[\s\S]*position: fixed;[\s\S]*inset: 0;/.test(css), 'the mask is a fixed full-frame layer');
ok(/\.dfi-root\[data-strict='true'\] \.dfi-card \{ display: none; \}/.test(css), 'the island card is hidden under the mask');
ok(/\.dfi-maskFoot \{[\s\S]*right: 24px;[\s\S]*bottom: 24px/.test(css), 'the exit sits in the bottom-right corner');
ok(/\.dfi-mask \{[\s\S]*justify-content: center;/.test(css), 'the mask content is centred');
ok(!/#[0-9a-fA-F]{3,8}\b/.test(cssRules), 'the mask adds no hardcoded colours');

// English locale + live locale switch
const enApi = makeApi({ prefs: { expanded: true }, locale: 'en' });
const en = mount(enApi, { rightInset: 0, topInset: 86 });
same(byClass(en.tree, 'dfi-gaugeLabel').map((node) => textOf(node)), ['CPU', 'GPU', 'RAM', 'GPU TEMP'], 'en resource labels');
eq(byClass(en.tree, 'dfi-gaugeVal').map((node) => textOf(node))[3], '64°C', 'en temperature unit');
ok(textOf(en.tree).includes('Focus Island'), 'en title');
enApi.emitLocale('zh');
en.flush();
ok(textOf(en.tree).includes('惜时岛'), 'locale subscription re-renders');
en.unmount();
expanded.unmount();
collapsed.unmount();

eq(intervals.size, 0, 'unmount clears the wall-clock interval');

/* ---------------------------------------------------------------- teardown -- */

globalThis.Date = realDate;
globalThis.setInterval = realSetInterval;
globalThis.clearInterval = realClearInterval;

if (process.exitCode) {
  console.error('\nwidget smoke: FAILED');
} else {
  console.log('widget smoke: ' + passed + ' checks passed');
}




