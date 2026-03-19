#!/bin/bash

# ========================================
# Enterprise LLM Platform Deployment Script
# 企业大模型平台部署脚本
# ========================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_DIR/docker"
ENV_FILE="$DOCKER_DIR/.env"

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ========================================
# 1. 环境检查
# ========================================
check_environment() {
    log_info "检查部署环境..."

    # 检查 Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    log_success "Docker 已安装: $(docker --version)"

    # 检查 Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
    log_success "Docker Compose 已安装"

    # 检查 NVIDIA Docker
    if command -v nvidia-smi &> /dev/null; then
        log_success "NVIDIA 驱动已安装"
        nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
    else
        log_warning "未检测到 NVIDIA 驱动，推理服务可能无法正常运行"
    fi

    # 检查磁盘空间
    local available_space=$(df -BG "$PROJECT_DIR" | awk 'NR==2 {print $4}' | sed 's/G//')
    if [ "$available_space" -lt 50 ]; then
        log_warning "磁盘空间不足 50GB，建议至少预留 100GB"
    else
        log_success "磁盘空间充足: ${available_space}GB 可用"
    fi
}

# ========================================
# 2. 配置初始化
# ========================================
init_config() {
    log_info "初始化配置..."

    if [ -f "$ENV_FILE" ]; then
        log_info "发现已有配置文件: $ENV_FILE"
        read -p "是否重新生成配置? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "使用现有配置"
            return
        fi
    fi

    log_info "生成新配置文件..."

    # 生成随机密码
    KONG_DB_PASSWORD=$(openssl rand -base64 32)
    KEYCLOAK_DB_PASSWORD=$(openssl rand -base64 32)
    POSTGRES_PASSWORD=$(openssl rand -base64 32)
    REDIS_PASSWORD=$(openssl rand -base64 32)
    GRAFANA_PASSWORD=$(openssl rand -base64 16)

    # 写入配置文件
    cat > "$ENV_FILE" << EOF
# ========================================
# 数据库密码配置
# ========================================
KONG_DB_PASSWORD=$KONG_DB_PASSWORD
KEYCLOAK_DB_PASSWORD=$KEYCLOAK_DB_PASSWORD
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD

# ========================================
# Keycloak 配置
# ========================================
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=ChangeMe123!
LLM_API_SECRET=$(openssl rand -base64 32)

# ========================================
# Grafana 配置
# ========================================
GRAFANA_ADMIN=admin
GRAFANA_PASSWORD=$GRAFANA_PASSWORD

# ========================================
# 推理服务配置
# ========================================
MODEL_NAME=/models/Qwen-72B-Chat
VLLM_TENSOR_PARALLEL_SIZE=4
VLLM_GPU_MEMORY_UTILIZATION=0.95
VLLM_MAX_MODEL_LEN=8192

# ========================================
# API 配置
# ========================================
API_BASE_URL=https://api.company.com
API_PORT=8443
JWT_SECRET=$(openssl rand -base64 48)

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
EOF

    log_success "配置文件已生成: $ENV_FILE"
    log_warning "请修改配置文件中的默认密码！"
}

# ========================================
# 3. 模型下载
# ========================================
download_models() {
    log_info "准备模型下载..."

    local models_dir="$PROJECT_DIR/models"
    mkdir -p "$models_dir"

    log_warning "模型下载需要较长时间，请确保网络畅通"
    log_info "支持以下方式下载模型:"
    echo "  1. 使用 HuggingFace Hub 下载"
    echo "  2. 使用 ModelScope 下载"
    echo "  3. 手动下载并放置到 models 目录"

    read -p "是否现在下载模型? (y/n): " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "跳过模型下载，请手动下载后放置到 models 目录"
        return
    fi

    log_info "启动模型下载容器..."

    # 使用 huggingface-cli 下载模型
    docker run --rm \
        -v "$models_dir":/models \
        ghcr.io/huggingface/text-generation-inference:latest \
        download-model Qwen/Qwen-72B-Chat || {
        log_error "模型下载失败，请手动下载"
        return 1
    }

    log_success "模型下载完成"
}

# ========================================
# 4. 启动服务
# ========================================
start_services() {
    log_info "启动服务..."

    cd "$DOCKER_DIR"

    # 加载环境变量
    if [ -f "$ENV_FILE" ]; then
        export $(cat "$ENV_FILE" | grep -v '^#' | xargs)
    else
        log_error "配置文件不存在: $ENV_FILE"
        exit 1
    fi

    # 创建必要目录
    mkdir -p "$PROJECT_DIR/logs" "$PROJECT_DIR/data"

    # 启动服务
    log_info "使用 Docker Compose 启动服务..."
    docker-compose up -d

    log_success "服务启动中..."

    # 等待服务就绪
    log_info "等待服务启动..."
    local max_wait=120
    local wait_count=0

    while [ $wait_count -lt $max_wait ]; do
        if curl -f -s http://localhost:8000/health &> /dev/null; then
            log_success "推理服务已就绪"
            break
        fi
        echo -n "."
        sleep 2
        wait_count=$((wait_count + 2))
    done
    echo

    if [ $wait_count -ge $max_wait ]; then
        log_warning "服务启动超时，请检查日志"
    fi
}

# ========================================
# 5. 健康检查
# ========================================
health_check() {
    log_info "执行健康检查..."

    # 检查各服务状态
    echo ""
    echo "服务状态:"
    docker-compose ps

    echo ""
    echo "访问地址:"
    echo "  - API Gateway:   https://localhost:8443"
    echo "  - Keycloak:      http://localhost:8080"
    echo "  - Grafana:       http://localhost:3000"
    echo "  - Prometheus:    http://localhost:9090"
    echo ""
    echo "默认账号密码:"
    echo "  - Keycloak admin: admin / ChangeMe123!"
    echo "  - Grafana admin: admin / $(grep GRAFANA_PASSWORD $ENV_FILE | cut -d'=' -f2)"
    echo ""
}

# ========================================
# 6. 生成管理员账号
# ========================================
create_admin() {
    log_info "创建管理员账号..."

    # 这里可以通过 Keycloak API 创建初始管理员
    log_info "请在 Keycloak 控制台手动创建用户账号"
    log_info "访问: http://localhost:8080/admin"
}

# ========================================
# 主函数
# ========================================
main() {
    echo ""
    echo "========================================"
    echo "  Enterprise LLM Platform Deployment"
    echo "  企业大模型平台部署"
    echo "========================================"
    echo ""

    # 执行部署步骤
    check_environment
    init_config
    download_models
    start_services
    health_check
    create_admin

    echo ""
    log_success "部署完成！"
    echo ""
    log_info "后续步骤:"
    echo "  1. 修改默认密码"
    echo "  2. 在 Keycloak 中创建用户"
    echo "  3. 为用户分配角色和配额"
    echo "  4. 安装 IDE 插件并配置"
    echo ""
}

# 执行主函数
main "$@"
