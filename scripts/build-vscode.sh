#!/bin/bash

# ========================================
# Build VS Code Extension
# 构建 VS Code 插件
# ========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VSCODE_DIR="$PROJECT_DIR/plugin/vscode"
DIST_DIR="$PROJECT_DIR/dist"

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}[INFO]${NC} Building VS Code extension..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${YELLOW}[WARN]${NC} Node.js 18+ recommended. Current: $(node --version)"
fi

# 创建输出目录
mkdir -p "$DIST_DIR"

cd "$VSCODE_DIR"

# 安装依赖
echo -e "${BLUE}[INFO]${NC} Installing dependencies..."
npm install --production=false

# 编译 TypeScript
echo -e "${BLUE}[INFO]${NC} Compiling TypeScript..."
npx tsc -p .
if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR]${NC} TypeScript compilation failed!"
    exit 1
fi

# 打包插件
echo -e "${BLUE}[INFO]${NC} Packaging extension..."
npx vsce package --out "$DIST_DIR/"
if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR]${NC} Packaging failed!"
    exit 1
fi

echo -e "${GREEN}[SUCCESS]${NC} VS Code extension built successfully!"
echo ""
echo "Output: $DIST_DIR/*.vsix"
echo ""
echo "Install with: code --install-extension $DIST_DIR/enterprise-llm-assistant-*.vsix"
