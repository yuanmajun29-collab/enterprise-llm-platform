#!/bin/bash

# ========================================
# Build JetBrains Plugin
# 构建 JetBrains 插件
# ========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
JETBRAINS_DIR="$PROJECT_DIR/plugin/jetbrains"

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}[INFO]${NC} Building JetBrains plugin..."

cd "$JETBRAINS_DIR"

# 检查 Gradle
if ! command -v gradle &> /dev/null; then
    if [ -f "./gradlew" ]; then
        GRADLE_CMD="./gradlew"
    else
        echo -e "${RED}[ERROR]${NC} Gradle not found. Please install Gradle first."
        exit 1
    fi
else
    GRADLE_CMD="gradle"
fi

# 检查 JDK
if ! command -v java &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} Java not found. Please install JDK 17+."
    exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ "$JAVA_VERSION" -lt 17 ]; then
    echo -e "${RED}[ERROR]${NC} JDK 17+ is required. Current version: $JAVA_VERSION"
    exit 1
fi

# 构建
echo -e "${BLUE}[INFO]${NC} Running Gradle build..."
$GRADLE_CMD clean buildPlugin

# 检查构建结果
if [ -f "build/distributions/*.zip" ]; then
    echo -e "${GREEN}[SUCCESS]${NC} JetBrains plugin built successfully!"
    echo ""
    echo "Output: $JETBRAINS_DIR/build/distributions/"
    echo ""
    echo "Install in IDE:"
    echo "  Settings -> Plugins -> Install Plugin from Disk"
else
    echo -e "${RED}[ERROR]${NC} Build failed. Check the logs above."
    exit 1
fi
