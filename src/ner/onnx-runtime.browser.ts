/**
 * ONNX Runtime Abstraction - Browser-Only Version
 * 
 * This module provides the same interface as onnx-runtime.ts but only includes
 * onnxruntime-web. It's used by the browser entry point to avoid bundler issues
 * with onnxruntime-node.
 * 
 * DO NOT import onnxruntime-node here - that's the whole point!
 */

// CDN URL for onnxruntime-web (used when bare import fails in browser)
// Using the bundled ESM version that includes WebAssembly backend
const ONNX_WEB_CDN_URL =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.bundle.min.mjs";

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

export interface OrtInferenceSession {
  create(
    pathOrBuffer: string | ArrayBuffer | Uint8Array,
    options?: unknown
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

/**
 * Detects the best ONNX runtime for the current environment
 * Browser version always returns "web"
 */
export function detectRuntime(): "node" | "web" {
  return "web";
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
 * Loads the ONNX runtime (always onnxruntime-web in browser build)
 */
export async function loadRuntime(
  preferredRuntime?: "node" | "web"
): Promise<OrtRuntime> {
  if (_runtime !== null) {
    return _runtime;
  }

  // In browser build, we only support "web" runtime
  if (preferredRuntime === "node") {
    throw new Error(
      "onnxruntime-node is not available in browser build.\n" +
      "Import from 'rehydra' (not 'rehydra/browser') for Node.js support."
    );
  }

  try {
    const ort = await loadOnnxWeb();
    _runtime = ort;
    _runtimeType = "web";
  } catch (e) {
    throw new Error(
      `Failed to load ONNX runtime. Make sure 'onnxruntime-web' is installed.\n` +
        `Original error: ${String(e)}`
    );
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
 * Resets the runtime (useful for testing)
 */
export function resetRuntime(): void {
  _runtime = null;
  _runtimeType = null;
}

