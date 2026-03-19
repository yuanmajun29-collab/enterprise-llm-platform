# 企业大模型服务平台 — 云端部署实施文档

> 团队：cqfz-ai-platform  |  版本：v1.1  |  更新日期：2026-03-19

---

## 一、系统架构总览

```
                        ┌─────────────┐
                        │   Nginx     │  反向代理 + SSL 终止
                        │  (可选)     │
                        └──────┬──────┘
                               │
                        ┌──────┴──────┐
                        │  Kong 网关   │  :8443 API 统一入口
                        │  (路由 + 限流)│
                        └──┬─────┬────┘
                           │     │
              ┌────────────┘     └────────────┐
              │                              │
       ┌──────┴──────┐               ┌───────┴──────┐
       │  API Server  │               │ vLLM 推理服务 │
       │  (Node.js)   │               │  (GPU)      │
       │  :8080       │               │  :8000       │
       └──┬───┬───┬──┘               └──────────────┘
          │   │   │
    ┌─────┘   │   └─────┐
    │         │         │
┌───┴───┐ ┌──┴───┐ ┌───┴───┐
│PostgreSQL│ Redis │Keycloak│
│ :5432   │ :6379 │ :8080  │
└─────────┘ └──────┘ └───────┘

监控体系：
┌──────────┐  ┌────────┐  ┌──────┐
│Prometheus│  │ Grafana│  │ Loki │
│ :9090    │  │ :3000  │  │:3100 │
└──────────┘  └────────┘  └──────┘
```

### 服务清单

| 服务 | 容器名 | 镜像 | 端口 | 说明 |
|------|--------|------|------|------|
| API Server | api-server | 自建 | 8080 | 业务逻辑、认证、用户管理 |
| Kong 网关 | kong-gateway | kong/kong-gateway:3.5.0.0 | 8443/8444/8001 | API 路由、限流（认证由 API Server 处理） |
| vLLM 推理 | vllm-inference | vllm/vllm-openai:latest | 8000 | 大模型推理引擎 |
| PostgreSQL | postgres | postgres:15-alpine | 5432 | 业务数据库 |
| Kong DB | kong-database | postgres:15-alpine | — | Kong 元数据库 |
| Keycloak DB | keycloak-db | postgres:15-alpine | — | Keycloak 元数据库 |
| Keycloak | keycloak | quay.io/keycloak/keycloak:24.0 | 8080 | 身份认证 |
| Redis | redis | redis:7-alpine | 6379 | 缓存、限流、Session |
| Prometheus | prometheus | prom/prometheus:latest | 9090 | 指标采集 |
| Grafana | grafana | grafana/grafana:latest | 3000 | 数据可视化 |
| Loki | loki | grafana/loki:latest | 3100 | 日志聚合 |
| Promtail | promtail | grafana/promtail:latest | — | 日志采集 |

---

## 二、硬件要求

### 2.1 GPU 推理服务器（必选）

| 资源 | 最低配置 | 推荐配置 |
|------|---------|---------|
| GPU | 1× A100 40GB 或 4× A30 | 4× A100 80GB |
| GPU 显存 | 40GB（72B 量化） | 320GB（72B 全精度） |
| CPU | 16 核 | 64 核 |
| 内存 | 64GB | 256GB |
| 系统盘 | 100GB SSD | 200GB SSD |
| 模型盘 | 300GB SSD | 500GB NVMe |
| 网络 | 千兆 | 万兆内网 |

### 2.2 应用服务器（可与 GPU 服务器合并部署）

| 资源 | 最低配置 | 推荐配置 |
|------|---------|---------|
| CPU | 8 核 | 16 核 |
| 内存 | 16GB | 32GB |
| 系统盘 | 50GB SSD | 100GB SSD |
| 网络 | 千兆 | 万兆 |

### 2.3 端口规划

| 端口 | 服务 | 说明 |
|------|------|------|
| 443 | Nginx（可选） | HTTPS 外部入口 |
| 8443 | Kong Gateway | API 代理 |
| 8080 | Keycloak / API Server | 内部服务 |
| 3000 | Grafana | 监控面板 |
| 9090 | Prometheus | 指标查询 |
| 5432 | PostgreSQL | 数据库 |
| 6379 | Redis | 缓存 |
| 8000 | vLLM | 推理服务 |
| 3100 | Loki | 日志查询 |

---

## 三、系统环境准备

### 3.1 操作系统

推荐 Ubuntu 22.04 LTS 或 CentOS 8+。

