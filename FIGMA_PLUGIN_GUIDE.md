# 🎨 Figma 插件完整配置指南

## ✅ 已完成的工作

### 1. Figma 插件文件 (3个)
- ✅ `/figma-plugin/manifest.json` - 插件配置
- ✅ `/figma-plugin/code.ts` - 插件主逻辑
- ✅ `/figma-plugin/ui.html` - 插件UI界面

### 2. Supabase Edge Function 端点 (4个)
- ✅ `POST /make-server-fc31472c/figma/sync` - 同步 Figma 节点
- ✅ `POST /make-server-fc31472c/figma/create-series` - 创建漫剧系列
- ✅ `POST /make-server-fc31472c/figma/upload-image` - 上传图片
- ✅ `GET /make-server-fc31472c/figma/my-series` - 获取用户系列列表

### 3. OAuth 回调页面
- ✅ `/src/app/pages/FigmaAuthCallbackPage.tsx` - Figma OAuth 回调处理

---

## 🎯 下一步操作（你需要做的）

### 步骤 1：验证 Figma OAuth 配置（5分钟）

确认以下配置已完成：

1. **Figma Developers 应用设置**
   - 访问：https://www.figma.com/developers/apps
   - 确认 **Redirect URL** 包含：
     ```
     https://cjjbxfzwjhnuwkqsntop.supabase.co/auth/v1/callback
     ```
   - 确认 OAuth scopes 勾选：`current_user:read`

2. **Supabase Auth Provider 配置**
   - 访问：https://supabase.com/dashboard/project/cjjbxfzwjhnuwkqsntop/auth/providers
   - 确认 **Figma** Provider 已启用
   - Client ID 和 Secret 已填写

3. **Supabase URL Configuration**
   - 访问：https://supabase.com/dashboard/project/cjjbxfzwjhnuwkqsntop/auth/url-configuration
   - **Redirect URLs** 添加：
     ```
     http://localhost:5173/figma-auth
     https://your-app-domain.com/figma-auth
     ```

### 步骤 2：编译 Figma 插件（3分钟）

#### 安装 TypeScript 编译器（如果没有）
```bash
npm install -g typescript
```

#### 编译插件代码
```bash
cd figma-plugin
tsc code.ts --target es2020 --module commonjs --outDir ./
```

这会生成 `code.js` 文件。

#### 或者使用在线 TypeScript 编译器
1. 复制 `/figma-plugin/code.ts` 的内容
2. 访问：https://www.typescriptlang.org/play
3. 粘贴代码，编译后复制输出的 JS
4. 保存为 `code.js`

### 步骤 3：在 Figma 中加载插件（2分钟）

1. 打开 Figma 桌面应用
2. 菜单 → **Plugins** → **Development** → **Import plugin from manifest**
3. 选择 `/figma-plugin/manifest.json`
4. 插件安装成功！

---

## 🧪 测试插件

### 测试 1：打开插件
1. 在 Figma 中，菜单 → **Plugins** → **Development** → **AI漫剧创作 - Figma插件**
2. 插件界面应该正常显示

### 测试 2：Figma 登录
1. 点击 **使用 Figma 账号登录**
2. 新窗口应该打开 OAuth 登录页面
3. 授权后自动关闭窗口，返回插件
4. 应该显示用户信息

### 测试 3：创建漫剧
1. 输入标题和简介
2. 点击 **创建漫剧**
3. 应该提示创建成功

### 测试 4：同步图层
1. 在 Figma 中选中一些图层/Frame
2. 点击 **同步选中图层**
3. 应该提示同步成功

---

## 📊 插件功能列表

### 核心功能
- ✅ **Figma OAuth 登录** - 使用 Supabase Auth
- ✅ **创建漫剧系列** - 从 Figma 直接创建
- ✅ **同步选中图层** - 导出并上传到服务器
- ✅ **导出帧为图片** - 高清PNG导出
- ✅ **查看用户系列** - 列表展示

### 数据流
```
Figma Plugin UI 
  ↓ (用户操作)
Figma Plugin Code (code.ts)
  ↓ (HTTP Request + Bearer Token)
Supabase Edge Function (/make-server-fc31472c/figma/*)
  ↓ (验证 token + 数据库操作)
PostgreSQL Database
```

---

## 🔐 安全性

