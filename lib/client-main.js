// dsh-focus-island — Client integration layer.
//
// Owns everything that touches the page: presence detection (composer, focus,
// model activity), right-sidebar geometry tracking, persistence, the optional
// resource poller, and the one `shell.overlay` registration. The visual widget
// and the countdown state machine stay in their own files.

const PLUGIN_ID = 'dsh-focus-island'
const STORE_STATE = 'dsh-focus-island:v1:state'
const STORE_PREFS = 'dsh-focus-island:v1:prefs'

/** Heartbeat age above which a stored round belongs to an earlier app run.
 *
 * The persistence pulse writes every 5 s, so a reload inside the same run
 * leaves a heartbeat a few seconds old. Anything older than two minutes means
 * the app was closed (or crashed) in between: that is a cold start, and a cold
 * start has to begin a fresh round instead of reopening yesterday's reminder.
 * Only a fallback: the page-session marker below decides this exactly whenever
 * `sessionStorage` is usable. */
const COLD_START_GAP_MS = 120_000

/** `sessionStorage` key marking "this page session already exists".
 *
 * `sessionStorage` survives a reload of the same page and dies with the page
 * itself, which is exactly the difference between "F5 / re-render" and "close
 * the app and open it again": a reload finds the marker, a cold start does not.
 * The heartbeat above only covers runtimes where `sessionStorage` throws. */
const SESSION_KEY = 'dsh-focus-island:v1:page'

/**
 * Classify this page session.
 *
 * Returns `'same'` when the marker was already there (a reload of this page),
 * `'new'` when storage works but the marker was missing (the app was started
 * again — the marker is written as part of the check), and `'unavailable'` when
 * `sessionStorage` throws, in which case the caller falls back to the heartbeat.
 *
 * @returns {'same' | 'new' | 'unavailable'}
 */
function pageSessionState() {
  try {
    if (window.sessionStorage.getItem(SESSION_KEY) !== null) return 'same'
    window.sessionStorage.setItem(SESSION_KEY, '1')
    return 'new'
  } catch {
    return 'unavailable'
  }
}

/**
 * Does this boot follow an earlier run?
 * @param {number} sincePulse Milliseconds since the stored heartbeat; Infinity when absent.
 * @returns {boolean} True when the stored round must be dropped.
 */
function fromColdStart(sincePulse) {
  /* A snapshot with no heartbeat at all (written before this field existed)
   * cannot prove it is from the same run, so it is treated as cold as well. */
  return !Number.isFinite(sincePulse) || sincePulse > COLD_START_GAP_MS
}

/** Composer primary-button labels that mean "the user just sent something". */
const SEND_LABEL = /发送|提交|send|submit|queue|steer|排队|队列/i
/** Composer labels that mean the machine is running a turn right now. */
const STOP_LABEL = /停止|中止|中断|stop|abort/i

/** Cheap millisecond clock; injected into the core for testability. */
function nowMs() {
  return Date.now()
}

/** Read a JSON value from localStorage without ever throwing. */
function readStored(key) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

/** Write a JSON value to localStorage without ever throwing. */
function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode / quota: preferences are best-effort */
  }
}

/** True when the event target sits inside the composer card. */
function inComposer(target) {
  if (target === null || target === undefined || typeof target.closest !== 'function') return false
  return target.closest('[data-composer-card]') !== null
}

/** The official composer editor (a contenteditable div), when mounted. */
function composerInput() {
  return document.querySelector('[data-composer-input]')
}

/* Cached composer/composer-card lookups. `sync()` runs on every pulse and on
 * every keystroke, and each lookup is a full tree walk; the nodes themselves
 * live as long as the composer does, so they only need re-finding when they are
 * detached (session switch, route change). */
let cachedInput = null
let cachedCard = null

function composerEl() {
  if (cachedInput === null || cachedInput.isConnected === false) cachedInput = composerInput()
  return cachedInput
}

function composerCard() {
  if (cachedCard === null || cachedCard.isConnected === false) cachedCard = document.querySelector('[data-composer-card]')
  return cachedCard
}

/** Composer draft text, whitespace and zero-width joiners removed. */
function composerText() {
  const el = composerEl()
  if (el === null) return ''
  return (el.textContent || '').replace(/[\u200b\u200c\u200d\ufeff]/g, '').trim()
}

/** True while the composer shows the "stop" action, i.e. a turn is running. */
function hasStopAction() {
  const card = composerCard()
  if (card === null) return false
  const buttons = card.querySelectorAll('button[aria-label]')
  for (const button of buttons) {
    const label = button.getAttribute('aria-label') || ''
    if (STOP_LABEL.test(label)) return true
  }
  return false
}

/** Translate with `{name}` interpolation, falling back to the bundled copy. */
function makeTranslate(getLang) {
  return function t(key, vars) {
    const table = COPY[getLang()] || COPY.zh
    const raw = table[key] !== undefined ? table[key] : (COPY.zh[key] !== undefined ? COPY.zh[key] : key)
    if (vars === undefined || vars === null) return raw
    return raw.replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined ? String(vars[name]) : match))
  }
}

