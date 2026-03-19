# Enterprise LLM Platform

企业大模型服务器平台 - 支持本地化部署，通过 IDE 插件调用

## 项目结构

```
enterprise-llm-platform/
├── docker/                    # Docker 配置文件
│   ├── docker-compose.yml    # 服务编排
│   ├── kong/                # API 网关配置
│   ├── prometheus/          # 监控配置
│   ├── grafana/             # 数据可视化配置
│   ├── loki/                # 日志系统配置
│   ├── keycloak/            # 身份认证配置
│   └── sql/                 # 数据库初始化脚本
├── plugin/                   # IDE 插件
│   ├── vscode/              # VS Code 插件
│   └── jetbrains/           # JetBrains 插件
├── scripts/                  # 部署脚本
├── models/                   # 模型文件目录
├── logs/                     # 日志目录
└── data/                     # 数据目录
```

## 快速开始

### 前置要求

- Docker & Docker Compose
- NVIDIA GPU 驱动 & NVIDIA Container Toolkit
- 至少 80GB 显存 (72B 模型) 或可使用量化模型降低需求

### 一键部署

```bash
# 1. 克隆项目
git clone <repository-url>
cd enterprise-llm-platform

# 2. 运行部署脚本
chmod +x scripts/*.sh
./scripts/deploy.sh

# 3. 等待服务启动完成
# 默认访问地址:
# - API Gateway:   https://localhost:8443
# - Keycloak:      http://localhost:8080
# - Grafana:       http://localhost:3000
# - Prometheus:    http://localhost:9090
```

### 模型下载

模型会自动从 HuggingFace 下载到 `models/` 目录。

手动下载:
```bash
# 使用 HuggingFace CLI
pip install huggingface_hub
huggingface-cli download Qwen/Qwen-72B-Chat --local-dir ./models/Qwen-72B-Chat
```

支持的模型:
- Qwen-72B-Chat (推荐)
- Qwen-14B-Chat
- DeepSeek-Coder-33B
- Llama-3-70B-Instruct

## IDE 插件安装

### VS Code 插件

```bash
# 构建
./scripts/build-vscode.sh

# 安装
code --install-extension plugin/vscode/enterprise-llm-assistant-*.vsix
```

配置:
1. 打开 VS Code 设置，搜索 "LLM"
2. 填写 API 地址: `https://your-api-server.com`
3. 配置 API 密钥或使用 OAuth 登录

### JetBrains 插件

```bash
# 构建
./scripts/build-jetbrains.sh

# 安装
# Settings -> Plugins -> Install Plugin from Disk -> 选择构建的 zip 文件
```

## 用户管理

### 创建用户

```bash
./scripts/create-user.sh
```

### 默认管理员账号

- Keycloak: `admin` / `ChangeMe123!` (首次登录需修改)
- Grafana: `admin` / `ChangeMe123!`

## 配置说明

### 环境变量

编辑 `docker/.env` 文件配置以下参数:

```bash
# API 配置
API_BASE_URL=https://api.company.com
API_PORT=8443

# 限流配置
RATE_LIMIT_PER_MINUTE=60
RATE_LIMIT_PER_HOUR=1000
RATE_LIMIT_PER_DAY=10000

# 推理服务配置
VLLM_TENSOR_PARALLEL_SIZE=4      # GPU 数量
VLLM_GPU_MEMORY_UTILIZATION=0.95  # 显存利用率
VLLM_MAX_MODEL_LEN=8192          # 上下文长度
```

### 网络配置

所有服务默认监听在 `0.0.0.0`，生产环境建议:
1. 配置反向代理 (Nginx)
2. 启用 HTTPS
3. 配置防火墙规则

## 功能特性

### 平台功能

- ✅ 多模型支持
- ✅ 用户认证与授权 (Keycloak)
- ✅ API 网关与限流 (Kong)
- ✅ 用户配额管理
- ✅ 审计日志
- ✅ 敏感信息过滤
- ✅ 实时监控 (Prometheus + Grafana)
- ✅ 日志聚合 (Loki)

### IDE 插件功能

- ✅ AI 对话
- ✅ 代码补全
- ✅ 代码解释
- ✅ 代码重构
- ✅ 单元测试生成
- ✅ Bug 检测
- ✅ 代码优化

## API 使用

### 聊天补全

```bash
curl -X POST https://your-api.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen-72B-Chat",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "temperature": 0.7,
    "max_tokens": 1000
  }'
```

### 代码补全

```bash
curl -X POST https://your-api.com/api/code/complete \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \

  
  -d '{
    "code": "def fibonacci(n):",
    "language": "python",
    "cursorPosition": 17,
    "model": "DeepSeek-Coder-33B"
  }'
```

## 监控与运维

### Grafana 仪表板

访问 http://localhost:3000 查看实时监控数据。

关键指标:
- QPS (每秒请求数)
- P99 延迟
- GPU 利用率
- Token 吞吐量
- 用户活跃度

### 日志查看

```bash
# 查看所有服务日志
cd docker && docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f vllm-inference
docker-compose logs -f kong

# 查看容器资源使用
docker stats
```

### 备份与恢复

```bash
# 备份数据库
docker exec postgres pg_dump -U llm_platform llm_platform > backup.sql

# 恢复数据库
cat backup.sql | docker exec -i postgres psql -U llm_platform llm_platform

# 备份模型
tar -czf models-backup.tar.gz models/
```

## 安全建议

1. **修改默认密码**: 部署后立即修改所有默认密码
2. **启用 HTTPS**: 生产环境必须使用 HTTPS
3. **网络隔离**: 使用 VPN 或内网部署
4. **定期更新**: 及时更新组件版本
5. **审计日志**: 定期检查审计日志

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

## 许可证

MIT License

## 技术支持

如有问题，请提交 Issue 或联系技术支持团队。
