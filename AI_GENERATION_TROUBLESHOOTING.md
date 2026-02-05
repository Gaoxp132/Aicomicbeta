# AI生成功能故障排查指南

## 🚨 问题现象

用户点击"AI生成中..."按钮后，长时间卡住不动，无法继续操作。

---

## 🔍 快速诊断

### 方法1: 使用诊断API（推荐）

在浏览器中打开以下URL进行快速诊断：

```
https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-fc31472c/ai/diagnose
```

**预期结果**:
```json
{
  "timestamp": "2026-01-29T...",
  "environment": {
    "VOLCENGINE_API_KEY": "sk-xxx...xxx",
    "ALIYUN_BAILIAN_API_KEY": "sk-xxx...xxx",
    "hasVolcKey": true,
    "hasAliyunKey": true
  },
  "tests": {
    "basicInfo": {
      "success": true,
      "engine": "volcengine",
      "executionTime": 2500
    },
    "story": {
      "success": true,
      "engine": "volcengine",
      "executionTime": 3200
    }
  },
  "summary": {
    "status": "✅ 所有测试通过",
    "passed": 2,
    "failed": 0
  }
}
```

### 方法2: 检查浏览器控制台

1. 按 `F12` 打开开发者工具
2. 切换到 "Console" 标签
3. 点击"AI生成"按钮
4. 查看日志输出

**正常情况**:
```
[SeriesCreationWizard] 🤖 Calling AI to generate basic info...
[SeriesCreationWizard] 📍 API URL: https://xxx.supabase.co/...
[SeriesCreationWizard] 📍 Response status: 200
[SeriesCreationWizard] ✅ AI response received
[SeriesCreationWizard] 📝 Setting title: ...
```

**异常情况**:
```
[SeriesCreationWizard] ❌ Response error: 500
或
[SeriesCreationWizard] ⏱️ Request timeout after 30s
```

---

## 🛠️ 修复方案

### 问题1: API密钥未配置

**症状**: 诊断API返回 `hasVolcKey: false` 或 `hasAliyunKey: false`

**解决方案**:

1. 打开Supabase项目设置
2. 进入 "Edge Functions" → "Secrets"
3. 添加以下环境变量：