### 3.2 基础软件安装

```bash
# 1. 更新系统
apt update && apt upgrade -y

# 2. 安装 Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 3. 安装 Docker Compose 插件
apt install docker-compose-plugin -y
docker compose version

# 4. 安装 NVIDIA 驱动（GPU 服务器）
apt install -y nvidia-driver-535
nvidia-smi  # 验证驱动安装

# 5. 安装 NVIDIA Container Toolkit（GPU 服务器）
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
apt update && apt install -y nvidia-container-toolkit
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker

# 6. 验证 GPU Docker
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi

# 7. 安装 Git
apt install -y git

# 8. 创建目录
mkdir -p /opt/enterprise-llm-platform/{models,logs,data}
```

### 3.3 防火墙配置

```bash
# 仅开放必要端口
ufw allow 443/tcp    # HTTPS
ufw allow 8443/tcp   # Kong（如直接暴露）
ufw allow 3000/tcp   # Grafana（可限制为 VPN 内网）

# 数据库端口仅允许内网
ufw deny 5432/tcp
ufw deny 6379/tcp
ufw deny 8080/tcp
```

---

## 四、项目部署

### 4.1 克隆代码

```bash
cd /opt
git clone https://github.com/yuanmajun29-collab/enterprise-llm-platform.git
cd enterprise-llm-platform
```

### 4.2 配置环境变量

```bash
cp docker/.env.example docker/.env
vi docker/.env
```

关键配置项：

```bash
# 数据库密码（必须修改为强密码）
KONG_DB_PASSWORD=<生成32位随机密码>
KEYCLOAK_DB_PASSWORD=<生成32位随机密码>
POSTGRES_PASSWORD=<生成32位随机密码>
REDIS_PASSWORD=<生成32位随机密码>

# Keycloak 管理员（必须修改默认密码）
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<你的强密码>
LLM_API_SECRET=<生成32位随机密码>

# Grafana 管理员
GRAFANA_ADMIN=admin
GRAFANA_PASSWORD=<你的强密码>

# JWT 密钥（必须修改）
JWT_SECRET=<生成48位随机密码>

# 推理服务（根据 GPU 调整）
VLLM_TENSOR_PARALLEL_SIZE=4       # GPU 数量
VLLM_GPU_MEMORY_UTILIZATION=0.95  # 显存利用率
VLLM_MAX_MODEL_LEN=8192           # 最大上下文长度
```

一键生成随机密码：

```bash
cat > docker/.env << EOF
KONG_DB_PASSWORD=$(openssl rand -base64 32)
KEYCLOAK_DB_PASSWORD=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=$(openssl rand -base64 16)
LLM_API_SECRET=$(openssl rand -base64 32)
GRAFANA_ADMIN=admin
GRAFANA_PASSWORD=$(openssl rand -base64 16)
JWT_SECRET=$(openssl rand -base64 48)
VLLM_TENSOR_PARALLEL_SIZE=4
VLLM_GPU_MEMORY_UTILIZATION=0.95
VLLM_MAX_MODEL_LEN=8192
RATE_LIMIT_PER_MINUTE=60
RATE_LIMIT_PER_HOUR=1000
RATE_LIMIT_PER_DAY=10000
EOF
```

### 4.3 API Server 配置

```bash
vi api-server/.env
```

```bash
DATABASE_URL=postgresql://llm_platform:<POSTGRES_PASSWORD>@postgres:5432/llm_platform
REDIS_URL=redis://:<REDIS_PASSWORD>@redis:6379
REDIS_PASSWORD=<REDIS_PASSWORD>
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_REALM=llm-platform
KEYCLOAK_CLIENT_ID=llm-api
KEYCLOAK_CLIENT_SECRET=<LLM_API_SECRET>
AUTH_MODE=hybrid
JWT_SECRET=<与docker/.env保持一致>
PORT=8080
NODE_ENV=production
```

### 4.4 模型下载

```bash
pip install huggingface_hub
export HF_ENDPOINT=https://hf-mirror.com

# 下载主模型（Qwen-72B-Chat，约 140GB）
huggingface-cli download Qwen/Qwen-72B-Chat \
  --local-dir ./models/Qwen-72B-Chat \
  --local-dir-use-symlinks False

# 下载代码模型（可选，约 65GB）
huggingface-cli download deepseek-ai/DeepSeek-Coder-33B-instruct \
  --local-dir ./models/DeepSeek-Coder-33B \
  --local-dir-use-symlinks False
```

