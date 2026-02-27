/**
 * Supabase Edge Function 入口文件 — /server/ 目录
 * v6.0.132: video-proxy三层修复——timeout增大+DB fallback扩展所有URL+bulk-refresh OSS HEAD验证
 *
 * 此文件是 Figma Make 平台实际部署的 Edge Function 入口。
 * 前端请求 /functions/v1/make-server-fc31472c/<route> 由此文件接收并路由到 app.tsx。
 *
 * REBUILD_HASH: rf_20260216_v6040_fix_thumbnail_mp4_resolution
 * DEPLOY_TS: 2026-02-16T23:59:50Z
 */

import { Hono } from "npm:hono@4.0.2";
import { cors } from "npm:hono@4.0.2/cors";

const VERSION = "v6.0.132";
const PREFIX = "/make-server-fc31472c";

console.log(`[Entry:server] ${VERSION} — starting...`);

let app: Hono;

try {
  const mod = await import("./app.tsx");
  if (mod.default && typeof mod.default.fetch === "function") {
    app = mod.default;
    console.log(`[Entry:server] ${VERSION} — app.tsx loaded successfully`);
  } else {
    throw new Error("app.tsx default export is not a valid Hono app");
  }
} catch (err: unknown) {
  const errMsg = err instanceof Error ? err.message : String(err);
  const errStack = err instanceof Error ? err.stack : undefined;
  console.error(`[Entry:server] FATAL — app.tsx failed:`, errMsg);
  if (errStack) console.error(`[Entry:server] Stack:`, errStack.substring(0, 500));

  app = new Hono();
  app.use("*", cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allowHeaders: ["Content-Type", "Authorization", "X-User-Phone"],
  }));

  app.get(`${PREFIX}/health`, (c) =>
    c.json({
      status: "degraded",
      version: VERSION,
      error: "app.tsx failed: " + errMsg,
      timestamp: new Date().toISOString(),
      mode: "fallback",
    })
  );

  app.get(`${PREFIX}/deploy-verify`, (c) =>
    c.json({
      status: "error",
      version: VERSION,
      timestamp: new Date().toISOString(),
      error: errMsg,
      stack: errStack?.substring(0, 300) || "",
    })
  );

  app.all("*", (c) =>
    c.json(
      {
        success: false,
        error: "Server fallback — app.tsx failed to load",
        message: errMsg,
        version: VERSION,
        path: c.req.path,
      },
      503
    )
  );
}

// v6.0.122: 包装 app.fetch 捕获 Deno TCP层 "send was called before connect" 等断连错误
Deno.serve((req: Request) =>
  app.fetch(req).catch((err: unknown) => {
    const msg = String(err);
    if (
      msg.includes('send was called before connect') ||
      msg.includes('connection closed') ||
      msg.includes('Broken pipe') ||
      msg.includes('broken pipe') ||
      msg.includes('Connection reset by peer')
    ) {
      // 客户端已断开接，无需发送响应
      return new Response('', { status: 200 });
    }
    console.error('[Entry:server] Unhandled fetch error:', msg);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  })
);