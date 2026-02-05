# 🎨 Figma 插件快速参考

## ⚡ 快速开始（3步）

### 1. 编译插件
```bash
cd figma-plugin
tsc code.ts --target es2020 --module commonjs
```

### 2. 在 Figma 中加载
Figma → Plugins → Development → Import plugin from manifest → 选择 `manifest.json`

### 3. 运行插件
Figma → Plugins → Development → AI漫剧创作

---

## 🔗 关键 URL

### Figma Developers
https://www.figma.com/developers/apps

### Supabase Auth Providers
https://supabase.com/dashboard/project/cjjbxfzwjhnuwkqsntop/auth/providers

### Redirect URL（必须配置）
```
https://cjjbxfzwjhnuwkqsntop.supabase.co/auth/v1/callback
```

### App Redirect URLs（必须配置）
```
http://localhost:5173/figma-auth
https://your-app-domain.com/figma-auth
```

---

## 📡 API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/figma/sync` | POST | 同步 Figma 节点 |
| `/figma/create-series` | POST | 创建漫剧系列 |
| `/figma/upload-image` | POST | 上传图片 |
| `/figma/my-series` | GET | 获取用户系列 |

**Base URL**: `https://cjjbxfzwjhnuwkqsntop.supabase.co/functions/v1/make-server-fc31472c`

---

## 🔐 认证流程

```
1. 用户点击"登录" → 打开 OAuth 窗口
2. 完成 Figma 授权 → 重定向到 /figma-auth
3. 获取 access_token → 保存到 localStorage
4. 关闭窗口 → 返回插件
5. 插件自动刷新状态 → 显示已登录
```

---

## 🐛 快速调试

### 查看插件日志
Figma → Plugins → Development → Open Console

### 查看 Edge Function 日志
Supabase Dashboard → Edge Functions → Logs

### 测试 API
```javascript
// 在浏览器控制台
fetch('https://cjjbxfzwjhnuwkqsntop.supabase.co/functions/v1/make-server-fc31472c/figma/my-series', {
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
}).then(r => r.json()).then(console.log)
```

---

## 📦 文件清单

- [x] `/figma-plugin/manifest.json`
- [x] `/figma-plugin/code.ts`
- [x] `/figma-plugin/code.js` ← **需要编译生成**
- [x] `/figma-plugin/ui.html`
- [x] `/supabase/functions/server/routes/figma.tsx`
- [x] `/supabase/functions/server/routes/handlers/figma_plugin.tsx`
- [x] `/src/app/pages/FigmaAuthCallbackPage.tsx`

---

## ⚠️ 常见问题

### Q: 插件加载失败
A: 确保 `code.js` 已生成（编译 TypeScript）

### Q: 登录窗口不打开
A: 检查浏览器弹窗拦截设置

### Q: API 请求 401 错误
A: Token 过期，需要重新登录

### Q: CORS 错误
A: 检查 Supabase 的 CORS 配置

---

## 💡 Tips

- 使用 `Cmd/Ctrl + Shift + I` 打开 Figma 开发者工具
- localStorage 中查看 `figma_plugin_access_token`
- 每次修改 `code.ts` 后需要重新编译
- Figma 插件的 localStorage 独立于浏览器

---

**需要完整文档？查看 `/FIGMA_PLUGIN_GUIDE.md`**