/** Locale seat: adopt the official locale service when present, else read the DOM. */
function createLocaleSeat(ctx) {
  let lang = 'zh'
  let override = null
  const listeners = new Set()

  function detect() {
    let next = null
    try {
      if (ctx !== null && ctx !== undefined && typeof ctx.get === 'function') {
        const service = ctx.get('locale')
        if (service !== null && service !== undefined && typeof service.getLocale === 'function') {
          const snapshot = service.getLocale()
          if (snapshot !== null && snapshot !== undefined && typeof snapshot.id === 'string') next = snapshot.id
        }
      }
    } catch {
      /* locale service is optional */
    }
    if (next === null) {
      const attr = document.documentElement.getAttribute('lang')
      next = typeof attr === 'string' && attr.length > 0 ? attr : 'zh'
    }
    const detected = String(next).toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en'
    const normalized = override === null ? detected : override
    if (normalized !== lang) lang = normalized
    return lang
  }

  function notify() {
    for (const listener of listeners) {
      try {
        listener(lang)
      } catch {
        /* a listener must not break the widget */
      }
    }
  }

  detect()
  try {
    if (ctx !== null && ctx !== undefined && typeof ctx.on === 'function') {
      ctx.on('locale/change', () => {
        detect()
        notify()
      })
    }
  } catch {
    /* older hosts may not expose the event */
  }
  try {
    const attrObserver = new MutationObserver(() => {
      detect()
      notify()
    })
    attrObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
  } catch {
    /* the DOM observer is best-effort */
  }

  return {
    get: () => lang,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** Island-only language override; the surrounding app keeps its own locale. */
    setLang(value) {
      override = value === 'en' ? 'en' : 'zh'
      if (override !== lang) {
        lang = override
        notify()
      }
    },
  }
}

/** Layout seat: the right-sidebar width, the conversation header, drag state. */
function createLayoutSeat() {
  const listeners = new Set()
  let current = { right: 0, top: 84, dragging: false }
  let columnObserver = null
  let headerObserver = null
  let frameObserver = null
  let frameElement = null
  let column = null
  let header = null
  let frameHandle = 0

  function publish(next) {
    if (next.right === current.right && next.top === current.top && next.dragging === current.dragging) return
    current = next
    for (const listener of listeners) {
      try {
        listener(current)
      } catch {
        /* a listener must not break the tracker */
      }
    }
  }

  /** The official conversation `<header>`; the island floats below its rule. */
  function findHeader() {
    const leading = document.querySelector('[data-conversation-header-leading]')
    if (leading !== null && typeof leading.closest === 'function') {
      const owner = leading.closest('header')
      if (owner !== null) return owner
    }
    const main = document.querySelector('[data-side="main"]')
    if (main !== null) {
      const owner = main.querySelector('header')
      if (owner !== null) return owner
    }
    return null
  }

  function measureTop() {
    if (header === null || !header.isConnected) {
      const found = findHeader()
      if (found !== null && found !== header) {
        header = found
        observe()
      }
    }
    if (header === null) return 84
    const rect = header.getBoundingClientRect()
    if (!(rect.bottom > 0)) return 84
    return Math.round(rect.bottom + 10)
  }

  function measure() {
    if (column === null || !column.isConnected) {
      column = document.querySelector('[data-rightbar-col]')
      frameElement = column === null ? null
        : column.closest('[data-rightbar-collapsed], [data-rightbar-fullscreen], [data-sidebar-collapsed]')
      if (frameElement === null && column !== null) frameElement = column.parentElement
      observe()
    }
    const dragging = frameElement !== null && frameElement.hasAttribute('data-dragging')
    const top = measureTop()
    if (column === null) {
      publish({ right: 0, top, dragging })
      return
    }
    if (frameElement !== null && frameElement.hasAttribute('data-rightbar-fullscreen')) {
      publish({ right: -1, top, dragging })
      return
    }
    publish({ right: Math.round(column.getBoundingClientRect().width), top, dragging })
  }

  /** Coalesce bursts of mutations (a drag emits many) into one measurement. */
  function schedule() {
    if (frameHandle !== 0) return
    frameHandle = window.requestAnimationFrame(() => {
      frameHandle = 0
      measure()
    })
  }

  /**
   * Periodic staleness probe — deliberately free of layout reads.
   *
   * Switching sessions replaces the conversation header with a new element, so
   * the ResizeObserver ends up watching a detached node and never fires again.
   * The old code answered that by re-measuring on every pulse, which forced a
   * style/layout flush several times a second on the thread that renders the
   * conversation. `isConnected` costs nothing and is exactly the signal for
   * "the node I was tracking is gone", so a full measurement now happens only
   * when the DOM really was replaced.
   */
  function refreshIfStale() {
    if (header === null || column === null) { schedule(); return }
    if (!header.isConnected || !column.isConnected) schedule()
  }

  function observe() {
    if (columnObserver !== null) columnObserver.disconnect()
    if (headerObserver !== null) headerObserver.disconnect()
    if (frameObserver !== null) frameObserver.disconnect()
    columnObserver = null
    headerObserver = null
    frameObserver = null
    if (column !== null && typeof ResizeObserver === 'function') {
      columnObserver = new ResizeObserver(() => schedule())
      columnObserver.observe(column)
    }
    if (header !== null && typeof ResizeObserver === 'function') {
      headerObserver = new ResizeObserver(() => schedule())
      headerObserver.observe(header)
    }
    if (frameElement !== null && typeof MutationObserver === 'function') {
      frameObserver = new MutationObserver(() => schedule())
      frameObserver.observe(frameElement, {
        attributes: true,
        attributeFilter: [
          'data-rightbar-fullscreen',
          'data-rightbar-collapsed',
          'data-sidebar-collapsed',
          'data-dragging',
          'data-animating',
          'style',
        ],
      })
    }
  }

  function onResize() {
    schedule()
  }

  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** Staleness probe: measures only when the tracked DOM was replaced. */
    refresh: refreshIfStale,
    /** Force one measurement regardless (used by the drag/resize paths). */
    remeasure: schedule,
    start() {
      measure()
      window.addEventListener('resize', onResize, { passive: true })
      /* the frame settles its columns and the header after first paint */
      window.setTimeout(() => schedule(), 400)
      window.setTimeout(() => schedule(), 1500)
    },
    stop() {
      if (columnObserver !== null) columnObserver.disconnect()
      if (headerObserver !== null) headerObserver.disconnect()
      if (frameObserver !== null) frameObserver.disconnect()
      if (frameHandle !== 0) window.cancelAnimationFrame(frameHandle)
      window.removeEventListener('resize', onResize)
      listeners.clear()
    },
  }
}

