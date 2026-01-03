/**
 * ONNX Runtime Abstraction
 * Allows switching between onnxruntime-node, onnxruntime-node-gpu, and onnxruntime-web
 * 
 * In browsers without a bundler, automatically loads onnxruntime-web from CDN
 * GPU support (CUDA/TensorRT) requires Node.js and onnxruntime-node-gpu package
 */

// CDN URL for onnxruntime-web (used when bare import fails in browser)
// Using the bundled ESM version that includes WebAssembly backend
const ONNX_WEB_CDN_URL =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.bundle.min.mjs";

/**
 * Device type for inference
 * - 'cpu': Standard CPU inference (works with Node.js and Bun)
 * - 'cuda': NVIDIA GPU via CUDA (requires Node.js + onnxruntime-node-gpu)
 * - 'tensorrt': NVIDIA GPU via TensorRT for maximum performance (requires Node.js + onnxruntime-node-gpu)
 */
export type DeviceType = "cpu" | "cuda" | "tensorrt";

/**
 * GPU-specific configuration options
 */
export interface GPUConfig {
  /** Device type for inference */
  device: DeviceType;
  /** GPU device ID (default: 0) */
  deviceId?: number;
  /** Path to cache TensorRT engines (default: /tmp/rehydra_trt_cache) */
  tensorrtCachePath?: string;
}

// Type definitions that match both runtimes
export interface OrtTensor {
  data: Float32Array | BigInt64Array | Int32Array;
  dims: readonly number[];
}

export interface OrtSession {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
}

/**
 * ONNX Runtime session options for performance tuning
 */
export interface OrtSessionOptions {
  /**
   * Execution providers in priority order.
   * - For onnxruntime-web: ['webgpu', 'wasm'] or ['wasm']
   * - For onnxruntime-node: usually not needed (uses CPU by default)
   * - With custom builds: ['coreml'], ['cuda'], etc.
   */
  executionProviders?: Array<string | { name: string; [key: string]: unknown }>;
  /** Graph optimization level */
  graphOptimizationLevel?: "disabled" | "basic" | "extended" | "all";
  /** Number of threads for parallel execution within operators */
  intraOpNumThreads?: number;
  /** Number of threads for parallel execution between operators */
  interOpNumThreads?: number;
  /** Enable CPU memory arena for allocations */
  enableCpuMemArena?: boolean;
  /** Enable memory pattern optimization */
  enableMemPattern?: boolean;
}

export interface OrtInferenceSession {
  create(
    pathOrBuffer: string | ArrayBuffer | Uint8Array,
    options?: OrtSessionOptions
  ): Promise<OrtSession>;
}

export interface OrtTensorConstructor {
  new (
    type: string,
    data: Float32Array | BigInt64Array | Int32Array | number[] | bigint[],
    dims: number[]
  ): OrtTensor;
}

export interface OrtRuntime {
  InferenceSession: OrtInferenceSession;
  Tensor: OrtTensorConstructor;
}

/**
 * Runtime detection and loading
 */
let _runtime: OrtRuntime | null = null;
let _runtimeType: "node" | "web" | null = null;
let _loadedDevice: DeviceType = "cpu";

/**
 * Detects the best ONNX runtime for the current environment
 */
export function detectRuntime(): "node" | "web" {
  // Check if we're in Bun
  const isBun = typeof globalThis.Bun !== "undefined";

  // Check if we're in a browser-like environment
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const isBrowser = typeof globalThis.window !== "undefined";

  // Check if we're in Deno
  const isDeno = typeof globalThis.Deno !== "undefined";

  if (isBrowser || isDeno) {
    return "web";
  }

  // For Bun, try node first, fall back to web
  if (isBun) {
    try {
      // Quick check if onnxruntime-node is loadable
      require.resolve("onnxruntime-node");
      return "node";
    } catch {
      return "web";
    }
  }

  // Default to node for Node.js
  return "node";
}

/**
 * Attempts to load onnxruntime-web, first via bare import, then via CDN
 */
async function loadOnnxWeb(): Promise<OrtRuntime> {
  // First try bare import (works with bundlers or import maps)
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - onnxruntime-web may not be installed
    const ort = (await import("onnxruntime-web")) as OrtRuntime;
    return ort;
  } catch {
    // Bare import failed, try CDN (for browsers without bundlers)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const isBrowser = typeof globalThis.window !== "undefined";
    if (isBrowser) {
      try {
        // Dynamic import from CDN URL
        const ort = (await import(
          /* webpackIgnore: true */ ONNX_WEB_CDN_URL
        )) as OrtRuntime;
        return ort;
      } catch (cdnError) {
        throw new Error(
          `Failed to load onnxruntime-web from CDN: ${String(cdnError)}`
        );
      }
    }
    throw new Error("onnxruntime-web is not available");
  }
}

/**
 * Loads the GPU ONNX runtime (onnxruntime-node-gpu)
 * Only works in Node.js environment
 */
