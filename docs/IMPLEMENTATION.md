# Enterprise LLM Platform - 核心实现详解

## 目录

1. [整体架构设计](#1-整体架构设计)
2. [API 网关实现](#2-api-网关实现)
3. [身份认证与权限系统](#3-身份认证与权限系统)
4. [模型推理服务](#4-模型推理服务)
5. [IDE 插件通信机制](#5-ide-插件通信机制)
6. [用户配额管理](#6-用户配额管理)
7. [监控与告警系统](#7-监控与告警系统)
8. [数据安全机制](#8-数据安全机制)

---

## 1. 整体架构设计

### 1.1 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                   客户端层 (Client Layer)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │VS Code   │  │JetBrains │  │Web API   │  │CLI Tools │  │
│  │插件      │  │插件      │  │客户端     │  │          │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
└───────┼──────────────┼──────────────┼──────────────┼───────┘
        │              │              │              │
        └──────────────┼──────────────┼──────────────┘
                       │ HTTPS/gRPC/mTLS
┌──────────────────────▼──────────────────────────────────────┐
│                   网关层 (Gateway Layer)                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Kong Gateway                                         │   │
│  │  ├─ 路由匹配                   │   │
│  │  ├─ 认证鉴权 (JWT/OAuth2)                          │   │
│  │  ├─ 限流控制 (Redis)                                │   │
│  │  ├─ 请求转换                                         │   │
│  │  └─ 响应转换                                         │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐
│  认证服务    │ │ 业务服务  │ │ 推理服务   │
│              │ │          │ │            │
│  Keycloak   │ │ 平台API  │ │  vLLM      │
│              │ │          │ │  TensorRT  │
│  PostgreSQL │ │ PostgreSQL│ │  TGI       │
└──────────────┘ └──────────┘ └────────────┘
        │              │              │
        └──────────────┼──────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   数据层 (Data Layer)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │PostgreSQL│  │  Redis   │  │  Loki    │  │Prometheus│  │
│  │(业务数据) │  │(缓存/限流)│  │(日志)    │  │(监控)    │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 请求流程

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
路由到推理服务
    ↓
推理服务处理请求
    ↓
流式返回结果
    ↓
插件接收并显示
```

---

## 2. API 网关实现

### 2.1 Kong 网关配置

Kong 作为统一 API 网关，负责：
- 请求路由
- 认证鉴权
- 限流控制
- 请求/响应转换

**关键配置文件：** `docker/kong/kong.yml`

```yaml
services:
  - name: vllm-inference-service
    url: http://vllm-inference:8000
    routes:
      - name: llm-chat-completions
        paths:
          - /v1/chat/completions
        methods:
          - POST
        plugins:
          - name: jwt                    # JWT 认证
          - name: rate-limiting          # 限流
            config:
              minute: 60                 # 每分钟60次
              hour: 1000                 # 每小时1000次
              policy: redis
              redis_host: redis
              redis_port: 6379
```

### 2.2 JWT 认证流程

```
1. 用户登录 Keycloak
   ↓
2. Keycloak 返回 Access Token (JWT)
   ↓
3. 插件存储 Token
   ↓
4. 后续请求携带 Token
   ↓
5. Kong 验证 Token 签名
   ↓
6. Token 有效 → 转发到后端
   Token 无效 → 返回 401
```

### 2.3 限流机制

限流采用 **令牌桶算法**，使用 Redis 作为后端存储：

```python
# 令牌桶算法实现 (伪代码)
class RateLimiter:
    def __init__(self, redis_client):
        self.redis = redis_client

    def check_limit(self, user_id, limit_per_minute):
        key = f"rate_limit:{user_id}:{time.strftime('%Y%m%d%H%M')}"
        current = self.redis.incr(key)

        if current == 1:
            self.redis.expire(key, 60)  # 60秒过期

        if current > limit_per_minute:
            return False, current

        return True, current
```

限流策略：
- **按用户限流**：每个用户独立的令牌桶
- **分级限流**：不同角色不同配额
- **动态调整**：可根据系统负载动态调整

---

## 3. 身份认证与权限系统

### 3.1 Keycloak 配置

Keycloak 是开源的身份和访问管理解决方案，支持：
- OpenID Connect / OAuth 2.0
- 单点登录 (SSO)
- 社交账号登录
- 多因素认证

**Realm 配置：** `docker/keycloak/realm-export.json`

### 3.2 权限模型

采用 **RBAC (基于角色的访问控制)** 模型：

```
用户 (User)
  ↓ 1:N
角色 (Role)
  ↓ 1:N
权限 (Permission)
  ↓
资源 (Resource)
```

**角色定义：**

| 角色 | 权限 | 配额 |
|------|------|------|
| `admin` | 全部权限 | 无限制 |
| `developer` | 所有模型访问、API 调用 | 100K tokens/day |
| `user` | 基础模型访问 | 10K tokens/day |
| `auditor` | 只读访问 | N/A |

### 3.3 认证流程图

```
┌─────────────┐
│  VS Code    │
│   Plugin    │
└──────┬──────┘
       │ 1. 点击登录
       ▼
┌─────────────┐
│  Keycloak   │◄────────────┐
│  认证页面   │             │
└──────┬──────┘             │
       │ 2. 授权码         │
       ▼                    │
┌─────────────┐              │
│  Plugin     │              │
│  交换Token  │              │
└──────┬──────┘              │
       │ 3. Token          │
       ▼                    │
┌─────────────┐              │
│  密钥存储    │              │
│  (Secrets)  │              │
└─────────────┘              │
       │ 4. 后续请求         │
       ▼                    │
┌─────────────┐              │
│  API Gateway│──────────────┘
│  验证JWT    │
└─────────────┘
```

---

## 4. 模型推理服务

### 4.1 vLLM 推理引擎

vLLM 是高性能的大模型推理引擎，核心特性：
- **PagedAttention**: 高效显存管理
- **Continuous Batching**: 提高吞吐量
- **KV Cache 优化**: 减少重复计算

**启动配置：**

```bash
docker run --gpus all \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen-72B-Chat \
  --tensor-parallel-size 4 \      # 4卡并行
  --gpu-memory-utilization 0.95 \  # 95%显存利用率
  --max-model-len 8192 \          # 最大上下文长度
  --dtype bfloat16 \              # 数据类型
  --host 0.0.0.0 \
  --port 8000 \
  --trust-remote-code
```

### 4.2 OpenAI 兼容 API

vLLM 提供与 OpenAI 兼容的 API：

```bash
# 聊天补全
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer <token>

{
  "model": "Qwen-72B-Chat",
  "messages": [
    {"role": "user", "content": "你好"}
  ],
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**流式响应：**

```json
data: {"id":"chat-xxx","choices":[{"delta":{"content":"你"},"index":0,"finish_reason":null}]}

data: {"id":"chat-xxx","choices":[{"delta":{"content":"好"},"index":0,"finish_reason":null}]}

data: [DONE]
```

### 4.3 推理性能优化

| 优化手段 | 说明 | 效果 |
|----------|------|------|
| Tensor 并行 | 多卡并行计算 | 4x 吞吐量 |
| Continuous Batching | 动态批处理 | 2-3x 吞吐量 |
| KV Cache | 缓存中间结果 | 减少 50% 计算量 |
| FP8/BF16 | 低精度计算 | 2x 速度 |
| 量化 (AWQ/GPTQ) | 4-bit/8-bit 量化 | 显存节省 50%+ |

---

## 5. IDE 插件通信机制

### 5.1 VS Code 插件架构

```
extension.ts (主入口)
    ↓
├── client/
│   ├── aiClient.ts      # AI API 客户端
│   ├── authClient.ts    # 认证客户端
│   └── config.ts       # 配置管理
├── providers/
│   ├── chat.ts         # 聊天面板
│   └── completion.ts   # 代码补全
└── utils/
    ├── debounce.ts     # 防抖工具
    └── telemetry.ts    # 遥测数据
```

### 5.2 流式请求实现

```typescript
// 客户端流式请求实现
async *chatStream(request: AIRequest): AsyncGenerator<string> {
    const response = await axios({
        method: 'POST',
        url: `${this.apiBaseUrl}/v1/chat/completions`,
        responseType: 'stream',
        data: { ...request, stream: true }
    });

    for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);

                if (data === '[DONE]') return;

                const parsed = JSON.parse(data);
                const content = parsed.choices[0]?.delta?.content;

                if (content) {
                    yield content;  // 实时流式输出
                }
            }
        }
    }
}
```

### 5.3 插件与后端交互

```
插件侧                           服务端
  │                                │
  │  1. 获取 Token (OAuth)         │
  ├───────────────────────────────>│
  │                                │
  │  2. 发送请求 (带 Token)        │
  ├───────────────────────────────>│
  │                                │
  │  3. 网关验证 Token            │
  │                                │
  │  4. 检查限流 (Redis)         │
  │                                │
  │  5. 路由到推理服务            │
  │                                │
  │  6. 流式返回                   │
  │<───────────────────────────────┤
  │  (SSE 流)                      │
```

### 5.4 消息加密

传输层加密：
- 使用 TLS 1.3
- 证书验证
- 双向认证 (mTLS)

```typescript
// mTLS 配置示例
const httpsAgent = new https.Agent({
  cert: fs.readFileSync('client.crt'),
  key: fs.readFileSync('client.key'),
  ca: fs.readFileSync('ca.crt'),
  rejectUnauthorized: true
});
```

---

## 6. 用户配额管理

### 6.1 配额模型

```sql
-- 配额表结构
CREATE TABLE user_quotas (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    quota_type VARCHAR(50),      -- 'tokens_per_day', 'calls_per_hour'
    daily_limit INTEGER,         -- 每日限制
    hourly_limit INTEGER,        -- 每小时限制
    monthly_limit INTEGER       -- 每月限制
);

-- 使用记录表
CREATE TABLE usage_records (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    model_name VARCHAR(100),
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    status VARCHAR(50),         -- 'success', 'error'
    created_at TIMESTAMP
);

-- 每日汇总表
CREATE TABLE daily_usage_summary (
    user_id UUID,
    date DATE,
    total_tokens INTEGER,
    total_requests INTEGER,
    UNIQUE(user_id, date)
);
```

### 6.2 配额检查逻辑

```python
def check_quota(user_id, tokens_needed):
    # 获取今日已用量
    today = datetime.now().date()
    used = db.query("""
        SELECT total_tokens FROM daily_usage_summary
        WHERE user_id = %s AND date = %s
    """, (user_id, today))

    # 获取配额
    quota = db.query("""
        SELECT daily_limit FROM user_quotas
        WHERE user_id = %s AND quota_type = 'tokens_per_day'
    """, user_id)

    if used + tokens_needed > quota:
        raise QuotaExceededException(
            f"配额不足: 已使用 {used}/{quota}"
        )

    return True
```

### 6.3 配额分级策略

| 级别 | 每日 Token | 每小时调用数 | 价格 |
|------|------------|--------------|------|
| 基础 | 10,000 | 100 | 免费 |
| 标准 | 100,000 | 1,000 | ¥100/月 |
| 高级 | 1,000,000 | 10,000 | ¥500/月 |
| 企业 | 自定义 | 自定义 | 联系销售 |

---

## 7. 监控与告警系统

### 7.1 监控指标

**基础设施指标：**
- CPU 使用率
- 内存使用率
- GPU 利用率
- 磁盘 I/O
- 网络流量

**业务指标：**
- QPS (每秒请求数)
- P50/P95/P99 延迟
- Token 吞吐量
- 错误率
- 活跃用户数

### 7.2 Prometheus 配置

```yaml
# 抓取配置
scrape_configs:
  - job_name: 'vllm-inference'
    static_configs:
      - targets: ['vllm-inference:8000']
    metrics_path: /metrics

  - job_name: 'kong'
    static_configs:
      - targets: ['kong:8001']
```

**关键 PromQL 查询：**

```promql
# QPS
rate(llm_requests_total[1m])

# P99 延迟
histogram_quantile(0.99, llm_request_duration_seconds)

# 错误率
rate(llm_requests_errors_total[5m]) / rate(llm_requests_total[5m])

# GPU 利用率
nvidia_gpu_utilization

# Token 吞吐量
rate(llm_tokens_total[1m])
```

### 7.3 告警规则

```yaml
- alert: HighErrorRate
  expr: rate(llm_requests_errors_total[5m]) / rate(llm_requests_total[5m]) > 0.05
  for: 5m
  annotations:
    summary: "错误率超过 5%"

- alert: HighLatency
  expr: histogram_quantile(0.99, llm_request_duration_seconds) > 10
  for: 2m
  annotations:
    summary: "P99 延迟超过 10 秒"

- alert: GPUOverload
  expr: nvidia_gpu_utilization > 95
  for: 10m
  annotations:
    summary: "GPU 利用率持续过高"
```

---

## 8. 数据安全机制

### 8.1 敏感信息过滤

**检测模式（正则表达式）：**

```python
SENSITIVE_PATTERNS = {
    'phone': r'1[3-9]\d{9}',
    'email': r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
    'api_key': r'sk-[a-zA-Z0-9]{32,}',
    'jwt_token': r'eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+',
    'database_url': r'(mysql|postgres|mongodb)://[^\s]+',
    'private_key': r'-----BEGIN (RSA |PRIVATE KEY)-----',
}
```

**过滤流程：**

```python
def filter_sensitive(content: str) -> tuple[str, list]:
    """过滤敏感信息，返回过滤后内容和检测结果"""
    findings = []

    for name, pattern in SENSITIVE_PATTERNS.items():
        matches = re.findall(pattern, content)
        if matches:
            findings.append({'type': name, 'matches': matches})
            content = re.sub(pattern, '[REDACTED]', content)

    return content, findings
```

### 8.2 数据脱敏

```python
def mask_pii(text: str) -> str:
    """脱敏处理个人隐私信息"""
    # 手机号脱敏
    text = re.sub(r'(1[3-9]\d)\d{4}(\d{4})', r'\1****\2', text)

    # 身份证脱敏
    text = re.sub(r'(\d{6})\d{8}(\d{4})', r'\1********\2', text)

    # 银行卡脱敏
    text = re.sub(r'(\d{4})\d{8,12}(\d{4})', r'\1********\2', text)

    return text
```

### 8.3 审计日志

```sql
-- 审计日志表
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    user_id UUID,
    action VARCHAR(100),           -- 操作类型
    resource_type VARCHAR(100),    -- 资源类型
    resource_id VARCHAR(100),      -- 资源ID
    details JSONB,                 -- 详细信息
    ip_address INET,
    user_agent TEXT,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
```

**必审计操作：**
- 用户登录/登出
- 配额修改
- 模型访问
- API 密钥操作
- 敏感信息访问

---

## 9. 性能优化建议

### 9.1 推理层优化

1. **使用量化模型**：4-bit AWQ 量化，显存节省 75%
2. **调整批处理**：根据负载动态调整 batch size
3. **启用 KV Cache**：减少重复计算
4. **使用 FastAPI + Uvicorn**：异步处理

### 9.2 网络层优化

1. **启用 HTTP/2**：减少连接开销
2. **使用 gRPC**：支持多路复用
3. **配置 CDN**：加速静态资源
4. **启用 Brotli 压缩**：减小传输体积

### 9.3 数据层优化

1. **Redis 集群**：分布式缓存
2. **PostgreSQL 读写分离**：主从复制
3. **连接池管理**：避免连接泄漏
4. **索引优化**：加速查询

---

## 10. 部署架构

### 10.1 生产环境拓扑

```
                    ┌─────────────┐
                    │   用户      │
                    │  IDE 插件   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   CDN/WAF   │
                    └──────┬──────┘
                           │
              ┌────────────▼────────────┐
              │   负载均衡 (Nginx)      │
              └────────────┬────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
   │ Kong A  │      │ Kong B  │      │ Kong C  │
   └────┬────┘      └────┬────┘      └────┬────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
     ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
     │ vLLM-1  │    │ vLLM-2  │    │ vLLM-3  │
     │ (4x GPU) │    │ (4x GPU) │    │ (4x GPU) │
     └─────────┘    └─────────┘    └─────────┘
```

### 10.2 高可用配置

| 组件 | HA 方案 |
|------|---------|
| Kong | 3节点集群 + PostgreSQL 集群 |
| Keycloak | 3节点集群 + PostgreSQL 主从 |
| vLLM | 3节点，每节点 4x GPU |
| Redis | 3节点哨兵模式 |
| PostgreSQL | 主从复制 + 自动故障转移 |

---

## 总结

本实现方案提供了：
- ✅ 完整的企业级部署方案
- ✅ 安全的认证授权机制
- ✅ 高性能的推理服务
- ✅ 灵活的配额管理
- ✅ 全面的监控告警
- ✅ 便捷的 IDE 集成

可根据实际需求调整模型选择、硬件配置和功能模块。
