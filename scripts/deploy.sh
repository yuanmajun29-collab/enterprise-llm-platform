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

# 解析命令行参数
SKIP_MODELS=false
ONLY_INFRA=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-models)
      SKIP_MODELS=true
      shift
      ;;
    --only-infra)
      ONLY_INFRA=true
      shift
      ;;
    -h|--help)
      echo "用法: $0 [选项]"
      echo ""
      echo "选项:"
      echo "  --skip-models    跳过模型下载"
      echo "  --only-infra     只启动基础设施（postgres, redis, kong, keycloak），不启动 vllm 和 api-server"
      echo "  -h, --help       显示帮助信息"
      exit 0
      ;;
    *)
      echo "未知参数: $1"
      echo "使用 -h 查看帮助"
      exit 1
      ;;
  esac
done

# ========================================
# 部署日志
# ========================================
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"

log_info() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $1"
    echo -e "${BLUE}${msg}${NC}"
    echo "$msg" >> "$LOG_FILE"
}

log_success() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] $1"
    echo -e "${GREEN}${msg}${NC}"
    echo "$msg" >> "$LOG_FILE"
}

log_warning() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [WARNING] $1"
    echo -e "${YELLOW}${msg}${NC}"
    echo "$msg" >> "$LOG_FILE"
}

log_error() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $1"
    echo -e "${RED}${msg}${NC}"
    echo "$msg" >> "$LOG_FILE"
}

log_info "部署日志: $LOG_FILE"

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
    if [ "$SKIP_MODELS" = true ]; then
        log_info "跳过模型下载 (--skip-models)"
        return
    fi

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

    # 根据模式选择启动的服务
    if [ "$ONLY_INFRA" = true ]; then
        log_info "仅启动基础设施服务 (--only-infra)"
        log_info "将启动: postgres, redis, kong, keycloak"
        log_info "将跳过: vllm, api-server"

        # 获取 docker-compose 命令
        local compose_cmd="docker-compose"
        if ! command -v docker-compose &> /dev/null; then
            compose_cmd="docker compose"
        fi

        # 只启动基础设施服务
        $compose_cmd up -d postgres redis kong keycloak 2>&1 | tee -a "$LOG_FILE"
    else
        log_info "使用 Docker Compose 启动所有服务..."
        docker-compose up -d 2>&1 | tee -a "$LOG_FILE"
    fi

    log_success "服务启动中..."
}

# ========================================
# 5. 健康检查
# ========================================
health_check() {
    log_info "执行健康检查..."

    # 检查各服务状态
    echo ""
    echo "服务状态:"
    docker-compose ps 2>&1 | tee -a "$LOG_FILE"

    # 循环检查所有服务的健康端点
    local services=(
        "API Gateway|http://localhost:8443/health|120"
        "Keycloak|http://localhost:8080|90"
        "Grafana|http://localhost:3000/api/health|60"
        "Prometheus|http://localhost:9090/-/healthy|30"
        "PostgreSQL|tcp://localhost:5432|30"
        "Redis|tcp://localhost:6379|15"
    )

    echo ""
    log_info "循环检查服务健康状态..."

    local failed_services=()

    for service_info in "${services[@]}"; do
        IFS='|' read -r name url timeout <<< "$service_info"

        log_info "检查 $name ($url)..."

        if [[ "$url" == tcp://* ]]; then
            # TCP 端口检查
            local host_port="${url#tcp://}"
            local host="${host_port%%:*}"
            local port="${host_port##*:}"

            local retries=0
            local max_retries=$((timeout / 3))
            local healthy=false

            while [ $retries -lt $max_retries ]; do
                if timeout 3 bash -c "echo > /dev/tcp/$host/$port" 2>/dev/null; then
                    log_success "$name 可用 (端口 $port)"
                    healthy=true
                    break
                fi
                retries=$((retries + 1))
                sleep 3
            done

            if [ "$healthy" = false ]; then
                log_warning "$name 未就绪 (端口 $port) — 请检查日志"
                failed_services+=("$name")
            fi
        else
            # HTTP 健康检查
            local retries=0
            local max_retries=$((timeout / 3))
            local healthy=false

            while [ $retries -lt $max_retries ]; do
                if curl -sf --connect-timeout 3 --max-time 5 "$url" > /dev/null 2>&1; then
                    log_success "$name 健康检查通过"
                    healthy=true
                    break
                fi
                retries=$((retries + 1))
                sleep 3
            done

            if [ "$healthy" = false ]; then
                log_warning "$name 未就绪 — 请检查日志"
                failed_services+=("$name")
            fi
        fi
    done

    echo ""

    if [ ${#failed_services[@]} -gt 0 ]; then
        log_warning "以下服务未通过健康检查: ${failed_services[*]}"
        log_info "查看日志: docker-compose logs <service_name>"
    else
        log_success "所有服务健康检查通过！"
    fi

    echo ""
    echo "访问地址:"
    echo "  - API Gateway:   https://localhost:8443"
    echo "  - Keycloak:      http://localhost:8080"
    echo "  - Grafana:       http://localhost:3000"
    echo "  - Prometheus:    http://localhost:9090"
    echo ""

    if [ -f "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
        local grafana_pwd=$(grep GRAFANA_PASSWORD "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2)
        echo "默认账号密码:"
        echo "  - Keycloak admin: admin / ChangeMe123!"
        echo "  - Grafana admin: admin / ${grafana_pwd:-<见.env文件>}"
        echo ""
    fi
}

# ========================================
# 6. 生成管理员账号
# ========================================
create_admin() {
    log_info "创建管理员账号..."
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
    echo "参数:"
    [ "$SKIP_MODELS" = true ] && echo "  --skip-models    是（跳过模型下载）"
    [ "$ONLY_INFRA" = true ] && echo "  --only-infra     是（仅启动基础设施）"
    [ "$SKIP_MODELS" = false ] && echo "  --skip-models    否"
    [ "$ONLY_INFRA" = false ] && echo "  --only-infra     否"
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
    log_info "部署日志: $LOG_FILE"
}

# 执行主函数
main "$@"
