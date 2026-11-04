/**
 * dsh-focus-island — Host half.
 *
 * The feature is nearly all browser-side (a floating countdown in the page's
 * `shell.overlay`). The only privileged part is the OPTIONAL system-resource
 * extension: sampling CPU / GPU / memory / temperature needs Node, and the page
 * can only reach it through a same-origin HTTP route.
 *
 * This half is deliberately inert: if the resource sampler cannot load or the
 * runtime has no webServer, the client half keeps working on its own.
 *
 * @module dsh-focus-island
 */

/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export const name = 'dsh-focus-island'

/** Bounded log helper: a broken logger never breaks the plugin. */
function warn(ctx, message) {
  try {
    const logger = ctx === null || ctx === undefined ? undefined : ctx.logger
    if (logger !== undefined && logger !== null && typeof logger.warn === 'function') {
      logger.warn(`[dsh-focus-island] ${message}`)
    }
  } catch {
    /* logging is best-effort */
  }
}

/**
 * Mount the optional resource route.
 *
 * The monitor module is imported lazily so a missing or broken optional file
 * degrades to "no resource readout" instead of failing the whole bundle row
 * (the client half ships in the same row and must always load).
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx Plugin context.
 * @returns {Promise<void>} Resolves once the route is (or is not) registered.
 */
export async function apply(ctx) {
  let monitor = null
  try {
    monitor = await import('./host-monitor.js')
  } catch (error) {
    warn(ctx, `resource monitor unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  if (monitor === null || typeof monitor.registerResourceMonitor !== 'function') return

  /** Register against a context whose `webServer` is available. */
  const mount = (scope) => {
    try {
      const handle = monitor.registerResourceMonitor(scope)
      if (handle !== null && handle !== undefined && typeof handle.dispose === 'function') {
        ctx.effect(() => () => {
          try {
            handle.dispose()
          } catch {
            /* disposal is best-effort */
          }
        })
      }
    } catch (error) {
      warn(ctx, `resource monitor mount failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /* A profile may activate this row before the webserver service exists, and a
   * strict `ctx.get('webServer')` read would then degrade to "no resources".
   * Wait for the service the way the harness expects instead of racing it. */
  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['webServer'], (child) => {
        mount(child)
      })
      return
    } catch (error) {
      warn(ctx, `inject(webServer) failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  mount(ctx)
}
