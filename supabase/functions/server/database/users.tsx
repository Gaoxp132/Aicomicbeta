/**
 * User Management Functions
 * 
 * CACHE BUSTER: v4.2.4_STANDALONE_2026-01-27_004
 * FIX: 内联 getBeijingTime 函数，避免模块导入问题
 */

// 🔥 CACHE BUSTER - Force recompilation
export const USERS_MODULE_VERSION = 'v4.2.4_STANDALONE_2026-01-27_004';

import { supabase } from './client.tsx';

/**
 * 获取当前北京时间（内联实现，避免模块导入问题）
 * @returns 北京时间的ISO字符串
 */
function getBeijingTime(): string {
  const now = new Date();
  // 转换为北京时间（UTC+8）
  const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return beijingTime.toISOString();
}

// ==================== 用户操作 ====================

export async function getOrCreateUser(phone: string, nickname?: string, avatar?: string) {
  try {
    // 先查询用户是否存在
    const { data: existingUser, error: queryError } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .single();

    if (existingUser) {
      // 如果用户存在且提供了更新信息，则更新
      if (nickname || avatar) {
        const updateData: any = { updated_at: getBeijingTime() };
        if (nickname) updateData.nickname = nickname;
        if (avatar) updateData.avatar_url = avatar;

        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update(updateData)
          .eq('phone', phone)
          .select()
          .single();

        if (updateError) throw updateError;
        return updatedUser;
      }
      return existingUser;
    }

    // 用户不存在，创建新用户
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{
        phone,
        nickname: nickname || generateChineseNickname(),
        avatar_url: avatar || '',
      }])
      .select()
      .single();

    if (createError) throw createError;
    return newUser;
  } catch (error) {
    console.error('Error in getOrCreateUser:', error);
    throw error;
  }
}

export async function updateUserProfile(phone: string, nickname?: string, avatar?: string) {
  try {
    const updateData: any = { updated_at: getBeijingTime() };
    if (nickname) updateData.nickname = nickname;
    if (avatar) updateData.avatar_url = avatar;

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('phone', phone)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
}

export async function getUserProfile(phone: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
}

/**
 * 生成中文昵称
 * @returns 随机生成的中文昵称
 */
function generateChineseNickname(): string {
  const adjectives = ['快乐的', '勇敢的', '智慧的', '可爱的', '善良的', '热情的', '阳光的', '活力的'];
  const nouns = ['小熊', '小兔', '小鸟', '小鹿', '小狐', '小猫', '小虎', '小龙'];
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000);
  
  return `${adj}${noun}${num}`;
}
