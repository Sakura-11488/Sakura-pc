/**
 * Runs when the Next server boots.
 *
 * Some upstream content APIs (e.g. atsu.moe) send no CORS headers, so they work inside the
 * packaged Electron app (CORS is injected in electron/main.js) but are blocked by the browser
 * during `next dev`. In development we start a tiny local pass-through proxy that adds permissive
 * CORS headers. With `output: export` there is no runtime server, so this never affects the
 * shipped desktop/mobile builds.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "development") return;

  const { startAtsuDevProxy } = await import("./lib/dev/atsu-proxy");
  startAtsuDevProxy();
}
