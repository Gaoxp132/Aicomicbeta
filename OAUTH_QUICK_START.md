# 🚀 OAuth 快速配置（5分钟完成）

## ✅ 已完成的工作

1. ✅ 创建了 `SocialLoginButtons` 组件
2. ✅ 创建了 `AuthCallback` 处理页面
3. ✅ 集成到 `LoginDialog` 登录对话框
4. ✅ 创建了测试页面 `/oauth-test.html`
5. ✅ 创建了配置检查工具

## 🎯 现在需要做的（3步）

### 步骤 1：在 Supabase 配置 Google OAuth（2分钟）

1. **获取 Google OAuth 凭据**
   - 访问：https://console.cloud.google.com/apis/credentials
   - 创建 OAuth 2.0 客户端 ID
   - **重定向 URI**: `https://cjjbxfzwjhnuwkqsntop.supabase.co/auth/v1/callback`

2. **在 Supabase 中配置**
   - 访问：https://supabase.com/dashboard/project/cjjbxfzwjhnuwkqsntop/auth/providers
   - 找到 **Google** → 点击展开
   - 粘贴 Client ID 和 Client Secret
   - 点击 **Enable** → **Save**

### 步骤 2：在 Supabase 配置 GitHub OAuth（2分钟）

1. **获取 GitHub OAuth 凭据**
   - 访问：https://github.com/settings/developers
   - New OAuth App
   - **Authorization callback URL**: `https://cjjbxfzwjhnuwkqsntop.supabase.co/auth/v1/callback`

2. **在 Supabase 中配置**
   - 访问：https://supabase.com/dashboard/project/cjjbxfzwjhnuwkqsntop/auth/providers
   - 找到 **GitHub** → 点击展开
   - 粘贴 Client ID 和 Client Secret
   - 点击 **Enable** → **Save**

### 步骤 3：配置重定向 URL（1分钟）

访问：https://supabase.com/dashboard/project/cjjbxfzwjhnuwkqsntop/auth/url-configuration

添加以下 URL：
```
http://localhost:5173/auth/callback
https://your-production-domain.com/auth/callback
```

## 🧪 测试

### 方式 1：使用测试页面
```bash
# 在浏览器打开
/oauth-test.html
```

### 方式 2：在控制台测试
```javascript
// F12 打开控制台，运行：
checkOAuthConfig()
```

### 方式 3：在应用中测试
1. 点击登录按钮
2. 选择 "使用 Google 登录" 或 "使用 GitHub 登录"
3. 授权后应自动跳转回应用

## 🐛 常见问题

### ❌ Error: Provider is not enabled

**解决**：在 Supabase Dashboard 中启用对应的 Provider

### ❌ Error: redirect_uri_mismatch

**解决**：检查重定向 URI 必须是：
```
https://cjjbxfzwjhnuwkqsntop.supabase.co/auth/v1/callback
```

### ❌ CORS 错误

**解决**：在 Supabase URL Configuration 中添加你的域名

## 📊 配置检查清单

- [ ] Google OAuth Client ID 已获取
- [ ] Google OAuth 在 Supabase 中已启用
- [ ] GitHub OAuth Client ID 已获取
- [ ] GitHub OAuth 在 Supabase 中已启用
- [ ] Redirect URLs 已配置
- [ ] 测试 Google 登录成功
- [ ] 测试 GitHub 登录成功

## 🎉 完成！

配置完成后：
- 用户可以使用 Google/GitHub 登录
- 登录信息自动保存到 localStorage
- 兼容现有的手机号登录系统

## 📚 详细文档

查看完整配置指南：`/OAUTH_SETUP_GUIDE.md`

---

**有问题？** 在控制台运行 `checkOAuthConfig()` 获取诊断信息
