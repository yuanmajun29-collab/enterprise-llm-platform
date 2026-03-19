#!/bin/bash

# ========================================
# Create User Script
# 创建用户脚本
# ========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_DIR/docker"
ENV_FILE="$DOCKER_DIR/.env"

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 加载环境变量
if [ -f "$ENV_FILE" ]; then
    export $(cat "$ENV_FILE" | grep -v '^#' | xargs)
else
    echo -e "${RED}[ERROR]${NC} Configuration file not found: $ENV_FILE"
    exit 1
fi

# ========================================
# 用户输入
# ========================================
echo ""
echo "========================================"
echo "  Create New User"
echo "  创建新用户"
echo "========================================"
echo ""

read -p "Username: " username
read -p "Email: " email
read -p "Display Name: " display_name
read -p "Department: " department
read -p "Employee ID: " employee_id
read -p "Role (user/developer/admin): " role

# 默认配额
tokens_per_day=100000
tokens_per_hour=10000
if [ "$role" = "admin" ]; then
    tokens_per_day=999999999
    tokens_per_hour=999999999
fi

read -p "Tokens per day [$tokens_per_day]: " input_tokens_day
[ -n "$input_tokens_day" ] && tokens_per_day=$input_tokens_day

read -p "Tokens per hour [$tokens_per_hour]: " input_tokens_hour
[ -n "$input_tokens_hour" ] && tokens_per_hour=$input_tokens_hour

# ========================================
# 创建 Keycloak 用户
# ========================================
echo -e "${BLUE}[INFO]${NC} Creating Keycloak user..."

KEYCLOAK_URL="http://localhost:8080"
REALM="llm-platform"
ADMIN_USER="admin"
ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD"

# 获取管理员 token
TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=$ADMIN_USER&password=$ADMIN_PASSWORD&grant_type=password&client_id=admin-cli" \
    | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}[ERROR]${NC} Failed to get admin token"
    exit 1
fi

# 创建用户
curl -s -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"username\": \"$username\",
        \"email\": \"$email\",
        \"emailVerified\": true,
        \"firstName\": \"$display_name\",
        \"lastName\": \"$employee_id\",
        \"enabled\": true,
        \"attributes\": {
            \"department\": [\"$department\"],
            \"employee_id\": [\"$employee_id\"]
        }
    }"

echo -e "${GREEN}[SUCCESS]${NC} Keycloak user created"

# 获取用户 ID
sleep 1
USER_ID=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users?username=$username" \
    -H "Authorization: Bearer $TOKEN" \
    | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$USER_ID" ]; then
    echo -e "${YELLOW}[WARNING]${NC} Could not get user ID"
else
    echo "User ID: $USER_ID"

    # 设置密码
    PASSWORD=$(openssl rand -base64 12)
    curl -s -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID/reset-password" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"value\":\"$PASSWORD\",\"type\":\"password\",\"temporary\":true}"

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo "  User Created Successfully"
    echo -e "${GREEN}========================================${NC}"
    echo "Username:     $username"
    echo "Password:     $PASSWORD"
    echo "Email:        $email"
    echo "Department:   $department"
    echo "Employee ID:  $employee_id"
    echo "Role:         $role"
    echo "Tokens/Day:   $tokens_per_day"
    echo "Tokens/Hour:  $tokens_per_hour"
    echo ""
    echo "Please ask the user to change password at first login."
    echo ""
fi