### Token 验证流程
```typescript
// 1. 插件获取 access_token（从 OAuth）
const accessToken = localStorage.getItem('figma_plugin_access_token');

// 2. 请求时携带 token
headers: {
  'Authorization': `Bearer ${accessToken}`
}

// 3. Edge Function 验证 token
const { data: { user }, error } = await supabase.auth.getUser(token);

// 4. 验证成功，执行操作
if (user) {
  // 允许访问
}
```

### 权限控制
- ✅ 插件只能访问已授权的 Figma 文件
- ✅ 所有 API 请求需要有效的 access_token
- ✅ Token 自动过期，需要重新登录
- ✅ 使用 HTTPS 加密传输

---

## 🛠️ 故障排查

### 问题 1: 插件无法加载
**症状**: Import plugin 时提示错误

**解决**:
1. 检查 `manifest.json` 语法是否正确
2. 确保 `code.js` 文件存在（编译后的）
3. 检查 `ui.html` 文件路径正确

### 问题 2: 登录窗口无法打开
**症状**: 点击登录按钮没反应

**解决**:
1. 检查浏览器是否阻止弹窗
2. 确认 loginUrl 配置正确
3. 查看浏览器控制台错误

### 问题 3: 登录后无法返回插件
**症状**: OAuth 成功但插件仍显示未登录

**解决**:
1. 检查 `window.opener.setAccessToken()` 是否正常调用
2. 确认 localStorage 是否存储了 token
3. 检查回调页面的 URL 是否正确

### 问题 4: API 请求失败
**症状**: 创建漫剧/同步图层时报错

**解决**:
1. 检查 Edge Function 是否部署成功
2. 确认 CORS 配置正确
3. 查看 Edge Function 日志
4. 检查 token 是否有效

---

## 📁 文件结构

```
/figma-plugin/
├── manifest.json          # 插件配置文件
├── code.ts               # 插件主逻辑（TypeScript）
├── code.js               # 编译后的 JS（需要生成）
└── ui.html               # 插件 UI 界面

/supabase/functions/server/
├── routes/
│   ├── figma.tsx         # Figma 路由注册
│   └── handlers/
│       └── figma_plugin.tsx  # Figma API 处理器

/src/app/pages/
└── FigmaAuthCallbackPage.tsx  # OAuth 回调页面
```

---

## 🚀 发布插件

### 私有使用（开发模式）
当前配置已足够，只需要：
1. 编译 TypeScript
2. 在 Figma 中导入插件
3. 开始使用

### 公开发布到 Figma Community
如需发布到 Figma 插件市场：

1. **完善插件信息**
   - 在 Figma Developers 添加图标、描述、截图
   - 编写详细的使用说明

2. **测试**
   - 确保所有功能正常
   - 测试不同场景

3. **提交审核**
   - 在 Figma Developers 提交插件
   - 等待审核（通常1-2周）

---

## 🔧 进阶配置

### 添加更多功能
可以扩展插件支持：
- 批量导出多个 Frame
- 自动生成分镜脚本
- AI 辅助设计建议
- 与团队协作功能

### 自定义样式
修改 `ui.html` 中的 CSS：
```css
.header {
  background: linear-gradient(135deg, #your-color-1 0%, #your-color-2 100%);
}
```

### 添加新的 API 端点
在 `/supabase/functions/server/routes/handlers/figma_plugin.tsx` 中添加新函数，
然后在 `/supabase/functions/server/routes/figma.tsx` 注册路由。

---

## 📞 获取帮助

### 相关文档
- [Figma Plugin API](https://www.figma.com/plugin-docs/)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

### 调试工具
```javascript
// 在插件 UI 中调试
console.log('[Debug]', data);

// 在 Edge Function 中调试
console.log('[Figma Plugin] Debug info:', data);
```

### 查看日志
- **插件日志**: Figma 菜单 → Plugins → Development → Open Console
- **Edge Function 日志**: Supabase Dashboard → Edge Functions → Logs

---

## ✅ 完成检查清单

- [ ] Figma OAuth 已在 Supabase 配置
- [ ] Redirect URL 已添加到 Supabase
- [ ] TypeScript 代码已编译为 JS
- [ ] 插件已在 Figma 中加载
- [ ] 登录功能测试通过
- [ ] 创建漫剧功能测试通过
- [ ] 同步图层功能测试通过

---

**所有准备工作已完成！开始使用 Figma 插件创作AI漫剧吧！** 🎉
