#!/bin/bash

# ========================================
# Build VS Code Extension
# 构建 VS Code 插件
# ========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VSCODE_DIR="$PROJECT_DIR/plugin/vscode"

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}[INFO]${NC} Building VS Code extension..."

cd "$VSCODE_DIR"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Please install Node.js first."
    exit 1
fi

# 安装依赖
echo -e "${BLUE}[INFO]${NC} Installing dependencies..."
npm install

# 编译 TypeScript
echo -e "${BLUE}[INFO]${NC} Compiling TypeScript..."
npm run compile

# 打包插件
echo -e "${BLUE}[INFO]${NC} Packaging extension..."
npm run package

echo -e "${GREEN}[SUCCESS]${NC} VS Code extension built successfully!"
echo ""
echo "Output: $VSCODE_DIR/*.vsix"
echo ""
echo "Install with: code --install-extension enterprise-llm-assistant-*.vsix"
