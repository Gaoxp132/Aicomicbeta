# 数据库Schema检查

## 已添加临时路由

路由已部署到: `GET /make-server-fc31472c/schema/inspect`

## 如何使用

### 方式1：在浏览器控制台执行

```javascript
fetch('https://cjjbxfzwjhnuwkqsntop.supabase.co/functions/v1/make-server-fc31472c/schema/inspect', {
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqamJ4Znp3amhudXdrcXNudG9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc5NjQyNzAsImV4cCI6MjA1MzU0MDI3MH0.tvwDfvE2EQ9xpjrvfkWqNMNL_4RiAuA3M2DZKEuWPcw'
  }
})
.then(r => r.json())
.then(data => {
  console.log('📊 Database Schema:', JSON.stringify(data, null, 2));
})
.catch(err => console.error('Error:', err));
```

### 方式2：使用curl

```bash
curl https://cjjbxfzwjhnuwkqsntop.supabase.co/functions/v1/make-server-fc31472c/schema/inspect \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqamJ4Znp3amhudXdrcXNudG9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc5NjQyNzAsImV4cCI6MjA1MzU0MDI3MH0.tvwDfvE2EQ9xpjrvfkWqNMNL_4RiAuA3M2DZKEuWPcw"
```

## 等待部署

**Edge Function需要1-2分钟重新部署**

然后在浏览器控制台运行上面的代码即可查看当前数据库schema！
