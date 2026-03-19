# 企业大模型平台 - 部署方案

## 目录

- [1. 部署概述](#1-部署概述)
- [2. 硬件要求](#2-硬件要求)
- [3. 软件依赖](#3-软件依赖)
- [4. 部署架构](#4-部署架构)
- [5. 部署步骤](#5-部署步骤)
- [6. 配置说明](#6-配置说明)
- [7. 安全配置](#7-安全配置)
- [8. 高可用部署](#8-高可用部署)
- [9. 故障处理](#9-故障处理)
- [10. 备份与恢复](#10-备份与恢复)

---

## 1. 部署概述

### 1.1 部署模式

本平台支持以下部署模式：

| 模式 | 适用场景 | 复杂度 | 成本 |
|------|----------|--------|------|
| **单机部署** | 小团队（<50人） | 低 | 低 |
| **高可用部署** | 中等团队（50-500人） | 中 | 中 |
| **集群部署** | 大型企业（500+人） | 高 | 高 |

### 1.2 部署方式

- **Docker Compose**（推荐用于测试和小规模生产）
- **Kubernetes**（推荐用于大规模生产）
- **手动部署**（不推荐）

---

## 2. 硬件要求

### 2.1 推理服务器

| 模型 | 显存需求 | GPU 配置 | 建议配置 |
|------|----------|----------|----------|
| Qwen-72B-Chat | ~80GB | 2x A800 (80GB) 或 4x A10G (24GB) | CPU: 32核, RAM: 128GB |
| Qwen-14B-Chat | ~16GB | 1x A10G (24GB) | CPU: 16核, RAM: 64GB |
| DeepSeek-Coder-33B | ~40GB | 2x A10G (24GB) | CPU: 24核, RAM: 96GB |

### 2.2 应用服务器

| 服务 | CPU | 内存 | 磁盘 |
|------|-----|------|------|
| API 网关 (Kong) | 4核 | 8GB | 50GB |
| 身份认证 (Keycloak) | 4核 | 8GB | 50GB |
| 应用数据库 (PostgreSQL) | 8核 | 32GB | 500GB+ |
| Redis 缓存 | 4核 | 16GB | 100GB |
| 监控服务 (Prometheus) | 4核 | 16GB | 500GB+ |

### 2.3 网络要求

- 内网带宽：建议 10Gbps
- 外网带宽：根据并发量决定，建议 1Gbps+
- 延迟：内部服务间 < 1ms

---

## 3. 软件依赖

### 3.1 基础软件

```bash
# 操作系统
- Linux: CentOS 7+, Ubuntu 18.04+, openEuler 22.03+

# 容器运行时
- Docker: 20.10+
- Docker Compose: 2.0+

# GPU 驱动
- NVIDIA Driver: 470.57+
- NVIDIA Container Toolkit: latest
```

### 3.2 验证安装

```bash
# 验证 Docker
docker --version
docker-compose version

# 验证 NVIDIA
nvidia-smi
docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi
```

---

## 4. 部署架构

### 4.1 单机部署架构

```
┌─────────────────────────────────────────────────────────┐
│                      物理服务器                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Docker 容器编排                     │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐    │   │
│  │  │Kong      │  │Keycloak  │  │PostgreSQL│    │   │
│  │  │:8443     │  │:8080     │  │:5432     │    │   │
│  │  └──────────┘  └──────────┘  └──────────┘    │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐    │   │
│  │  │Redis     │  │Prometheus│  │Grafana   │    │   │
│  │  │:6379     │  │:9090     │  │:3000     │    │   │
│  │  └──────────┘  └──────────┘  └──────────┘    │   │
│  │  ┌──────────────────────────────────────┐    │   │
│  │  │      vLLM 推理服务 (GPU 0-3)       │    │   │
│  │  │              :8000                  │    │   │
│  │  └──────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  NVIDIA GPUs (4x A800)                                  │
└─────────────────────────────────────────────────────────┘
```

### 4.2 高可用部署架构

```
                    ┌─────────────┐
                    │   用户网络   │
                    └──────┬──────┘
                           │
              ┌────────────▼────────────┐
              │   负载均衡 (Nginx)      │
              │   HA Keepalived       │
              └────────────┬────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
   │ Node A  │       │ Node B  │       │ Node C  │
   │ (主)    │       │ (备)    │       │ (备)    │
   └────┬────┘       └────┬────┘       └────┬────┘
        │                 │                 │
   ┌────▼─────────────────▼─────────────────▼────┐
   │           Docker Swarm / Kubernetes           │
   │  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
   │  │Kong x3   │  │Keycloak  │  │vLLM x3   │ │
   │  └──────────┘  └──────────┘  └──────────┘ │
   └───────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
   │Redis    │       │PostgreSQL│      │Prometheus│
   │Sentinel  │       │主从复制   │      │+Grafana  │
   └─────────┘       └──────────┘      └──────────┘
```

---

## 5. 部署步骤

### 5.1 准备阶段

```bash
# 1. 创建工作目录
mkdir -p /opt/llm-platform
cd /opt/llm-platform

# 2. 克隆或复制项目文件
# git clone <repository-url> .
# 或手动复制项目文件

# 3. 创建必要目录
mkdir -p models data logs config

# 4. 设置权限
chmod -R 755 /opt/llm-platform
```

### 5.2 配置环境变量

```bash
# 复制环境变量模板
cp docker/.env.example docker/.env

# 编辑配置
vim docker/.env
```

**关键配置项：**

```bash
# ========================================
# API 配置
# ========================================
API_BASE_URL=https://api.yourcompany.com    # 修改为实际域名
API_PORT=8443

# ========================================
# 数据库密码（修改为强密码）
# ========================================
KONG_DB_PASSWORD=<生成强密码>
KEYCLOAK_DB_PASSWORD=<生成强密码>
POSTGRES_PASSWORD=<生成强密码>
REDIS_PASSWORD=<生成强密码>

# ========================================
# Keycloak 配置
# ========================================
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<修改默认密码>

# ========================================
# 推理服务配置
# ========================================
VLLM_TENSOR_PARALLEL_SIZE=4              # 根据 GPU 数量调整
VLLM_MAX_MODEL_LEN=8192                   # 根据需求调整
```

### 5.3 下载模型

```bash
# 方式一：使用部署脚本自动下载
./scripts/deploy.sh

# 方式二：手动下载
# 安装 HuggingFace CLI
pip install huggingface_hub

# 下载模型
huggingface-cli download Qwen/Qwen-72B-Chat \
    --local-dir ./models/Qwen-72B-Chat \
    --local-dir-use-symlinks False

# 验证模型
ls -lh models/Qwen-72B-Chat/
```

### 5.4 启动服务

```bash
# 进入 docker 目录
cd docker

# 拉取镜像
docker-compose pull

# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 5.5 验证部署

```bash
# 1. 检查容器状态
docker-compose ps

# 2. 检查推理服务
curl -f http://localhost:8000/health

# 3. 检查 API 网关
curl -k https://localhost:8443/health

# 4. 检查 Keycloak
curl http://localhost:8080/health/ready

# 5. 检查 Grafana
curl http://localhost:3000/api/health
```

---

## 6. 配置说明

### 6.1 Nginx 反向代理配置

```nginx
# /etc/nginx/conf.d/llm-platform.conf
upstream kong_backend {
    server 127.0.0.1:8443;
    keepalive 32;
}

upstream keycloak_backend {
    server 127.0.0.1:8080;
    keepalive 32;
}

# HTTPS 重定向
server {
    listen 80;
    server_name api.yourcompany.com;
    return 301 https://$server_name$request_uri;
}

# API 代理
server {
    listen 443 ssl http2;
    server_name api.yourcompany.com;

    ssl_certificate /etc/ssl/certs/llm-platform.crt;
    ssl_certificate_key /etc/ssl/private/llm-platform.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # API 路由
    location / {
        proxy_pass https://kong_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}

# Keycloak 代理
server {
    listen 443 ssl http2;
    server_name auth.yourcompany.com;

    ssl_certificate /etc/ssl/certs/llm-platform.crt;
    ssl_certificate_key /etc/ssl/private/llm-platform.key;

    location / {
        proxy_pass http://keycloak_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 6.2 防火墙配置

```bash
# 允许必要端口
firewall-cmd --permanent --add-port=80/tcp    # HTTP
firewall-cmd --permanent --add-port=443/tcp   # HTTPS
firewall-cmd --permanent --add-port=22/tcp    # SSH

# 仅内网访问的服务端口
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" port port="8080" protocol="tcp" accept'
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" port port="3000" protocol="tcp" accept'

# 重载防火墙
firewall-cmd --reload
```

### 6.3 系统优化

```bash
# 1. 文件描述符限制
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# 2. 内核参数
cat >> /etc/sysctl.conf << EOF
# 网络优化
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.ip_local_port_range = 10000 65000

# 内存优化
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5

# GPU 相关
nvidia.NVreg_EnableGpuFirmware=0
nvidia.NVreg_EnablePageRetirement=1
EOF

sysctl -p
```

---

## 7. 安全配置

### 7.1 证书配置

```bash
# 使用 Let's Encrypt 免费证书
certbot certonly --nginx -d api.yourcompany.com -d auth.yourcompany.com

# 证书位置
# /etc/letsencrypt/live/api.yourcompany.com/fullchain.pem
# /etc/letsencrypt/live/api.yourcompany.com/privkey.pem
```

### 7.2 密码策略

```bash
# 1. 生成强密码
openssl rand -base64 32

# 2. 定期更换密码（建议每90天）
# 3. 启用 Keycloak 密码策略

# Keycloak 密码策略配置
登录 Keycloak Admin Console
→ Realm Settings → Password Policy
- Minimum Length: 12
- Max Character Repeats: 3
- Not Username: true
- Not Email: true
- Special Characters: true
- Upper Case: true
- Lower Case: true
- Digits: true
```

### 7.3 数据库安全

```sql
-- 1. 创建专用数据库用户
CREATE USER llm_platform WITH PASSWORD 'StrongPassword123!';

-- 2. 授予最小权限
GRANT CONNECT ON DATABASE llm_platform TO llm_platform;
GRANT USAGE ON SCHEMA public TO llm_platform;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO llm_platform;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO llm_platform;

-- 3. 禁用远程 root 登录
-- 编辑 pg_hba.conf
host all all 0.0.0.0/0 reject
host all all 10.0.0.0/8 md5
```

### 7.4 日志审计

```bash
# 配置审计日志保留时间
cat >> /etc/logrotate.d/llm-platform << EOF
/opt/llm-platform/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 llm-platform llm-platform
}
EOF
```

---

## 8. 高可用部署

### 8.1 Docker Swarm 部署

```bash
# 1. 初始化 Swarm
docker swarm init --advertise-addr <MANAGER_IP>

# 2. 添加工作节点
docker swarm join --token <WORKER_TOKEN> <MANAGER_IP>:2377

# 3. 部署栈
docker stack deploy -c docker-stack.yml llm-platform
```

**docker-stack.yml 示例：**

```yaml
version: '3.8'

services:
  kong:
    image: kong/kong-gateway:3.5.0.0
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
      placement:
        constraints:
          - node.labels.type == application
    networks:
      - llm-network

  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    deploy:
      replicas: 2
      placement:
        constraints:
          - node.labels.type == application
    networks:
      - llm-network

  vllm:
    image: vllm/vllm-openai:latest
    deploy:
      replicas: 3
      placement:
        constraints:
          - node.labels.type == gpu
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    networks:
      - llm-network

networks:
  llm-network:
    driver: overlay
    attachable: true
```

### 8.2 PostgreSQL 主从复制

```bash
# 主节点配置
# postgresql.conf
wal_level = replica
max_wal_senders = 5
wal_keep_size = 1GB

# pg_hba.conf
host replication replicator 10.0.0.0/8 md5

# 从节点配置
# standby.signal
# recovery.conf
standby_mode = 'on'
primary_conninfo = 'host=primary-ip port=5432 user=replicator password=xxx'
```

---

## 9. 故障处理

### 9.1 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| GPU 不可用 | NVIDIA 驱动问题 | 重启服务或更新驱动 |
| 内存溢出 | 批处理过大 | 减少 `max_model_len` |
| 连接超时 | 网络问题 | 检查防火墙和网络 |
| Token 验证失败 | Token 过期 | 刷新 Token |
| 限流触发 | 请求过多 | 等待限流窗口 |

### 9.2 故障排查命令

```bash
# 查看容器状态
docker-compose ps

# 查看容器日志
docker-compose logs -f [service-name]

# 进入容器调试
docker-compose exec [service-name] bash

# 检查 GPU 使用
nvidia-smi -l 1

# 检查网络连接
docker network inspect llm-network

# 检查数据库连接
docker-compose exec postgres psql -U llm_platform -d llm_platform

# 检查 Redis 连接
docker-compose exec redis redis-cli -a <password> ping
```

### 9.3 紧急恢复

```bash
# 1. 停止所有服务
cd docker && docker-compose down

# 2. 恢复数据库
docker run --rm -v /opt/llm-platform/data:/data postgres:15 \
    psql -h postgres_host -U llm_platform llm_platform < backup.sql

# 3. 恢复配置
cp /opt/llm-platform/backup/.env docker/.env

# 4. 重新启动
docker-compose up -d

# 5. 验证服务
./scripts/health-check.sh
```

---

## 10. 备份与恢复

### 10.1 备份策略

| 数据类型 | 备份频率 | 保留时间 | 备份方式 |
|----------|----------|----------|----------|
| 数据库 | 每日 | 30天 | pg_dump + tar |
| 模型文件 | 部署时 | 永久 | rsync |
| 配置文件 | 变更时 | 永久 | git |
| 日志文件 | 每日 | 7天 | logrotate |

### 10.2 备份脚本

```bash
#!/bin/bash
# /opt/llm-platform/scripts/backup.sh

BACKUP_DIR="/opt/llm-platform/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 1. 备份数据库
docker exec postgres pg_dump -U llm_platform llm_platform \
    | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# 2. 备份配置
tar -czf $BACKUP_DIR/config_$DATE.tar.gz docker/.env docker/kong docker/keycloak

# 3. 备份 Redis
docker exec redis redis-cli -a $REDIS_PASSWORD --rdb $DATE.rdb

# 4. 清理旧备份
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

### 10.3 自动备份

```bash
# 添加到 crontab
crontab -e

# 每日凌晨 2 点备份
0 2 * * * /opt/llm-platform/scripts/backup.sh >> /var/log/llm-backup.log 2>&1
```

---

## 附录

### A. 端口清单

| 端口 | 服务 | 说明 | 外部访问 |
|------|------|------|----------|
| 80 | HTTP | Nginx HTTP | 是 |
| 443 | HTTPS | Nginx HTTPS | 是 |
| 22 | SSH | 管理访问 | 是（限IP） |
| 8000 | vLLM | 推理服务 | 否 |
| 8080 | Keycloak | 认证服务 | 否 |
| 8443 | Kong | API 网关 | 否 |
| 5432 | PostgreSQL | 数据库 | 否 |
| 6379 | Redis | 缓存 | 否 |
| 9090 | Prometheus | 监控 | 否 |
| 3000 | Grafana | 可视化 | 否 |

### B. 目录结构

```
/opt/llm-platform/
├── docker/           # Docker 配置
├── models/           # 模型文件
├── data/             # 数据目录
├── logs/             # 日志目录
├── backups/          # 备份目录
├── scripts/          # 运维脚本
└── docs/             # 文档
```

### C. 部署检查清单

- [ ] 硬件配置满足要求
- [ ] 软件依赖已安装
- [ ] 环境变量已配置
- [ ] 模型已下载
- [ ] 服务已启动
- [ ] 健康检查通过
- [ ] 监控已配置
- [ ] 备份已设置
- [ ] 安全配置完成
- [ ] 用户已创建