### 4.5 使用部署脚本

```bash
chmod +x scripts/*.sh tests/deploy/*.sh

# 完整部署
./scripts/deploy.sh

# 仅基础设施（不启动 vLLM）
./scripts/deploy.sh --only-infra

# 跳过模型下载
./scripts/deploy.sh --skip-models
```

### 4.6 手动部署（推荐生产环境）

```bash
cd docker
export $(grep -v '^#' .env | xargs)
mkdir -p ../{logs,data}
docker compose up -d --build
docker compose logs -f --tail=50
docker compose ps
```

### 4.7 健康检查

```bash
./tests/deploy/test-compose.sh
```

---

## 五、Keycloak 初始化

1. 访问管理控制台：`http://<IP>:8080/admin`
2. 使用 `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` 登录
3. 首次登录修改默认密码
4. 验证 realm `llm-platform` 已导入：
   - 角色：admin / developer / user / auditor
   - 客户端：llm-api / vscode-plugin / jetbrains-plugin
5. 创建用户并分配角色

---

## 六、网关与认证架构

### 6.1 设计原则

系统采用**网关路由 + 应用层认证**的分离架构：

```
IDE 插件
    │
    ▼ Authorization: Bearer <token>
┌──────────────────────────────────────────┐
│  Kong 网关 (:8443)                        │
│  职责：路由分发 + Redis 限流              │
│  不做 JWT 验证，透传 Authorization header │
└──────┬──────────────────────┬────────────┘
       │                      │
       ▼                      ▼
┌──────────────┐      ┌──────────────┐
│ API Server   │      │ vLLM 推理服务  │
│ (:8080)      │      │ (:8000)      │
│ JWT 验证     │      │              │
│ 用户管理     │      │              │
│ 配额/审计    │      │              │
└──────────────┘      └──────────────┘
```

- **Kong**：纯路由网关，负责限流（Redis 策略）和请求分发，将 `Authorization` header 透传给后端
- **API Server**：负责所有认证逻辑（JWT 验证、API Key 验证、Keycloak OAuth）
- **vLLM**：纯推理引擎，不处理认证（生产环境如需 vLLM 层认证可后续在 Kong 添加）

### 6.2 路由表

