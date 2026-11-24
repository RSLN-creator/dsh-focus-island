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
    subscribeNotifyPrefs(listener) { notifyListeners.add(listener); return () => notifyListeners.delete(listener); },
    notifyCalls,
    getAutoRepeatMinutes: () => autoRepeat,
    setAutoRepeatMinutes(minutes) {
      autoRepeatCalls.push(['setAutoRepeatMinutes', minutes]);
      autoRepeat = Math.min(10, Math.max(0, Math.round(Number(minutes)) || 0));
    },
    autoRepeatCalls,
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
ok(/\.dfi-clock \{[\s\S]*calc\(15px \* var\(--dfi-scale/.test(css), 'capsule clock font scales with collapsedScale');
ok(/\.dfi-microTrack \{[\s\S]*calc\(5px \* var\(--dfi-scale/.test(css), 'micro bar height scales with collapsedScale');
ok(/\.dfi-chevronBox \{[^}]*position: absolute;[^}]*top: calc\(\(27px[^}]*width: 34px;[^}]*height: 34px;/.test(css), 'collapsed chevron is a 34x34 hit area parked on the ring axis');
ok(/\.dfi-collapse \{[\s\S]*position: absolute;[\s\S]*top: 0;[\s\S]*right: 0;[\s\S]*width: 34px;[\s\S]*height: 34px;/.test(css), 'expanded collapse is the same absolute 34x34 corner');
ok(/transition: top 140ms[^;]*right 140ms/.test(css), 'top/right use the 140ms transition');
ok(/\.dfi-root\[data-dragging='true'\] \{ transition: none; \}/.test(css), 'dragging disables the position transition');
ok(/\.dfi-settings \{[\s\S]*margin: 12px 16px 0/.test(css), 'settings uses the card 16px side padding');
ok(/\.dfi-setBox \{[\s\S]*border: 0\.5px solid var\(--dsw-alias-border-l2\);[\s\S]*background: var\(--dsw-alias-bg-layer-2\)/.test(css), 'settings boxes have a 0.5px border and raised fill');
ok(/\.dfi-setBoxTitle \{[\s\S]*border-bottom: 0\.5px solid var\(--dsw-alias-border-l2\)/.test(css), 'settings box title divider');
ok(/\.dfi-setRow \{[\s\S]*min-height: 34px/.test(css), 'settings rows are 34px');
ok(/\.dfi-settings \{[\s\S]*gap: 8px/.test(css), 'settings boxes are 8px apart');
ok(/\.dfi-setBoxTitle \{[\s\S]*padding: 8px 10px 6px;[\s\S]*font-size: 11px;[\s\S]*font-weight: 500/.test(css), 'box titles are compact 11px/500');
ok(/\.dfi-setRow \{[\s\S]*padding: 0 10px/.test(css), 'settings rows use 10px inset padding');
ok(/\.dfi-chipsRow \{[\s\S]*gap: 6px;[\s\S]*padding: 0 10px 8px/.test(css), 'preset chips sit 6px apart');
ok(/\.dfi-chip \{[\s\S]*padding: 0 8px;[\s\S]*border-radius: 7px;[\s\S]*font-size: 10px/.test(css), 'preset chips are 10px / 24px / 7px');
ok(/\.dfi-chip\[data-active='true'\] \{[\s\S]*inset 0 0 0 1px var\(--dsw-alias-button-ghost-active-border\)/.test(css), 'active chip has a 1px border');
ok(/\.dfi-seg \{[\s\S]*gap: 4px/.test(css), 'segmented control gap is 4px');
ok(/\.dfi-segBtn \{[\s\S]*height: 24px;[\s\S]*padding: 0 8px;[\s\S]*font-size: 10px/.test(css), 'segment buttons are 10px / 24px');
ok(/\.dfi-btnTest \{[\s\S]*height: 22px;[\s\S]*padding: 0 8px;[\s\S]*font-size: 10px/.test(css), 'test button is 10px / 22px');
ok(/\.dfi-stepper \{[\s\S]*height: 26px/.test(css) && /\.dfi-stepBtn \{[\s\S]*width: 22px;[\s\S]*height: 22px/.test(css), 'stepper buttons are 22x22');
ok(/\.dfi-stepInput \{[\s\S]*font-size: 12px/.test(css), 'stepper input is 12px');
ok(!/\.dfi-opacityVal \{[\s\S]*font-size/.test(css), 'no opacity slider styles remain');
ok(/\.dfi-rowRight \{[\s\S]*align-items: center;[\s\S]*gap: 8px/.test(css), 'switch rows group test + switch with an 8px gap');
ok(!/--dsw-elevation-panel|--dsw-elevation-prominent|--dsw-elevation-stroke-color/.test(css), 'card shadow no longer uses the elevation hairline tokens');
ok(/\.dfi-card \{[\s\S]*box-shadow: 0 1px 4px rgba\(0, 0, 0, 0\.05\);/.test(css), 'light card keeps one cheap projection');
ok(/\[data-ds-dark-theme\] \.dfi-card \{[\s\S]*0 2px 8px rgba\(0, 0, 0, 0\.34\)/.test(css), 'dark card keeps one cheap projection');
ok(!/\.dfi-card:hover \{[\s\S]{0,120}var\(--dsw-elevation/.test(css), 'hover does not restore the hairline ring');
ok(/\.dfi-permHint \{[\s\S]*var\(--dsw-alias-label-caption\)/.test(css), 'permission hint is small grey text');
ok(/\.dfi-autoHint \{[\s\S]*font-size: 11px;[\s\S]*color: var\(--dsw-alias-label-secondary\)/.test(css), 'auto-repeat hint is 11px secondary');
ok(/\.dfi-root button:focus-visible,[\s\S]*outline-offset: -2px/.test(css), 'keyboard focus ring stays inset');
ok(!/\.dfi-root \{[^}]*border:/.test(css), 'outer root paints no frame');
ok(!/\.dfi-content \{[^}]*border:/.test(css), 'content wrapper paints no frame');
ok(/\.dfi-pill \{[^}]*border: 0;/.test(css), 'capsule explicitly paints no border');
ok(/\.dfi-clockBig \{[\s\S]*font-size: 38px/.test(css), 'single countdown stays 38px');

/* Every view shares one header geometry. The reminder views used to put 16px
 * of horizontal padding on their wrapper while the header also insets itself,
 * so the title sat 32px in and jumped left when the reminder appeared. */
ok(/\.dfi-finish \{ padding: 0 0 16px; \}/.test(css), 'finished wrapper adds no horizontal padding');
ok(/\.dfi-confirm \{ padding: 0 0 16px; \}/.test(css), 'confirm wrapper adds no horizontal padding');
ok(/\.dfi-btnRow \{[\s\S]*margin: 14px 16px 0;/.test(css), 'reminder action rows sit on the same 16px inset');
ok(/\.dfi-expHdr \{[\s\S]*padding: 0 42px 0 16px;/.test(css), 'one header inset for every view');

/* One type scale: six steps, and the compact controls sit on the lowest one. */
const declared = [];
for (const block of css.split('}')) {
  const sel = /\.dfi-([A-Za-z]+)\s*\{/.exec(block);
  const size = /font-size: ([\d.]+)px/.exec(block);
  if (sel && size) declared.push([sel[1], Number(size[1])]);
}
ok(declared.length > 8, 'font sizes were actually collected (' + declared.length + ')');
const allowed = new Set([10, 11, 12, 12.5, 13, 14, 27, 38]);
const stray = declared.filter(([, v]) => !allowed.has(v));
eq(stray.length, 0, 'every font size is on the type scale (10 / 11 / 12 / 12.5 / 13 / 14 + clocks): ' + JSON.stringify(stray));
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

// hidden fullscreen right sidebar
const hiddenApi = makeApi({});
const hidden = mount(hiddenApi, { rightInset: -1, topInset: 86 });
eq(hidden.root().props['data-hidden'], 'true', 'rightInset -1 hides the island');
eq(hidden.root().props['aria-hidden'], 'true', 'hidden island is aria-hidden');
hidden.unmount();

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

