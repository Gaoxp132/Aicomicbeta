# 🔐 OAuth 社交登录完整配置指南

## 📋 目录
1. [Google OAuth 配置](#google-oauth-配置)
2. [GitHub OAuth 配置](#github-oauth-配置)
3. [微信 OAuth 配置](#微信-oauth-配置)
4. [Supabase 配置](#supabase-配置)
5. [测试指南](#测试指南)

---

## 🎯 Google OAuth 配置

### 步骤 1：创建 Google Cloud 项目

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 项目名称：`AI漫剧创作应用`

### 步骤 2：启用 Google+ API

1. 导航到 **APIs & Services** → **Library**
2. 搜索 **Google+ API**
3. 点击 **Enable**

### 步骤 3：创建 OAuth 凭据

1. 导航到 **APIs & Services** → **Credentials**
2. 点击 **+ CREATE CREDENTIALS** → **OAuth client ID**
3. 应用类型：**Web application**
4. 名称：`AI漫剧创作 - Web Client`

5. **授权的 JavaScript 来源**：
   ```
   http://localhost:5173
   https://your-app-domain.com
   ```

6. **授权的重定向 URI**：
   ```
   https://cjjbxfzwjhnuwkqsntop.supabase.co/auth/v1/callback
   ```

7. 点击 **CREATE**，保存以下信息：
   - **Client ID**: `YOUR_GOOGLE_CLIENT_ID`
   - **Client Secret**: `YOUR_GOOGLE_CLIENT_SECRET`

### 步骤 4：在 Supabase 中配置

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目：`cjjbxfzwjhnuwkqsntop`
3. 导航到 **Authentication** → **Providers**
4. 找到 **Google**，点击展开
5. 输入：
   - **Client ID**: `YOUR_GOOGLE_CLIENT_ID`
   - **Client Secret**: `YOUR_GOOGLE_CLIENT_SECRET`
6. 启用 **Google enabled**
7. 点击 **Save**

---

## 🐙 GitHub OAuth 配置

### 步骤 1：创建 GitHub OAuth App

1. 访问 [GitHub Developer Settings](https://github.com/settings/developers)
2. 点击 **New OAuth App**

### 步骤 2：填写应用信息

- **Application name**: `AI漫剧创作应用`
- **Homepage URL**: `https://your-app-domain.com`
- **Application description**: `AI驱动的短剧视频创作工具`
- **Authorization callback URL**:
  ```
  https://cjjbxfzwjhnuwkqsntop.supabase.co/auth/v1/callback
  ```

### 步骤 3：获取凭据

1. 点击 **Register application**
2. 保存以下信息：
   - **Client ID**: `YOUR_GITHUB_CLIENT_ID`
   - **Client Secret**: 点击 **Generate a new client secret**，保存密钥

### 步骤 4：在 Supabase 中配置

1. 打开 Supabase Dashboard
2. 导航到 **Authentication** → **Providers**
3. 找到 **GitHub**，点击展开
4. 输入：
   - **Client ID**: `YOUR_GITHUB_CLIENT_ID`
   - **Client Secret**: `YOUR_GITHUB_CLIENT_SECRET`
5. 启用 **GitHub enabled**
6. 点击 **Save**

---

## 💬 微信 OAuth 配置（仅适用于中国大陆）

### ⚠️ 前提条件

- 需要已认证的**微信公众号**或**微信开放平台账号**
- 企业或个体工商户资质
- 审核周期：3-7个工作日

### 步骤 1：注册微信开放平台

1. 访问 [微信开放平台](https://open.weixin.qq.com/)
2. 注册并完成开发者认证（需要企业资质）

### 步骤 2：创建网站应用

1. 登录微信开放平台
2. 管理中心 → 网站应用 → 创建应用
3. 填写应用信息：
   - **应用名称**：AI漫剧创作应用
   - **应用简介**：AI驱动的短剧视频创作工具
   - **应用官网**：https://your-app-domain.com

4. 授权回调域：
   ```
   cjjbxfzwjhnuwkqsntop.supabase.co
   ```

### 步骤 3：获取凭据

提交审核后，获取：
- **AppID**: `wx1234567890abcdef`
- **AppSecret**: `YOUR_WECHAT_APP_SECRET`

### 步骤 4：自定义 Supabase Provider

微信登录需要自定义实现，因为 Supabase 原生不支持。需要：

1. 在后端创建微信 OAuth 处理路由
2. 参考文档：[微信网页授权](https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/Wechat_webpage_authorization.html)

**代码示例**（需要在 Edge Function 中实现）：
```typescript
// /supabase/functions/server/routes/auth/wechat.tsx
export async function wechatOAuthCallback(c: Context) {
  const code = c.req.query('code');
  
  // 1. 用code换取access_token
  const tokenResponse = await fetch(
    `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${WECHAT_APP_ID}&secret=${WECHAT_APP_SECRET}&code=${code}&grant_type=authorization_code`
  );
  
  const { access_token, openid } = await tokenResponse.json();
  
  // 2. 获取用户信息
  const userResponse = await fetch(
    `https://api.weixin.qq.com/sns/userinfo?access_token=${access_token}&openid=${openid}`
  );
  
  const userInfo = await userResponse.json();
  
  // 3. 创建或登录用户
  // ... 保存到数据库
}
```

---

## ⚙️ Supabase 配置

### 完整的 Supabase Auth 设置

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard/project/cjjbxfzwjhnuwkqsntop/auth/providers)

2. **Site URL** 设置：
   ```
   https://your-app-domain.com
   ```

3. **Redirect URLs** 添加（允许的回调地址）：
   ```
   http://localhost:5173/auth/callback
   https://your-app-domain.com/auth/callback
   ```

4. **Email Auth** 配置：
   - 启用 **Confirm email**（可选）
   - 禁用 **Secure email change**（开发阶段）

5. **Providers** 启用：
   - ✅ Email
   - ✅ Google
   - ✅ GitHub
   - ⏸️ WeChat（需自定义实现）

---

## 🧪 测试指南

### 本地测试

1. 启动开发服务器：
   ```bash
   npm run dev
   ```

2. 访问应用，点击登录

3. 尝试以下登录方式：
   - ✅ **手机号登录**（已实现）
   - ✅ **Google 登录**
   - ✅ **GitHub 登录**

### 测试 OAuth 流程

1. 点击 **使用 Google 登录**
2. 跳转到 Google 授权页面
3. 授权后自动跳转回 `/auth/callback`
4. 处理成功后跳转回首页
5. 检查 localStorage：
   ```javascript
   localStorage.getItem('userEmail')
   localStorage.getItem('userId')
   localStorage.getItem('authProvider')
   ```

### 常见问题排查

#### 1. **重定向 URI 不匹配**

**错误**：`redirect_uri_mismatch`

**解决**：
- 检查 Google/GitHub OAuth 配置中的 Redirect URI
- 必须完全匹配：`https://cjjbxfzwjhnuwkqsntop.supabase.co/auth/v1/callback`

#### 2. **CORS 错误**

**错误**：`Access to fetch at ... has been blocked by CORS policy`

**解决**：
- 在 Supabase Dashboard → Authentication → URL Configuration
- 添加你的域名到 **Site URL** 和 **Redirect URLs**

#### 3. **Provider not enabled**

**错误**：`Provider is not enabled`

**解决**：
- 检查 Supabase Dashboard → Authentication → Providers
- 确保对应的 Provider 已启用并保存

---

## 📊 数据库用户表更新

OAuth 登录后，用户数据存储在 Supabase Auth 系统中，需要同步到你的数据库：

### 创建用户同步触发器（可选）

```sql
-- 在 Supabase SQL Editor 中执行

-- 创建用户扩展信息表
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  provider TEXT, -- 'phone', 'google', 'github', 'wechat'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- 用户只能读写自己的数据
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- 自动创建 profile 的触发器
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, provider, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_app_meta_data->>'provider',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## 🚀 上线前检查清单

- [ ] Google OAuth 配置完成并测试
- [ ] GitHub OAuth 配置完成并测试
- [ ] Supabase Redirect URLs 包含生产域名
- [ ] 生产环境的 Client ID/Secret 已更新
- [ ] 用户数据同步到自定义表
- [ ] 隐私政策和服务条款页面已创建
- [ ] OAuth 回调页面正常工作
- [ ] 错误处理和日志完善

---

## 📚 相关文档

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [GitHub OAuth Apps](https://docs.github.com/en/apps/oauth-apps)
- [微信开放平台文档](https://developers.weixin.qq.com/doc/)

---

## 💡 下一步优化

1. **添加邮箱+密码登录**
2. **实现手机验证码登录**
3. **支持苹果登录（Apple Sign In）**
4. **双因素认证（2FA）**
5. **账号绑定（绑定多个登录方式）**

---

**配置完成后，记得在应用中测试所有登录方式！** ✅