async function loadOnnxNodeGPU(): Promise<OrtRuntime> {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - onnxruntime-node-gpu may not be installed
    const ort = (await import("onnxruntime-node-gpu")) as OrtRuntime;
    return ort;
  } catch (e) {
    throw new Error(
      `GPU device requires 'onnxruntime-node-gpu' package.\n` +
        `Install with: npm install onnxruntime-node-gpu\n` +
        `Note: GPU mode requires Node.js (not Bun).\n` +
        `Original error: ${String(e)}`
    );
  }
}

/**
 * Loads the appropriate ONNX runtime
 * @param preferredRuntime - Force 'node' or 'web' runtime
 * @param device - Device type: 'cpu', 'cuda', or 'tensorrt' (GPU requires Node.js)
 */
export async function loadRuntime(
  preferredRuntime?: "node" | "web",
  device: DeviceType = "cpu"
): Promise<OrtRuntime> {
  // If runtime is already loaded, check if device matches
  // GPU runtimes are different packages, so we need to reload if switching
  if (_runtime !== null && _loadedDevice === device) {
    return _runtime;
  }

  // If switching devices, reset the runtime
  if (_runtime !== null && _loadedDevice !== device) {
    _runtime = null;
    _runtimeType = null;
  }

  const runtimeType = preferredRuntime ?? detectRuntime();

  try {
    if (runtimeType === "node") {
      if (device === "cpu") {
        // Load standard CPU runtime (works with Bun)
        const ort = (await import("onnxruntime-node")) as OrtRuntime;
        _runtime = ort;
        _runtimeType = "node";
        _loadedDevice = "cpu";
      } else {
        // Load GPU runtime (Node.js only, requires onnxruntime-node-gpu)
        const ort = await loadOnnxNodeGPU();
        _runtime = ort;
        _runtimeType = "node";
        _loadedDevice = device;
      }
    } else {
      // Load onnxruntime-web (with CDN fallback for browsers)
      // Note: GPU device setting is ignored in browser - uses WebGPU/WASM
      const ort = await loadOnnxWeb();
      _runtime = ort;
      _runtimeType = "web";
      _loadedDevice = "cpu"; // Browser doesn't use our GPU config
    }
  } catch (e) {
    // If preferred runtime fails and we're on CPU, try the other
    if (device === "cpu") {
      const fallbackType = runtimeType === "node" ? "web" : "node";

      try {
        if (fallbackType === "node") {
          const ort = (await import("onnxruntime-node")) as OrtRuntime;
          _runtime = ort;
          _runtimeType = "node";
          _loadedDevice = "cpu";
        } else {
          // Load onnxruntime-web (with CDN fallback for browsers)
          const ort = await loadOnnxWeb();
          _runtime = ort;
          _runtimeType = "web";
          _loadedDevice = "cpu";
        }
      } catch {
        throw new Error(
          `Failed to load ONNX runtime. Install either 'onnxruntime-node' or 'onnxruntime-web'.\n` +
            `Original error: ${String(e)}`
        );
      }
    } else {
      // GPU mode failed - don't fallback, throw the error
      throw e;
    }
  }

  return _runtime;
}

/**
 * Gets the currently loaded runtime type
 */
export function getRuntimeType(): "node" | "web" | null {
  return _runtimeType;
}

/**
 * Gets the currently loaded device type
 */
export function getLoadedDevice(): DeviceType {
  return _loadedDevice;
}

/**
 * Resets the runtime (useful for testing)
 */
export function resetRuntime(): void {
  _runtime = null;
  _runtimeType = null;
  _loadedDevice = "cpu";
}

/** Execution provider configuration with required name */
export type ExecutionProviderConfig = string | { name: string; [key: string]: unknown };

/**
 * Builds execution providers array based on device type
 * @param device - The device type to configure
 * @param deviceId - GPU device ID (default: 0)
 * @param tensorrtCachePath - Path to cache TensorRT engines
 * @returns Array of execution providers in priority order
 */
export function buildGPUExecutionProviders(
  device: DeviceType,
  deviceId: number = 0,
  tensorrtCachePath?: string
): ExecutionProviderConfig[] {
  switch (device) {
    case "tensorrt":
      return [
        {
          name: "TensorrtExecutionProvider",
          deviceId,
          trtFp16Enable: true,
          trtEngineCacheEnable: true,
          trtEngineCachePath: tensorrtCachePath ?? "/tmp/rehydra_trt_cache",
        },
        { name: "CUDAExecutionProvider", deviceId },
        "CPUExecutionProvider",
      ];
    case "cuda":
      return [
        { name: "CUDAExecutionProvider", deviceId },
        "CPUExecutionProvider",
      ];
    default:
      return ["CPUExecutionProvider"];
  }
}

// Add runtime type declarations
declare global {
  // eslint-disable-next-line no-var
  var Bun: unknown;
  // eslint-disable-next-line no-var
  var Deno: unknown;
}
