# Enterprise LLM Platform - 架构深度解析

## 项目概述

这是一个完整的企业级大模型服务平台，支持本地化部署，通过 IDE 插件调用 LLM 推理服务。平台涵盖了从模型推理、API 网关、用户认证、使用计量到监控告警的全栈能力。

## 整体架构

```
┌────────────────────────────────────────────────────────────────────┐
│                       IDE 插件层 (Client)                          │
│  ┌──────────────────┐              ┌──────────────────┐           │
│  │  VS Code Plugin  │              │ JetBrains Plugin │           │
│  │  - Chat WebView  │              │ - Swing ToolWindow│          │
│  │  - InlineCompletion│            │ - CompletionContrib│         │
│  │  - AuthClient    │              │ - AIService       │          │
│  └────────┬─────────┘              └────────┬─────────┘          │
└───────────┼──────────────────────────────────┼────────────────────┘
            │          HTTPS / SSE             │
            └──────────────┬───────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Kong API Gateway (:8443)                       │
│  路由: /v1/chat/completions → vLLM | /api/* → API Server         │
│  插件: Rate Limiting, CORS, Request Transformer, Size Limit      │
│  上游: 健康检查 + 轮询负载均衡                                      │
└──────────┬──────────────────────────────────┬────────────────────┘
           ▼                                  ▼
┌─────────────────────┐         ┌──────────────────────────────────┐
│ vLLM Inference      │         │  API Server (Node.js/Express)    │
│ :8000               │         │  :8080                           │
│ - Qwen-72B-Chat     │         │  ┌───────────────────────────┐   │
│ - OpenAI兼容API      │         │  │ Middleware Pipeline       │   │
│ - Tensor Parallel×4  │         │  │ helmet → cors → bodyParser│   │
│ - GPU 95% 利用率     │         │  │ → logger → rateLimit      │   │
│                     │         │  │ → contentFilter → audit    │   │
└─────────────────────┘         │  └───────────────────────────┘   │
                                │  ┌───────────────────────────┐   │
                                │  │ Controllers               │   │
                                │  │ auth, user, model,        │   │
                                │  │ conversation, apikey,     │   │
                                │  │ usage                     │   │
                                │  └───────────────────────────┘   │
                                └──────┬────────────┬──────────────┘
                                       ▼            ▼
                        ┌──────────────────┐  ┌──────────┐
                        │ PostgreSQL :5432  │  │ Redis    │
                        │ 核心业务数据       │  │ :6379    │
                        │ 8 张核心表         │  │ 缓存/限流 │
                        └──────────────────┘  └──────────┘
                                       │
                        ┌──────────────────┐
                        │ Keycloak :8080   │
                        │ SSO/OIDC 认证    │
                        │ 4 角色 3 客户端   │
                        └──────────────────┘

┌──────────────────────────── 可观测性 ──────────────────────────────┐
│  Prometheus(:9090)  →  Grafana(:3000)   16条告警规则               │
│  Promtail → Loki(:3100) → Grafana       5个日志采集源              │
└───────────────────────────────────────────────────────────────────┘
```

## 一、API Server (Node.js + Express + TypeScript)

### 技术栈
- **运行时**: Node.js 20 + TypeScript 5.3
- **框架**: Express 4.18
- **数据库**: PostgreSQL 15 (pg 驱动, 连接池 max=20)
- **缓存**: Redis 7 (分布式限流、Token 缓存)
- **认证**: JWT (jsonwebtoken) + bcryptjs + Keycloak OIDC
- **日志**: Winston
- **测试**: Jest + Supertest

### 中间件管道 (请求处理顺序)
1. `helmet` — 安全 HTTP 头
2. `cors` — 跨域配置
3. `express.json/urlencoded` — Body 解析 (10MB 限制)
4. `requestLogger` — 请求日志 (method, path, IP, 耗时)
5. `authenticate` / `optionalAuthenticate` — JWT/API Key 认证
6. `rateLimit` — Redis 滑动窗口限流 (100次/分钟/IP, 60次/分钟/用户)
7. `contentFilter` — 敏感内容过滤 (regex/keyword/phrase, 5分钟缓存刷新)
8. `auditLogger` — 审计日志 (异步写入, 不阻塞请求)
9. **路由处理器**
10. `errorHandler` — 统一错误处理 (PostgreSQL约束冲突→409)

