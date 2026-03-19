# Enterprise LLM Platform 项目概览

这是一个**企业级大模型服务器平台**，支持本地化部署，通过 IDE 插件提供服务。

---

## 项目结构

```
enterprise-llm-platform/
├── docker/                    # Docker 配置与部署
│   ├── docker-compose.yml    # 服务编排 (9个服务)
│   ├── kong/                # API 网关配置
│   ├── keycloak/            # 身份认证配置
│   ├── prometheus/          # 监控配置
│   ├── grafana/             # 可视化面板
│   ├── loki/                # 日志聚合
│   ├── promtail/            # 日志采集
│   ├── sql/                 # 数据库初始化
│   └── .env.example         # 环境变量模板
│
├── plugin/                   # IDE 插件
│   ├── vscode/              # VS Code 插件
│   └── jetbrains/           # JetBrains 插件
│
├── scripts/                  # 部署脚本
│   ├── deploy.sh            # 一键部署
│   ├── build-vscode.sh      # 构建 VS Code 插件
│   ├── build-jetbrains.sh   # 构建 JetBrains 插件
│   └── create-user.sh       # 用户创建
│
├── docs/                     # 文档
│   ├── IMPLEMENTATION.md    # 实现详解
│   ├── QUICK_START.md       # 快速开始
│   ├── DEPLOYMENT.md        # 部署方案
│   ├── USER_GUIDE.md        # 用户指南
│   ├── ADMIN_GUIDE.md       # 管理员指南
│   └── PROJECT_OVERVIEW.md  # 项目概览 (本文件)
│
├── models/                   # 模型文件目录
├── logs/                     # 日志目录
└── data/                     # 数据目录
```

---

## 核心架构

```
┌─────────────────────────────────────────────┐
│  客户端层 (VS Code / JetBrains / Web API)   │
└──────────────┬──────────────────────────────┘
               │ HTTPS/gRPC/mTLS
┌──────────────▼──────────────────────────────┐
│  Kong Gateway (认证、限流、路由)              │
└──────────────┬──────────────────────────────┘
       ┌───────┼────────┬──────────────┐
       ▼       ▼        ▼              ▼
┌──────────┐ ┌──────┐ ┌──────────┐ ┌──────────┐
│ Keycloak │ │ API  │ │ vLLM     │ │ Redis    │
│ (认证)   │ │ DB   │ │ (推理)   │ │ (缓存)   │
└──────────┘ └──────┘ └──────────┘ └──────────┘
                                       │
┌──────────────────────────────────────┼──────────┐
│  数据层 (PostgreSQL + Redis + Loki)   │          │
└──────────────────────────────────────┘          │
                                                   │
┌──────────────────────────────────────────────────┤
│  监控层 (Prometheus + Grafana)                   │
└──────────────────────────────────────────────────┘
```

---

## 服务组件

| 组件 | 端口 | 功能 |
|------|------|------|
| vLLM 推理 | 8000 | 大模型推理引擎 (PagedAttention) |
| Kong 网关 | 8443 | API 网关 (JWT 认证/限流) |
| Keycloak | 8080 | 身份认证 (OIDC/OAuth2) |
| PostgreSQL | 5432 | 业务数据存储 |
| Redis | 6379 | 缓存/限流 |
| Prometheus | 9090 | 监控指标采集 |
| Grafana | 3000 | 可视化监控面板 |
| Loki | 3100 | 日志聚合 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 推理引擎 | vLLM (OpenAI 兼容 API) |
| 网关 | Kong Gateway 3.5 |
| 认证 | Keycloak 24.0 |
| 数据库 | PostgreSQL 15 |
| 缓存 | Redis 7 |
| 监控 | Prometheus + Grafana |
| 日志 | Loki + Promtail |
| 容器 | Docker + Docker Compose |

---

## 支持的模型

