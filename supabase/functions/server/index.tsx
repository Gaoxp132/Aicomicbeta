/**
 * Hono 服务器入口
 * 版本：v4.2.53
 * 最后更新：2026-02-02 - 禁用直连PG（临时），强制使用稳定的REST API
 * 
 * 缓存破坏符：DISABLE_DIRECT_PG_V53
 */

import { Hono } from 'npm:hono@4.0.2';