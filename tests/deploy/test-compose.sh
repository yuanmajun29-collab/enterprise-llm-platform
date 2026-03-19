#!/bin/bash

# ========================================
# Docker Compose 配置验证脚本
# 验证语法、端口冲突、网络配置
# ========================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
DOCKER_DIR="$PROJECT_DIR/docker"
COMPOSE_FILE="$DOCKER_DIR/docker-compose.yml"

PASS=0
FAIL=0
WARN=0

pass() { PASS=$((PASS+1)); echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { FAIL=$((FAIL+1)); echo -e "${RED}[FAIL]${NC} $1"; }
warn() { WARN=$((WARN+1)); echo -e "${YELLOW}[WARN]${NC} $1"; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }

# ========================================
# 1. 验证 Docker Compose 语法
# ========================================

section() {
    echo ""
    echo "========================================"
    echo "  $1"
    echo "========================================"
    echo ""
}

section "1. Docker Compose 语法验证"

if [ ! -f "$COMPOSE_FILE" ]; then
    fail "docker-compose.yml 不存在: $COMPOSE_FILE"
    exit 1
fi

info "文件: $COMPOSE_FILE"

# 检查 docker compose 命令
COMPOSE_CMD="docker-compose"
if ! command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker compose"
fi

info "使用命令: $COMPOSE_CMD"

# 验证配置语法
if $COMPOSE_CMD -f "$COMPOSE_FILE" config > /dev/null 2>&1; then
    pass "docker-compose.yml 语法正确"
else
    fail "docker-compose.yml 语法错误:"
    $COMPOSE_CMD -f "$COMPOSE_FILE" config 2>&1 | head -20
fi

# 验证配置可以正常解析
PARSED=$($COMPOSE_CMD -f "$COMPOSE_FILE" config 2>&1)
if [ $? -eq 0 ]; then
    pass "docker-compose.yml 可以正常解析"
else
    fail "docker-compose.yml 解析失败"
fi

# ========================================
# 2. 检查端口冲突
# ========================================

section "2. 端口冲突检查"

# 需要检查的端口列表
CHECKED_PORTS=(8443 8080 3000 9090 5432 6379)

for port in "${CHECKED_PORTS[@]}"; do
    if command -v lsof &> /dev/null; then
        if lsof -i :"$port" > /dev/null 2>&1; then
            local_pid=$(lsof -t -i :"$port" 2>/dev/null | head -1)
            local_proc=$(lsof -i :"$port" 2>/dev/null | grep LISTEN | awk '{print $1}' | head -1)
            warn "端口 $port 已被占用 (PID: ${local_pid:-unknown}, 进程: ${local_proc:-unknown})"
        else
            pass "端口 $port 可用"
        fi
    elif command -v ss &> /dev/null; then
        if ss -tlnp | grep -q ":${port} "; then
            warn "端口 $port 已被占用"
            ss -tlnp | grep ":${port} " | head -1
        else
            pass "端口 $port 可用"
        fi
    elif command -v netstat &> /dev/null; then
        if netstat -tlnp 2>/dev/null | grep -q ":${port} "; then
            warn "端口 $port 已被占用"
        else
            pass "端口 $port 可用"
        fi
    else
        warn "无法检查端口 $port（缺少 lsof/ss/netstat）"
    fi
done

# 验证 compose 文件中声明的端口映射
info "检查 docker-compose.yml 中的端口映射..."
DECLARED_PORTS=$(echo "$PARSED" | grep -oP '^\s+"(\d+):' | grep -oP '\d+' | sort -u || true)
if [ -n "$DECLARED_PORTS" ]; then
    for port in $DECLARED_PORTS; do
        # 检查是否在需要检查的端口列表中
        for check_port in "${CHECKED_PORTS[@]}"; do
            if [ "$port" = "$check_port" ]; then
                pass "声明的端口 $check_port 在检查列表中"
                break
            fi
        done
    done
fi

# ========================================
# 3. 验证网络配置
# ========================================

section "3. 网络配置验证"

# 检查是否有网络定义
NETWORKS=$(echo "$PARSED" | grep -A5 "networks:" 2>/dev/null | grep -v "^--$" || true)
if [ -n "$NETWORKS" ]; then
    info "发现网络配置:"
    echo "$NETWORKS" | head -20
    pass "存在网络配置定义"
else
    warn "未发现显式网络配置（将使用默认网络）"
fi

# 检查各服务是否都在网络中
info "检查服务网络连接..."
SERVICES=$(echo "$PARSED" | grep -oP '^\s+(\w+):' | awk '{print $1}' | grep -v 'version\|services\|networks\|volumes\|x-' | head -20 || true)
if [ -n "$SERVICES" ]; then
    service_count=0
    for svc in $SERVICES; do
        service_count=$((service_count + 1))
        # 检查服务是否有网络配置
        svc_network=$(echo "$PARSED" | grep -A50 "  ${svc}:" | grep -B50 "networks:" | head -1 || true)
        if echo "$PARSED" | grep -A50 "  ${svc}:" | grep -q "networks:"; then
            pass "服务 '$svc' 已配置网络"
        else
            warn "服务 '$svc' 未显式配置网络（将使用默认网络）"
        fi
    done
    info "共发现 $service_count 个服务"
else
    warn "未发现服务定义"
fi

# 检查是否存在内外网络隔离
if echo "$PARSED" | grep -q "internal:"; then
    pass "发现内部网络隔离配置"
else
    warn "未发现内部网络隔离配置，建议为数据库/缓存服务配置内部网络"
fi

# ========================================
# 4. 其他安全检查
# ========================================

section "4. 安全检查"

# 检查敏感信息是否硬编码
if grep -iE 'password|secret|token|api_key' "$COMPOSE_FILE" | grep -vE '\$\{|^\s*#|environment' | grep -vE 'KONG_DB_PASSWORD|KEYCLOAK_DB_PASSWORD|POSTGRES_PASSWORD|REDIS_PASSWORD|LLM_API_SECRET|JWT_SECRET|GRAFANA_PASSWORD' | head -5; then
    warn "发现可能的硬编码敏感信息（请使用环境变量替代）"
else
    pass "未发现硬编码敏感信息"
fi

# 检查是否有重启策略
RESTART_COUNT=$(echo "$PARSED" | grep -c "restart:" || true)
if [ "$RESTART_COUNT" -gt 0 ]; then
    pass "$RESTART_COUNT 个服务配置了重启策略"
else
    warn "未发现重启策略配置，建议为关键服务配置 restart: unless-stopped"
fi

# ========================================
# 结果汇总
# ========================================

section "结果汇总"

TOTAL=$((PASS + FAIL + WARN))
echo -e "${GREEN}通过: $PASS${NC}  ${RED}失败: $FAIL${NC}  ${YELLOW}警告: $WARN${NC}  总计: $TOTAL"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}存在失败项，请修复后重试${NC}"
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo -e "${YELLOW}存在警告项，建议检查${NC}"
    exit 0
else
    echo -e "${GREEN}所有检查通过！${NC}"
    exit 0
fi
