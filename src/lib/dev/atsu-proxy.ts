/**
 * Dev-only local CORS proxy for atsu.moe (which sends no CORS headers).
 *
 * Node-only module — imported dynamically from `src/instrumentation.ts` on the Node.js runtime so
 * the Edge runtime never compiles these `node:` imports. Never runs in the packaged build
 * (`output: export` has no runtime server).
 */
import http from "node:http";
import https from "node:https";

const ATSU_DEV_PROXY_PORT = 4790;

let started = false;

export function startAtsuDevProxy() {
  if (started) return;
  started = true;

  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    let upstream: URL;
    try {
      upstream = new URL(req.url || "/", "https://atsu.moe");
    } catch {
      res.writeHead(400);
      res.end("Bad upstream URL");
      return;
    }

    const headers: Record<string, string> = {
      Accept: (req.headers["accept"] as string) || "application/json",
      Referer: "https://atsu.moe",
      "User-Agent": (req.headers["user-agent"] as string) || "Mozilla/5.0",
    };
    if (req.headers["content-type"]) {
      headers["Content-Type"] = req.headers["content-type"] as string;
    }

    const proxyReq = https.request(
      upstream,
      { method: req.method, headers },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, {
          "Content-Type": proxyRes.headers["content-type"] || "application/json",
        });
        proxyRes.pipe(res);
      },
    );

    proxyReq.on("error", (err) => {
      res.writeHead(502);
      res.end(JSON.stringify({ error: String(err) }));
    });

    req.pipe(proxyReq);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") return; // another dev worker already bound it
    console.error("[atsu-dev-proxy] error:", err);
  });

  server.listen(ATSU_DEV_PROXY_PORT, "127.0.0.1", () => {
    console.log(
      `[atsu-dev-proxy] http://127.0.0.1:${ATSU_DEV_PROXY_PORT} -> https://atsu.moe (dev CORS shim)`,
    );
  });
}
