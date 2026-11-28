# Focus Island · dsh-focus-island

[简体中文](README.md) | **English**

A DeepSeek Harness (DSH) web UI plugin that adds a Dynamic-Island-style timer and status panel in the upper-right corner.

Focus Island measures the time you spend in a visible, focused conversation window. Reading, typing, drafting, or waiting for the model does not pause the timer. Sending a message starts a fresh round. When the configured budget expires, the island reminds you how long you have been sitting in the conversation window.

The plugin has no build framework or runtime npm dependencies. Its Client half is loaded through the official `__ModuleLoader__` and registers one overlay in `shell.overlay`; it does not modify DSH-owned DOM nodes.

## Features

### Focus timer

| Feature | Behavior |
|---|---|
| Counted time | Runs while the page is visible and the window has focus. Typing, drafts, and model generation do not pause it. |
| Reminder interval | 5–180 minutes; 25 minutes by default. The number field accepts direct input, with ± controls in 5-minute steps and presets of 5/15/30/45/60/180 minutes. |
| Reminder | At the deadline, the expanded card shows the time spent in the conversation window, with a warm status color and a one-shot pulse. |
| Skip | Requires two steps: arm the action, then confirm. The confirmation explicitly states that the time still counts. A skipped round remains stopped until the next message is sent. |
| Send resets | Enter (without Shift) in the composer or the main Send button resets the timer. |
| Auto-repeat | An ignored reminder can start a new round after a configurable delay (0–10 minutes; default 2; 0 disables it). Interacting with the island acknowledges the reminder. |
| Pause conditions | A hidden page or an unfocused window pauses the timer. Returning resumes from the frozen value. |
| Persistence | Preferences and timer snapshots are stored locally, so a refresh does not silently restart an active or completed round. |
| Notifications | Desktop notifications and a synthesized Web Audio chime are independently configurable and enabled by default. |
| Strict mode | When enabled, the deadline displays a full-screen mask with the official pixel whale and the running or pending sessions. It does not offer ordinary skip, collapse, or auto-repeat actions. The two explicit exits either keep strict mode enabled or turn it off; both restart a five-minute round. A pending question automatically yields the screen so it can be answered. |

### Strict mode

Enable **Settings → Appearance & more → Strict mode**. It is off by default because it covers the entire page.

At the deadline, the mask shows the official whale artwork and each running or waiting session with its own elapsed time. If no session is active, it shows an idle timer instead of inventing a conversation row. The whale atlas is vendored byte-for-byte from `@deepseek-ai/dsh-client-ui-brand-official` and embedded into the client bundle so the mask does not depend on a separately mounted asset route.

The mask has two exits:

- **Skip this round** dismisses the mask, starts a five-minute round, and leaves strict mode enabled.
- **Turn strict mode off** dismisses the mask, starts a five-minute round, and disables strict mode.

A question or approval request must remain answerable. If a session becomes pending while the mask is visible, the mask yields through the same five-minute restart path; it never answers or skips the question for you.

### Appearance

- Collapsed mode uses a capsule with a status ring, countdown, local clock, and four compact resource bars.
- Expanded mode shows the countdown, actions, machine resource gauges, and settings.
- Three collapsed-size presets are available: Compact, Standard, and Large (Standard is the default at 1.2×).
- The surface follows DSH semantic theme tokens and supports light and dark themes.
- The island has its own Chinese/English language switch; it does not change the language of the surrounding DSH application.
- `prefers-reduced-motion` is respected. The UI does not rely on a permanent decorative animation.

### Machine resource monitor (optional Host half)

- CPU and memory are sampled through Node's `os` APIs.
- NVIDIA GPU utilization and temperature are read through `nvidia-smi` when available.
- The page polls the same-origin `/dsh-focus-island/resources` route every **5 seconds**.
- Host CPU/memory samples are refreshed at most every **1 second**; GPU data is refreshed every **15 seconds** because spawning `nvidia-smi` is comparatively expensive.
- The figures describe the whole machine, not the current conversation or remote model inference.

## Installation

Install the bundle from the repository (the repo declares `dsh.bundle`, so `dsh plugin add` works directly):

```sh
dsh plugin --profile <profile> add RSLN-creator/dsh-focus-island
```

