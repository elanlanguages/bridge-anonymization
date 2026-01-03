#!/bin/bash
#
# Triton Model Setup Script
# Copies NER model files from Rehydra cache to Triton model repository
#
# Usage:
#   ./setup.sh [mode]
#
# Arguments:
#   mode: 'standard' or 'quantized' (default: quantized)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_DIR="${SCRIPT_DIR}/models/ner_model/1"

# Default to quantized model
MODE="${1:-quantized}"

echo "==================================="
echo "Rehydra Triton Model Setup"
echo "==================================="
echo ""
echo "Mode: ${MODE}"
echo "Target: ${MODEL_DIR}"
echo ""

# Determine source directory
# Check common cache locations
CACHE_DIRS=(
    "${HOME}/.cache/rehydra/models/${MODE}"
    "${HOME}/.rehydra/models/${MODE}"
    "/tmp/rehydra/models/${MODE}"
)

SOURCE_DIR=""
for dir in "${CACHE_DIRS[@]}"; do
    if [ -f "${dir}/model.onnx" ]; then
        SOURCE_DIR="${dir}"
        break
    fi
done

if [ -z "${SOURCE_DIR}" ]; then
    echo "ERROR: Model files not found in cache."
    echo ""
    echo "Please download the model first by running:"
    echo ""
    echo "  # Option 1: Use the SDK to download"
    echo "  npx tsx -e \"import { ensureModel } from './src/ner/model-manager.js'; ensureModel('${MODE}', { autoDownload: true }).then(console.log)\""
    echo ""
    echo "  # Option 2: Download manually from Hugging Face"
    echo "  huggingface-cli download tjruesch/xlm-roberta-base-ner-hrl-onnx --local-dir ${HOME}/.cache/rehydra/models/${MODE}"
    echo ""
    echo "Searched locations:"
    for dir in "${CACHE_DIRS[@]}"; do
        echo "  - ${dir}"
    done
    exit 1
fi

echo "Source: ${SOURCE_DIR}"
echo ""

# Create model directory
mkdir -p "${MODEL_DIR}"

# Copy model file
if [ -f "${SOURCE_DIR}/model.onnx" ]; then
    echo "Copying model.onnx..."
    cp "${SOURCE_DIR}/model.onnx" "${MODEL_DIR}/model.onnx"
else
    echo "ERROR: model.onnx not found in ${SOURCE_DIR}"
    exit 1
fi

# Verify copy
if [ -f "${MODEL_DIR}/model.onnx" ]; then
    SIZE=$(du -h "${MODEL_DIR}/model.onnx" | cut -f1)
    echo ""
    echo "✓ Model copied successfully (${SIZE})"
    echo ""
    echo "==================================="
    echo "Setup Complete!"
    echo "==================================="
    echo ""
    echo "Start Triton with:"
    echo "  cd ${SCRIPT_DIR}"
    echo "  docker compose up"
    echo ""
    echo "Then test with:"
    echo "  npm run test:triton"
    echo ""
else
    echo "ERROR: Failed to copy model file"
    exit 1
fi


