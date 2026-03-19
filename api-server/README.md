# Enterprise LLM Platform API Server

企业大模型平台后端 API 服务。

## 🚀 快速开始

### 安装依赖
```bash
cd api-server
npm install
```

### 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，配置数据库和 Redis 连接
```

### 启动开发服务器
```bash
npm run dev
```

服务将在 `http://localhost:8080` 启动。

### 编译 TypeScript
```bash
npm run build
```

### 启动生产服务器
```bash
npm start
```

## 📁 项目结构

```
src/
├── config/           # 配置文件
│   ├── database.ts   # 数据库连接
│   └── redis.ts      # Redis 连接
├── controllers/      # 控制器（业务逻辑）
│   ├── auth.controller.ts
│   ├── user.controller.ts
│   ├── model.controller.ts
│   ├── conversation.controller.ts
│   └── usage.controller.ts
├── middleware/       # 中间件
│   └── index.ts
├── routes/          # 路由
│   ├── index.ts
│   ├── auth.routes.ts
│   ├── user.routes.ts
│   ├── model.routes.ts
│   ├── conversation.routes.ts
│   └── usage.routes.ts
└── utils/           # 工具函数
    └── logger.ts
```

## 🔌 API 端点

### 认证 API
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/refresh` - 刷新 Token
- `POST /api/auth/logout` - 登出

### 用户 API
- `GET /api/user/info` - 获取用户信息
- `PUT /api/user/info` - 更新用户信息
- `GET /api/user/quota` - 获取用户配额

### 模型 API
- `GET /api/models` - 获取所有模型
- `GET /api/models/:id` - 获取模型详情
- `POST /api/models` - 创建模型
- `PUT /api/models/:id` - 更新模型

### 会话 API
- `GET /api/conversations` - 获取所有会话
- `GET /api/conversations/:id` - 获取会话详情
- `POST /api/conversations` - 创建会话
- `DELETE /api/conversations/:id` - 删除会话
- `DELETE /api/conversations` - 清空所有会话

### 使用记录 API
- `GET /api/usage/records` - 获取使用记录
- `GET /api/usage/daily` - 获取每日使用汇总
- `GET /api/usage/today` - 获取今日使用统计

### 健康检查
- `GET /health` - 服务健康检查

## 🔐 认证说明

所有受保护的路由都需要在请求头中包含：
```
x-user-id: <user_uuid>
```

登录成功后，客户端会收到：
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": "...",
    "username": "...",
    "email": "...",
    "isAdmin": false
  }
}
```

客户端需要在后续请求的 `Authorization` 头中包含：
```
Authorization: Bearer <accessToken>
```

## 📊 数据库表

主要表结构：
- `users` - 用户信息
- `user_roles` - 用户角色
- `user_quotas` - 用户配额
- `models` - 模型配置
- `conversations` - 对话会话
- `conversation_messages` - 对话消息
- `usage_records` - 使用记录
- `daily_usage_summary` - 每日汇总
- `audit_logs` - 审计日志
- `sensitive_patterns` - 敏感词过滤规则

## 🧪 测试

```bash
npm test
```

## 📝 代码风格

```bash
npm run lint
npm run format
```

## 📄 许可证

MIT License

---

*创建日期: 2026-03-16*
*版本: v1.0.0*
