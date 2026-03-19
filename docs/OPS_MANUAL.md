# 企业大模型平台 - 运维管理手册

> 本文档面向运维管理人员，详细介绍平台的日常运维、监控、故障处理等操作流程。

---

## 目录

- [1. 运维概述](#1-运维概述)
- [2. 服务管理](#2-服务管理)
- [3. 监控告警](#3-监控告警)
- [4. 日志管理](#4-日志管理)
- [5. 性能优化](#5-性能优化)
- [6. 故障处理](#6-故障处理)
- [7. 安全运维](#7-安全运维)
- [8. 容量规划](#8-容量规划)
- [9. 版本升级](#9-版本升级)

---

## 1. 运维概述

### 1.1 运维职责

| 类别 | 职责 | 频率 |
|------|------|------|
| **日常巡检** | 服务状态检查、资源监控 | 每日 |
| **日志分析** | 错误日志、性能日志分析 | 每日 |
| **备份管理** | 数据备份、备份验证 | 每日 |
| **安全审计** | 访问日志、异常行为检测 | 每周 |
| **性能调优** | 性能分析、参数调整 | 按需 |
| **版本升级** | 组件升级、漏洞修复 | 按月/按需 |
| **容量规划** | 资源评估、扩容计划 | 每季度 |
| **应急响应** | 故障处理、服务恢复 | 实时 |

### 1.2 运维流程

```
┌──────────┐    ┌──────────┐    ┌──────────┐
│ 监控告警  │───→│ 故障定位  │───→│ 问题处理  │
└──────────┘    └──────────┘    └──────────┘
                                ↓
                       ┌─────────────────┐
                       │ 事后分析/复盘   │
                       └─────────────────┘
```

---

## 2. 服务管理

### 2.1 服务启停

#### 查看服务状态

```bash
#!/bin/bash
# scripts/service-status.sh

echo "=== 企业大模型平台服务状态 ==="
echo ""
cd /opt/enterprise-llm-platform/docker

docker-compose ps

echo ""
echo "=== GPU 状态 ==="
nvidia-smi --query-gpu=index,name,memory.used,memory.total,utilization.gpu --format=csv

echo ""
echo "=== 磁盘使用 ==="
df -h | grep -E "^/dev"

echo ""
echo "=== 内存使用 ==="
free -h
```

#### 启动服务

```bash
#!/bin/bash
# scripts/start-services.sh

cd /opt/enterprise-llm-platform/docker

echo "启动数据库服务..."
docker-compose up -d postgres keycloak-db kong-database redis
sleep 10

echo "启动应用服务..."
docker-compose up -d keycloak kong
sleep 10

echo "启动推理服务..."
docker-compose up -d vllm-inference
sleep 30

echo "启动监控服务..."
docker-compose up -d prometheus grafana loki promtail

echo "服务启动完成！"
docker-compose ps
```

#### 停止服务

```bash
#!/bin/bash
# scripts/stop-services.sh

cd /opt/enterprise-llm-platform/docker

echo "停止服务..."
docker-compose down

echo "服务已停止"
```

#### 重启服务

```bash
#!/bin/bash
# scripts/restart-service.sh

SERVICE_NAME=$1

if [ -z "$SERVICE_NAME" ]; then
    echo "用法: $0 <service-name>"
    echo "可用服务: kong, keycloak, vllm-inference, redis, postgres, prometheus, grafana"
    exit 1
fi

cd /opt/enterprise-llm-platform/docker
docker-compose restart $SERVICE_NAME

echo "服务 $SERVICE_NAME 已重启"
```

### 2.2 健康检查

```bash
#!/bin/bash
# scripts/health-check.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_service() {
    local name=$1
    local url=$2
    local status_code=$(curl -o /dev/null -s -w "%{http_code}" $url)

    if [ "$status_code" = "200" ] || [ "$status_code" = "204" ]; then
        echo -e "${GREEN}✓${NC} $name 正常"
        return 0
    else
        echo -e "${RED}✗${NC} $name 异常 (HTTP $status_code)"
        return 1
    fi
}

echo "=== 服务健康检查 ==="

check_service "vLLM 推理" "http://localhost:8000/health"
check_service "Kong 管理" "http://localhost:8444"
check_service "Keycloak" "http://localhost:8080/health/ready"
check_service "Grafana" "http://localhost:3000/api/health"
check_service "Prometheus" "http://localhost:9090/-/healthy"

echo ""
echo "=== 数据库检查 ==="
cd /opt/enterprise-llm-platform/docker

# PostgreSQL
if docker-compose exec -T postgres pg_isready -U llm_platform &> /dev/null; then
    echo -e "${GREEN}✓${NC} PostgreSQL 数据库正常"
else
    echo -e "${RED}✗${NC} PostgreSQL 数据库异常"
fi

# Redis
if docker-compose exec -T redis redis-cli -a $REDIS_PASSWORD ping &> /dev/null; then
    echo -e "${GREEN}✓${NC} Redis 缓存正常"
else
    echo -e "${RED}✗${NC} Redis 缓存异常"
fi

echo ""
echo "=== GPU 检查 ==="
if nvidia-smi &> /dev/null; then
    echo -e "${GREEN}✓${NC} GPU 可用"
    nvidia-smi --query-gpu=index,name,memory.used,memory.total,utilization.gpu --format=csv,noheader | \
    while IFS=',' read -r idx name mem_used mem_total util; do
        echo "  GPU $idx: $name (显存: $mem_used/$mem_total, 利用率: $util)"
    done
else
    echo -e "${RED}✗${NC} GPU 不可用"
fi
```

---

## 3. 监控告警

### 3.1 关键监控指标

#### 基础设施指标

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| CPU 使用率 | 系统整体 CPU 使用情况 | > 80% |
| 内存使用率 | 系统内存使用情况 | > 90% |
| 磁盘使用率 | 各分区磁盘使用情况 | > 85% |
| 网络流量 | 网络进出流量 | > 带宽 80% |

#### 服务指标

| 指标 | 说明 | 正常范围 | 告警阈值 |
|------|------|----------|----------|
| QPS | 每秒请求数 | 根据业务 | 突增 > 200% |
| P99 延迟 | 99% 请求延迟 | < 5s | > 10s |
| 错误率 | 请求失败比例 | < 1% | > 5% |
| GPU 利用率 | GPU 计算利用率 | 60-90% | > 95% |
| GPU 显存 | GPU 显存使用情况 | < 90% | > 95% |

#### 业务指标

| 指标 | 说明 |
|------|------|
| 活跃用户数 | 每日活跃用户数量 |
| Token 消耗 | 每日 Token 使用量 |
| 模型使用 | 各模型使用比例 |
| 用户配额 | 用户配额使用情况 |

### 3.2 Prometheus 查询示例

```promql
# QPS
rate(llm_requests_total[5m])

# P99 延迟
histogram_quantile(0.99, rate(llm_request_duration_seconds_bucket[5m]))

# 错误率
rate(llm_requests_errors_total[5m]) / rate(llm_requests_total[5m])

# GPU 利用率
nvidia_gpu_utilization

# GPU 显存使用
nvidia_gpu_memory_used_bytes / nvidia_gpu_memory_total_bytes

# 活跃用户数
count(increase(llm_requests_total[1h]))

# 今日 Token 消耗
sum(increase(llm_tokens_total[1d]))

# 模型使用分布
sum by (model) (rate(llm_requests_total[5m]))

# 用户配额使用率
user_tokens_used_today / user_quota_daily
```

### 3.3 告警规则配置

```yaml
# docker/prometheus/alerts.yml
groups:
  - name: critical_alerts
    interval: 30s
    rules:
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "服务 {{ $labels.instance }} 已停止"
          description: "服务 {{ $labels.job }} 在实例 {{ $labels.instance }} 上已停止超过 1 分钟"

      - alert: DatabaseDown
        expr: pg_up == 0
        for: 30s
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "数据库 {{ $labels.instance }} 已停止"
          description: "PostgreSQL 数据库连接失败"

  - name: warning_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(llm_requests_errors_total[5m]) / rate(llm_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "错误率过高"
          description: "{{ $labels.instance }} 的错误率为 {{ $value | humanizePercentage }}"

      - alert: HighLatency
        expr: histogram_quantile(0.99, llm_request_duration_seconds) > 10
        for: 2m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "P99 延迟过高"
          description: "{{ $labels.instance }} 的 P99 延迟为 {{ $value }}s"

      - alert: GPUOverload
        expr: nvidia_gpu_utilization > 95
        for: 10m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "GPU 利用率持续过高"
          description: "{{ $labels.instance }} 的 GPU 利用率为 {{ $value }}%"

  - name: info_alerts
    interval: 1m
    rules:
      - alert: UserQuotaExceeded
        expr: user_tokens_used_today > user_quota_daily
        for: 0s
        labels:
          severity: info
          team: support
        annotations:
          summary: "用户 {{ $labels.username }} 配额已用尽"
          description: "用户 {{ $labels.username }} 的每日 Token 配额已用完"

      - alert: DiskSpaceLow
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.1
        for: 5m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "磁盘空间不足"
          description: "{{ $labels.instance }} 的 {{ $labels.mountpoint }} 磁盘空间剩余 {{ $value | humanizePercentage }}"
```

---

## 4. 日志管理

### 4.1 日志查看

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f vllm-inference
docker-compose logs -f kong
docker-compose logs -f keycloak

# 查看最近 N 行日志
docker-compose logs --tail=100 vllm-inference

# 查看指定时间范围的日志
docker-compose logs --since="2024-01-01T00:00:00" --until="2024-01-01T23:59:59" vllm-inference

# 查看错误日志
docker-compose logs | grep -i error
docker-compose logs | grep -i exception

# 查看警告日志
docker-compose logs | grep -i warning

# 导出日志
docker-compose logs > /tmp/llm-platform-$(date +%Y%m%d).log
```

### 4.2 日志分析

```bash
#!/bin/bash
# scripts/analyze-logs.sh

LOG_DATE=$(date +%Y%m%d)

echo "=== 错误统计 ==="
docker-compose logs | grep -i error | awk '{print $NF}' | sort | uniq -c | sort -rn

echo ""
echo "=== 请求延迟分布 ==="
docker-compose logs | grep "duration_ms" | awk -F'duration_ms=' '{print $2}' | \
    awk '{sum+=$1; count++; if($1>max) max=$1} END {print "平均:", sum/count, "ms", "最大:", max, "ms"}'

echo ""
echo "=== 错误率 ==="
total=$(docker-compose logs | grep -c "request")
errors=$(docker-compose logs | grep -i error | wc -l)
echo "请求数: $total, 错误数: $errors, 错误率: $(awk "BEGIN {printf \"%.2f%%\", ($errors/$total)*100}")"

echo ""
echo "=== 异常 IP 统计 ==="
docker-compose logs | grep -oP 'client_ip=\K[0-9.]+' | sort | uniq -c | sort -rn | head -20
```

### 4.3 日志清理

```bash
#!/bin/bash
# scripts/clean-logs.sh

# 清理 Docker 日志
docker system prune -f --filter "until=7d"

# 清理容器日志
for container in $(docker ps -aq); do
    docker inspect $container | jq '.[0].LogPath' | xargs truncate -s 0
done

# 清理应用日志
find /opt/enterprise-llm-platform/logs -name "*.log" -mtime +7 -delete

# 清理 Loki 日志
docker-compose exec -T loki logcli query '{job=~".+"}' --from 30d | wc -l

echo "日志清理完成"
```

---

## 5. 性能优化

### 5.1 推理服务优化

#### 批处理优化

```yaml
# 调整批处理参数
vllm-inference:
  environment:
    - VLLM_MAX_NUM_SEQS=512        # 最大并发序列
    - VLLM_MAX_NUM_BATCHED_TOKENS=8192  # 最大批处理 tokens
```

#### 显存优化

```yaml
# 使用量化模型
vllm-inference:
  command: >
    --model /models/Qwen-72B-Chat-AWQ
    --quantization awq
    --gpu-memory-utilization 0.95
```

#### 并行优化

```yaml
# 增加 Tensor 并行
vllm-inference:
  command: >
    --model /models/Qwen-72B-Chat
    --tensor-parallel-size 8  # 根据 GPU 数量调整
```

### 5.2 网络优化

```bash
# 内核参数优化
cat >> /etc/sysctl.d/99-llm-platform.conf << EOF
# 网络优化
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 30
net.ipv4.tcp_keepalive_time = 1200
net.ipv4.tcp_keepalive_probes = 3
net.ipv4.tcp_keepalive_intvl = 15
EOF

sysctl -p /etc/sysctl.d/99-llm-platform.conf
```

### 5.3 数据库优化

```sql
-- PostgreSQL 配置
-- postgresql.conf
shared_buffers = 4GB
effective_cache_size = 12GB
maintenance_work_mem = 1GB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 6553kB
min_wal_size = 1GB
max_wal_size = 4GB

-- 查看慢查询
SELECT query, mean_exec_time, calls, total_exec_time, max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### 5.4 缓存优化

```bash
# Redis 配置优化
maxmemory 16gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

---

## 6. 故障处理

### 6.1 故障分类

| 故障级别 | 响应时间 | 处理时间 | 影响 |
|---------|----------|----------|------|
| P0 | 5 分钟 | 1 小时 | 服务完全不可用 |
| P1 | 15 分钟 | 4 小时 | 核心功能不可用 |
| P2 | 1 小时 | 24 小时 | 部分功能受影响 |
| P3 | 1 天 | 3 天 | 非核心问题 |

### 6.2 故障处理流程

```
┌──────────┐
│ 发现故障  │
└────┬─────┘
     ↓
┌──────────┐
│ 初步定位  │
└────┬─────┘
     ↓
┌─────────────────────┐
│ P0/P1: 立即上报     │
│ P2/P3: 自行处理     │
└────┬────────────────┘
     ↓
┌──────────┐
│ 故障处理  │
└────┬─────┘
     ↓
┌──────────┐
│ 验证恢复  │
└────┬─────┘
     ↓
┌──────────┐
│ 复盘总结  │
└──────────┘
```

### 6.3 常见故障处理

#### 服务不可用

```bash
# 检查服务状态
docker-compose ps

# 查看服务日志
docker-compose logs -f <service-name>

# 重启服务
docker-compose restart <service-name>

# 如仍无法解决
docker-compose down
docker-compose up -d
```

#### GPU 故障

```bash
# 检查 GPU 状态
nvidia-smi

# 查看 GPU 进程
nvidia-smi pmon

# 清理 GPU 显存
docker-compose restart vllm-inference

# 检查 GPU 温度
nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader
```

#### 数据库故障

```bash
# 检查数据库状态
docker-compose exec postgres pg_isready

# 查看数据库日志
docker-compose logs postgres

# 检查数据库连接
docker-compose exec postgres psql -U llm_platform -c "SELECT 1"

# 恢复数据库（如有备份）
gunzip -c backup.sql.gz | docker-compose exec -T postgres psql -U llm_platform llm_platform
```

#### 磁盘空间不足

```bash
# 检查磁盘使用
df -h

# 清理 Docker 资源
docker system prune -a -f

# 清理旧日志
find /opt/enterprise-llm-platform/logs -name "*.log" -mtime +7 -delete

# 清理备份文件
find /opt/enterprise-llm-platform/backups -name "*.sql.gz" -mtime +30 -delete

# 清理 Postgres WAL 归档
docker-compose exec postgres psql -U llm_platform -c "SELECT pg_switch_wal();"
```

---

## 7. 安全运维

### 7.1 安全检查清单

```bash
#!/bin/bash
# scripts/security-check.sh

echo "=== 安全检查 ==="

# 1. 检查默认密码
echo -n "检查默认密码: "
grep -r "ChangeMe123\|admin" /opt/enterprise-llm-platform/docker/.env && echo "❌ 发现默认密码" || echo "✓ 无默认密码"

# 2. 检查端口暴露
echo -n "检查端口暴露: "
netstat -tlnp | grep "0.0.0.0:8443" > /dev/null && echo "⚠️ Kong 管理端口暴露" || echo "✓ 端口配置正常"

# 3. 检查 HTTPS
echo -n "检查 HTTPS: "
curl -k https://localhost:8443 -I | grep -i "HTTP/2" > /dev/null && echo "✓ HTTPS 正常" || echo "⚠️ HTTPS 可能未配置"

# 4. 检查防火墙
echo -n "检查防火墙: "
firewall-cmd --list-all > /dev/null 2>&1 && echo "✓ 防火墙已启用" || echo "⚠️ 防火墙可能未启用"

# 5. 检查审计日志
echo -n "检查审计日志: "
ls -lh /opt/enterprise-llm-platform/logs/audit.log > /dev/null && echo "✓ 审计日志存在" || echo "⚠️ 审计日志缺失"
```

### 7.2 权限管理

```sql
-- 查看用户权限
SELECT u.username, u.display_name, r.role_name, u.is_active
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
LEFT JOIN roles r ON ur.role_id = r.id
ORDER BY u.username;

-- 查看管理员用户
SELECT username, display_name, email, created_at
FROM users
WHERE is_admin = true OR username IN (SELECT username FROM user_roles WHERE role_name = 'admin');
```

### 7.3 审计日志

```sql
-- 查看敏感操作日志
SELECT
    al.action,
    al.user_id,
    u.username,
    al.ip_address,
    al.details,
    al.created_at
FROM audit_logs al
LEFT JOIN users u ON al.user_id = u.id
WHERE al.action IN ('CREATE_USER', 'DELETE_USER', 'MODIFY_QUOTA', 'MODIFY_ROLE')
ORDER BY al.created_at DESC
LIMIT 100;

-- 查看异常登录
SELECT
    u.username,
    al.ip_address,
    al.created_at,
    al.status
FROM audit_logs al
LEFT JOIN users u ON al.user_id = u.id
WHERE al.action = 'LOGIN' AND al.status = 'failure'
ORDER BY al.created_at DESC
LIMIT 50;
```

---

## 8. 容量规划

### 8.1 容量评估

```sql
-- 查看使用统计
SELECT
    COUNT(DISTINCT user_id) as active_users,
    SUM(total_tokens) as total_tokens,
    SUM(total_requests) as total_requests,
    AVG(total_tokens) as avg_tokens_per_user,
    MAX(total_tokens) as max_tokens_per_user
FROM daily_usage_summary
WHERE date >= CURRENT_DATE - INTERVAL '30 days';

-- 预测下月使用量
SELECT
    date,
    SUM(total_tokens) as daily_tokens,
    AVG(SUM(total_tokens)) OVER (ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) as ma_7d
FROM daily_usage_summary
WHERE date >= CURRENT_DATE - INTERVAL '60 days'
GROUP BY date
ORDER BY date;
```

### 8.2 扩容建议

| 指标 | 当前 | 阈值 | 建议 |
|------|------|------|------|
| QPS | 200 | 500/s | 当前满足 |
| P99 延迟 | 3s | 5s | 当前满足 |
| GPU 利用率 | 75% | 90% | 当前满足 |
| 活跃用户 | 100 | 500 | 当前满足 |
| 每日 Token | 1M | 5M | 当前满足 |

### 8.3 扩容方案

#### 水平扩容

```bash
# 增加 vLLM 实例
docker-compose up -d --scale vllm-inference=3

# 配置负载均衡
# Kong 自动负载均衡
```

#### 垂直扩容

```bash
# 增加 GPU 分配
VLLM_TENSOR_PARALLEL_SIZE=8

# 增加显存分配
VLLM_GPU_MEMORY_UTILIZATION=0.99
```

---

## 9. 版本升级

### 9.1 升级前检查

```bash
#!/bin/bash
# scripts/pre-upgrade-check.sh

echo "=== 升级前检查 ==="

# 1. 备份数据库
echo "备份数据库..."
./scripts/backup.sh

# 2. 检查服务状态
echo "检查服务状态..."
docker-compose ps

# 3. 检查磁盘空间
echo "检查磁盘空间..."
df -h | grep -E "^/dev"

# 4. 检查配置备份
echo "检查配置备份..."
ls -lh /opt/enterprise-llm-platform/backups/config_*.tar.gz

# 5. 测试回滚
echo "测试回滚..."
# (可选) 在测试环境验证回滚流程

echo "检查完成！"
```

### 9.2 升级流程

```bash
#!/bin/bash
# scripts/upgrade.sh

VERSION=$1

if [ -z "$VERSION" ]; then
    echo "用法: $0 <version>"
    exit 1
fi

echo "=== 升级到版本 $VERSION ==="

# 1. 拉取新版本
echo "拉取新版本代码..."
git pull origin main
git checkout $VERSION

# 2. 更新镜像
echo "更新 Docker 镜像..."
docker-compose pull

# 3. 执行数据库迁移（如有）
echo "执行数据库迁移..."
# docker-compose exec postgres psql -U llm_platform -f /docker/sql/migration_$VERSION.sql

# 4. 重启服务
echo "重启服务..."
docker-compose down
docker-compose up -d

# 5. 验证升级
echo "验证升级..."
sleep 30
./scripts/health-check.sh

echo "升级完成！"
```

### 9.3 回滚流程

```bash
#!/bin/bash
# scripts/rollback.sh

VERSION=$1

echo "=== 回滚到版本 $VERSION ==="

# 1. 停止服务
echo "停止服务..."
docker-compose down

# 2. 切换代码版本
echo "切换代码版本..."
git checkout $VERSION

# 3. 回滚数据库（如有备份）
echo "回滚数据库..."
# gunzip -c /opt/enterprise-llm-platform/backups/postgres_*.sql.gz | \
#     docker-compose exec -T postgres psql -U llm_platform llm_platform

# 4. 重启服务
echo "重启服务..."
docker-compose up -d

# 5. 验证回滚
echo "验证回滚..."
./scripts/health-check.sh

echo "回滚完成！"
```

---

## 附录

### A. 常用运维命令速查

| 功能 | 命令 |
|------|------|
| 服务状态 | `docker-compose ps` |
| 服务日志 | `docker-compose logs -f [service]` |
| 重启服务 | `docker-compose restart [service]` |
| 停止服务 | `docker-compose down` |
| 启动服务 | `docker-compose up -d` |
| 健康检查 | `./scripts/health-check.sh` |
| 备份数据 | `./scripts/backup.sh` |
| 恢复数据 | `./scripts/restore.sh` |
| GPU 状态 | `nvidia-smi` |
| 查看配额 | `./scripts/check-quota.sh` |
| 安全检查 | `./scripts/security-check.sh` |

### B. 重要文件位置

| 文件 | 位置 |
|------|------|
| 环境变量 | `/opt/enterprise-llm-platform/docker/.env` |
| 模型文件 | `/opt/enterprise-llm-platform/models/` |
| 日志文件 | `/opt/enterprise-llm-platform/logs/` |
| 备份文件 | `/opt/enterprise-llm-platform/backups/` |
| 配置文件 | `/opt/enterprise-llm-platform/docker/` |
| 运维脚本 | `/opt/enterprise-llm-platform/scripts/` |

### C. 联系信息

| 类型 | 联系方式 |
|------|----------|
| 技术支持 | support@company.com |
| 安全团队 | security@company.com |
| 紧急热线 | +86-xxx-xxxx-xxxx |
| 问题追踪 | https://github.com/your-org/enterprise-llm-platform/issues |
| 知识库 | https://wiki.company.com/llm-platform |
