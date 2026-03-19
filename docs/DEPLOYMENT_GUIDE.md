# 企业大模型平台 - 完整部署指南

> 本文档提供企业大模型平台的完整部署流程，包括单机部署、高可用部署和生产环境配置。

---

## 目录

- [1. 部署概述](#1-部署概述)
- [2. 环境准备](#2-环境准备)
- [3. 系统配置](#3-系统配置)
- [4. 单机部署](#4-单机部署)
- [5. 高可用部署](#5-高可用部署)
- [6. 配置详解](#6-配置详解)
- [7. 安全加固](#7-安全加固)
- [8. 监控配置](#8-监控配置)
- [9. 备份恢复](#9-备份恢复)
- [10. 常见问题](#10-常见问题)

---

## 1. 部署概述

### 1.1 支持的部署模式

| 部署模式 | 适用场景 | 用户规模 | 复杂度 | 推荐度 |
|---------|---------|---------|--------|--------|
| **单机部署** | 开发测试、小团队 | < 50 人 | 低 | ⭐⭐⭐⭐ |
| **高可用部署** | 中等规模 | 50-500 人 | 中 | ⭐⭐⭐⭐⭐ |
| **集群部署** | 大型企业 | > 500 人 | 高 | ⭐⭐⭐ |

### 1.2 部署架构对比

#### 单机部署架构
```
┌─────────────────────────────────────────────────────────┐
│                    物理服务器                            │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Docker Compose 编排               │   │
│  │  ┌────────┐  ┌────────┐  ┌────────┐          │   │
│  │  │ Kong   │  │Keycloak│  │Postgres│          │   │
│  │  │:8443   │  │:8080   │  │:5432   │          │   │
│  │  └────────┘  └────────┘  └────────┘          │   │
│  │  ┌────────┐  ┌────────┐  ┌────────┐          │   │
│  │  │Redis   │  │Prom    │  │Grafana │          │   │
│  │  │:6379   │  │:9090   │  │:3000   │          │   │
│  │  └────────┘  └────────┘  └────────┘          │   │
│  │  ┌──────────────────────────────────────┐    │   │
│  │  │      vLLM 推理服务 (GPU 0-3)         │    │   │
│  │  │              :8000                     │    │   │
│  │  └──────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  NVIDIA GPUs (4x A800/A10G)                            │
└─────────────────────────────────────────────────────────┘
```

#### 高可用部署架构
```
                      ┌────────────────┐
                      │  外部负载均衡   │
                      │  (Nginx/HAProxy)│
                      └────────┬───────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
     ┌─────▼─────┐      ┌─────▼─────┐      ┌─────▼─────┐
     │  Node A   │      │  Node B   │      │  Node C   │
     │  (主节点)  │      │  (工作节点) │      │  (工作节点) │
     └─────┬─────┘      └─────┬─────┘      └─────┬─────┘
           │                   │                   │
     ┌─────▼───────────────────▼───────────────────▼─────┐
     │              Docker Swarm / Kubernetes             │
     │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐ │
     │  │ Kong   │  │Keycloak│  │ vLLM   │  │Redis   │ │
     │  │  x3    │  │  x2    │  │  x3    │  │Sentinel│ │
     │  └────────┘  └────────┘  └────────┘  └────────┘ │
     │  ┌──────────────────────────────────────────┐    │
     │  │         PostgreSQL 主从集群              │    │
     │  └──────────────────────────────────────────┘    │
     └──────────────────────────────────────────────────┘
```

---

## 2. 环境准备

### 2.1 硬件要求

#### 推理服务器

| 模型 | 显存需求 | GPU 配置 | CPU | 内存 | 存储 |
|------|----------|----------|-----|------|------|
| Qwen-72B-Chat | ~80GB | 4x A10G (24GB) 或 2x A800 (80GB) | 32核+ | 128GB+ | 500GB SSD |
| Qwen-72B-Chat (AWQ) | ~40GB | 2x A10G (24GB) | 32核+ | 96GB+ | 300GB SSD |
| Qwen-14B-Chat | ~16GB | 1x A10G (24GB) | 16核+ | 64GB+ | 200GB SSD |
| DeepSeek-Coder-33B | ~40GB | 2x A10G (24GB) | 24核+ | 96GB+ | 300GB SSD |
| Llama-3-70B | ~140GB | 4x A800 (80GB) | 32核+ | 128GB+ | 500GB SSD |

#### 应用服务器（如独立部署）

| 服务 | CPU | 内存 | 存储 | 网络 |
|------|-----|------|------|------|
| Kong | 8核 | 16GB | 100GB SSD | 10Gbps |
| Keycloak | 8核 | 16GB | 100GB SSD | 10Gbps |
| PostgreSQL | 16核 | 64GB | 2TB SSD | 10Gbps |
| Redis | 8核 | 32GB | 500GB SSD | 10Gbps |
| Prometheus | 8核 | 32GB | 1TB SSD | 10Gbps |

### 2.2 软件依赖

#### 操作系统要求

```bash
# 推荐操作系统
- CentOS 7.9+
- Rocky Linux 8.6+
- Ubuntu 20.04 LTS / 22.04 LTS
- openEuler 22.03 LTS
```

#### Docker 安装

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# CentOS/RHEL
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install -y docker-ce docker-ce-cli containerd.io

# 验证安装
docker --version
# Docker version 24.0.0+
```

#### Docker Compose 安装

```bash
# 方法一：使用插件
sudo apt-get install -y docker-compose-plugin

# 方法二：独立安装
sudo curl -SL https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-linux-x86_64 \
    -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证安装
docker-compose version
# Docker Compose version v2.23.0+
```

#### NVIDIA 驱动安装

```bash
# 安装 NVIDIA 驱动
sudo apt-get install -y linux-headers-$(uname -r)
sudo apt-get install -y nvidia-driver-535

# 或使用官方仓库
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-ubuntu2204.pin
sudo mv cuda-ubuntu2204.pin /etc/apt/preferences.d/cuda-repository-pin-600
wget https://developer.download.nvidia.com/compute/cuda/12.2.0/local_installers/cuda-repo-ubuntu2204-12-2-local_12.2.0-535.54.03-1_amd64.deb
sudo dpkg -i cuda-repo-ubuntu2204-12-2-local_12.2.0-535.54.03-1_amd64.deb
sudo cp /var/cuda-repo-ubuntu2204-12-2-local/cuda-*-keyring.gpg /usr/share/keyrings/
sudo apt-get update
sudo apt-get -y install cuda-toolkit-12-2

# 验证驱动
nvidia-smi
```

#### NVIDIA Container Toolkit 安装

```bash
# 添加 NVIDIA Container Toolkit 仓库
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
    sudo tee /etc/apt/sources.list.d/nvidia-docker.list

# 安装 toolkit
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# 配置 Docker 使用 NVIDIA 运行时
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# 验证 GPU 在 Docker 中可用
docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi
```

### 2.3 环境验证

```bash
#!/bin/bash
# 环境检查脚本

echo "=== 环境检查 ==="

# 检查 Docker
if command -v docker &> /dev/null; then
    echo "✓ Docker 已安装: $(docker --version)"
else
    echo "✗ Docker 未安装"
    exit 1
fi

# 检查 Docker Compose
if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
    echo "✓ Docker Compose 已安装"
else
    echo "✗ Docker Compose 未安装"
    exit 1
fi

# 检查 NVIDIA 驱动
if command -v nvidia-smi &> /dev/null; then
    echo "✓ NVIDIA 驱动已安装"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
else
    echo "⚠ 未检测到 NVIDIA 驱动"
fi

# 检查磁盘空间
available=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$available" -gt 100 ]; then
    echo "✓ 磁盘空间充足: ${available}GB 可用"
else
    echo "⚠ 磁盘空间不足: ${available}GB 可用，建议至少 100GB"
fi

# 检查内存
total_mem=$(free -g | awk '/^Mem:/{print $2}')
if [ "$total_mem" -gt 32 ]; then
    echo "✓ 内存充足: ${total_mem}GB"
else
    echo "⚠ 内存不足: ${total_mem}GB，建议至少 32GB"
fi

echo "=== 环境检查完成 ==="
```

---

## 3. 系统配置

### 3.1 内核参数优化

```bash
# 创建内核参数配置文件
cat > /etc/sysctl.d/99-llm-platform.conf << 'EOF'
# 网络优化
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 30
net.ipv4.ip_local_port_range = 10000 65000
net.ipv4.tcp_max_tw_buckets = 6000
net.ipv4.tcp_keepalive_time = 1200
net.ipv4.tcp_keepalive_probes = 3
net.ipv4.tcp_keepalive_intvl = 15

# 内存优化
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
vm.overcommit_memory = 1

# 文件描述符
fs.file-max = 2097152
fs.inotify.max_user_watches = 524288

# 共享内存
kernel.shmmax = 68719476736   # 64GB
kernel.shmall = 4294967296     # 16GB in pages
EOF

# 应用配置
sysctl -p /etc/sysctl.d/99-llm-platform.conf
```

### 3.2 文件描述符限制

```bash
# 设置用户限制
cat > /etc/security/limits.d/99-llm-platform.conf << 'EOF'
* soft nofile 65536
* hard nofile 65536
* soft nproc 65536
* hard nproc 65536
root soft nofile 65536
root hard nofile 65536
EOF

# 验证配置
ulimit -n
ulimit -u
```

### 3.3 Docker 配置

```bash
# 创建 Docker 配置目录
mkdir -p /etc/docker

# 配置 Docker 守护进程
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "default-runtime": "nvidia",
  "runtimes": {
    "nvidia": {
      "path": "nvidia-container-runtime",
      "runtimeArgs": []
    }
  },
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ],
  "max-concurrent-downloads": 10,
  "max-concurrent-uploads": 10,
  "data-root": "/var/lib/docker"
}
EOF

# 重启 Docker 服务
systemctl daemon-reload
systemctl restart docker
```

### 3.4 防火墙配置

```bash
# 使用 firewalld 配置
firewall-cmd --permanent --add-port=80/tcp    # HTTP
firewall-cmd --permanent --add-port=443/tcp   # HTTPS
firewall-cmd --permanent --add-port=22/tcp    # SSH

# 仅内网访问的服务端口
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" port port="8000" protocol="tcp" accept'
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" port port="8080" protocol="tcp" accept'
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" port port="3000" protocol="tcp" accept'
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" port port="8443" protocol="tcp" accept'
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" port port="9090" protocol="tcp" accept'

# 重载防火墙
firewall-cmd --reload

# 查看防火墙状态
firewall-cmd --list-all
```

---

## 4. 单机部署

### 4.1 准备部署目录

```bash
# 创建工作目录
mkdir -p /opt/enterprise-llm-platform
cd /opt/enterprise-llm-platform

# 创建必要的子目录
mkdir -p models data logs backups config
```

### 4.2 下载项目文件

```bash
# 方式一：Git 克隆
git clone https://github.com/your-org/enterprise-llm-platform.git .
# 或
git clone https://gitee.com/your-org/enterprise-llm-platform.git .

# 方式二：下载压缩包
wget https://github.com/your-org/enterprise-llm-platform/archive/refs/heads/main.zip
unzip main.zip
mv enterprise-llm-platform-main/* .
rm -rf main.zip enterprise-llm-platform-main
```

### 4.3 配置环境变量

```bash
# 复制环境变量模板
cp docker/.env.example docker/.env

# 编辑配置
vim docker/.env
```

**完整配置示例：**

```bash
# ========================================
# 数据库密码配置（请修改为强密码）
# ========================================
KONG_DB_PASSWORD=$(openssl rand -base64 32)
KEYCLOAK_DB_PASSWORD=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)

# ========================================
# Keycloak 配置
# ========================================
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=YourStrongPassword123!

# ========================================
# Grafana 配置
# ========================================
GRAFANA_ADMIN=admin
GRAFANA_PASSWORD=YourStrongPassword123!

# ========================================
# 推理服务配置
# ========================================
MODEL_NAME=/models/Qwen-72B-Chat
VLLM_TENSOR_PARALLEL_SIZE=4              # 根据实际 GPU 数量调整
VLLM_GPU_MEMORY_UTILIZATION=0.95
VLLM_MAX_MODEL_LEN=8192
VLLM_DTYPE=bfloat16

# ========================================
# API 配置
# ========================================
API_BASE_URL=https://api.yourcompany.com
API_PORT=8443
JWT_SECRET=$(openssl rand -base64 48)
LLM_API_SECRET=$(openssl rand -base64 32)

# ========================================
# 限流配置
# ========================================
RATE_LIMIT_PER_MINUTE=60
RATE_LIMIT_PER_HOUR=1000
RATE_LIMIT_PER_DAY=10000

# ========================================
# 监控配置
# ========================================
PROMETHEUS_RETENTION=15d
LOKI_RETENTION=30d

# ========================================
# 日志配置
# ========================================
LOG_LEVEL=info
LOG_MAX_SIZE=100M
LOG_MAX_FILES=3
```

### 4.4 下载模型

#### 使用 HuggingFace 下载

```bash
# 安装 HuggingFace CLI
pip install huggingface_hub

# 下载模型（推荐）
huggingface-cli download Qwen/Qwen-72B-Chat \
    --local-dir ./models/Qwen-72B-Chat \
    --local-dir-use-symlinks False

# 或者使用 git-lfs
git lfs install
git clone https://huggingface.co/Qwen/Qwen-72B-Chat ./models/Qwen-72B-Chat
```

#### 使用 ModelScope 下载（国内推荐）

```bash
# 安装 ModelScope SDK
pip install modelscope

# 下载模型
python -c "from modelscope import snapshot_download
snapshot_download('Qwen/Qwen-72B-Chat', cache_dir='./models')"
```

#### 使用 Docker 容器下载

```bash
docker run --rm \
    -v $(pwd)/models:/models \
    -e HF_TOKEN=your_hf_token \
    ghcr.io/huggingface/text-generation-inference:latest \
    download-model Qwen/Qwen-72B-Chat
```

#### 下载量化模型（节省显存）

```bash
# 下载 AWQ 量化模型
huggingface-cli download Qwen/Qwen-72B-Chat-AWQ \
    --local-dir ./models/Qwen-72B-Chat-AWQ \
    --local-dir-use-symlinks False

# 下载 GPTQ 量化模型
huggingface-cli download Qwen/Qwen-72B-Chat-GPTQ-Int4 \
    --local-dir ./models/Qwen-72B-Chat-GPTQ-Int4 \
    --local-dir-use-symlinks False
```

### 4.5 启动服务

```bash
# 进入 docker 目录
cd docker

# 拉取镜像
docker-compose pull

# 启动服务（按顺序启动：数据库 -> 缓存 -> 应用）
docker-compose up -d postgres redis
sleep 10
docker-compose up -d keycloak-db keycloak
sleep 15
docker-compose up -d kong-database kong
sleep 10
docker-compose up -d vllm-inference
sleep 30
docker-compose up -d prometheus grafana loki promtail

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 4.6 验证部署

```bash
#!/bin/bash
# 部署验证脚本

echo "=== 服务状态检查 ==="
docker-compose ps

echo ""
echo "=== 健康检查 ==="

# 检查推理服务
if curl -f -s http://localhost:8000/health &> /dev/null; then
    echo "✓ vLLM 推理服务正常"
else
    echo "✗ vLLM 推理服务异常"
fi

# 检查 Keycloak
if curl -f -s http://localhost:8080/health/ready &> /dev/null; then
    echo "✓ Keycloak 服务正常"
else
    echo "✗ Keycloak 服务异常"
fi

# 检查 Kong
if curl -f -s http://localhost:8444 &> /dev/null; then
    echo "✓ Kong 管理接口正常"
else
    echo "✗ Kong 管理接口异常"
fi

# 检查 PostgreSQL
if docker-compose exec -T postgres pg_isready -U llm_platform &> /dev/null; then
    echo "✓ PostgreSQL 数据库正常"
else
    echo "✗ PostgreSQL 数据库异常"
fi

# 检查 Redis
if docker-compose exec -T redis redis-cli -a $REDIS_PASSWORD ping &> /dev/null; then
    echo "✓ Redis 缓存正常"
else
    echo "✗ Redis 缓存异常"
fi

# 检查 Grafana
if curl -f -s http://localhost:3000/api/health &> /dev/null; then
    echo "✓ Grafana 监控正常"
else
    echo "✗ Grafana 监控异常"
fi

# 检查 Prometheus
if curl -f -s http://localhost:9090/-/healthy &> /dev/null; then
    echo "✓ Prometheus 监控正常"
else
    echo "✗ Prometheus 监控异常"
fi

echo ""
echo "=== 访问地址 ==="
echo "API Gateway:  https://localhost:8443"
echo "Keycloak:     http://localhost:8080"
echo "Grafana:      http://localhost:3000"
echo "Prometheus:   http://localhost:9090"
echo ""
echo "=== 默认账号 ==="
echo "Keycloak: admin / ChangeMe123!"
echo "Grafana:  admin / admin"
```

---

## 5. 高可用部署

### 5.1 Docker Swarm 部署

#### 初始化 Swarm 集群

```bash
# 在主节点上初始化 Swarm
docker swarm init --advertise-addr <MANAGER_IP>

# 查看加入命令
docker swarm join-token worker

# 在工作节点上执行加入命令
docker swarm join --token <WORKER_TOKEN> <MANAGER_IP>:2377

# 标记节点类型
docker node update --label-add type=application node-1
docker node update --label-add type=gpu node-2
docker node update --label-add type=gpu node-3
```

#### 创建 Docker Stack

```bash
# 部署栈
docker stack deploy -c docker-stack.yml llm-platform

# 查看栈状态
docker stack ps llm-platform

# 查看服务
docker stack services llm-platform
```

#### docker-stack.yml 示例

```yaml
version: '3.8'

services:
  # ========================================
  # 推理服务
  # ========================================
  vllm-inference:
    image: vllm/vllm-openai:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 30s
      restart_policy:
        condition: on-failure
        delay: 10s
        max_attempts: 3
      placement:
        constraints:
          - node.labels.type == gpu
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    volumes:
      - /opt/llm-platform/models:/models
      - /opt/llm-platform/logs:/logs
    environment:
      - MODEL_NAME=/models/Qwen-72B-Chat
      - VLLM_TENSOR_PARALLEL_SIZE=4
      - VLLM_GPU_MEMORY_UTILIZATION=0.95
      - VLLM_MAX_MODEL_LEN=8192
    command: >
      --model /models/Qwen-72B-Chat
      --tensor-parallel-size 4
      --gpu-memory-utilization 0.95
      --max-model-len 8192
      --host 0.0.0.0
      --port 8000
      --trust-remote-code
    networks:
      - llm-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ========================================
  # API 网关
  # ========================================
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
    ports:
      - "8443:8443"
      - "8444:8444"
    environment:
      - KONG_DATABASE=postgres
      - KONG_PG_HOST=kong-database
      - KONG_PG_USER=kong
      - KONG_PG_PASSWORD=${KONG_DB_PASSWORD}
      - KONG_PG_DATABASE=kong
    networks:
      - llm-network

  kong-database:
    image: postgres:15-alpine
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
    environment:
      - POSTGRES_USER=kong
      - POSTGRES_PASSWORD=${KONG_DB_PASSWORD}
      - POSTGRES_DB=kong
    volumes:
      - kong-data:/var/lib/postgresql/data
    networks:
      - llm-network

  # ========================================
  # Redis 集群
  # ========================================
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD} --cluster-enabled yes
    deploy:
      replicas: 3
      placement:
        constraints:
          - node.labels.type == application
    volumes:
      - redis-data:/data
    networks:
      - llm-network

  # ========================================
  # Keycloak
  # ========================================
  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    deploy:
      replicas: 2
      restart_policy:
        condition: on-failure
    environment:
      - KEYCLOAK_ADMIN=${KEYCLOAK_ADMIN}
      - KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}
      - KC_DB=postgres
      - KC_DB_URL=jdbc:postgresql://keycloak-db/keycloak
      - KC_DB_USERNAME=keycloak
      - KC_DB_PASSWORD=${KEYCLOAK_DB_PASSWORD}
      - KC_HOSTNAME=${KC_HOSTNAME}
      - KC_HOSTNAME_PORT=8080
      - KC_HOSTNAME_STRICT=false
      - KC_HOSTNAME_STRICT_HTTPS=false
      - KC_PROXY=edge
    command: start-dev
    networks:
      - llm-network

  keycloak-db:
    image: postgres:15-alpine
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
    environment:
      - POSTGRES_USER=keycloak
      - POSTGRES_PASSWORD=${KEYCLOAK_DB_PASSWORD}
      - POSTGRES_DB=keycloak
    volumes:
      - keycloak-data:/var/lib/postgresql/data
    networks:
      - llm-network

  # ========================================
  # PostgreSQL 主从复制
  # ========================================
  postgres-primary:
    image: postgres:15-alpine
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.labels.type == application
    environment:
      - POSTGRES_USER=llm_platform
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=llm_platform
      - POSTGRES_REPLICATION_USER=replicator
      - POSTGRES_REPLICATION_PASSWORD=${REPLICATION_PASSWORD}
    volumes:
      - postgres-primary-data:/var/lib/postgresql/data
      - ./docker/sql/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    networks:
      - llm-network

  postgres-standby:
    image: postgres:15-alpine
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.labels.type == application
    environment:
      - POSTGRES_USER=llm_platform
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=llm_platform
      - PGUSER=llm_platform
    volumes:
      - postgres-standby-data:/var/lib/postgresql/data
    command: |
      sh -c "
      until pg_basebackup -h postgres-primary -D /var/lib/postgresql/data -U replicator -W; do
        echo 'Waiting for primary...'
        sleep 5
      done
      echo 'standby_mode = on' >> /var/lib/postgresql/data/recovery.conf
      echo 'primary_conninfo = \"host=postgres-primary port=5432 user=replicator\"' >> /var/lib/postgresql/data/recovery.conf
      postgres
      "
    networks:
      - llm-network

  # ========================================
  # 监控服务
  # ========================================
  prometheus:
    image: prom/prometheus:latest
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
    volumes:
      - ./docker/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./docker/prometheus/alerts.yml:/etc/prometheus/alerts.yml:ro
      - prometheus-data:/prometheus
    networks:
      - llm-network

  grafana:
    image: grafana/grafana:latest
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
    environment:
      - GF_SECURITY_ADMIN_USER=${GRAFANA_ADMIN}
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - ./docker/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./docker/grafana/datasources:/etc/grafana/provisioning/datasources:ro
      - grafana-data:/var/lib/grafana
    networks:
      - llm-network

networks:
  llm-network:
    driver: overlay
    attachable: true

volumes:
  kong-data:
    driver: local
  keycloak-data:
    driver: local
  redis-data:
    driver: local
  postgres-primary-data:
    driver: local
  postgres-standby-data:
    driver: local
  prometheus-data:
    driver: local
  grafana-data:
    driver: local
```

### 5.2 负载均衡配置

#### Nginx 负载均衡配置

```nginx
# /etc/nginx/conf.d/llm-platform.conf

upstream kong_backend {
    least_conn;
    server node1.yourcompany.com:8443 max_fails=3 fail_timeout=30s;
    server node2.yourcompany.com:8443 max_fails=3 fail_timeout=30s;
    server node3.yourcompany.com:8443 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

upstream keycloak_backend {
    least_conn;
    server node1.yourcompany.com:8080 max_fails=3 fail_timeout=30s;
    server node2.yourcompany.com:8080 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

# 限流配置
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/s;

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name api.yourcompany.com auth.yourcompany.com;
    return 301 https://$server_name$request_uri;
}

# API 代理
server {
    listen 443 ssl http2;
    server_name api.yourcompany.com;

    ssl_certificate /etc/letsencrypt/live/api.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourcompany.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 限流
    limit_req zone=api_limit burst=200 nodelay;

    # 日志
    access_log /var/log/nginx/llm-api-access.log;
    error_log /var/log/nginx/llm-api-error.log;

    # API 路由
    location / {
        proxy_pass https://kong_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;

        # Buffer 设置
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
    }
}

# Keycloak 代理
server {
    listen 443 ssl http2;
    server_name auth.yourcompany.com;

    ssl_certificate /etc/letsencrypt/live/auth.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/auth.yourcompany.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    limit_req zone=auth_limit burst=20 nodelay;

    location / {
        proxy_pass http://keycloak_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
}
```

#### HAProxy 负载均衡配置

```haproxy
# /etc/haproxy/haproxy.cfg

global
    maxconn 10000
    user haproxy
    group haproxy
    daemon
    log /dev/log local0
    log /dev/log local1 notice

defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    option  redispatch
    retries 3
    timeout connect 5000
    timeout client  50000
    timeout server  50000

# 健康检查
frontend health_check
    bind *:8080
    mode http
    monitor-uri /health

# Kong API
frontend kong_frontend
    bind *:8443 ssl crt /etc/ssl/haproxy.pem
    mode http
    default_backend kong_backend

backend kong_backend
    mode http
    balance leastconn
    option httpchk GET /health
    server kong1 node1:8443 check inter 5s rise 2 fall 3
    server kong2 node2:8443 check inter 5s rise 2 fall 3
    server kong3 node3:8443 check inter 5s rise 2 fall 3

# Keycloak
frontend keycloak_frontend
    bind *:8081
    mode http
    default_backend keycloak_backend

backend keycloak_backend
    mode http
    balance leastconn
    option httpchk GET /health/ready
    server keycloak1 node1:8080 check inter 5s rise 2 fall 3
    server keycloak2 node2:8080 check inter 5s rise 2 fall 3
```

---

## 6. 配置详解

### 6.1 推理服务配置

#### vLLM 启动参数

| 参数 | 说明 | 默认值 | 推荐值 |
|------|------|--------|--------|
| `--model` | 模型路径 | - | /models/Qwen-72B-Chat |
| `--tensor-parallel-size` | 张量并行数 | 1 | GPU 数量 |
| `--gpu-memory-utilization` | 显存利用率 | 0.9 | 0.95 |
| `--max-model-len` | 最大上下文长度 | 4096 | 8192/16384 |
| `--dtype` | 数据类型 | auto | bfloat16 |
| `--quantization` | 量化方法 | - | awq/gptq |
| `--max-num-seqs` | 最大并发序列 | 256 | 512 |
| `--max-num-batched-tokens` | 最大批处理 tokens | - | 8192 |

#### 配置示例

```yaml
# docker-compose.yml 中的推理服务配置
vllm-inference:
  image: vllm/vllm-openai:latest
  command: >
    --model /models/Qwen-72B-Chat
    --tensor-parallel-size 4
    --gpu-memory-utilization 0.95
    --max-model-len 8192
    --dtype bfloat16
    --max-num-seqs 512
    --max-num-batched-tokens 8192
    --host 0.0.0.0
    --port 8000
    --trust-remote-code
    --disable-log-requests
```

### 6.2 网关配置

#### Kong 限流策略

```yaml
# kong/kong.yml
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
          # JWT 认证
          - name: jwt
          # 限流配置
          - name: rate-limiting
            config:
              minute: 60              # 每分钟 60 次请求
              hour: 1000             # 每小时 1000 次请求
              day: 10000             # 每天 10000 次请求
              policy: redis
              redis_host: redis
              redis_port: 6379
              redis_password: ${REDIS_PASSWORD}
              fault_tolerant: true
              hide_client_headers: false
          # 请求大小限制
          - name: request-size-limiting
            config:
              allowed_payload_size: 10  # 10MB
          # 响应转换 - 添加安全头
          - name: response-transformer
            config:
              add:
                headers:
                  - X-Content-Type-Options:nosniff
                  - X-Frame-Options:DENY
                  - X-XSS-Protection:1; mode=block
```

### 6.3 Keycloak 配置

#### Realm 配置

```json
// docker/keycloak/realm-export.json
{
  "realm": "llm-platform",
  "enabled": true,
  "sslRequired": "external",
  "users": [
    {
      "username": "admin",
      "enabled": true,
      "credentials": [
        {
          "type": "password",
          "value": "ChangeMe123!"
        }
      ],
      "realmRoles": ["admin"]
    }
  ],
  "clients": [
    {
      "clientId": "vscode-plugin",
      "enabled": true,
      "redirectUris": ["vscode://company.enterprise-llm-assistant/callback"],
      "webOrigins": [],
      "bearerOnly": false,
      "consentRequired": false,
      "standardFlowEnabled": true,
      "implicitFlowEnabled": false,
      "directAccessGrantsEnabled": true,
      "publicClient": false,
      "secret": "your-client-secret"
    }
  ],
  "roles": {
    "realm": [
      {
        "name": "admin",
        "description": "系统管理员"
      },
      {
        "name": "developer",
        "description": "开发人员"
      },
      {
        "name": "user",
        "description": "普通用户"
      },
      {
        "name": "auditor",
        "description": "审计员"
      }
    ]
  }
}
```

---

## 7. 安全加固

### 7.1 SSL/TLS 证书配置

#### 使用 Let's Encrypt

```bash
# 安装 certbot
apt-get install -y certbot python3-certbot-nginx

# 获取证书
certbot certonly --nginx -d api.yourcompany.com -d auth.yourcompany.com

# 证书位置
# /etc/letsencrypt/live/api.yourcompany.com/fullchain.pem
# /etc/letsencrypt/live/api.yourcompany.com/privkey.pem

# 自动续期
certbot renew --dry-run
```

#### 使用自签名证书（测试环境）

```bash
# 生成自签名证书
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/llm-platform.key \
    -out /etc/ssl/certs/llm-platform.crt \
    -subj "/C=CN/ST=Beijing/L=Beijing/O=Company/OU=IT/CN=api.yourcompany.com"

# 生成 CA 证书
openssl genrsa -out ca.key 2048
openssl req -x509 -new -nodes -key ca.key -days 3650 \
    -out ca.crt -subj "/C=CN/ST=Beijing/L=Beijing/O=Company/OU=IT/CN=LLM-Platform-CA"
```

### 7.2 密钥管理

#### 使用 HashiCorp Vault

```bash
# 启动 Vault
docker run -d --name vault \
    -p 8200:8200 \
    -e 'VAULT_DEV_ROOT_TOKEN_ID=myroot' \
    vault

# 存储密钥
vault kv put secret/llm-platform/database \
    password=$(openssl rand -base64 32)

vault kv put secret/llm-platform/kong \
    password=$(openssl rand -base64 32)

# 读取密钥
vault kv get -field=password secret/llm-platform/database
```

### 7.3 网络隔离

```bash
# Docker 网络隔离
# 创建隔离网络
docker network create --driver bridge --internal llm-internal
docker network create --driver bridge llm-public

# 服务网络分配
# Kong: llm-public (对外) + llm-internal (内部通信)
# Keycloak: llm-internal
# PostgreSQL: llm-internal
# Redis: llm-internal
# vLLM: llm-internal
```

---

## 8. 监控配置

### 8.1 Prometheus 配置

```yaml
# docker/prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'llm-platform'
    environment: 'production'

alerting:
  alertmanagers:
    - static_configs:
        - targets: []

rule_files:
  - "alerts.yml"

scrape_configs:
  # vLLM 推理服务
  - job_name: 'vllm-inference'
    static_configs:
      - targets: ['vllm-inference:8000']
    metrics_path: /metrics

  # Kong 网关
  - job_name: 'kong'
    static_configs:
      - targets: ['kong:8001']

  # PostgreSQL
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:9187']

  # Redis
  - job_name: 'redis'
    static_configs:
      - targets: ['redis:9121']

  # Node Exporter
  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']

  # GPU 监控
  - job_name: 'nvidia'
    static_configs:
      - targets: ['nvidia-dcgm-exporter:9400']
```

### 8.2 告警规则配置

```yaml
# docker/prometheus/alerts.yml
groups:
  - name: llm_platform_alerts
    interval: 30s
    rules:
      # 服务可用性
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "服务 {{ $labels.instance }} 已停止"
          description: "服务 {{ $labels.job }} 在实例 {{ $labels.instance }} 上已停止超过 1 分钟"

      # 错误率
      - alert: HighErrorRate
        expr: rate(llm_requests_errors_total[5m]) / rate(llm_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "错误率过高"
          description: "{{ $labels.instance }} 的错误率为 {{ $value | humanizePercentage }}"

      # 延迟
      - alert: HighLatency
        expr: histogram_quantile(0.99, llm_request_duration_seconds) > 10
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "P99 延迟过高"
          description: "{{ $labels.instance }} 的 P99 延迟为 {{ $value }}s"

      # GPU 利用率
      - alert: GPUOverload
        expr: nvidia_gpu_utilization > 95
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "GPU 利用率持续过高"
          description: "{{ $labels.instance }} 的 GPU 利用率为 {{ $value }}%"

      # GPU 显存
      - alert: GPUMemoryHigh
        expr: nvidia_gpu_memory_used_bytes / nvidia_gpu_memory_total_bytes > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "GPU 显存使用率过高"
          description: "{{ $labels.instance }} 的显存使用率为 {{ $value | humanizePercentage }}"

      # 配额
      - alert: UserQuotaExceeded
        expr: user_tokens_used_today > user_quota_daily
        for: 0s
        labels:
          severity: info
        annotations:
          summary: "用户 {{ $labels.username }} 配额已用尽"

      # 磁盘空间
      - alert: DiskSpaceLow
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "磁盘空间不足"
          description: "{{ $labels.instance }} 的磁盘空间剩余 {{ $value | humanizePercentage }}"
```

---

## 9. 备份恢复

### 9.1 备份策略

```bash
#!/bin/bash
# /opt/llm-platform/scripts/backup.sh

set -e

# 配置
BACKUP_DIR="/opt/llm-platform/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# 创建备份目录
mkdir -p $BACKUP_DIR

echo "=== 开始备份: $DATE ==="

# 1. 备份 PostgreSQL
echo "备份 PostgreSQL..."
docker exec postgres pg_dump -U llm_platform llm_platform \
    | gzip > $BACKUP_DIR/postgres_$DATE.sql.gz

# 2. 备份 Keycloak 数据库
echo "备份 Keycloak..."
docker exec keycloak-db pg_dump -U keycloak keycloak \
    | gzip > $BACKUP_DIR/keycloak_$DATE.sql.gz

# 3. 备份 Redis
echo "备份 Redis..."
docker exec redis redis-cli -a $REDIS_PASSWORD --rdb backup_$DATE.rdb
docker cp redis:/data/backup_$DATE.rdb $BACKUP_DIR/redis_$DATE.rdb

# 4. 备份配置文件
echo "备份配置文件..."
tar -czf $BACKUP_DIR/config_$DATE.tar.gz \
    docker/.env \
    docker/kong \
    docker/keycloak \
    docker/prometheus \
    docker/grafana

# 5. 备份模型元数据
echo "备份模型元数据..."
ls -lh models/ > $BACKUP_DIR/models_info_$DATE.txt

# 6. 清理旧备份
echo "清理旧备份..."
find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.rdb" -mtime +$RETENTION_DAYS -delete

# 7. 生成备份报告
echo "生成备份报告..."
cat > $BACKUP_DIR/backup_report_$DATE.txt << EOF
备份时间: $DATE
备份文件:
  - PostgreSQL: postgres_$DATE.sql.gz
  - Keycloak: keycloak_$DATE.sql.gz
  - Redis: redis_$DATE.rdb
  - 配置: config_$DATE.tar.gz
  - 模型信息: models_info_$DATE.txt
EOF

echo "=== 备份完成 ==="
```

### 9.2 恢复流程

```bash
#!/bin/bash
# /opt/llm-platform/scripts/restore.sh

set -e

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "用法: $0 <backup_file>"
    exit 1
fi

echo "=== 开始恢复 ==="

# 1. 停止服务
echo "停止服务..."
docker-compose stop

# 2. 恢复 PostgreSQL
echo "恢复 PostgreSQL..."
gunzip -c $BACKUP_DIR/postgres_$BACKUP_FILE.sql.gz | \
    docker exec -i postgres psql -U llm_platform llm_platform

# 3. 恢复 Keycloak
echo "恢复 Keycloak..."
gunzip -c $BACKUP_DIR/keycloak_$BACKUP_FILE.sql.gz | \
    docker exec -i keycloak-db psql -U keycloak keycloak

# 4. 恢复 Redis
echo "恢复 Redis..."
docker cp $BACKUP_DIR/redis_$BACKUP_FILE.rdb redis:/data/dump.rdb
docker-compose restart redis

# 5. 恢复配置
echo "恢复配置..."
tar -xzf $BACKUP_DIR/config_$BACKUP_FILE.tar.gz -C docker/

# 6. 启动服务
echo "启动服务..."
docker-compose start

# 7. 验证
echo "验证服务..."
./scripts/health-check.sh

echo "=== 恢复完成 ==="
```

### 9.3 自动备份

```bash
# 添加到 crontab
crontab -e

# 每日凌晨 2 点完整备份
0 2 * * * /opt/llm-platform/scripts/backup.sh >> /var/log/llm-backup.log 2>&1

# 每周日凌晨 3 点清理旧备份
0 3 * * 0 find /opt/llm-platform/backups -name "*.tar.gz" -mtime +30 -delete

# 每天上午 10 点检查备份状态
0 10 * * * /opt/llm-platform/scripts/check-backup.sh >> /var/log/llm-backup.log 2>&1
```

---

## 10. 常见问题

### 10.1 服务启动问题

**问题：容器启动失败**

```bash
# 检查日志
docker-compose logs <service-name>

# 常见原因
1. 端口冲突 - 修改 docker-compose.yml 中的端口映射
2. 内存不足 - 减少 VLLM_MAX_MODEL_LEN 或使用量化模型
3. GPU 不可用 - 检查 nvidia-smi 和 nvidia-container-toolkit
4. 磁盘空间不足 - 清理 docker system prune
```

### 10.2 模型加载问题

**问题：模型加载失败**

```bash
# 检查模型文件
ls -lh models/Qwen-72B-Chat/

# 检查容器内模型
docker exec vllm-inference ls -lh /models/

# 检查模型完整性
for file in models/Qwen-72B-Chat/*.safetensors; do
    sha256sum "$file"
done
```

### 10.3 性能问题

**问题：推理速度慢**

```bash
# 检查 GPU 利用率
nvidia-smi -l 1

# 检查批处理配置
# 增加 --max-num-seqs 和 --max-num-batched-tokens

# 检查网络延迟
ping -c 10 <api-server>

# 优化建议
1. 启用量化模型 (AWQ/GPTQ)
2. 增加 Tensor 并行数
3. 调整批处理参数
4. 优化网络配置
```

### 10.4 内存问题

**问题：OOM (Out of Memory)**

```bash
# 检查内存使用
free -h

# 检查容器内存限制
docker stats

# 解决方案
1. 减少 VLLM_MAX_MODEL_LEN
2. 使用量化模型
3. 增加系统交换空间
4. 限制并发请求数
```

---

## 附录

### A. 端口清单

| 端口 | 协议 | 服务 | 说明 | 外部访问 |
|------|------|------|------|----------|
| 80 | HTTP | Nginx | Web 入口 | 是 |
| 443 | HTTPS | Nginx | Web 入口 | 是 |
| 8000 | HTTP | vLLM | 推理服务 | 否 |
| 8080 | HTTP | Keycloak | 认证服务 | 否 |
| 8443 | HTTPS | Kong | API 网关 | 否 |
| 8444 | HTTPS | Kong | 管理接口 | 否 |
| 5432 | TCP | PostgreSQL | 业务数据库 | 否 |
| 6379 | TCP | Redis | 缓存 | 否 |
| 9090 | HTTP | Prometheus | 监控 | 否 |
| 3000 | HTTP | Grafana | 可视化 | 否 |
| 9100 | HTTP | Node Exporter | 系统监控 | 否 |
| 9121 | HTTP | Redis Exporter | Redis 监控 | 否 |
| 9187 | HTTP | Postgres Exporter | 数据库监控 | 否 |

### B. 部署检查清单

- [ ] 硬件配置满足要求
- [ ] 操作系统版本正确
- [ ] Docker 已安装并运行
- [ ] NVIDIA 驱动已安装
- [ ] NVIDIA Container Toolkit 已配置
- [ ] 网络配置正确
- [ ] 防火墙规则已设置
- [ ] 环境变量已配置
- [ ] 模型已下载
- [ ] SSL 证书已配置（生产环境）
- [ ] 服务已启动
- [ ] 健康检查通过
- [ ] 监控已配置
- [ ] 备份已设置
- [ ] 安全加固完成
- [ ] 默认密码已修改
- [ ] 用户已创建
- [ ] 配额已分配

### C. 联系支持

- 技术支持：support@company.com
- 安全团队：security@company.com
- 文档中心：https://docs.company.com/llm
- 问题追踪：https://github.com/your-org/enterprise-llm-platform/issues
