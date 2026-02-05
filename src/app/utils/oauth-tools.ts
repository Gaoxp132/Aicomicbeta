/**
 * OAuth 调试工具 - 全局暴露
 * 这个文件在开发时自动加载，提供控制台调试工具
 */

// 延迟加载工具函数，避免影响主应用性能
if (typeof window !== 'undefined') {
  // 在全局作用域暴露工具函数
  (window as any).checkOAuthConfig = async () => {
    const { checkOAuthConfig } = await import('./check-oauth-config');
    return checkOAuthConfig();
  };
  
  console.log('🔧 OAuth 调试工具已加载');
  console.log('💡 运行 checkOAuthConfig() 检查 OAuth 配置');
}

export {};