### API 路由

| 模块 | 路径前缀 | 关键端点 |
|------|---------|---------|
| 认证 | `/api/auth` | login, register, refresh, logout, password reset |
| Keycloak | `/api/auth/keycloak` | login, refresh, config, logout |
| 用户 | `/api/user` | info, quota, list(admin), status/role/quota管理 |
| 模型 | `/api/models` | CRUD, available(公开), toggle, usage统计 |
| 对话 | `/api/conversations` | CRUD, archive, 消息管理 |
| API Key | `/api/apikeys` | 创建(返回完整key), 列表, 撤销 |
| 用量 | `/api/usage` | records, daily, today, stats(admin) |

### 认证机制 (双模式)

**模式一: JWT Bearer Token**
- `Authorization: Bearer <token>`
- Access Token: 24h, Refresh Token: 30d
- Redis 缓存验证, 支持自动续签

**模式二: API Key**
- `Authorization: ApiKey cqfz_<32hex>`
- 数据库只存 SHA256 哈希 + 12字符前缀
- 支持 IP 白名单、过期时间、独立限流

**模式三: Keycloak SSO**
- OIDC Direct Grant 流程
- 自动同步用户到本地数据库
- Admin Token 缓存 50s TTL

### 数据库表结构 (PostgreSQL)

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `users` | 用户管理 | username, email, department, is_admin, 软删除 |
| `user_quotas` | 配额控制 | daily/hourly/monthly_limit, quota_type |
| `models` | 模型注册 | provider, parameters, cost_per_1k_tokens |
| `model_permissions` | 模型权限 | access_type, expires_at |
| `api_keys` | API密钥 | key_hash(SHA256), ip_whitelist, rate_limit |
| `conversations` | 对话管理 | model_id, total_tokens, is_archived |
| `conversation_messages` | 消息存储 | role, content, order_index |
| `usage_records` | 使用记录 | tokens, duration, status |
| `daily_usage_summary` | 日汇总 | total_tokens, success/failed counts |
| `audit_logs` | 审计日志 | action, resource, details(JSONB) |
| `sensitive_patterns` | 敏感词库 | pattern_type, severity, category |

---

## 二、Docker 基础设施 (13 个服务)

### 服务拓扑

```
推理层:    vllm-inference (GPU, Qwen-72B-Chat)
网关层:    kong → kong-database(PG)
认证层:    keycloak → keycloak-db(PG)
应用层:    api-server → postgres + redis
监控层:    prometheus, grafana
日志层:    loki, promtail
```

### Kong 网关配置
- `/v1/chat/completions` → vLLM (60次/分, 1000次/时)
- `/v1/embeddings` → vLLM (30次/分, 500次/时)
- `/api/*` → API Server (60次/分, 1000次/时)
- `/auth/*` → Keycloak
- 全局: CORS, 10MB 请求限制, 安全响应头

### Keycloak 认证配置
- **Realm**: `llm-platform`
- **角色**: admin, developer, user(默认), auditor
- **客户端**: llm-api(机密), vscode-plugin(公开), jetbrains-plugin(公开)
- **自定义 Scope**: `llm-scope` (department, position, employee_id, realm_roles)
- **安全**: 暴力破解保护, HSTS, CSP

### 监控告警 (16 条规则)

| 类别 | 告警 | 阈值 |
|------|------|------|
| 可用性 | ServiceDown | up==0, 1分钟 |
| API错误 | HighErrorRate | >5%, 5分钟 |
| 延迟 | HighLatency | P99>5s |
| GPU | HighGPUMemory | >95%, 5分钟 |
| 磁盘 | DiskSpaceCritical | <5%, 5分钟 |
| 业务 | UserQuotaExceeded | tokens>quota |