Or, for a local checkout, through the DSH profile bundle manager. For example, on Windows:

```text
plugin_manager { action: "install_bundle", target: "D:\\path\\to\\dsh-focus-island" }
```

The Client half takes effect after a page refresh. The optional Host resource route is registered when the bundle is loaded. If the Host half does not appear after installation, toggle the bundle off and on using the profile's bundle manager; a full DSH restart should not be necessary.

To remove the bundle:

```text
plugin_manager { action: "remove_bundle", target: "dsh-focus-island" }
```

## Development

| File | Responsibility |
|---|---|
| `package.json` | DSH bundle and Client manifest |
| `cordis.patch.yml` | Cordis registration patch |
| `build.mjs` | Concatenates the seven Client source modules into `lib/client.js` |
| `lib/core.js` | Pure focus-timer state machine; no DOM or host APIs |
| `lib/notify.js` | Desktop notifications and synthesized sound |
| `lib/whale-atlas.js` | Generated embedded whale-atlas data URL |
| `lib/whale.js` | Strict-mode whale renderer |
| `lib/widget.js` | React UI and styling |
| `lib/monitor-client.js` | Same-origin resource poller |
| `lib/client-main.js` | Presence detection, persistence, layout tracking, and overlay registration |
| `lib/host-monitor.js` | Optional Host CPU/GPU/memory sampler and HTTP route |
| `lib/index.js` | Host entry point; failure to load the optional Host half does not disable the timer |

After changing any `lib/*.js` source file, regenerate the bundle and verify it:

```sh
node build.mjs
node build.mjs --check
```

The atlas source can be regenerated from the vendored WebP with:

```sh
node build-atlas.mjs
```

## Verification

The checks use Node directly and do not require a build framework:

```sh
node verify/core.test.mjs
node verify/monitor.test.mjs
node verify/widget-smoke.mjs
node verify/whale.test.mjs
node verify/notify-smoke.mjs
node verify/auto-repeat-smoke.mjs
node verify/strict-smoke.mjs
node verify/integration-smoke.mjs
node verify/render-smoke.mjs
node verify/mutation.mjs
node audit-tokens.mjs
node build.mjs --check
```

`render-smoke.mjs` requires a local Chromium or Edge executable and `playwright-core`. When no supported browser is available, it prints an explicit skip reason; a skipped browser test is not a passing rendering test. It can also save light- and dark-theme screenshots with `--screenshots <directory>`.

## How timing works

Elapsed time is derived from timestamps rather than incremented once per timer callback. Delayed browser timers therefore do not accumulate clock drift. The page being hidden or the window losing focus freezes the counted segment; typing, drafts, and model generation do not. Sending a message resets the round. Refreshing restores the saved snapshot and re-anchors an active timer, without charging offline time.

## Notifications and sound

At the deadline, the plugin can send a browser `Notification` and play a short synthesized sound using Web Audio. The two settings are independent. The first user gesture may request notification permission when notifications are enabled. The sound is generated at runtime; no audio file is bundled. In Electron desktop mode, the operating system notification may be silent, so the plugin's own chime is used for audio feedback.

## Privacy and limitations

- Preferences and timer state are stored in the browser's `localStorage`.
- The plugin does not send usage or resource data to a remote service. Resource samples are collected by the local Host half and returned through a same-origin route.
- Per-conversation CPU/GPU utilization is not available: model inference runs remotely, and the local process can only report machine-level resources.
- GPU utilization and temperature require an NVIDIA GPU and an accessible `nvidia-smi`. Missing readings are displayed as unavailable.
- “Model is generating” is a DOM-based heuristic because the official client does not expose a streaming-state event to this overlay. It affects only the status indicator, not timer accounting.
- Session titles and running/pending status are read from the official session hooks. Per-session elapsed time is measured from the observed running/pending transition and persisted locally; it is not the official turn timeline.
- Browser throttling can delay visual updates in background tabs, but timestamp-based accounting prevents the timer from drifting.

## Third-party assets and acknowledgements

- The pixel-whale atlas and code phrases come from `@deepseek-ai/dsh-client-ui-brand-official` (MIT). The vendored WebP is unchanged.
- The notification and sound implementation was informed by `@dingyi222666/dsh-session-notification` (BSD-3-Clause).

## License

MIT
