// dsh-focus-island — browser notification + synthesized alert sounds.
//
// The notification wrapper and the Web Audio player are adapted from
// @dingyi222666/dsh-session-notification (BSD-3-Clause), trimmed to the two
// alert kinds this plugin needs. Keeping the same guarded shape means a
// permission-less or non-browser environment degrades to a visible console
// warning instead of a thrown error, and no audio assets ship in the bundle.

/** Tag prefix shared by every alert from this plugin. */
const NOTIFY_TAG_PREFIX = 'dsh-focus-island'

/** Schemes a native notification layer can fetch an icon from. */
const ICON_URL_SCHEME = /^(?:https?|blob):/i
/** A `data:` icon is usable only when it carries a raster image. */
const RASTER_DATA_ICON = /^data:image\/(?!svg)/i

/** One declared icon link, or undefined when absent or unusable natively. */
function iconUrlOf(link) {
  if (link === null || link === undefined || typeof link.href !== 'string' || link.href.length === 0) return undefined
  if (ICON_URL_SCHEME.test(link.href)) return link.href
  return RASTER_DATA_ICON.test(link.href) ? link.href : undefined
}

/** The current page's own favicon, when it can be used by a native card. */
function pageIconUrl() {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return undefined
  return iconUrlOf(document.querySelector('link[rel="apple-touch-icon"]'))
    ?? iconUrlOf(document.querySelector('link[rel~="icon"]'))
}

/** Whether this page runs inside the dsh desktop (Electron) shell. */
function isDesktopShell() {
  return typeof globalThis !== 'undefined' && 'dshDesktop' in globalThis
}

/** Current notification permission state ('unsupported' outside browsers). */
function browserPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/** Ask for notification permission (call from a user gesture). */
async function requestBrowserPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  let permission = Notification.permission
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission()
    } catch {
      permission = Notification.permission
    }
  }
  return permission
}

/**
 * Show one system notification.
 * @param {string} title Notification title.
 * @param {string} body Notification body.
 * @param {string} [tag] Collapse key: alerts of one kind share it.
 * @returns {boolean} Whether a notification was actually shown.
 */
function showBrowserNotification(title, body, tag = NOTIFY_TAG_PREFIX) {
  if (typeof Notification === 'undefined') {
    console.warn('[dsh-focus-island] Notification API unavailable (insecure context or unsupported browser)')
    return false
  }
  if (Notification.permission !== 'granted') {
    console.warn('[dsh-focus-island] notification suppressed: permission is "' + Notification.permission + '"')
    return false
  }
  const icon = pageIconUrl()
  const options = { body, tag, renotify: true }
  if (isDesktopShell()) options.silent = true
  if (icon !== undefined) options.icon = icon
  try {
    const notification = new Notification(title, options)
    notification.onclick = () => {
      try {
        window.focus()
      } catch {
        /* focusing is best-effort */
      }
      notification.close()
    }
    return true
  } catch (error) {
    if (icon !== undefined) {
      try {
        new Notification(title, { body, tag, renotify: true })
        console.warn('[dsh-focus-island] page icon rejected; notification shown without it', error)
        return true
      } catch {
        /* fall through to the icon-less failure log */
      }
    }
    console.warn('[dsh-focus-island] Notification constructor failed', error)
    return false
  }
}

/** Built-in synthesized sounds: an ascending chime and a short alert beep. */
const SOUND_PATTERNS = {
  chime: {
    notes: [
      { at: 0, frequency: 659.25, duration: 0.2, type: 'sine', gain: 0.9 },
      { at: 0.16, frequency: 880, duration: 0.4, type: 'sine', gain: 0.9 },
    ],
  },
  alert: {
    notes: [
      { at: 0, frequency: 660, duration: 0.12, type: 'square', gain: 0.35 },
      { at: 0.18, frequency: 660, duration: 0.12, type: 'square', gain: 0.35 },
      { at: 0.36, frequency: 880, duration: 0.24, type: 'square', gain: 0.35 },
    ],
  },
}

/**
 * Web Audio player for the built-in sounds.
 *
 * The context is created lazily on the first play and suspended once playback
 * ends, so a single chime never pins a system output stream for the tab's life.
 * @returns {{ play: (id: string) => void, dispose: () => void }} Player handle.
 */
function createSoundPlayer() {
  let context = null
  let master = null
  let idleTimer = 0
  let disposed = false

  function ensureContext() {
    if (disposed) return null
    if (context !== null) {
      if (context.state === 'suspended' && typeof context.resume === 'function') {
        try {
          context.resume()
        } catch {
          /* the autoplay policy may refuse until the next gesture */
        }
      }
      return context
    }
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return null
    const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext
    try {
      context = new Ctor()
      master = context.createGain()
      master.gain.value = 0.7
      master.connect(context.destination)
    } catch {
      context = null
      master = null
    }
    return context
  }

  function suspendSoon(seconds) {
    if (idleTimer !== 0) window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(() => {
      idleTimer = 0
      if (context === null || typeof context.suspend !== 'function') return
      if (context.state === 'running') {
        try {
          context.suspend()
        } catch {
          /* suspending is best-effort */
        }
      }
    }, Math.max(250, Math.round(seconds * 1000) + 260))
  }

  function play(id) {
    const pattern = SOUND_PATTERNS[id]
    if (pattern === undefined) return
    const ctx = ensureContext()
    if (ctx === null || master === null) return
    const start = ctx.currentTime + 0.01
    let end = start
    for (const note of pattern.notes) {
      try {
        const oscillator = ctx.createOscillator()
        const gain = ctx.createGain()
        oscillator.type = note.type
        oscillator.frequency.value = note.frequency
        const at = start + note.at
        const stop = at + note.duration
        gain.gain.setValueAtTime(0, at)
        gain.gain.linearRampToValueAtTime(note.gain, at + 0.012)
        gain.gain.exponentialRampToValueAtTime(0.0001, stop)
        oscillator.connect(gain)
        gain.connect(master)
        oscillator.start(at)
        oscillator.stop(stop)
        if (stop > end) end = stop
      } catch {
        /* one failed note must not kill the pattern */
      }
    }
    suspendSoon(end - ctx.currentTime)
  }

  function dispose() {
    disposed = true
    if (idleTimer !== 0) {
      window.clearTimeout(idleTimer)
      idleTimer = 0
    }
    if (context !== null) {
      try {
        context.close()
      } catch {
        /* closing is best-effort */
      }
      context = null
      master = null
    }
  }

  return { play, dispose }
}

/** Notification copy for the alert kinds this plugin emits. */
const NOTIFY_COPY = {
  zh: {
    finished: {
      title: '惜时岛 · 该动一动了',
      body: '你已在这个没有对话的窗口里停留 {n} 分钟，这段时间被 AI 一个人用掉了。',
    },
    taskDone: {
      title: '惜时岛 · 任务时间到',
      body: '「{name}」的 {n} 分钟到了。',
    },
    enabled: {
      title: '惜时岛 · 通知已开启',
      body: '到点提醒会以系统通知的方式出现。',
    },
  },
  en: {
    finished: {
      title: 'Focus Island · time to move',
      body: 'You watched a silent window for {n} minutes while the model worked alone.',
    },
    taskDone: {
      title: 'Focus Island · task timer done',
      body: 'The {n} minutes you set for "{name}" are up.',
    },
    enabled: {
      title: 'Focus Island · notifications on',
      body: 'Finished timers will arrive as system notifications.',
    },
  },
}
