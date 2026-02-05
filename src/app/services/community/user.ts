import { apiGet, apiPost, apiPut } from '../../utils/apiClient';

// 生成中国风昵称
const SURNAMES = ['李', '王', '张', '刘', '陈', '杨', '黄', '赵', '周', '吴'];
const GIVEN_NAMES = ['明', '华', '强', '伟', '芳', '娜', '秀英', '敏', '静', '丽'];

export function generateChineseNickname(): string {
  const surname = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
  const givenName = GIVEN_NAMES[Math.floor(Math.random() * GIVEN_NAMES.length)];
  return `${surname}${givenName}`;
}

/**
 * 获取用户资料
 */
export async function getUserProfile(userPhone: string) {
  try {
    const response = await apiGet(`/user/profile/${userPhone}`);
    
    console.log('[getUserProfile] API response:', response);
    
    // 🔧 修复：确保返回一致的格式
    if (response && response.success) {
      return {
        success: true,
        user: response.user,
      };
    }
    
    return {
      success: false,
      error: response?.error || 'Failed to fetch user profile',
    };
  } catch (error: any) {
    console.error('[getUserProfile] Error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 创建或更新用户资料（用于登录）
 */
export async function createOrUpdateUser(phone: string, nickname?: string, avatar?: string) {
  try {
    const response = await apiPost('/user/profile', {
      phone,
      nickname: nickname || generateChineseNickname(),
      avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${phone}`,
    });
    
    if (response.success) {
      return response.data;
    }
    
    return {
      success: false,
      error: response.error,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 🆕 更新用户昵称
 */
export async function updateUserNickname(userPhone: string, nickname: string) {
  try {
    const response = await apiPut(`/user/profile/${userPhone}/nickname`, {
      nickname,
    });
    
    if (response.success) {
      return {
        success: true,
        user: response.user,
      };
    }
    
    return {
      success: false,
      error: response.error,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}