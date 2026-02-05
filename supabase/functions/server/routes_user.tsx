import type { Hono } from "npm:hono";
import * as db from "./database/index.tsx";
import { createDualRouteRegistrar } from "./utils.tsx";

export function registerUserRoutes(app: Hono) {
  
  const register = createDualRouteRegistrar(app);
  
  // 用户登录/注册 - 简化版本，通过手机号自动创建或获取用户
  register('post', '/user/login', async (c) => {
    try {
      const { phone } = await c.req.json();
      
      if (!phone) {
        return c.json({ error: "手机号不能为空" }, 400);
      }
      
      // 自动创建或获取用户
      const user = await db.getOrCreateUser(phone);
      
      console.log('User logged in:', phone);
      return c.json({ success: true, user });
    } catch (error: any) {
      console.error('Error in user login:', error);
      return c.json({ error: "登录失败", message: error.message }, 500);
    }
  });
  
  // 创建或更新用户资料
  register('post', '/user/profile', async (c) => {
    try {
      const { phone, nickname, avatar } = await c.req.json();
      
      if (!phone) {
        return c.json({ error: "手机号不能为空" }, 400);
      }
      
      const user = await db.getOrCreateUser(phone, nickname, avatar);
      
      console.log('User profile updated:', phone);
      return c.json({ success: true, user });
    } catch (error: any) {
      console.error('Error updating user profile:', error);
      return c.json({ error: "更新用户资料失败", message: error.message }, 500);
    }
  });

  // 获取用户资料
  register('get', '/user/profile/:phone', async (c) => {
    try {
      const phone = c.req.param("phone");
      
      const user = await db.getUserProfile(phone);
      
      if (!user) {
        // 如果用户不存在，自动创建带中国风昵称的用户
        const newUser = await db.getOrCreateUser(phone);
        return c.json({ success: true, user: newUser });
      }
      
      return c.json({ success: true, user });
    } catch (error: any) {
      console.error('Error getting user profile:', error);
      return c.json({ error: "获取用户资料失败", message: error.message }, 500);
    }
  });

  // 🆕 更新用户昵称
  register('put', '/user/profile/:phone/nickname', async (c) => {
    try {
      const phone = c.req.param("phone");
      const { nickname } = await c.req.json();
      
      if (!phone) {
        return c.json({ error: "手机号不能为空" }, 400);
      }
      
      if (!nickname || nickname.trim() === '') {
        return c.json({ error: "昵称不能为空" }, 400);
      }
      
      // 昵称长度限制
      if (nickname.length > 20) {
        return c.json({ error: "昵称长度不能超过20个字符" }, 400);
      }
      
      console.log('[UpdateNickname] Updating nickname for:', phone, 'to:', nickname);
      
      const updatedUser = await db.updateUserProfile(phone, nickname);
      
      if (!updatedUser) {
        return c.json({ error: "更新昵称失败，用户不存在" }, 404);
      }
      
      console.log('[UpdateNickname] Nickname updated successfully');
      return c.json({ success: true, user: updatedUser });
    } catch (error: any) {
      console.error('[UpdateNickname] Error:', error);
      return c.json({ error: "更新昵称失败", message: error.message }, 500);
    }
  });
}