/**
 * 手机号工具函数
 * 统一处理手机号的脱敏显示和真实值管理
 */

/**
 * 脱敏手机号 - 仅用于显示
 * @param phone 真实手机号
 * @returns 脱敏后的号码，例如：185****1136
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length !== 11) {
    return phone;
  }
  return `${phone.substring(0, 3)}****${phone.substring(7)}`;
}

/**
 * 验证手机号格式
 * @param phone 待验证的手机号
 * @returns 是否为有效的中国大陆手机号
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
}

/**
 * 从localStorage获取真实手机号（用于API调用）
 * @returns 真实手机号或空字符串
 */
export function getRealPhoneNumber(): string {
  return localStorage.getItem('userPhone') || '';
}

/**
 * 从localStorage获取显示用的脱敏手机号
 * @returns 脱敏后的手机号或空字符串
 */
export function getDisplayPhoneNumber(): string {
  const realPhone = getRealPhoneNumber();
  return realPhone ? maskPhone(realPhone) : '';
}

/**
 * 保存手机号到localStorage
 * @param phone 真实手机号（11位）
 */
export function savePhoneNumber(phone: string): void {
  if (!isValidPhone(phone)) {
    console.warn('[PhoneUtils] ⚠️ Invalid phone number format:', phone);
    return;
  }
  localStorage.setItem('userPhone', phone);
  console.log('[PhoneUtils] ✅ Phone number saved:', maskPhone(phone));
}

/**
 * 清除保存的手机号
 */
export function clearPhoneNumber(): void {
  localStorage.removeItem('userPhone');
  localStorage.removeItem('loginTime');
  console.log('[PhoneUtils] ✅ Phone number cleared');
}

/**
 * 检查是否已登录（有有效的手机号）
 * @returns 是否已登录
 */
export function isLoggedIn(): boolean {
  const phone = getRealPhoneNumber();
  return isValidPhone(phone);
}
