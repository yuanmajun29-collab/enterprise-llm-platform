# 更新 docker-compose.yml 添加 API 服务

## 1. 在 vllm-inference 服务后添加 api-server 服务

```yaml
  # ========================================
  # API 业务服务
  # ========================================
  api-server:
    build:
      context: ./api-server
      dockerfile: Dockerfile
    container_name: api-server
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://llm_platform:${POSTGRES_PASSWORD:-llm_platform_password_2024}@postgres:5432/llm_platform
      - REDIS_URL=redis://:${REDIS_PASSWORD:-redis_secure_password_2024}@redis:6379
      - KEYCLOAK_URL=http://keycloak:8080
      - KEYCLOAK_REALM=enterprise-llm
      - KEYCLOAK_CLIENT_ID=vscode-plugin
      - VLLM_API_URL=http://vllm-inference:8000
      - JWT_SECRET=${JWT_SECRET:-jwt_secret_change_me_please}
      - PORT=8080
    depends_on:
      - postgres
      - redis
      - keycloak
      - vllm-inference
    networks:
      - llm-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "3"

  # ========================================
  # 创建 api-server/Dockerfile
  # ========================================
  
  # api-server/Dockerfile 内容：
  
  FROM node:18-alpine

  WORKDIR /app

  # 安装依赖
  COPY package*.json ./
  RUN npm ci --only=production

  # 复制源代码
  COPY . .

  # 构建 TypeScript
  RUN npm run build

  # 暴露端口
  EXPOSE 8080

  # 健康检查
  HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

  # 启动应用
  CMD ["node", "dist/index.js"]
```

## 2. 添加 API 路由到 Kong

更新 `docker/kong/kong.yml`，添加路由：

```yaml
_format_version: "3.0"

services:
  - name: api-server
    url: http://api-server:8080
    routes:
      - name: api-health
        paths:
          - /api/health
        strip_path: false
      - name: api-auth
        paths:
          - /api/auth
      - name: api-user
        paths:
          - /api/user
      - name: api-models
        paths:
          - /api/models
      - name: api-conversations
        paths:
          - /api/conversations
      - name: api-usage
        paths:
          - /api/usage
    plugins:
      - name: rate-limiting
        config:
          minute: 60
          hour: 1000
          day: 10000
          limit_by: ip
      - name: cors
        config:
          origins:
            - "*"
          methods:
            - GET
            - POST
            - PUT
            - DELETE
            - OPTIONS
          exposed_headers:
            - "Content-Type"
            - "Authorization"
            - "X-Request-ID"
```

## 3. 更新网络拓扑

### 当前网络结构
```
所有服务在同一个网络（llm-network）
```

### 建议优化（可选）

创建两个网络：
- `public`: 公网服务（Kong）
- `internal`: 内部服务（API、数据库、Redis）

```yaml
networks:
  public:
    driver: bridge
    name: llm-public
  internal:
    driver: bridge
    name: llm-internal
    internal: true

# 服务网络分配
kong:
  networks:
    - public
    - internal

api-server:
  networks:
    - internal

postgres:
  networks:
    - internal

redis:
  networks:
    - internal
```

## 4. 环境变量更新

在 `docker/.env.example` 中添加：

```bash
# API Server
NODE_ENV=production
PORT=8080
JWT_SECRET=your_jwt_secret_change_me_please

# CORS
CORS_ORIGIN=*
```

## 5. 部署步骤

### 方式一：Docker Compose（推荐）

```bash
# 1. 更新 docker-compose.yml
# 2. 更新 docker/.env
# 3. 启动所有服务
cd docker
docker-compose up -d --build

# 4. 查看日志
docker-compose logs -f api-server
```

### 方式二：单独部署 API 服务器

```bash
# 1. 进入 API 服务器目录
cd api-server

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env

# 4. 启动开发服务器
npm run dev
```

## 6. 验证部署

### 检查服务状态
```bash
cd docker
docker-compose ps
```

### 测试 API
```bash
# 健康检查
curl http://localhost:8080/health

# 通过 Kong 网关测试
curl http://localhost:8443/api/health
```

### 测试认证流程
```bash
# 注册用户
curl -X POST http://localhost:8443/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "Test123456!"
  }'

# 登录
curl -X POST http://localhost:8443/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "Test123456!"
  }'
```

## 7. 监控和日志

### 查看日志
```bash
# API 服务器日志
docker-compose logs -f api-server

# 所有服务日志
docker-compose logs -f
```

### 访问监控
- API 服务器：http://localhost:8080/health
- Grafana：http://localhost:3000
- Prometheus：http://localhost:9090

---

## 📋 更新清单

- [ ] 在 docker-compose.yml 中添加 api-server 服务
- [ ] 创建 api-server/Dockerfile
- [ ] 更新 Kong 路由配置
- [ ] 更新 docker/.env.example
- [ ] 测试 API 服务部署
- [ ] 验证 Kong 路由
- [ ] 配置健康检查
- [ ] 添加资源限制
- [ ] 测试认证流程

---

*创建日期: 2026-03-16*
*版本: v1.0.0*