### 日志采集 (Promtail → Loki)
- vLLM 日志: JSON 解析 (level, request_id, model, latency)
- Kong 日志: HTTP 请求正则提取 (method, path)
- Keycloak 日志: 用户提取
- 应用日志: 多行合并 + 级别提取
- Docker 容器: 自动发现

---

## 三、IDE 插件

### VS Code 插件

**核心模块:**
- `extension.ts` — 入口, 7个命令注册, 状态栏
- `authClient.ts` — SecretStorage 安全存储, JWT 自动续签 (到期前5分钟)
- `aiClient.ts` — Axios HTTP, SSE 流式, 自动重试 (2次, 指数退避)
- `config.ts` — 设置管理 (apiUrl, model, temperature, maxTokens 等)
- `chat.ts` — WebView 聊天面板, 多轮对话, 流式输出
- `completion.ts` — InlineCompletion 代码补全, 500ms 防抖

**快捷键:**
| 功能 | 快捷键 |
|------|--------|
| 登录 | Ctrl+Shift+L |
| 聊天 | Ctrl+Shift+C |
| 解释代码 | Ctrl+Shift+E |
| 重构 | Ctrl+Shift+R |
| 生成测试 | Ctrl+Shift+T |
| 找Bug | Ctrl+Shift+B |
| 优化 | Ctrl+Shift+O |

### JetBrains 插件

**核心模块:**
- `AIService.kt` — 应用级单例, HttpURLConnection (零外部依赖)
- `AIConfig.kt` + `AIConfigurable.kt` — IntelliJ 持久化设置
- `BaseAIAction.kt` — 6个 Action 的抽象基类 (进度条, 结果对话框)
- `AICompletionContributor.kt` — 代码补全, 20行上下文
- `AIToolWindowFactory.kt` — Swing 聊天面板 (右侧工具窗口)
- 支持: IntelliJ IDEA, PyCharm, WebStorm, GoLand, CLion

### 插件通信协议

```
插件 → Kong(:8443) → vLLM     POST /v1/chat/completions  (聊天)
插件 → Kong(:8443) → vLLM     POST /v1/completions       (代码补全)
插件 → Kong(:8443) → API      POST /api/auth/login       (认证)
插件 → Kong(:8443) → API      POST /api/auth/refresh     (续签)
```

- 流式响应: Server-Sent Events (SSE), `data: {choices[{delta}]}`
- 错误处理: 401→自动刷新, 429→尊重 Retry-After, 5xx→指数退避重试

---

## 四、CI/CD 流水线

```
Push/PR → GitHub Actions
  ├── api-lint-test     (ESLint + TypeScript + Jest + Coverage)
  ├── vscode-plugin-build  (Lint + Compile + Test → .vsix)
  ├── jetbrains-plugin-build (Gradle Build + Test → .zip)
  ├── security-scan     (Trivy → GitHub Security)
  ├── docker-build      (→ ghcr.io, 仅 main 分支)
  ├── deploy-staging    (SSH + docker-compose, develop 分支)
  └── deploy-production (SSH + docker-compose + Slack 通知, main 分支)
```

---

## 五、部署脚本

| 脚本 | 功能 |
|------|------|
| `deploy.sh` | 一键部署: 环境检查 → 配置生成 → 模型下载 → 服务启动 → 健康检查 |
| `download-model.sh` | 交互式模型下载 (HuggingFace CLI) |
| `create-user.sh` | 通过 Keycloak API 创建用户 |
| `build-vscode.sh` | 构建 VS Code .vsix 插件包 |
| `build-jetbrains.sh` | 构建 JetBrains .zip 插件包 |

---

## 六、测试覆盖

- **单元测试**: 5 个 Controller 测试 + 1 个中间件测试
- **集成测试**: API 端点测试 + 健康检查测试
- **Mock 体系**: PostgreSQL Pool Mock, Redis Mock, bcrypt Mock, JWT Mock
- **测试框架**: Jest + ts-jest + Supertest
- **覆盖范围**: 认证流程、用户管理、对话管理、模型管理、用量统计、中间件鉴权
