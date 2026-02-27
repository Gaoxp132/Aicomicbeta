/**
 * Hono 服务器 — 本地开发入口 (非部署用)
 *
 * 注意: 此文件仅用于本地 `deno run` 开发调试。
 * 生产部署入口在 /supabase/functions/make-server-fc31472c/index.ts
 *
 * 重要: 此文件不能命名为 index.ts(x)，否则 Supabase 会将 /server/ 目录
 * 误识别为独立 Edge Function 进行部署，导致构建失败。
 *
 * 用法: deno run --allow-net --allow-env dev_entry.tsx
 */

import { Hono } from "npm:hono@4.0.2";
import { cors } from "npm:hono@4.0.2/cors";

const VERSION = "v6.0.77-dev";
const PREFIX = "/make-server-fc31472c";

console.log(`[DevEntry] ${VERSION} — starting local dev server...`);

let app: Hono;

try {
  const mod = await import("./app.tsx");
  if (mod.default && typeof mod.default.fetch === "function") {
    app = mod.default;
    console.log(`[DevEntry] ${VERSION} — app.tsx loaded successfully`);
  } else {
    throw new Error("app.tsx default export is not a valid Hono app (missing .fetch method)");
  }
} catch (err: unknown) {
  const errMsg = err instanceof Error ? err.message : String(err);
  const errStack = err instanceof Error ? err.stack : undefined;
  console.error(`[DevEntry] FATAL — app.tsx failed to load:`, errMsg);
  if (errStack) console.error(`[DevEntry] Stack:`, errStack.substring(0, 500));

  app = new Hono();
  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
      allowHeaders: ["Content-Type", "Authorization", "X-User-Phone"],
    })
  );

  app.get(`${PREFIX}/health`, (c) =>
    c.json({
      status: "degraded",
      version: VERSION,
      error: "app.tsx failed to load: " + errMsg,
      timestamp: new Date().toISOString(),
      mode: "dev-fallback",
    })
  );

  app.all("*", (c) =>
    c.json(
      {
        success: false,
        error: "Dev server fallback — app.tsx failed to load",
        message: errMsg,
        version: VERSION,
        path: c.req.path,
      },
      503
    )
  );
}

Deno.serve((req: Request) => app.fetch(req));