```bash
# 火山引擎API密钥（必需）
VOLCENGINE_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 阿里百炼API密钥（可选，作为备份）
ALIYUN_BAILIAN_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

4. 重新部署Edge Functions
5. 等待1-2分钟后重试

---

### 问题2: API密钥无效或过期

**症状**: 
- 诊断API返回 `"error": "401"`
- 控制台显示 "API密钥未授权"

**解决方案**:

1. 验证密钥是否正确
2. 检查密钥是否过期
3. 访问火山引擎/阿里云控制台重新生成密钥
4. 更新Supabase Secrets
5. 重新测试

---

### 问题3: API调用超时

**症状**: 
- 控制台显示 "Request timeout after 30s"
- 长时间无响应

**可能原因**:
1. 网络连接慢
2. AI服务繁忙
3. 服务器响应时间过长

**解决方案**:

**临时方案**: 
- 刷新页面重试
- 等待片刻后再次尝试
- 检查网络连接

**长期方案** (已在代码中修复):
- 降低超时时间到30秒（快速失败）
- 添加详细的错误提示
- 提供手动输入选项

---

### 问题4: 服务器内部错误 (500)

**症状**: 
- 诊断API返回 `"error": "500"`
- 控制台显示 "服务器内部错误"

**排查步骤**:

1. 检查Supabase日志:
   ```
   Supabase项目 → Logs → Edge Functions
   ```

2. 查找错误信息:
   ```
   [VolcengineAI] ❌ API Error: ...
   或
   [SmartAI] ❌ Primary engine failed: ...
   ```

3. 常见错误:
   - "模型不存在" → 检查模型ID是否正确
   - "API调用频率限制" → 稍后重试或升级配额
   - "余额不足" → 充值API账户

---

### 问题5: 前端按钮卡住

**症状**: 
- 按钮显示"AI生成中..."不消失
- 无法进行其他操作

**原因**: 前端状态管理问题（已在本次修复中解决）

**已修复内容**:
1. 添加30秒超时保护
2. 添加详细的错误处理
3. 确保 `finally` 块正确重置状态

**用户操作**:
- 如果卡住，等待30秒会自动超时
- 如果仍无响应，刷新页面重试

---

## 📊 诊断结果解读

### 成功示例

```json
{
  "summary": {
    "status": "✅ 所有测试通过",
    "passed": 2,
    "failed": 0,
    "recommendation": "✅ AI服务运行正常！"
  }
}
```

**说明**: AI功能正常，可以使用

---

### 部分成功示例

```json
{
  "environment": {
    "hasVolcKey": true,
    "hasAliyunKey": false
  },
  "tests": {
    "basicInfo": {
      "success": true,
      "engine": "volcengine"
    }
  },
  "summary": {
    "passed": 2,
    "failed": 0,
    "recommendation": "⚠️ 未配置阿里百炼API密钥 (ALIYUN_BAILIAN_API_KEY)"
  }
}
```

**说明**: 火山引擎正常工作，阿里百炼未配置（可选）

---

### 失败示例

```json
{
  "environment": {
    "hasVolcKey": false,
    "hasAliyunKey": false
  },
  "summary": {
    "critical": "⚠️ 警告：未配置任何AI引擎的API密钥！",
    "recommendation": "⚠️ 未配置火山引擎API密钥 (VOLCENGINE_API_KEY)\n⚠️ 未配置阿里百炼API密钥 (ALIYUN_BAILIAN_API_KEY)"
  }
}
```

**说明**: 需要立即配置API密钥

---

## 🚀 应急处理流程

### 当AI生成卡住时：

1. **等待30秒**
   - 系统会自动超时并显示错误提示

2. **检查控制台**
   - 按F12查看具体错误信息

3. **使用诊断API**
   - 访问 `/ai/diagnose` 端点

4. **根据诊断结果处理**:
   - 缺少密钥 → 配置环境变量
   - 密钥无效 → 重新生成密钥
   - 服务器错误 → 查看日志
   - 超时 → 检查网络

5. **临时解决方案**:
   - 手动填写表单（不使用AI生成）
   - 刷新页面重试

---

## ✅ 本次修复内容

### 1. 前端改进

#### a. 降低超时时间
```typescript
// ❌ 修复前：70秒超时（等待时间过长）
const timeoutId = setTimeout(() => controller.abort(), 70000);

// ✅ 修复后：30秒超时（快速失败，更好的用户体验）
const timeoutId = setTimeout(() => controller.abort(), 30000);
```

#### b. 添加详细错误提示
```typescript
// ✅ 根据不同错误类型提供具体建议
if (error.message.includes('500')) {
  errorMessage += '\n\n可能原因：服务器内部错误或AI服务配置问题';
} else if (error.message.includes('404')) {
  errorMessage += '\n\n可能原因：API路由不存在';
}
```

#### c. 改进超时提示
```typescript
alert('⏱️ AI生成超时（30秒），可能原因：\n\n1. 网络连接慢\n2. AI服务繁忙\n3. API配置问题\n\n建议：\n- 检查网络连接\n- 稍后重试\n- 或手动填写表单');
```

### 2. 后端改进

#### a. 添加诊断工具
- 新增 `/ai/diagnose` 路由
- 自动检查环境变量
- 测试AI引擎连接
- 提供修复建议

#### b. 添加诊断Handler
- `/supabase/functions/server/routes/handlers/ai_diagnosis.tsx`
- 完整的环境检查
- 多场景测试
- 详细的错误日志

---

## 📞 技术支持

如果以上方法都无法解决问题，请提供以下信息：

1. 诊断API返回结果（完整JSON）
2. 浏览器控制台日志截图
3. Supabase Edge Functions日志
4. 复现步骤

---

**最后更新**: 2026-01-29
**版本**: v1.0.0
**状态**: ✅ 已修复前端超时和错误处理
