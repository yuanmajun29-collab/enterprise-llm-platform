#!/bin/bash
# 模型下载脚本

set -e

MODELS_DIR="/root/projects/enterprise-llm-platform/models"
LOG_FILE="/root/projects/enterprise-llm-platform/logs/download.log"

# 创建日志目录
mkdir -p "$(dirname "$LOG_FILE")"

echo "========================================" | tee -a "$LOG_FILE"
echo "Enterprise LLM Platform - 模型下载" | tee -a "$LOG_FILE"
echo "开始时间: $(date)" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"

# 创建模型目录
mkdir -p "$MODELS_DIR"

# 检查磁盘空间
available_space=$(df -BG "$MODELS_DIR" | awk 'NR==2 {print $4}' | sed 's/G//')
echo "可用磁盘空间: ${available_space}GB" | tee -a "$LOG_FILE"

if [ "$available_space" -lt 100 ]; then
    echo "警告: 磁盘空间不足 100GB，建议至少预留 150GB" | tee -a "$LOG_FILE"
fi

# 检查 NVIDIA GPU
if command -v nvidia-smi &> /dev/null; then
    echo "检测到 NVIDIA GPU:" | tee -a "$LOG_FILE"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader | tee -a "$LOG_FILE"
else
    echo "警告: 未检测到 NVIDIA GPU，模型下载后可能无法运行" | tee -a "$LOG_FILE"
fi

# 模型列表
echo "" | tee -a "$LOG_FILE"
echo "支持的模型:" | tee -a "$LOG_FILE"
echo "  1. Qwen-72B-Chat (推荐) - 约 140GB" | tee -a "$LOG_FILE"
echo "  2. Qwen-14B-Chat - 约 28GB" | tee -a "$LOG_FILE"
echo "  3. DeepSeek-Coder-33B - 约 66GB" | tee -a "$LOG_FILE"
echo "  4. Llama-3-70B-Instruct - 约 140GB" | tee -a "$LOG_FILE"
echo ""

# 默认下载 Qwen-14B-Chat（更适合测试）
MODEL_NAME="Qwen-14B-Chat"
HUGGINGFACE_MODEL="Qwen/Qwen-14B-Chat"

echo "开始下载模型: $MODEL_NAME" | tee -a "$LOG_FILE"
echo "HuggingFace 路径: $HUGGINGFACE_MODEL" | tee -a "$LOG_FILE"

# 使用 HuggingFace CLI 下载
if ! command -v huggingface-cli &> /dev/null; then
    echo "安装 huggingface-hub..." | tee -a "$LOG_FILE"
    pip3 install -q huggingface_hub
fi

echo "" | tee -a "$LOG_FILE"
echo "开始下载...（这可能需要较长时间）" | tee -a "$LOG_FILE"
echo "预计时间: 30-60 分钟（取决于网络速度）" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# 下载模型
start_time=$(date +%s)
huggingface-cli download "$HUGGINGFACE_MODEL" --local-dir "$MODELS_DIR/$MODEL_NAME" --resume-download 2>&1 | tee -a "$LOG_FILE"
end_time=$(date +%s)
duration=$((end_time - start_time))

# 下载完成
echo "" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "模型下载完成！" | tee -a "$LOG_FILE"
echo "耗时: $((duration / 60)) 分 $((duration % 60)) 秒" | tee -a "$LOG_FILE"
echo "模型路径: $MODELS_DIR/$MODEL_NAME" | tee -a "$LOG_FILE"
echo "结束时间: $(date)" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"

# 显示模型文件大小
echo "" | tee -a "$LOG_FILE"
echo "模型文件:" | tee -a "$LOG_FILE"
du -sh "$MODELS_DIR/$MODEL_NAME" | tee -a "$LOG_FILE"
