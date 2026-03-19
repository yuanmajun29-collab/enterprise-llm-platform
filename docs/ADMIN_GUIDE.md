# 企业大模型平台 - 管理员操作指南

## 目录

- [1. 管理员职责](#1-管理员职责)
- [2. 用户管理](#2-用户管理)
- [3. 角色与权限](#3-角色与权限)
- [4. 配额管理](#4-配额管理)
- [5. 模型管理](#5-模型管理)
- [6. 监控运维](#6-监控运维)
- [7. 安全审计](#7-安全审计)
- [8. 应急处理](#8-应急处理)

---

## 1. 管理员职责

### 1.1 主要职责

| 职责 | 说明 |
|------|------|
| **用户管理** | 创建/删除用户账号、重置密码、分配角色 |
| **配额管理** | 设置用户配额、监控使用情况、调整配额 |
| **角色管理** | 创建角色、分配权限、管理角色继承 |
| **模型管理** | 添加/删除模型、配置模型参数、模型版本管理 |
| **监控运维** | 监控服务状态、分析性能数据、处理告警 |
| **安全审计** | 查看审计日志、处理安全事件、定期安全检查 |
| **故障处理** | 处理用户反馈、排查服务故障、协调资源 |

### 1.2 管理员账号

**默认管理员：**

| 系统 | 用户名 | 默认密码 |
|------|--------|----------|
| Keycloak | admin | ChangeMe123! |
| Grafana | admin | admin |

**重要提示：**
- 部署后立即修改默认密码
- 使用强密码（12位以上，包含大小写字母、数字、符号）
- 启用多因素认证（MFA）

---

## 2. 用户管理

### 2.1 创建用户

**方式一：使用脚本**

```bash
./scripts/create-user.sh
```

按提示输入：
- 用户名
- 邮箱
- 显示名称
- 部门
- 工号
- 角色
- 配额

**方式二：Keycloak 管理控制台**

```
1. 访问 http://your-domain:8080/admin
2. 登录管理员账号
3. 选择 Realm: llm-platform
4. Users → Add user
5. 填写用户信息
6. 保存后设置密码（Credentials → Set Password）
7. 分配角色（Role Mappings）
```

**方式三：API 创建**

```bash
# 获取管理员 Token
TOKEN=$(curl -s -X POST \
  http://your-domain:8080/realms/master/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=YOUR_PASSWORD&grant_type=password&client_id=admin-cli" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

# 创建用户
curl -s -X POST \
  http://your-domain:8080/admin/realms/llm-platform/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john.doe",
    "email": "john.doe@company.com",
    "firstName": "John",
    "lastName": "Doe",
    "enabled": true,
    "attributes": {
      "department": ["研发部"],
      "employee_id": ["E12345"]
    }
  }'
```

### 2.2 分配角色

```
1. 进入用户详情页
2. Role Mappings
3. 从 Available 列选择角色
4. 点击 Add selected
```

### 2.3 重置密码

```
1. 进入用户详情页
2. Credentials
3. Set Password
4. 输入新密码
5. Temporary: 是否首次登录需要修改
```

### 2.4 禁用/启用用户

```
1. 进入用户详情页
2. Edit
3. User Enabled: 开关
4. Save
```

### 2.5 删除用户

**警告：删除用户将清除所有数据，请谨慎操作**

```
1. 进入用户详情页
2. Delete
3. 确认删除
```

---

## 3. 角色与权限

### 3.1 预设角色

| 角色 | 权限描述 | 配额建议 |
|------|----------|----------|
| **admin** | 系统管理员，全部权限 | 无限制 |
| **developer** | 开发人员，所有模型访问 | 100K tokens/day |
| **user** | 普通用户，基础模型访问 | 10K tokens/day |
| **auditor** | 审计员，只读访问 | N/A |

### 3.2 创建角色

```
1. 登录 Keycloak 管理控制台
2. Roles → Add Role
3. 填写角色名称和描述
4. Save
```

### 3.3 配置角色权限

**权限矩阵：**

| 操作 | admin | developer | user | auditor |
|------|-------|-----------|------|---------|
| 用户管理 | ✅ | ❌ | ❌ | ❌ |
| 角色管理 | ✅ | ❌ | ❌ | ❌ |
| 配额管理 | ✅ | ❌ | ❌ | ❌ |
| 模型访问 | ✅ 全部 | ✅ 全部 | ✅ 基础 | ❌ |
| API 调用 | ✅ 无限 | ✅ 配额 | ✅ 配额 | ❌ |
| 查看日志 | ✅ | ❌ | ❌ | ✅ |
| 审计查看 | ✅ | ❌ | ❌ | ✅ |

### 3.4 用户-角色分配

```sql
-- 查看用户角色
SELECT u.username, u.display_name, r.role_name
FROM users u
JOIN user_roles ur ON u.id = ur.user_id
ORDER BY u.username;

-- 统计各角色用户数
SELECT role_name, COUNT(*) as user_count
FROM user_roles
GROUP BY role_name;
```

---

## 4. 配额管理

### 4.1 配额类型

| 配额类型 | 说明 | 重置周期 |
|----------|------|----------|
| tokens_per_day | 每日 Token 限制 | 每天 00:00 |
| calls_per_hour | 每小时调用次数限制 | 每小时 |
| tokens_per_month | 每月 Token 限制 | 每月1日 |

### 4.2 设置用户配额

```sql
-- 为用户设置每日配额
INSERT INTO user_quotas (user_id, quota_type, daily_limit, hourly_limit)
VALUES (
    (SELECT id FROM users WHERE username = 'john.doe'),
    'tokens_per_day',
    100000,  -- 每天 100K tokens
    10000     -- 每小时 10K tokens
)
ON CONFLICT (user_id, quota_type) DO UPDATE SET
    daily_limit = EXCLUDED.daily_limit,
    hourly_limit = EXCLUDED.hourly_limit;
```

### 4.3 查看配额使用

```sql
-- 查看用户配额使用情况
SELECT
    u.username,
    u.display_name,
    u.department,
    q.daily_limit,
    COALESCE(d.total_tokens, 0) as used_today,
    q.daily_limit - COALESCE(d.total_tokens, 0) as remaining
FROM users u
LEFT JOIN user_quotas q ON u.id = q.user_id AND q.quota_type = 'tokens_per_day'
LEFT JOIN daily_usage_summary d ON u.id = d.user_id AND d.date = CURRENT_DATE
WHERE u.is_active = true
ORDER BY used_today DESC;
```

### 4.4 调整配额

```sql
-- 调整用户配额
UPDATE user_quotas
SET daily_limit = 200000, hourly_limit = 20000
WHERE user_id = (SELECT id FROM users WHERE username = 'john.doe');
```

### 4.5 配额预警

配置告警规则，当用户配额使用超过阈值时发送通知：

```yaml
- alert: UserQuotaNearLimit
  expr: |
    user_tokens_used_today / user_quota_daily > 0.8
  for: 1m
  annotations:
    summary: "用户 {{ $labels.username }} 配额即将用尽"
    description: "已使用 {{ $value | humanizePercentage }}，请关注"
```

---

## 5. 模型管理

### 5.1 添加新模型

**步骤：**

1. 下载模型文件到 `models/` 目录
2. 更新数据库模型配置
3. 重启推理服务
4. 更新 Kong 路由配置

**数据库配置：**

```sql
-- 添加新模型
INSERT INTO models (name, display_name, description, provider, parameters, context_length)
VALUES (
    'Mistral-7B-Instruct',
    'Mistral 7B',
    'Mistral AI 开源的 7B 指令微调模型',
    'mistral',
    7000000000,
    8192
);
```

**推理服务配置：**

```bash
# 修改 docker-compose.yml
vllm-inference:
  environment:
    - MODEL_NAME=/models/Mistral-7B-Instruct
```

### 5.2 模型权限管理

```sql
-- 为模型设置访问权限
INSERT INTO model_permissions (model_id, user_id, access_type)
VALUES (
    (SELECT id FROM models WHERE name = 'Qwen-72B-Chat'),
    (SELECT id FROM users WHERE username = 'john.doe'),
    'read'
);

-- 为部门设置权限
INSERT INTO model_permissions (model_id, department, access_type)
VALUES (
    (SELECT id FROM models WHERE name = 'DeepSeek-Coder-33B'),
    '研发部',
    'read'
);
```

### 5.3 模型监控

**监控指标：**

- QPS：每秒请求数
- 延迟：P50/P95/P99 延迟
- GPU 利用率：显存和计算资源使用
- 错误率：请求失败比例

**Grafana 仪表板：**
- 模型性能概览
- 模型使用排行
- GPU 资源监控
- 错误率趋势

### 5.4 模型版本管理

```sql
-- 模型版本表结构（可扩展）
ALTER TABLE models ADD COLUMN version VARCHAR(50);
ALTER TABLE models ADD COLUMN is_latest BOOLEAN DEFAULT true;

-- 查看模型版本
SELECT name, version, display_name, is_latest
FROM models
ORDER BY name, version;
```

---

## 6. 监控运维

### 6.1 服务状态检查

```bash
#!/bin/bash
# health-check.sh

services=("kong" "keycloak" "vllm-inference" "redis" "postgres" "prometheus")

for service in "${services[@]}"; do
    status=$(docker-compose ps -q $service | xargs docker inspect --format='{{.State.Status}}')
    if [ "$status" == "running" ]; then
        echo "✓ $service: $status"
    else
        echo "✗ $service: $status"
    fi
done

# 检查 GPU
echo ""
echo "GPU Status:"
nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv
```

### 6.2 日志查看

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f vllm-inference

# 查看最近 100 行日志
docker-compose logs --tail=100 kong

# 查看错误日志
docker-compose logs | grep ERROR
```

### 6.3 性能监控

**Prometheus 查询：**

```promql
# 总请求数
sum(llm_requests_total)

# QPS
rate(llm_requests_total[5m])

# P99 延迟
histogram_quantile(0.99, llm_request_duration_seconds)

# 错误率
rate(llm_requests_errors_total[5m]) / rate(llm_requests_total[5m])

# GPU 利用率
nvidia_gpu_utilization

# 活跃用户数
count(increase(llm_requests_total[1h]))
```

### 6.4 告警处理

**常见告警：**

| 告警 | 处理方法 |
|------|----------|
| HighErrorRate | 检查服务日志，排查错误原因 |
| HighLatency | 检查负载，考虑扩容或限流 |
| GPUOverload | 检查请求量，优化批处理或增加 GPU |
| UserQuotaNearLimit | 联系用户，调整配额 |
| ServiceDown | 检查容器状态，重启服务 |

### 6.5 容量规划

**扩容建议：**

| 指标 | 阈值 | 建议操作 |
|------|------|----------|
| QPS | > 500/s | 增加推理节点 |
| P99 延迟 | > 5s | 优化模型或增加 GPU |
| GPU 利用率 | > 90% | 增加 GPU 资源 |
| 活跃用户 | 配额不足 | 增加配额或限流 |

---

## 7. 安全审计

### 7.1 审计日志查询

```sql
-- 查询用户登录记录
SELECT
    al.user_id,
    u.username,
    u.email,
    al.ip_address,
    al.created_at
FROM audit_logs al
LEFT JOIN users u ON al.user_id = u.id
WHERE al.action = 'LOGIN'
ORDER BY al.created_at DESC
LIMIT 100;

-- 查询 API 调用记录
SELECT
    al.user_id,
    u.username,
    al.resource_id as model_name,
    al.created_at,
    al.status
FROM audit_logs al
LEFT JOIN users u ON al.user_id = u.id
WHERE al.resource_type = 'model'
ORDER BY al.created_at DESC
LIMIT 100;

-- 查询敏感操作
SELECT
    al.user_id,
    u.username,
    al.action,
    al.details,
    al.ip_address,
    al.created_at
FROM audit_logs al
LEFT JOIN users u ON al.user_id = u.id
WHERE al.action IN ('CREATE_USER', 'DELETE_USER', 'MODIFY_QUOTA', 'MODIFY_ROLE')
ORDER BY al.created_at DESC;
```

### 7.2 数据脱敏检查

```sql
-- 检查是否有敏感信息泄露
SELECT
    content,
    created_at
FROM conversation_messages
WHERE content LIKE '%@%'  -- 可能有邮箱
   OR content LIKE '%1[3-9]__________%'  -- 可能有手机号
ORDER BY created_at DESC;
```

### 7.3 异常行为检测

```python
# 检测异常访问模式
def detect_anomalies():
    # 1. 检查短时间大量请求
    suspicious_users = db.query("""
        SELECT user_id, COUNT(*) as request_count
        FROM usage_records
        WHERE created_at > NOW() - INTERVAL '5 minutes'
        GROUP BY user_id
        HAVING COUNT(*) > 100
    """)

    # 2. 检查异常时间段访问
    night_users = db.query("""
        SELECT user_id, COUNT(*) as request_count
        FROM usage_records
        WHERE EXTRACT(HOUR FROM created_at) BETWEEN 2 AND 5
        GROUP BY user_id
        HAVING COUNT(*) > 50
    """)

    # 3. 检查异常 Token 消耗
    high_consumption = db.query("""
        SELECT user_id, SUM(total_tokens) as total
        FROM usage_records
        WHERE created_at > NOW() - INTERVAL '1 hour'
        GROUP BY user_id
        HAVING SUM(total_tokens) > 50000
    """)

    return {
        'suspicious_users': suspicious_users,
        'night_users': night_users,
        'high_consumption': high_consumption
    }
```

---

## 8. 应急处理

### 8.1 服务中断

**症状：** 服务无法访问

**处理步骤：**

```bash
# 1. 检查容器状态
docker-compose ps

# 2. 检查服务日志
docker-compose logs -f

# 3. 重启服务
docker-compose restart [service-name]

# 4. 如仍无法解决，停止后重新启动
docker-compose down
docker-compose up -d

# 5. 检查网络
docker network inspect llm-network

# 6. 检查资源
docker stats
```

### 8.2 GPU 故障

**症状：** 推理服务报错或响应极慢

**处理步骤：**

```bash
# 1. 检查 GPU 状态
nvidia-smi

# 2. 如 GPU 异常，重启相关容器
docker-compose restart vllm-inference

# 3. 检查 GPU 进程
nvidia-smi pmon

# 4. 清理 GPU 显存（如需要）
fuser -v /dev/nvidia*

# 5. 如硬件故障，切换到备用节点
```

### 8.3 数据库故障

**症状：** 登录失败、用户信息无法保存

**处理步骤：**

```bash
# 1. 检查数据库状态
docker-compose ps postgres

# 2. 查看数据库日志
docker-compose logs postgres

# 3. 进入数据库容器
docker-compose exec postgres bash

# 4. 检查 PostgreSQL 进程
ps aux | grep postgres

# 5. 检查磁盘空间
df -h

# 6. 如主库故障，切换到从库
```

### 8.4 资源耗尽

**症状：** 系统响应缓慢、OOM 错误

**处理步骤：**

```bash
# 1. 检查系统资源
free -h
df -h
top

# 2. 清理日志
find /opt/llm-platform/logs -name "*.log" -mtime +7 -delete

# 3. 清理 Docker 资源
docker system prune -a

# 4. 扩容磁盘或内存
# (根据实际情况操作)
```

### 8.5 安全事件

**症状：** 可疑登录、异常访问、数据泄露

**处理步骤：**

```bash
# 1. 禁用可疑账号
# 通过 Keycloak 管理控制台禁用用户

# 2. 检查审计日志
# 查看 suspicious_events 表

# 3. 回滚 API 密钥
# 通知用户重新生成密钥

# 4. 增强安全措施
# - 启用 MFA
# - 限制 IP 访问
# - 增加监控告警

# 5. 报告安全事件
# 按公司安全流程上报
```

---

## 附录

### A. 管理命令速查

| 功能 | 命令 |
|------|------|
| 查看服务状态 | `docker-compose ps` |
| 查看服务日志 | `docker-compose logs -f [service]` |
| 重启服务 | `docker-compose restart [service]` |
| 停止所有服务 | `docker-compose down` |
| 启动所有服务 | `docker-compose up -d` |
| 创建用户 | `./scripts/create-user.sh` |
| 数据库备份 | `./scripts/backup.sh` |
| GPU 状态 | `nvidia-smi` |
| 查看配额 | `./scripts/check-quota.sh` |

### B. 重要文件位置

| 文件 | 位置 |
|------|------|
| 环境变量 | `/opt/llm-platform/docker/.env` |
| 模型文件 | `/opt/llm-platform/models/` |
| 日志文件 | `/opt/llm-platform/logs/` |
| 备份文件 | `/opt/llm-platform/backups/` |
| 配置文件 | `/opt/llm-platform/docker/` |

### C. 联系信息

- 技术支持：support@company.com
- 安全团队：security@company.com
- 紧急热线：+86-xxx-xxxx-xxxx
