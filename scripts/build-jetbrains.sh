#!/bin/bash

# ========================================
# Build JetBrains Plugin
# 构建 JetBrains 插件
# ========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
JETBRAINS_DIR="$PROJECT_DIR/plugin/jetbrains"
DIST_DIR="$PROJECT_DIR/dist"

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}[INFO]${NC} Building JetBrains plugin..."

# 检查 JDK 11+
if ! command -v java &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} Java not found. Please install JDK 11+."
    exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ -z "$JAVA_VERSION" ] || [ "$JAVA_VERSION" -lt 11 ]; then
    echo -e "${RED}[ERROR]${NC} JDK 11+ is required. Current: $(java -version 2>&1 | head -1)"
    exit 1
fi
echo -e "${BLUE}[INFO]${NC} Using JDK $JAVA_VERSION"

# 创建输出目录
mkdir -p "$DIST_DIR"

cd "$JETBRAINS_DIR"

# 设置 Gradle 权限
if [ -f "./gradlew" ]; then
    chmod +x gradlew
    GRADLE_CMD="./gradlew"
else
    echo -e "${RED}[ERROR]${NC} gradlew not found in $JETBRAINS_DIR"
    exit 1
fi

# 构建
echo -e "${BLUE}[INFO]${NC} Running Gradle build..."
$GRADLE_CMD clean buildPlugin

# 检查构建结果
if ls build/distributions/*.zip 1> /dev/null 2>&1; then
    # 复制到 dist 目录
    cp build/distributions/*.zip "$DIST_DIR/"

    echo -e "${GREEN}[SUCCESS]${NC} JetBrains plugin built successfully!"
    echo ""
    echo "Output:"
    ls -la "$DIST_DIR"/*.zip 2>/dev/null
    echo ""
    echo "Install in IDE:"
    echo "  Settings → Plugins → ⚙️ → Install Plugin from Disk"
else
    echo -e "${RED}[ERROR]${NC} Build failed. No zip found in build/distributions/"
    exit 1
fi