| 路由 | 路径 | 目标服务 | 插件 |
|------|------|---------|------|
| llm-chat-completions | POST /v1/chat/completions | vLLM | Rate-limiting |
| llm-completions | POST /v1/completions | vLLM | Rate-limiting |
| llm-models | GET /v1/models | vLLM | — |
| llm-embeddings | POST /v1/embeddings | vLLM | Rate-limiting |
| api-server | /api/* | API Server | Rate-limiting |
| keycloak-proxy | /auth/* | Keycloak | — |
| health-check | GET /health | vLLM | — |

### 6.3 限流策略

基于 Redis 的三级限流：

| 级别 | 配置 | 说明 |
|------|------|------|
| 每分钟 | 60 次 | 防止单用户短时刷接口 |
| 每小时 | 1000 次 | 控制单用户持续使用 |
| 每天 | 10000 次 | 全天用量上限 |

---

## 七、数据库

### 7.1 表结构（14 张表）

| 表 | 说明 |
|----|------|
| users | 用户信息（含软删除） |
| user_roles | 用户角色分配 |
| user_quotas | Token 用量配额 |
| usage_records | API 使用记录 |
| daily_usage_summary | 每日汇总（自动触发） |
| models | 模型注册 |
| model_permissions | 模型访问权限 |
| api_keys | API 密钥管理 |
| conversations | 对话会话 |
| conversation_messages | 对话消息 |
| audit_logs | 操作审计日志 |
| sensitive_patterns | 敏感词规则 |

### 7.2 迁移脚本

```bash
docker exec -i postgres psql -U llm_platform llm_platform < \
  api-server/src/migrations/001_add_api_keys_audit_triggers.sql
docker exec -i postgres psql -U llm_platform llm_platform < \
  api-server/src/migrations/002_add_rate_limit_columns.sql
docker exec -i postgres psql -U llm_platform llm_platform < \
  api-server/src/migrations/003_create_api_server_indexes.sql
```

---

## 八、认证模式

通过 `api-server/.env` 的 `AUTH_MODE` 切换：

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| `local` | 仅本地 JWT | 快速部署、内网测试 |
| `keycloak` | 仅 Keycloak OAuth | 已有统一身份平台 |
| `hybrid` | 双模式并存 | **推荐生产环境** |

Hybrid 模式同时支持：
- 本地登录：`POST /api/auth/login`
- Keycloak 登录：`POST /api/auth/keycloak/login`
- Keycloak 用户首次登录自动同步到本地

---

## 九、API 使用

### 9.1 登录

```bash
curl -X POST http://localhost:8443/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your_password"}'
```

### 9.2 聊天补全

```bash
curl -X POST http://localhost:8443/v1/chat/completions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen-72B-Chat",
    "messages": [
      {"role": "user", "content": "解释 Docker 容器技术"}
    ],
    "temperature": 0.7,
    "max_tokens": 2000
  }'
```

### 9.3 创建 API Key

```bash
curl -X POST http://localhost:8443/api/apikeys \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-script-key", "description": "自动化脚本"}'
```

### 9.4 查看统计

```bash
curl http://localhost:8443/api/usage/stats?days=30 \
  -H "Authorization: Bearer <token>"
```

---

## 十、IDE 插件

### 10.1 员工使用流程

```
1. 安装插件（VSCode 或 JetBrains）
2. 配置 API 地址 → https://api.yourcompany.com（Kong 入口）
3. 登录（用户名+密码 或 Keycloak OAuth）
4. 开始使用：
   - AI 对话（多轮聊天，流式输出）
   - 代码补全（输入时自动触发，500ms 防抖）
   - 选中代码 → 右键 → 解释/重构/测试/Bug检测/优化
```

### 10.2 插件调用链路

```
VSCode 插件
  ├── AI 对话：aiClient → Kong(:8443) → vLLM(:8000) /v1/chat/completions
  ├── 代码补全：aiClient → Kong(:8443) → vLLM(:8000) /v1/completions
  ├── 登录认证：authClient → Kong(:8443) → API Server(:8080) /api/auth/login
  ├── Keycloak 登录：authClient → Kong(:8443) → API Server(:8080) /api/auth/keycloak/login
  ├── 使用统计：Kong(:8443) → API Server(:8080) /api/usage/*
  └── API Key：Kong(:8443) → API Server(:8080) /api/apikeys/*
```

> 所有请求均通过 Kong 网关 (:8443) 统一入口，Kong 负责限流后透传给后端服务。
> 认证 token 在 API Server 层验证，vLLM 推理服务不做认证。

### 10.3 VSCode 插件

```bash
./scripts/build-vscode.sh
code --install-extension dist/enterprise-llm-assistant-*.vsix
```

功能清单：
- **AI 对话**：侧边栏聊天面板，支持多轮对话、流式输出、Markdown 渲染
- **代码补全**：内联补全（ghost text），500ms 防抖，支持所有语言
- **代码辅助**：选中代码后右键菜单
  - 解释代码（Ctrl+Shift+E）
  - 重构代码（Ctrl+Shift+R）
  - 生成单元测试（Ctrl+Shift+T）
  - 查找 Bug（Ctrl+Shift+B）
  - 优化性能（Ctrl+Shift+O）
- **状态栏**：显示连接状态（已连接/未连接）

配置项（Settings → 搜索 "LLM"）：

| 配置 | 默认值 | 说明 |
|------|--------|------|
| llm-assistant.apiUrl | http://localhost:8443 | API 地址（指向 Kong 网关） |
| llm-assistant.authMode | token | 认证模式（token / keycloak） |
| llm-assistant.defaultModel | Qwen-72B-Chat | 默认模型 |
| llm-assistant.maxTokens | 2000 | 最大 Token 数 |
| llm-assistant.temperature | 0.7 | 温度参数 |
| llm-assistant.enableStream | true | 启用流式输出 |
| llm-assistant.enableAutocomplete | true | 启用自动补全 |
| llm-assistant.autocompleteDebounce | 500 | 补全防抖时间（ms） |
| llm-assistant.systemPrompt | （内置专业提示词） | 系统提示词 |

快捷键：

| 快捷键 | 功能 |
|--------|------|
| Ctrl+Shift+L | 登录 |
| Ctrl+Shift+C | 打开 AI 对话 |
| Ctrl+Shift+E | 解释选中代码 |
| Ctrl+Shift+R | 重构选中代码 |
| Ctrl+Shift+T | 生成单元测试 |
| Ctrl+Shift+B | 查找 Bug |
| Ctrl+Shift+O | 优化代码 |

### 10.4 JetBrains 插件

```bash
# 构建（需要 JDK 17+）
./scripts/build-jetbrains.sh

# 安装：Settings → Plugins → Install Plugin from Disk → 选择 dist/*.zip
```

功能清单：
- **AI 聊天面板**：工具窗口，支持消息历史、模型选择、Token 计数显示
- **代码补全**：AICompletionContributor，自动触发
- **代码辅助 Actions**（右键菜单 → AI 助手）：
  - 解释代码、重构代码、生成测试、查找 Bug、优化性能
  - 结果支持复制或直接替换选中代码
- **设置界面**：API URL、Token、默认模型、温度滑块等

构建依赖：Gradle 8.7 + JDK 17，使用 IntelliJ Platform Plugin，**零外部运行时依赖**（HTTP 使用 JDK 内置 HttpURLConnection）。

---

## 十一、Nginx 反向代理（生产推荐）

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourcompany.com;

    ssl_certificate     /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    client_max_body_size 10m;

    location / {
        proxy_pass https://127.0.0.1:8443;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket（流式输出）
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
```

```bash
ln -sf /etc/nginx/sites-available/llm-platform /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

---

## 十二、监控与运维

### Grafana

访问 `http://<IP>:3000`，查看实时仪表板。

关键指标：

| 指标 | 告警阈值 |
|------|---------|
| P99 延迟 | > 30s |
| GPU 利用率 | > 90% |
| 错误率 | > 5% |

### 日志

```bash
cd docker
docker compose logs -f api-server
docker compose logs -f vllm-inference
docker stats
```

### 备份

```bash
# 业务数据库
docker exec postgres pg_dump -U llm_platform llm_platform > backup-$(date +%Y%m%d).sql

# 恢复
cat backup-20260319.sql | docker exec -i postgres psql -U llm_platform llm_platform

# 模型
tar -czf models-backup-$(date +%Y%m%d).tar.gz models/
```

### 服务管理

```bash
cd docker
docker compose up -d          # 启动
docker compose down            # 停止
docker compose restart api-server  # 重启单个
docker compose pull && docker compose up -d  # 更新
```

---

## 十三、安全加固

- [ ] 修改所有默认密码
- [ ] 生成强随机 JWT_SECRET
- [ ] 配置 HTTPS（Let's Encrypt）
- [ ] 关闭不必要的端口
- [ ] 定期轮换 API 密钥
- [ ] 定期审查审计日志
- [ ] 保持 Docker 镜像更新

---

## 十四、CI/CD

GitHub Actions（`.github/workflows/ci-cd.yml`）：

| 阶段 | 触发 | 内容 |
|------|------|------|
| Lint & Test | push/PR | ESLint + 类型检查 + 126 个测试 |
| VSCode 构建 | push/PR | 编译 + 打包 .vsix |
| JetBrains 构建 | push/PR | Gradle 打包 zip |
| Docker 构建 | push to main | Build & Push GHCR |
| 安全扫描 | push/PR | Trivy 漏洞扫描 |
| 部署 | develop/main | SSH 部署 Staging/Production |

---

## 十五、故障排查

### 服务无法启动

```bash
docker compose ps
docker compose logs <service-name> --tail=100
```

### GPU 不可用

```bash
nvidia-smi
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

### 模型加载失败

```bash
ls -lh models/Qwen-72B-Chat/
docker exec vllm-inference ls -lh /models/
```

### 认证失败

```bash
# 检查 Keycloak 状态
curl http://localhost:8080/health/ready

# 检查 JWT Secret 是否一致（docker/.env 和 api-server/.env）
grep JWT_SECRET docker/.env api-server/.env

# 检查 API Server 日志
cd docker && docker compose logs api-server --tail=50
```

---

## 十六、附录

### 支持的模型

| 模型 | 参数量 | 上下文 | 显存需求 | 用途 |
|------|--------|--------|---------|------|
| Qwen-72B-Chat | 72B | 32K | 4×A100 80GB | 通用对话 |
| Qwen-14B-Chat | 14B | 16K | 1×A100 40GB | 轻量对话 |
| Qwen2.5-7B-Instruct | 7B | 32K | 24GB | 开发测试 |
| DeepSeek-Coder-33B | 33B | 16K | 2×A100 40GB | 代码补全 |
| Llama-3-70B | 70B | 8K | 4×A100 80GB | 通用对话 |
| BGE-Embedding-ZH | 0.75B | 512 | 4GB | 文本嵌入 |

### 测试

```bash
cd api-server
npm test                    # 126 个用例
npm test -- --coverage      # 覆盖率报告
```
