/**
 * Triton Inference Server gRPC Client
 * Provides high-performance inference via NVIDIA Triton's gRPC API
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Type definitions for dynamically loaded gRPC modules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GrpcModule = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProtoLoaderModule = any;

// Dynamic imports for optional gRPC dependencies
let grpc: GrpcModule | null = null;
let protoLoader: ProtoLoaderModule | null = null;

/**
 * Triton client configuration
 */
export interface TritonClientConfig {
  /** Triton gRPC endpoint (e.g., 'localhost:8001') */
  url: string;
  /** Model name in Triton repository */
  modelName: string;
  /** Model version (empty string = latest) */
  modelVersion?: string;
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Whether to use SSL/TLS */
  useSsl?: boolean;
}

/**
 * Inference result from Triton
 */
export interface TritonInferResult {
  /** Output logits as Float32Array */
  logits: Float32Array;
  /** Output tensor shape */
  shape: number[];
  /** Model name that processed the request */
  modelName: string;
  /** Model version that processed the request */
  modelVersion: string;
}

// gRPC client types (dynamically loaded)
interface GRPCClient {
  ServerLive: (
    request: Record<string, unknown>,
    callback: (error: Error | null, response: { live: boolean }) => void
  ) => void;
  ServerReady: (
    request: Record<string, unknown>,
    callback: (error: Error | null, response: { ready: boolean }) => void
  ) => void;
  ModelReady: (
    request: { name: string; version: string },
    callback: (error: Error | null, response: { ready: boolean }) => void
  ) => void;
  ModelInfer: (
    request: ModelInferRequest,
    callback: (error: Error | null, response: ModelInferResponse) => void
  ) => void;
  close: () => void;
}

interface ModelInferRequest {
  model_name: string;
  model_version: string;
  id: string;
  inputs: Array<{
    name: string;
    datatype: string;
    shape: number[];
    contents?: {
      int64_contents?: bigint[];
    };
  }>;
  outputs: Array<{ name: string }>;
  raw_input_contents?: Buffer[];
}

interface ModelInferResponse {
  model_name: string;
  model_version: string;
  id: string;
  outputs: Array<{
    name: string;
    datatype: string;
    shape: number[];
    contents?: {
      fp32_contents?: number[];
    };
  }>;
  raw_output_contents?: Buffer[];
}

/**
 * Loads gRPC dependencies dynamically
 * Throws a helpful error if not installed
 */
async function loadGRPCDependencies(): Promise<void> {
  if (grpc !== null && protoLoader !== null) {
    return;
  }

  try {
    // Dynamic imports - these packages are optional peer dependencies
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Optional dependency
    grpc = await import("@grpc/grpc-js");
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Optional dependency
    protoLoader = await import("@grpc/proto-loader");
  } catch (e) {
    throw new Error(
      `Triton backend requires gRPC dependencies.\n\n` +
        `Install them with:\n` +
        `  npm install @grpc/grpc-js @grpc/proto-loader\n\n` +
        `Original error: ${String(e)}`
    );
  }
}

/**
 * Triton Inference Server gRPC Client
 *
 * Provides efficient tensor inference via Triton's gRPC API.
 * Handles connection management, tensor serialization, and error recovery.
 *
 * @example
 * ```typescript
 * const client = new TritonClient({
 *   url: 'localhost:8001',
 *   modelName: 'ner_model'
 * });
 *
 * await client.connect();
 *
 * const result = await client.infer(inputIds, attentionMask, seqLength);
 * console.log(result.logits);
 *
 * client.close();
 * ```
 */
export class TritonClient {
  private config: Required<TritonClientConfig>;
  private client: GRPCClient | null = null;
  private connected = false;

  constructor(config: TritonClientConfig) {
    this.config = {
      url: config.url,
      modelName: config.modelName,
      modelVersion: config.modelVersion ?? "",
      timeout: config.timeout ?? 30000,
      useSsl: config.useSsl ?? false,
    };
  }

  /**
   * Establishes connection to Triton server
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    await loadGRPCDependencies();

    if (grpc === null || protoLoader === null) {
      throw new Error("gRPC dependencies not loaded");
    }

    // Get the directory of this file for proto path resolution
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const protoPath = join(currentDir, "triton.proto");

    // Load proto definition
    const packageDefinition = await protoLoader.load(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);

    // Get the service constructor
    const inference = protoDescriptor.inference as {
      GRPCInferenceService: new (
        address: string,
        credentials: ReturnType<typeof grpc.credentials.createInsecure>
      ) => GRPCClient;
    };

    // Create credentials
    const credentials = this.config.useSsl
      ? grpc.credentials.createSsl()
      : grpc.credentials.createInsecure();

    // Create client
    this.client = new inference.GRPCInferenceService(
      this.config.url,
      credentials
    );

    this.connected = true;
  }

  /**
   * Checks if the Triton server is live
   */
  async isServerLive(): Promise<boolean> {
    await this.ensureConnected();

    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + this.config.timeout);

