/**
 * 用户任务列表Handler
 * 从 video/task_query.tsx 提取 getUserTasks 函数
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";

/**
 * 获取用户的视频任务列表
 */
export async function getUserTasks(c: Context) {
  try {
    const userPhone = c.req.query("userPhone");
    if (!userPhone) {
      return c.json({
        success: true,
        tasks: [],
        total: 0,
        message: "请先登录",
      });
    }

    const page = parseInt(c.req.query("page_num") || "1");
    const pageSize = parseInt(c.req.query("page_size") || "20");

    const result = await db.getUserVideoTasks(userPhone, page, pageSize);

    return c.json({
      success: true,
      tasks: result.tasks,
      total: result.total,
    });
  } catch (error: any) {
    console.error("Error fetching tasks:", error);
    return c.json({
      success: true,
      tasks: [],
      total: 0,
      error: error.message,
    });
  }
}
