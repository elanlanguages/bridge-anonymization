#!/bin/bash
#
# NER Model Setup Script
# Downloads and exports a Hugging Face NER model to ONNX format
#
# Usage:
#   ./scripts/setup-ner-model.sh [model_id] [--quantize]
#
# Examples:
#   ./scripts/setup-ner-model.sh                                    # Default multilingual model
#   ./scripts/setup-ner-model.sh dslim/bert-base-NER                # English-only model
#   ./scripts/setup-ner-model.sh Davlan/xlm-roberta-base-ner-hrl --quantize  # With quantization
#

set -e

# Configuration
DEFAULT_MODEL="Davlan/xlm-roberta-base-ner-hrl"  # Multilingual: EN, DE, FR, ES, etc.
MODEL_ID="${1:-$DEFAULT_MODEL}"
QUANTIZE=false
OUTPUT_DIR="./models/ner"
VENV_DIR="./.ner-setup-venv"

# Parse arguments
for arg in "$@"; do
  case $arg in
    --quantize)
      QUANTIZE=true
      shift
      ;;
  esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           NER Model Setup for Bridge Anonymization         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: Python 3 is required but not installed.${NC}"
    echo "Please install Python 3.8+ and try again."
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo -e "${GREEN}✓${NC} Found Python ${PYTHON_VERSION}"

# Check Python version >= 3.8
PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)
if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 8 ]); then
    echo -e "${RED}Error: Python 3.8+ is required (found ${PYTHON_VERSION})${NC}"
    exit 1
fi

echo -e "${BLUE}Model:${NC} ${MODEL_ID}"
echo -e "${BLUE}Output:${NC} ${OUTPUT_DIR}"
echo -e "${BLUE}Quantize:${NC} ${QUANTIZE}"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Create temporary virtual environment
echo -e "${YELLOW}→${NC} Creating temporary Python environment..."
python3 -m venv "$VENV_DIR"

# Activate venv (works on both bash and zsh)
source "$VENV_DIR/bin/activate"

# Upgrade pip quietly
pip install --quiet --upgrade pip

# Install dependencies
echo -e "${YELLOW}→${NC} Installing dependencies (this may take a minute)..."
pip install --quiet \
    "optimum[exporters]>=1.16.0" \
    "transformers>=4.36.0" \
    "onnx>=1.15.0" \
    "onnxruntime>=1.17.0"

# Export model to ONNX
echo -e "${YELLOW}→${NC} Exporting model to ONNX format..."
optimum-cli export onnx \
    --model "$MODEL_ID" \
    --task token-classification \
    "$OUTPUT_DIR"

# Quantize if requested
if [ "$QUANTIZE" = true ]; then
    echo -e "${YELLOW}→${NC} Quantizing model (int8 dynamic)..."
    python3 << EOF
from onnxruntime.quantization import quantize_dynamic, QuantType
import os

model_path = "${OUTPUT_DIR}/model.onnx"
quantized_path = "${OUTPUT_DIR}/model-quantized.onnx"

quantize_dynamic(
    model_input=model_path,
    model_output=quantized_path,
    weight_type=QuantType.QInt8,
)

# Get file sizes
orig_size = os.path.getsize(model_path) / (1024 * 1024)
quant_size = os.path.getsize(quantized_path) / (1024 * 1024)

print(f"Original: {orig_size:.1f} MB")
print(f"Quantized: {quant_size:.1f} MB ({100 * quant_size / orig_size:.0f}% of original)")
EOF
fi

# Generate label map from config
echo -e "${YELLOW}→${NC} Generating label map..."
python3 << EOF
import json
from transformers import AutoConfig

config = AutoConfig.from_pretrained("${MODEL_ID}")

# Build label map from id2label
if hasattr(config, 'id2label'):
    label_map = [config.id2label[i] for i in sorted(config.id2label.keys())]
else:
    # Fallback for models without id2label
    label_map = ["O", "B-PER", "I-PER", "B-ORG", "I-ORG", "B-LOC", "I-LOC", "B-MISC", "I-MISC"]

with open("${OUTPUT_DIR}/label_map.json", "w") as f:
    json.dump(label_map, f, indent=2)

print(f"Labels: {label_map}")
EOF

# Generate config file for the TypeScript loader
echo -e "${YELLOW}→${NC} Generating model config..."
python3 << EOF
import json
from transformers import AutoConfig, AutoTokenizer

config = AutoConfig.from_pretrained("${MODEL_ID}")
tokenizer = AutoTokenizer.from_pretrained("${MODEL_ID}")

model_config = {
    "modelId": "${MODEL_ID}",
    "modelPath": "./model.onnx",
    "quantizedPath": "./model-quantized.onnx" if ${QUANTIZE} == True else None,
    "vocabPath": "./vocab.txt" if hasattr(tokenizer, 'vocab') else "./tokenizer.json",
    "labelMapPath": "./label_map.json",
    "maxLength": config.max_position_embeddings if hasattr(config, 'max_position_embeddings') else 512,
    "doLowerCase": tokenizer.do_lower_case if hasattr(tokenizer, 'do_lower_case') else False,
}

# Remove None values
model_config = {k: v for k, v in model_config.items() if v is not None}

with open("${OUTPUT_DIR}/config.json", "w") as f:
    json.dump(model_config, f, indent=2)

print(json.dumps(model_config, indent=2))
EOF

# Cleanup
echo -e "${YELLOW}→${NC} Cleaning up..."
deactivate
rm -rf "$VENV_DIR"

# Summary
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Setup Complete! ✓                       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Model files saved to: ${BLUE}${OUTPUT_DIR}/${NC}"
echo ""
echo "Files created:"
ls -lh "$OUTPUT_DIR" | tail -n +2 | while read line; do
    echo "  $line"
done
echo ""
echo -e "To use the model in your code:"
echo ""
echo -e "  ${YELLOW}import { createAnonymizerWithNER } from 'bridge-anonymization';${NC}"
echo ""
echo -e "  ${YELLOW}const anonymizer = await createAnonymizerWithNER(${NC}"
echo -e "  ${YELLOW}  './models/ner/model.onnx',${NC}"
echo -e "  ${YELLOW}  './models/ner/vocab.txt'${NC}"
echo -e "  ${YELLOW});${NC}"
echo ""

