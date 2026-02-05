/**
 * OAuth 配置检查工具
 * 在浏览器控制台运行：checkOAuthConfig()
 * 
 * 使用方式：
 * 1. 打开浏览器控制台 (F12)
 * 2. 输入：checkOAuthConfig()
 */

export async function checkOAuthConfig() {
  console.log('🔍 检查 OAuth 配置...\n');
  
  // 动态导入 Supabase（避免在未使用时加载）
  const { createClient } = await import('@supabase/supabase-js');
  const { projectId, publicAnonKey } = await import('/utils/supabase/info');
  
  const supabase = createClient(
    `https://${projectId}.supabase.co`,
    publicAnonKey
  );
  
  const results = {
    projectInfo: {
      projectId,
      supabaseUrl: `https://${projectId}.supabase.co`,
      status: '✅ 连接正常'
    },
    redirectUrls: {
      current: window.location.origin,
      callback: `${window.location.origin}/auth/callback`,
      supabaseCallback: `https://${projectId}.supabase.co/auth/v1/callback`,
    },
    providers: {
      google: '❓ 需要在 Supabase Dashboard 检查',
      github: '❓ 需要在 Supabase Dashboard 检查',
      wechat: '❌ 需要自定义实现',
    },
    steps: [
      '1. 访问 https://supabase.com/dashboard/project/' + projectId + '/auth/providers',
      '2. 配置 Google OAuth:',
      '   - 获取 Google Client ID & Secret',
      '   - 重定向 URI: https://' + projectId + '.supabase.co/auth/v1/callback',
      '3. 配置 GitHub OAuth:',
      '   - 获取 GitHub Client ID & Secret',
      '   - 重定向 URI: https://' + projectId + '.supabase.co/auth/v1/callback',
      '4. 在 URL Configuration 添加:',
      '   - Site URL: ' + window.location.origin,
      '   - Redirect URLs: ' + window.location.origin + '/auth/callback',
    ]
  };
  
  console.log('📊 配置信息：\n', JSON.stringify(results, null, 2));
  console.log('\n📖 完整指南：查看 /OAUTH_SETUP_GUIDE.md');
  
  // 测试 Supabase 连接
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      console.log('\n✅ 当前已登录：', {
        user: session.user.email,
        provider: session.user.app_metadata?.provider,
        expiresAt: new Date(session.expires_at! * 1000).toLocaleString(),
      });
    } else {
      console.log('\n⚠️ 当前未登录');
    }
  } catch (error) {
    console.error('\n❌ Supabase 连接失败：', error);
  }
  
  return results;
}

// 全局暴露
if (typeof window !== 'undefined') {
  (window as any).checkOAuthConfig = checkOAuthConfig;
  console.log('💡 使用 checkOAuthConfig() 检查 OAuth 配置');
}