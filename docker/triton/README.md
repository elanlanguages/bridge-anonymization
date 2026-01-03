# Rehydra Triton Inference Server

GPU-accelerated NER inference using NVIDIA Triton Inference Server with TensorRT optimization.

## Requirements

- Docker with NVIDIA Container Toolkit
- NVIDIA GPU with CUDA support (T4, V100, A100, etc.)
- ~2GB disk space for model and container

## Quick Start

```bash
# 1. First, ensure the NER model is downloaded
cd ../..
npm run build
npx tsx -e "import { ensureModel } from './dist/ner/model-manager.js'; ensureModel('quantized', { autoDownload: true, onStatus: console.log }).then(console.log)"

# 2. Run the setup script to copy model to Triton
cd docker/triton
chmod +x setup.sh
./setup.sh quantized

# 3. Start Triton
docker compose up -d

# 4. Verify it's running
curl http://localhost:8000/v2/health/ready

# 5. Test with the SDK
cd ../..
npm run test:triton
```

## Configuration

### Model Config (`models/ner_model/config.pbtxt`)

The model is configured for optimal GPU performance:

- **TensorRT FP16**: Uses half-precision for 2x performance on tensor cores
- **Dynamic Batching**: Automatically batches requests for throughput
- **Model Warmup**: Pre-compiles TensorRT engines on startup

### Docker Compose Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 8000 | HTTP | REST API, health checks, metrics |
| 8001 | gRPC | Primary inference endpoint (used by SDK) |
| 8002 | HTTP | Prometheus metrics |

## Usage with SDK

```typescript
import { createAnonymizer } from 'rehydra';

const anonymizer = createAnonymizer({
  ner: {
    mode: 'quantized',
    backend: 'triton',
    tritonUrl: 'localhost:8001',
  }
});

await anonymizer.initialize();
const result = await anonymizer.anonymize('Contact John at john@example.com');
```

## Performance

Expected latency on NVIDIA T4:

| Backend | Latency (ms) | Throughput |
|---------|--------------|------------|
| CPU (ONNX) | ~150-200 | ~5-7 texts/sec |
| Triton (TensorRT FP16) | ~15-30 | ~30-60 texts/sec |

## Troubleshooting

### "Model not ready"

The model needs TensorRT engine compilation on first startup. This can take 1-2 minutes. Check logs:

```bash
docker compose logs -f triton
```

### "Connection refused"

Ensure Triton is running and healthy:

```bash
docker compose ps
curl http://localhost:8000/v2/health/ready
```

### "CUDA out of memory"

The default config uses ~1GB GPU memory. For smaller GPUs, reduce `max_workspace_size_bytes` in `config.pbtxt`.

## Stopping

```bash
docker compose down
```


