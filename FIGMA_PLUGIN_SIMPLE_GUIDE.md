# 🎨 Figma 插件快速指南（无需登录版）

## ✅ 已完成的工作

### 插件功能
- ✅ **直接连接 Supabase Edge Functions**（无需用户登录）
- ✅ **创建漫剧系列** - 直接写入数据库
- ✅ **同步 Figma 图层** - 导出并保存到服务器
- ✅ **查看漫剧列表** - 从数据库读取

### 认证方式
- ✅ 使用 `SUPABASE_ANON_KEY` 进行认证
- ✅ 无需用户 OAuth 登录
- ✅ 所有用户共享一个标识：`figma_plugin_user`

---

## 🚀 快速开始（3步）

### 步骤 1：编译 TypeScript（1分钟）

```bash
cd figma-plugin
tsc code.ts --target es2020 --module commonjs
```

**如果没有 TypeScript：**
```bash
npm install -g typescript
```

### 步骤 2：在 Figma 中加载插件（1分钟）

1. 打开 Figma 桌面应用
2. 菜单 → **Plugins** → **Development** → **Import plugin from manifest**
3. 选择 `/figma-plugin/manifest.json`
4. 完成！

### 步骤 3：使用插件（1分钟）

1. 在 Figma 中运行插件：**Plugins** → **Development** → **AI漫剧创作**
2. 看到"✅ 已连接到 Supabase"表示成功
3. 开始使用！

---

## 📡 API 端点（自动连接）

插件会自动连接到以下端点：

| 功能 | 端点 | 说明 |
|------|------|------|
| 创建漫剧 | `POST /figma/create-series` | 直接写入数据库 |
| 同步图层 | `POST /figma/sync` | 保存图层信息 |
| 查看列表 | `GET /figma/my-series` | 读取数据库 |

**Base URL**: `https://cjjbxfzwjhnuwkqsntop.supabase.co/functions/v1/make-server-fc31472c`

---

## 🎯 使用功能

### 1. 创建新漫剧
```
1. 输入标题：如"我的第一部漫剧"
2. 输入简介：描述故事内容
3. 点击"创建漫剧"
4. 等待提示"创建成功"
→ 数据已保存到数据库！
```

### 2. 同步 Figma 图层
```
1. 在 Figma 中选中一些图层/Frame
2. 点击"同步选中图层到数据库"
3. 插件会：
   - 导出为 PNG 图片（2x分辨率）
   - 提取图层信息（名称、类型、尺寸）
   - 发送到服务器
   - 保存到数据库
→ 同步成功！
```

### 3. 导出当前帧
```
1. 点击"导出当前帧"
2. 插件会导出选中的 Frame 为高清图片
3. 可以用于后续处理
```

---

## 🗄️ 数据流

```
Figma Plugin
  ↓ (使用 ANON_KEY)
Supabase Edge Function (/make-server-fc31472c/figma/*)
  ↓ (直接操作)
PostgreSQL Database
  ↓ (表: series, series_episodes 等)
数据持久化保存
```

### 存储的数据

**创建漫剧时：**
- `series` 表新增一条记录
- `user_phone` = `figma_plugin_user`
- `title`, `description`, `status` 等字段

**同步图层时：**
- 图层信息保存为 JSON
- 包含：ID、名称、类型、尺寸
- 可选：导出的图片数据

---

## 🔧 配置文件

### manifest.json
```json
{
  "name": "AI漫剧创作 - Figma插件",
  "id": "ai-comic-creator-figma-plugin",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "networkAccess": {
    "allowedDomains": [
      "https://cjjbxfzwjhnuwkqsntop.supabase.co"
    ]
  }
}
```

### code.ts 关键配置
```typescript
const SUPABASE_URL = 'https://cjjbxfzwjhnuwkqsntop.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbG...'; // 已内置
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/make-server-fc31472c`;
```

---

## 🐛 故障排查

### 问题 1: 插件无法加载
**症状**: Import plugin 失败

**解决**:
```bash
# 确保 code.js 已生成
cd figma-plugin
ls code.js  # 应该存在

# 如果不存在，编译：
tsc code.ts --target es2020 --module commonjs
```

### 问题 2: 同步失败
**症状**: 点击同步后提示错误

**检查**:
1. 是否选中了图层？
2. 查看 Figma 插件控制台（Plugins → Development → Open Console）
3. 查看错误信息

**解决**:
- 确保选中可导出的图层（Frame, Component等）
- 检查网络连接

### 问题 3: 创建漫剧失败
**症状**: 提示"创建失败"

**可能原因**:
1. 数据库连接问题
2. 字段验证失败

**解决**:
1. 确保标题和简介都已填写
2. 查看 Edge Function 日志：
   ```
   Supabase Dashboard → Edge Functions → Logs
   ```

### 问题 4: CORS 错误
**症状**: 控制台提示 CORS

**解决**:
- 检查 `manifest.json` 中的 `networkAccess`
- 确保域名正确：`https://cjjbxfzwjhnuwkqsntop.supabase.co`

---

## 📊 查看数据

### 在 Supabase Dashboard 查看
```
1. 访问: https://supabase.com/dashboard/project/cjjbxfzwjhnuwkqsntop/editor
2. 选择表: series
3. 查找 user_phone = 'figma_plugin_user' 的记录
4. 可以看到从插件创建的所有漫剧
```

### 使用 SQL 查询
```sql
-- 查看插件创建的漫剧
SELECT id, title, description, created_at 
FROM series 
WHERE user_phone = 'figma_plugin_user'
ORDER BY created_at DESC;
```

---

## 🔐 安全说明

### 当前方式
- 使用 `SUPABASE_ANON_KEY`（公开密钥）
- 适用于开发和测试
- 所有插件用户共享一个身份

### 如果需要更高安全性
可以改为：
1. 每个用户使用独立的 `figmaUserId`
2. 在 Supabase RLS（Row Level Security）中配置权限
3. 使用 Service Role Key（仅服务端）

---

## 📦 文件清单

- [x] `/figma-plugin/manifest.json` - 插件配置
- [x] `/figma-plugin/code.ts` - TypeScript 源码
- [x] `/figma-plugin/code.js` - 编译后的 JS（需生成）
- [x] `/figma-plugin/ui.html` - 插件界面
- [x] `/supabase/functions/server/routes/figma.tsx` - 路由
- [x] `/supabase/functions/server/routes/handlers/figma_plugin.tsx` - 处理器

---

## 💡 Tips

- **调试**: 使用 `Cmd/Ctrl + Shift + I` 打开 Figma 开发者工具
- **日志**: 所有操作都会在控制台显示
- **热重载**: 修改 `code.ts` 后需重新编译并重启插件
- **数据**: 创建的数据直接保存到生产数据库

---

## ✅ 完成检查清单

- [ ] TypeScript 已编译为 `code.js`
- [ ] 插件已在 Figma 中加载
- [ ] 看到"已连接到 Supabase"提示
- [ ] 测试创建漫剧成功
- [ ] 测试同步图层成功
- [ ] 在 Supabase Dashboard 中看到数据

---

**所有准备就绪！开始使用 Figma 插件创作吧！** 🎉

有问题随时查看 Figma 插件控制台或 Supabase Edge Function 日志！