/**
 * Presence detection: page visibility/focus, composer draft, typing, model activity.
 *
 * The host exposes no client event for "a turn is streaming", so model activity
 * is a heuristic: a Stop action in the composer, or DOM churn inside the chat
 * scrollport within the last 1.5 s. The countdown itself never depends on it.
 */
function createPresenceSeat(core) {
  const disposers = []
  let typingUntil = 0
  let chatMutationAt = 0

  function sendNow() {
    try {
      core.onUserSend()
    } catch {
      /* core never throws, but the loop must not either */
    }
  }

  function sync() {
    /* Unfocused or hidden page: presence is `visible: false` no matter what the
     * composer holds, so the two DOM probes below cannot change the answer.
     * Skipping them keeps a background window free of per-second
     * `querySelectorAll` + `textContent` work on the same thread that renders
     * the conversation — which is exactly when the user is reading another
     * session and expects this one to be idle. */
    if (typeof document.visibilityState === 'string' && document.visibilityState === 'hidden') {
      try {
        core.setPresence({ visible: false, typing: false, draftEmpty: true, sending: false, modelBusy: false })
      } catch {
        /* the state machine is defensive; keep the loop alive */
      }
      return
    }
    if (typeof document.hasFocus === 'function' && !document.hasFocus()) {
      try {
        core.setPresence({ visible: false, typing: false, draftEmpty: true, sending: false, modelBusy: false })
      } catch {
        /* see above */
      }
      return
    }
    const visible = true
    const busy = hasStopAction() || nowMs() - chatMutationAt <= 1500
    try {
      core.setPresence({
        visible,
        typing: nowMs() < typingUntil,
        draftEmpty: composerText().length === 0,
        sending: false,
        modelBusy: busy,
      })
    } catch {
      /* the state machine is defensive; keep the loop alive */
    }
  }

  function onKeydown(event) {
    if (!inComposer(event.target) || event.isComposing) return
    typingUntil = nowMs() + 2500
    const plainEnter = event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
    if (plainEnter && composerText().length > 0) {
      typingUntil = 0
      sendNow()
      return
    }
    sync()
  }

  function onInputEvent(event) {
    if (!inComposer(event.target)) return
    typingUntil = nowMs() + 2500
    sync()
  }

  function onClick(event) {
    const target = event.target
    if (!inComposer(target) || typeof target.closest !== 'function') return
    const button = target.closest('button[aria-label]')
    if (button === null) return
    const label = button.getAttribute('aria-label') || ''
    if (!SEND_LABEL.test(label) || STOP_LABEL.test(label)) return
    sendNow()
  }

  function onFocusChange() {
    typingUntil = 0
    sync()
  }

  function attach() {
    document.addEventListener('keydown', onKeydown, true)
    document.addEventListener('input', onInputEvent, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('visibilitychange', onFocusChange, true)
    window.addEventListener('focus', onFocusChange)
    window.addEventListener('blur', onFocusChange)
    disposers.push(() => {
      document.removeEventListener('keydown', onKeydown, true)
      document.removeEventListener('input', onInputEvent, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('visibilitychange', onFocusChange, true)
      window.removeEventListener('focus', onFocusChange)
      window.removeEventListener('blur', onFocusChange)
    })

    if (typeof MutationObserver !== 'function') return
    const editor = composerInput()
    if (editor !== null) {
      /* Programmatic composer churn (clearing after a send, placeholder swaps,
       * selection redraws) is not the user typing. Re-arming the typing window
       * here froze the countdown every few hundred milliseconds while the user
       * was doing nothing at all. Only real input events count. */
      const editorObserver = new MutationObserver(() => { sync() })
      editorObserver.observe(editor, { childList: true, characterData: true, subtree: true })
      disposers.push(() => editorObserver.disconnect())
    }
    const scrollport = document.querySelector('[data-conversation-scroll]')
    if (scrollport !== null) {
      const chatObserver = new MutationObserver(() => {
        chatMutationAt = nowMs()
      })
      chatObserver.observe(scrollport, { childList: true, characterData: true, subtree: true })
      disposers.push(() => chatObserver.disconnect())
    }
  }

  return {
    start() {
      attach()
      sync()
    },
    sync,
    stop() {
      for (const dispose of disposers.splice(0)) {
        try {
          dispose()
        } catch {
          /* disposal is best-effort */
        }
      }
    },
  }
}

/** Resource hub: holds the latest sample and only polls while the readout is on. */
function createResourceHub() {
  const listeners = new Set()
  let snapshot = null
  let poller = null

  function notify() {
    for (const listener of listeners) {
      try {
        listener(snapshot)
      } catch {
        /* a listener must not break the poller */
      }
    }
  }

  return {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start() {
      if (poller !== null) return
      try {
        poller = createResourcePoller({
          fetchImpl: (input, init) => window.fetch(input, init),
          intervalMs: 5000,
          onUpdate: (sample) => {
            snapshot = sample
            notify()
          },
          onError: () => {
            /* a failing sampler simply keeps the last / empty readout */
          },
        })
        poller.start()
      } catch {
        poller = null
      }
    },
    stop() {
      if (poller !== null) {
        try {
          poller.dispose()
        } catch {
          /* disposal is best-effort */
        }
        poller = null
      }
      snapshot = null
      notify()
    },
    dispose() {
      this.stop()
      listeners.clear()
    },
  }
}

/** Build the loader plugin exports. `apply` receives the Cordis context. */
function createIslandPlugin() {
  return {
    inject: ['slots'],
    apply(ctx) {
      const locale = createLocaleSeat(ctx)
      const layout = createLayoutSeat()
      const resources = createResourceHub()
      const translate = makeTranslate(() => locale.get())

      const prefs = (() => {
        const stored = readStored(STORE_PREFS)
        return stored !== null && typeof stored === 'object' ? stored : {}
      })()
      /* The resource readout is on by default: the extension should be visible
       * without hunting for a setting, and it degrades to N/A fields while the
       * Host half has not loaded (that half needs a dsh restart). */
      if (prefs.resourceMode === undefined) prefs.resourceMode = 'system'
      if (prefs.notifyEnabled === undefined) prefs.notifyEnabled = true
      if (prefs.soundEnabled === undefined) prefs.soundEnabled = true
      if (typeof prefs.autoRepeatMinutes !== 'number') prefs.autoRepeatMinutes = 2

      /** Wait before an ignored finished reminder starts a fresh round; 0 = off. */
      function autoRepeatMinutes() {
        const value = Math.round(Number(prefs.autoRepeatMinutes))
        if (!Number.isFinite(value)) return 2
        return Math.max(0, Math.min(10, value))
      }
      let savePrefsScheduled = 0

      function savePrefs() {
        if (savePrefsScheduled !== 0) return
        savePrefsScheduled = window.setTimeout(() => {
          savePrefsScheduled = 0
          writeStored(STORE_PREFS, prefs)
        }, 250)
      }

      if (prefs.locale === 'zh' || prefs.locale === 'en') locale.setLang(prefs.locale)

      let lastDuration = typeof prefs.durationMinutes === 'number' ? prefs.durationMinutes : DEFAULT_DURATION_MINUTES
      const core = createFocusCore({
        now: nowMs,
        durationMinutes: lastDuration,
        onChange: (state) => {
          if (state.durationMinutes !== lastDuration) {
            lastDuration = state.durationMinutes
            prefs.durationMinutes = state.durationMinutes
            savePrefs()
          }
        },
      })
      /* Restoring a round is for a *reload*, not for a cold start.
       *
       * `finished` and `skipped` used to be excluded here, so a mid-session
       * reload silently threw away the fact that this round was over: the
       * countdown restarted from zero and the reminder could appear again
       * seconds after the user had dismissed it. Restoring both terminal
       * phases fixed that — and then the same restore brought them back after
       * the app had been closed: opening DSH in the morning showed yesterday's
       * reminder/skip card.
       *
       * The two cases are told apart by the page-session marker in
       * `sessionStorage`: it survives a reload of the same page and dies with
       * the page itself, so closing the app and opening it again finds it
       * missing. Where `sessionStorage` is unavailable (private mode, an
       * embedding that throws), the 5 s heartbeat `pulseAt` decides instead:
       * a heartbeat minutes old is a new run. A cold start drops the stored
       * round and counts from zero, exactly as if the plugin had just been
       * installed. */
      const restored = readStored(STORE_STATE)
      const lastPulse = restored !== null ? Number(restored.pulseAt) : NaN
      const sincePulse = Number.isFinite(lastPulse) ? nowMs() - lastPulse : Number.POSITIVE_INFINITY
      const samePage = pageSessionState()
      const coldStart = restored !== null && (samePage === 'new'
        || (samePage === 'unavailable' && fromColdStart(sincePulse)))
      if (restored !== null && !coldStart) {
        try {
          core.restore(restored)
        } catch {
          /* a foreign snapshot must never block boot */
        }
      } else if (coldStart) {
        /* The stored round belongs to a previous run: drop it and count from
         * zero. `reset()` is the same path a send takes, so the new round is a
         * normal counting round with no leftover armed skip or finish time. */
        try {
          core.reset()
        } catch {
          /* the default counting round is already the fallback */
        }
      }

      const api = {
        core,
        t: translate,
        /* The strict mask's artwork. Passed in rather than imported by the
         * widget: the widget file is unit-loaded on its own by the verify
         * scripts and concatenated into this bundle in production, so it must
         * not depend on a sibling module's scope. */
        attachWhale,
        whaleAtlasUrl: WHALE_ATLAS_URL,
        getLocale: () => locale.get(),
        subscribeLocale: (listener) => locale.subscribe(listener),
        getResources: () => resources.get(),
        subscribeResources: (listener) => resources.subscribe(listener),
        getResourceMode: () => (prefs.resourceMode === 'system' ? 'system' : 'off'),
        setResourceMode(mode) {
          const next = mode === 'system' ? 'system' : 'off'
          prefs.resourceMode = next
          savePrefs()
          if (next === 'system') resources.start()
          else resources.stop()
        },
        persist(key, value) {
          prefs[key] = value
          savePrefs()
        },
        loadPref(key, fallback) {
          return key in prefs ? prefs[key] : fallback
        },
        getAutoRepeatMinutes: autoRepeatMinutes,
        setAutoRepeatMinutes(minutes) {
          const parsed = Math.round(Number(minutes))
          prefs.autoRepeatMinutes = Number.isFinite(parsed) ? Math.max(0, Math.min(10, parsed)) : 2
          savePrefs()
          notifyPrefsChanged()
        },
        getStrictMode: () => prefs.strictMode === true,
        setStrictMode(value) {
          prefs.strictMode = value === true
          savePrefs()
        },
        getNotifyEnabled: notifyEnabled,
        setNotifyEnabled(value) {
          prefs.notifyEnabled = value === true
          savePrefs()
          notifyPrefsChanged()
          if (value === true) {
            void requestBrowserPermission().then(() => notifyPrefsChanged())
            const table = notifyCopyTable()
            try {
              showBrowserNotification(table.enabled.title, table.enabled.body, NOTIFY_TAG_PREFIX + ':enabled')
            } catch {
              /* permission / platform refusal is logged by the helper */
            }
            try {
              soundPlayer.play('chime')
            } catch {
              /* audio is best-effort */
            }
          }
        },
        getSoundEnabled: soundEnabledPref,
        setSoundEnabled(value) {
          prefs.soundEnabled = value === true
          savePrefs()
          notifyPrefsChanged()
          if (value === true) {
            try {
              soundPlayer.play('chime')
            } catch {
              /* audio is best-effort */
            }
          }
        },
        getNotifyPermission: () => browserPermission(),
        requestNotifyPermission: () => requestBrowserPermission().then((state) => {
          notifyPrefsChanged()
          return state
        }),
        testNotify() {
          void requestBrowserPermission().then(() => {
            const table = notifyCopyTable()
            try {
              showBrowserNotification(table.enabled.title, table.enabled.body, NOTIFY_TAG_PREFIX + ':test')
            } catch {
              /* helper logs the reason */
            }
            notifyPrefsChanged()
          })
        },
        testSound() {
          try {
            soundPlayer.play('chime')
          } catch {
            /* audio is best-effort */
          }
        },
        /**
         * Something is waiting on the user (a question, an approval).
         *
         * Fired from the widget's own render, which is the only place the
         * session statuses are read; the copy and the channel switches stay
         * here with every other alert.
         */
        notifyPending() {
          alertFor('pending', {})
        },
        subscribeNotifyPrefs(listener) {
          notifyPrefsListeners.add(listener)
          return () => notifyPrefsListeners.delete(listener)
        },
        setLocale(value) {
          const next = value === 'en' ? 'en' : 'zh'
          prefs.locale = next
          savePrefs()
          locale.setLang(next)
        },
      }

      /* Live getters so the widget can read either the property form or the
       * getter form; both reflect the persisted preference, not a stale copy. */
      Object.defineProperty(api, 'resourceMode', {
        get: () => (prefs.resourceMode === 'system' ? 'system' : 'off'),
        enumerable: true,
      })
      Object.defineProperty(api, 'locale', {
        get: () => locale.get(),
        enumerable: true,
      })

      /* ---- desktop notification + sound ---------------------------------- */
      const notifyPrefsListeners = new Set()
      const soundPlayer = createSoundPlayer()

      function notifyPrefsChanged() {
        for (const listener of [...notifyPrefsListeners]) {
          try {
            listener()
          } catch {
            /* a listener must not break the timer */
          }
        }
      }

      function notifyEnabled() {
        return prefs.notifyEnabled !== false
      }

      function soundEnabledPref() {
        return prefs.soundEnabled !== false
      }

      function fillTemplate(text, vars) {
        return String(text).replace(/\{(\w+)\}/g, (match, name) => (
          vars !== null && vars !== undefined && vars[name] !== undefined ? String(vars[name]) : match
        ))
      }

      function notifyCopyTable() {
        const lang = locale.get()
        return NOTIFY_COPY[lang] !== undefined ? NOTIFY_COPY[lang] : NOTIFY_COPY.zh
      }

      /** Fire the configured alert channels for one state transition. */
      function alertFor(kind, vars) {
        const entry = notifyCopyTable()[kind]
        if (entry === undefined) return
        const body = fillTemplate(entry.body, vars)
        if (notifyEnabled()) {
          try {
            showBrowserNotification(entry.title, body, NOTIFY_TAG_PREFIX + ':' + kind)
          } catch {
            /* a notification layer that throws must not break the countdown */
          }
        }
        if (soundEnabledPref()) {
          try {
            soundPlayer.play('chime')
          } catch {
            /* audio is best-effort */
          }
        }
      }

      /* A default-on switch must actually be able to notify: the permission
       * prompt may only open from a user gesture, so ask on the first click. */
      let askPermissionCleanup = null
      if (notifyEnabled() && browserPermission() === 'default') {
        const askOnce = () => {
          if (askPermissionCleanup !== null) askPermissionCleanup()
        document.removeEventListener('click', onIslandClick, true)
          void requestBrowserPermission().then(() => notifyPrefsChanged())
        }
        document.addEventListener('click', askOnce, true)
        askPermissionCleanup = () => {
          document.removeEventListener('click', askOnce, true)
          askPermissionCleanup = null
        }
      }

      /* Any click on the island while the reminder is up means the user saw
       * it; that cycle must not auto-repeat. */
      let finishedAcked = false
      const onIslandClick = (event) => {
        const target = event === null || event === undefined ? undefined : event.target
        if (target === null || target === undefined || typeof target.closest !== 'function') return
        if (target.closest('#dsh-focus-island') === null) return
        if (core.getState().phase === 'finished') finishedAcked = true
      }
      document.addEventListener('click', onIslandClick, true)

      /* Watch edges, not levels: one alert per finish, never one per tick. */
      let seenPhase = core.getState().phase
      core.subscribe((state) => {
        if (state.phase === 'finished' && seenPhase !== 'finished') {
          const minutes = Math.max(1, Math.round((state.watchedMs || state.elapsedMs || 0) / 60000))
          alertFor('finished', { n: minutes })
        }
        seenPhase = state.phase
      })

      if (prefs.resourceMode === 'system') resources.start()

      let widget = null
      try {
        widget = createWidget({ h, React, api })
      } catch (error) {
        /* A broken widget file must not take the host page down. */
        console.warn('[dsh-focus-island] widget unavailable', error)
        return
      }

      /**
       * Running sessions, for the strict mask's list.
       *
       * Read from the official session store through the `useSessions` and
       * `useSessionStatus` hooks the `shell.overlay` seat injects — not from the
       * DOM and not from `document.title`. The sidebar's own rows use exactly
       * this pair (`status.running ?? session.running`), so "running" here means
       * the same thing it means in the app.
       *
       * The "current" mark is the main-view retention, the same rule the layout
       * uses to title the window (`retainedBy.mainView > 0`).
       */
      /**
       * Running sessions and how long each has been running.
       *
       * `useSessions` / `useSessionStatus` are injected into every
       * `shell.overlay` occupant and are exactly what the sidebar's own rows
       * read (`status.running ?? session.running`), so "running" here means what
       * it means in the app.
       *
       * The duration is NOT in that data: the official "深度求索中，用时 19分25秒"
       * line is computed from the open conversation's own turn timeline
       * (`turn.start.time`), which the overlay seat cannot see, and the status
       * map only carries `running / pendingInteraction / completionUnread`.
       * So the start instant is recorded here, from the `running` edge, and kept
       * in preferences so a reload does not reset a session that is still
       * working. It is a measurement, not an estimate.
       */
      /** Read one persisted `{ sessionId: timestamp }` map (garbage ignored). */
      function readStoredStarts(key) {
        const stored = prefs[key]
        if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) return new Map()
        const map = new Map()
        for (const [id, at] of Object.entries(stored)) {
          if (typeof at === 'number' && Number.isFinite(at)) map.set(id, at)
        }
        return map
      }

      const runStarts = readStoredStarts('runStarts')
      /* The `pendingInteraction` edges, kept apart from `runStarts`: a session
         waiting on you is not generating, and its wait started at a different
         instant than its turn did. */
      const pendingStarts = readStoredStarts('pendingStarts')

      /** Record the edges of one pass for one map; returns nothing. */
      function syncStarts(map, key, ids) {
        const now = nowMs()
        const seen = new Set(ids)
        let dirty = false
        for (const id of ids) {
          if (!map.has(id)) {
            map.set(id, now)
            dirty = true
          }
        }
        for (const id of [...map.keys()]) {
          if (seen.has(id)) continue
          map.delete(id)
          dirty = true
        }
        if (!dirty) return
        prefs[key] = Object.fromEntries(map)
        savePrefs()
      }

      /**
       * Running sessions, plus sessions waiting on you, current one first.
       *
       * A session that is neither is left out — an untouched blank conversation
       * is not "deep diving", and the mask used to invent a row for it.
       *
       * `pending` is the official `SessionStatus.pendingInteraction` seat: the
       * same fact the sidebar badge and the composer's question card read, so
       * "waiting for you" here means what it means in the app.
       */
      function runningSessionsFrom(useSessions, useSessionStatus) {
        const list = typeof useSessions === 'function' ? useSessions((state) => state) : null
        const statuses = typeof useSessionStatus === 'function' ? useSessionStatus((state) => state) : null
        if (list === null || list === undefined || !Array.isArray(list.ids)) {
          /* No hooks: report nothing, but do NOT clear what was already
           * measured. An overlay render without the injected hooks (an older
           * host, a nested render without props) used to wipe every running
           * session's start instant, which silently reset live durations to 1s. */
          return []
        }
        const byId = list.byId || {}
        const collected = []
        for (const id of list.ids) {
          const session = byId[id]
          if (session === undefined) continue
          const status = statuses !== null && statuses !== undefined && typeof statuses.get === 'function'
            ? statuses.get(id)
            : undefined
          const running = status !== undefined && status !== null && status.running !== undefined
            ? status.running === true
            : session.running === true
          const pending = status !== undefined && status !== null
            && status.pendingInteraction !== undefined && status.pendingInteraction !== null
          if (!running && !pending) continue
          const isBlank = session.blank === true
          const title = isBlank ? '' : String(session.title || '').trim()
          const retained = session.retainedBy
          const current = retained !== undefined && retained !== null && Number(retained.mainView) > 0
          collected.push({ id, title, current, running, pending })
        }
        syncStarts(runStarts, 'runStarts', collected.filter((entry) => entry.running).map((entry) => entry.id))
        syncStarts(pendingStarts, 'pendingStarts', collected.filter((entry) => entry.pending).map((entry) => entry.id))
        /* Current conversation first, then the rest in the app's own order. */
        collected.sort((left, right) => Number(right.current) - Number(left.current))
        return collected.map((entry) => ({
          title: entry.title,
          current: entry.current,
          pending: entry.pending,
          startedAt: entry.running && runStarts.has(entry.id) ? runStarts.get(entry.id) : null,
          pendingSince: entry.pending && pendingStarts.has(entry.id) ? pendingStarts.get(entry.id) : null,
        }))
      }

      function IslandHost(hostProps) {
        /* Only geometry needs to live here: the widget subscribes to core,
         * locale, resources and notify prefs itself, so a countdown tick or a
         * resource poll re-renders exactly one component instead of re-rendering
         * this host first and the widget a second time. */
        const [layoutState, setLayoutState] = React.useState(() => layout.get())
        /* `shell.overlay` injects these two; a host that does not (an older
         * build, or the fake ctx in the tests) leaves them undefined and the
         * mask falls back to a single untitled row. */
        const useSessions = typeof hostProps.useSessions === 'function' ? hostProps.useSessions : null
        const useSessionStatus = typeof hostProps.useSessionStatus === 'function' ? hostProps.useSessionStatus : null
        api.getRunningSessions = () => runningSessionsFrom(useSessions, useSessionStatus)
        /* Read the session facts here, not inside the widget.
         *
         * `useSessions` / `useSessionStatus` are hooks: whoever calls them owns
         * the subscription and re-renders when a session starts, stops or starts
         * waiting on you. Calling them from the widget's render — where the
         * countdown re-renders every second — made the hook list depend on
         * whether the mask happened to be up, and put the store subscription on
         * the busiest component in the tree. This host re-renders rarely; the
         * widget gets a fresh `sessions` prop and does the per-second maths
         * itself.
         */
        const sessions = runningSessionsFrom(useSessions, useSessionStatus)

        React.useEffect(() => layout.subscribe(setLayoutState), [])

        return h(widget, {
          rightInset: layoutState.right,
          topInset: layoutState.top,
          dragging: layoutState.dragging,
          sessions,
        })
      }

      let presence = null
      try {
        presence = createPresenceSeat(core)
        core.tick()
        presence.start()
      } catch (error) {
        console.warn('[dsh-focus-island] presence detection failed', error)
      }
      try {
        layout.start()
      } catch {
        /* geometry tracking is best-effort */
      }

      try {
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: PLUGIN_ID, order: 950 }, IslandHost),
        )
      } catch (error) {
        console.warn('[dsh-focus-island] overlay seat unavailable', error)
      }

      /* The countdown advances from timestamps, so a slow pulse never drifts.
       * 1 s is the fastest the UI can actually show: `core.publish` coalesces
       * subscriber updates to one per whole watched second, and the displayed
       * clock has 1 s resolution too. A 250 ms pulse therefore ran four times
       * per visible change — and each pulse cost a full `getState()`, a
       * composer text read, a composer button scan and a layout re-measure
       * (two `getBoundingClientRect` calls), i.e. forced style/layout work on
       * the same thread that renders the conversation. */
      /* One snapshot writer, so no save path can forget the heartbeat the
       * cold-start rule reads. Declared before the pulses that call it. */
      const persistSnapshot = () => writeStored(STORE_STATE, Object.assign({}, core.snapshot(), { pulseAt: nowMs() }))

      const tickHandle = window.setInterval(() => {
        /* Hidden tab: nothing the island shows can change (its clock is
         * timestamp-derived, so no drift is introduced by skipping) and the
         * countdown is already frozen — `onFocusChange` runs `sync()` once on
         * the visibility edge and sets `visible: false`. Doing per-second DOM
         * work inside a background window is pure cost on the main thread that
         * renders every other DSH session. */
        if (typeof document.visibilityState === 'string' && document.visibilityState === 'hidden') return
        core.tick()
        const phaseNow = core.getState().phase
        /* While the strict mask covers the frame the round is terminal: the
         * composer cannot be reached and its probes (a text read plus a button
         * scan) only cost DOM work on the thread that renders the conversation.
         * Skipping them cannot make the state stale: the mask's own exits reset
         * the round, and the next pulse re-syncs presence from the DOM. */
        const maskUp = prefs.strictMode === true && phaseNow === 'finished'
        if (presence !== null && !maskUp) presence.sync()
        /* Ignored reminder: after the configured wait, start a fresh round so
         * the countdown (and the next reminder) comes back by itself. */
        if (phaseNow !== 'finished') {
          finishedAcked = false
        } else if (!finishedAcked) {
          const finishedAt = Number(core.getState().finishedAt)
          const repeatMinutes = autoRepeatMinutes()
          /* 严格模式 下自动再来必须关掉：它会把 finished 悄悄变回 counting，
           * 也就是把那面整屏遮罩从用户眼前收走——等于「自动跳过计时」。
           * 这个模式里唯一的出口是右下角的「跳过严格模式」。 */
          const strict = prefs.strictMode === true
          if (!strict && repeatMinutes > 0 && Number.isFinite(finishedAt) && nowMs() - finishedAt >= repeatMinutes * 60000) {
            core.reset()
            persistSnapshot()
          }
        }
        /* Re-measure only when the header may have changed. Session switches
         * replace the header, and that is observed directly; the old code
         * re-measured on every pulse whether or not anything had moved.
         *
         * This probe is deliberately layout-free: two `isConnected` reads, and
         * a `getBoundingClientRect` only when the tracked node really was
         * replaced. Throttling it further would delay session-switch recovery
         * without saving any layout work, so it stays per-pulse. */
        layout.refresh()
      }, 1000)
      const saveHandle = window.setInterval(persistSnapshot, 5000)
      const persistNow = persistSnapshot
      window.addEventListener('visibilitychange', persistNow)
      window.addEventListener('beforeunload', persistNow)

      ctx.effect(() => () => {
        window.clearInterval(tickHandle)
        window.clearInterval(saveHandle)
        if (savePrefsScheduled !== 0) window.clearTimeout(savePrefsScheduled)
        window.removeEventListener('visibilitychange', persistNow)
        window.removeEventListener('beforeunload', persistNow)
        persistNow()
        if (askPermissionCleanup !== null) askPermissionCleanup()
        if (presence !== null) presence.stop()
        layout.stop()
        resources.dispose()
        try {
          soundPlayer.dispose()
        } catch {
          /* disposal is best-effort */
        }
      })
    },
  }
}

return createIslandPlugin()