      this.client!.ServerLive({}, (error, response) => {
        if (error) {
          // Connection errors mean server is not live
          if (
            error.message.includes("UNAVAILABLE") ||
            error.message.includes("DEADLINE_EXCEEDED")
          ) {
            resolve(false);
          } else {
            reject(error);
          }
          return;
        }
        resolve(response.live);
      });
    });
  }

  /**
   * Checks if a specific model is ready for inference
   */
  async isModelReady(
    modelName?: string,
    modelVersion?: string
  ): Promise<boolean> {
    await this.ensureConnected();

    return new Promise((resolve, reject) => {
      this.client!.ModelReady(
        {
          name: modelName ?? this.config.modelName,
          version: modelVersion ?? this.config.modelVersion,
        },
        (error, response) => {
          if (error) {
            if (error.message.includes("NOT_FOUND")) {
              resolve(false);
            } else {
              reject(error);
            }
            return;
          }
          resolve(response.ready);
        }
      );
    });
  }

  /**
   * Runs inference on the configured model
   *
   * @param inputIds - Token IDs as BigInt64Array
   * @param attentionMask - Attention mask as BigInt64Array
   * @param seqLength - Sequence length
   * @returns Inference result with logits
   */
  async infer(
    inputIds: BigInt64Array,
    attentionMask: BigInt64Array,
    seqLength: number
  ): Promise<TritonInferResult> {
    await this.ensureConnected();

    // Convert BigInt64Array to Buffer for raw input mode (more efficient)
    const inputIdsBuffer = Buffer.from(inputIds.buffer);
    const attentionMaskBuffer = Buffer.from(attentionMask.buffer);

    const request: ModelInferRequest = {
      model_name: this.config.modelName,
      model_version: this.config.modelVersion,
      id: `req-${Date.now()}`,
      inputs: [
        {
          name: "input_ids",
          datatype: "INT64",
          shape: [1, seqLength],
        },
        {
          name: "attention_mask",
          datatype: "INT64",
          shape: [1, seqLength],
        },
      ],
      outputs: [{ name: "logits" }],
      raw_input_contents: [inputIdsBuffer, attentionMaskBuffer],
    };

    return new Promise((resolve, reject) => {
      this.client!.ModelInfer(request, (error, response) => {
        if (error) {
          reject(new Error(`Triton inference failed: ${error.message}`));
          return;
        }

        // Find the logits output
        const logitsOutput = response.outputs.find(
          (o) => o.name === "logits"
        );
        if (!logitsOutput) {
          reject(new Error("No logits output in Triton response"));
          return;
        }

        // Parse output based on whether it's raw or contents mode
        let logits: Float32Array;

        const rawOutputContents = response.raw_output_contents as Buffer[] | undefined;
        if (
          rawOutputContents &&
          rawOutputContents.length > 0 &&
          rawOutputContents[0] !== undefined
        ) {
          // Raw mode: parse binary buffer
          const rawBuffer = rawOutputContents[0];
          logits = new Float32Array(
            rawBuffer.buffer,
            rawBuffer.byteOffset,
            rawBuffer.byteLength / 4
          );
        } else if (logitsOutput.contents?.fp32_contents) {
          // Contents mode: use the array directly
          logits = new Float32Array(logitsOutput.contents.fp32_contents);
        } else {
          reject(new Error("No logits data in Triton response"));
          return;
        }

        resolve({
          logits,
          shape: logitsOutput.shape.map(Number),
          modelName: response.model_name,
          modelVersion: response.model_version,
        });
      });
    });
  }

  /**
   * Closes the gRPC connection
   */
  close(): void {
    if (this.client !== null) {
      this.client.close();
      this.client = null;
      this.connected = false;
    }
  }

  /**
   * Ensures the client is connected
   */
  private async ensureConnected(): Promise<void> {
    if (!this.connected || this.client === null) {
      await this.connect();
    }
  }
}

/**
 * Creates a Triton client instance
 */
export function createTritonClient(config: TritonClientConfig): TritonClient {
  return new TritonClient(config);
}