- **Qwen-72B-Chat** (推荐) - 通义千问 720亿参数对话模型
- **Qwen-14B-Chat** - 通义千问 140亿参数对话模型
- **DeepSeek-Coder-33B** - DeepSeek 代码专用模型
- **Llama-3-70B-Instruct** - Meta Llama 3 指令微调模型
- **BGE-Embedding-ZH** - 中文文本嵌入模型

---

## IDE 插件功能

### VS Code / JetBrains 插件提供：

| 功能 | 说明 |
|------|------|
| AI 对话 | 流式对话交互 |
| 代码补全 | 智能代码补全 |
| 代码解释 | 解释选中代码 |
| 代码重构 | 优化代码结构 |
| 单元测试生成 | 自动生成测试用例 |
| Bug 检测 | 查找代码问题 |
| 代码优化 | 性能优化建议 |

---

## 数据库设计

### 核心表结构

| 表名 | 用途 |
|------|------|
| `users` | 用户信息 |
| `user_roles` | 用户角色 (RBAC) |
| `user_quotas` | 用户配额管理 |
| `usage_records` | 使用记录 |
| `daily_usage_summary` | 每日汇总 |
| `models` | 模型配置 |
| `model_permissions` | 模型访问权限 |
| `api_keys` | API 密钥 |
| `conversations` | 对话历史 |
| `conversation_messages` | 对话消息 |
| `audit_logs` | 审计日志 |
| `sensitive_patterns` | 敏感词过滤规则 |

---

## 安全机制

1. **认证授权** - JWT Token + Keycloak
2. **限流控制** - Redis 令牌桶算法
3. **敏感信息过滤** - 正则表达式匹配 (手机号/邮箱/API密钥等)
4. **数据脱敏** - PII 信息自动掩码
5. **审计日志** - 全量操作记录
6. **TLS/mTLS** - 传输层加密

### 敏感信息检测模式

- 手机号: `1[3-9]\d{9}`
- 邮箱: `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b`
- API Key: `sk-[a-zA-Z0-9]{32,}`
- JWT Token: `eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+`
- 数据库连接: `(mysql|postgres|mongodb)://[^\s]+`
- 证书私钥: `-----BEGIN (RSA |PRIVATE KEY)-----`

---

## 请求流程

```
用户请求 IDE 插件
    ↓
插件发起 HTTPS 请求 (带 JWT Token)
    ↓
API 网关接收请求
    ↓
├─ 验证 JWT Token
├─ 检查限流 (Redis)
└─ 提取用户信息
    ↓
路由到推理服务 (vLLM)
    ↓
推理服务处理请求 (PagedAttention + Continuous Batching)
    ↓
流式返回结果 (SSE)
    ↓
插件接收并显示
```

---

## 用户配额管理

### 配额分级策略

| 级别 | 每日 Token | 每小时调用数 | 说明 |
|------|------------|--------------|------|
| 基础 | 10,000 | 100 | 免费 |
| 标准 | 100,000 | 1,000 | ¥100/月 |
| 高级 | 1,000,000 | 10,000 | ¥500/月 |
| 企业 | 自定义 | 自定义 | 联系销售 |

### 角色权限

| 角色 | 权限 | 配额 |
|------|------|------|
| `admin` | 全部权限 | 无限制 |
| `developer` | 所有模型访问、API 调用 | 100K tokens/day |
| `user` | 基础模型访问 | 10K tokens/day |
| `auditor` | 只读访问 | N/A |

---

## 监控指标

### 基础设施指标
- CPU 使用率
- 内存使用率
- GPU 利用率
- 磁盘 I/O
- 网络流量

### 业务指标
- QPS (每秒请求数)
- P50/P95/P99 延迟
- Token 吞吐量
- 错误率
- 活跃用户数

### 告警规则
- 错误率超过 5%
- P99 延迟超过 10 秒
- GPU 利用率持续高于 95%

---

## 快速部署

### 前置要求
- Docker & Docker Compose
- NVIDIA GPU 驱动 & NVIDIA Container Toolkit
- 至少 80GB 显存 (72B 模型) 或使用量化模型

### 一键部署

```bash
# 1. 克隆项目
git clone <repository-url>
cd enterprise-llm-platform

# 2. 运行部署脚本
chmod +x scripts/*.sh
./scripts/deploy.sh

# 3. 等待服务启动完成
```

### 访问服务

| 服务 | 地址 | 默认账号 |
|------|------|----------|
| API Gateway | https://localhost:8443 | - |
| Keycloak | http://localhost:8080 | admin / ChangeMe123! |
| Grafana | http://localhost:3000 | admin / admin |
| Prometheus | http://localhost:9090 | - |

---

## API 使用示例

### 聊天补全

```bash
curl -X POST https://localhost:8443/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen-72B-Chat",
    "messages": [
      {"role": "user", "content": "你好"}
    ],
    "temperature": 0.7,
    "max_tokens": 1000
  }'
```

### 代码补全

```bash
curl -X POST https://localhost:8443/v1/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "DeepSeek-Coder-33B",
    "prompt": "def fibonacci(n):",
    "max_tokens": 100
  }'
```

---

## 常用命令

```bash
# 查看服务状态
cd docker && docker-compose ps

# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 停止服务
docker-compose down

# 启动服务
docker-compose up -d

# 查看 GPU 状态
nvidia-smi

# 创建用户
./scripts/create-user.sh

# 备份数据
docker exec postgres pg_dump -U llm_platform llm_platform > backup.sql
```

---

## 硬件要求

| 资源 | 推荐配置 | 最低配置 |
|------|----------|----------|
| GPU | 4x NVIDIA A100 (80GB) | 1x NVIDIA A30 (24GB) |
| 显存 | 80GB+ | 24GB (使用量化模型) |
| 内存 | 64GB+ | 32GB |
| 磁盘 | 500GB SSD | 100GB SSD |
| CPU | 32核+ | 16核 |

---

## 性能优化

### 推理层优化
1. **量化模型**: 4-bit AWQ 量化，显存节省 75%
2. **批处理**: 根据负载动态调整 batch size
3. **KV Cache**: 减少重复计算
4. **Tensor 并行**: 多卡并行计算

### 优化效果

| 优化手段 | 说明 | 效果 |
|----------|------|------|
| Tensor 并行 | 多卡并行计算 | 4x 吞吐量 |
| Continuous Batching | 动态批处理 | 2-3x 吞吐量 |
| KV Cache | 缓存中间结果 | 减少 50% 计算量 |
| FP8/BF16 | 低精度计算 | 2x 速度 |
| 量化 (AWQ/GPTQ) | 4-bit/8-bit 量化 | 显存节省 50%+ |

---

## 安全建议

1. **修改默认密码**: 部署后立即修改所有默认密码
2. **启用 HTTPS**: 生产环境必须使用 HTTPS
3. **网络隔离**: 使用 VPN 或内网部署
4. **定期更新**: 及时更新组件版本
5. **审计日志**: 定期检查审计日志
6. **敏感词过滤**: 配置合适的敏感信息检测规则

---

## 故障排查

### 服务无法启动
```bash
# 查看服务状态
cd docker && docker-compose ps

# 查看详细日志
docker-compose logs <service-name>
```

### GPU 不可用
```bash
# 检查 NVIDIA 驱动
nvidia-smi

# 检查 Docker GPU 支持
docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi
```

### 模型加载失败
```bash
# 检查模型文件
ls -lh models/

# 检查容器内模型
docker exec vllm-inference ls -lh /models/
```

---

## 文档索引

| 文档 | 说明 |
|------|------|
| [QUICK_START.md](QUICK_START.md) | 快速开始指南 |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | 核心实现详解 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | 部署方案说明 |
| [USER_GUIDE.md](USER_GUIDE.md) | 用户使用指南 |
| [ADMIN_GUIDE.md](ADMIN_GUIDE.md) | 管理员指南 |

---

## 许可证

MIT License

---

## 技术支持

如有问题，请提交 Issue 或联系技术支持团队。
