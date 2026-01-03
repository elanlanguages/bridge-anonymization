/**
 * Triton NER Model
 * NER model implementation using NVIDIA Triton Inference Server
 * Implements the INERModel interface for seamless integration
 */

import { SpanMatch, AnonymizationPolicy } from "../types/index.js";
import {
  WordPieceTokenizer,
  loadVocabFromFile,
  type TokenizationResult,
} from "./tokenizer.js";
import {
  decodeBIOTags,
  convertToSpanMatches,
  cleanupSpanBoundaries,
  mergeAdjacentSpans,
} from "./bio-decoder.js";
import { TritonClient, type TritonClientConfig } from "./triton-client.js";
import {
  ensureModel,
  type NERModelMode,
  type DownloadProgressCallback,
  MODEL_REGISTRY,
} from "./model-manager.js";
import { getStorageProvider } from "#storage";
import type { INERModel, NERPrediction } from "./ner-model.js";

import { DEFAULT_LABEL_MAP } from "./ner-model.js";

/**
 * Triton NER Model configuration
 */
export interface TritonNERModelConfig {
  /** Triton gRPC endpoint (e.g., 'localhost:8001') */
  tritonUrl: string;

  /** Model name in Triton repository */
  tritonModelName?: string;

  /** Model version in Triton (empty = latest) */
  tritonModelVersion?: string;

  /**
   * Model mode for tokenizer/vocab loading:
   * - 'standard': Full-size model vocab
   * - 'quantized': Quantized model vocab
   * - 'custom': Use custom vocabPath
   */
  mode?: NERModelMode;

  /** Custom vocabulary path (required when mode is 'custom') */
  vocabPath?: string;

  /** Label mapping (index -> label string) */
  labelMap?: string[];

  /** Maximum sequence length */
  maxLength?: number;

  /** Whether model expects lowercase input */
  doLowerCase?: boolean;

  /** Model version string for tracking */
  modelVersion?: string;

  /** Auto-download vocab files if not present */
  autoDownload?: boolean;

  /** Download progress callback */
  onDownloadProgress?: DownloadProgressCallback;

  /** Status message callback */
  onStatus?: (status: string) => void;

  /** Connection timeout in milliseconds */
  timeout?: number;
}

/**
 * Softmax function for probability calculation
 */
function softmax(logits: number[]): number[] {
  const maxLogit = Math.max(...logits);
  const expLogits = logits.map((x) => Math.exp(x - maxLogit));
  const sumExp = expLogits.reduce((a, b) => a + b, 0);
  return expLogits.map((x) => x / sumExp);
}

/**
 * Triton NER Model
 *
 * Uses NVIDIA Triton Inference Server for GPU-accelerated NER inference.
 * Tokenization happens locally, only tensor inference is offloaded to Triton.
 *
 * @example
 * ```typescript
 * const model = new TritonNERModel({
 *   tritonUrl: 'localhost:8001',
 *   mode: 'quantized',
 * });
 *
 * await model.load();
 *
 * const result = await model.predict('Contact John Smith at john@example.com');
 * console.log(result.spans);
 *
 * await model.dispose();
 * ```
 */
export class TritonNERModel implements INERModel {
  private client: TritonClient | null = null;
  private tokenizer: WordPieceTokenizer | null = null;
  private config: Required<
    Omit<TritonNERModelConfig, "onDownloadProgress" | "onStatus">
  > & {
    onDownloadProgress?: DownloadProgressCallback;
    onStatus?: (status: string) => void;
  };
  private isLoaded = false;

  constructor(config: TritonNERModelConfig) {
    this.config = {
      tritonUrl: config.tritonUrl,
      tritonModelName: config.tritonModelName ?? "ner_model",
      tritonModelVersion: config.tritonModelVersion ?? "",
      mode: config.mode ?? "quantized",
      vocabPath: config.vocabPath ?? "",
      labelMap: config.labelMap ?? DEFAULT_LABEL_MAP,
      maxLength: config.maxLength ?? 512,
      doLowerCase: config.doLowerCase ?? false,
      modelVersion: config.modelVersion ?? "triton-1.0.0",
      autoDownload: config.autoDownload ?? true,
      timeout: config.timeout ?? 30000,
      onDownloadProgress: config.onDownloadProgress,
      onStatus: config.onStatus,
    };
  }

  /**
   * Loads the tokenizer and connects to Triton
   */
  async load(): Promise<void> {
    if (this.isLoaded) return;

    this.config.onStatus?.("Connecting to Triton server...");

    // Create Triton client
    const clientConfig: TritonClientConfig = {
      url: this.config.tritonUrl,
      modelName: this.config.tritonModelName,
      modelVersion: this.config.tritonModelVersion,
      timeout: this.config.timeout,
    };

    this.client = new TritonClient(clientConfig);
    await this.client.connect();

    // Check if server is live
    const serverLive = await this.client.isServerLive();
    if (!serverLive) {
      throw new Error(
        `Triton server at ${this.config.tritonUrl} is not responding`
      );
    }

    // Check if model is ready
    const modelReady = await this.client.isModelReady();
    if (!modelReady) {
      throw new Error(
        `Model '${this.config.tritonModelName}' is not ready on Triton server`
      );
    }

    this.config.onStatus?.("Triton server connected, loading tokenizer...");

    // Load tokenizer vocabulary
    let vocabPath = this.config.vocabPath;

    if (this.config.mode !== "custom" && this.config.mode !== "disabled") {
      // Use model manager to get/download vocab
      const mode = this.config.mode as "standard" | "quantized";
      const { vocabPath: downloadedVocabPath, labelMapPath } = await ensureModel(
        mode,
        {
          autoDownload: this.config.autoDownload,
          onProgress: this.config.onDownloadProgress,
          onStatus: this.config.onStatus,
        }
      );
      vocabPath = downloadedVocabPath;

      // Load label map
      try {
        const storage = await getStorageProvider();
        const labelMapContent = await storage.readTextFile(labelMapPath);
        this.config.labelMap = JSON.parse(labelMapContent) as string[];
      } catch {
        // Use default label map from registry
        this.config.labelMap = MODEL_REGISTRY[mode].labelMap;
      }
    }

    if (!vocabPath) {
      throw new Error("No vocabulary path specified for Triton NER model");
    }

    const vocab = await loadVocabFromFile(vocabPath);
    this.tokenizer = new WordPieceTokenizer(vocab, {
      maxLength: this.config.maxLength,
      doLowerCase: this.config.doLowerCase,
    });

    this.config.onStatus?.("Triton NER model ready!");
    this.isLoaded = true;
  }

  /**
   * Predicts entities in text using Triton server
   */
  async predict(
    text: string,
    policy?: AnonymizationPolicy
  ): Promise<NERPrediction> {
    const startTime = performance.now();

    if (!this.isLoaded || this.client === null || this.tokenizer === null) {
      throw new Error("Model not loaded. Call load() first.");
    }

    // Tokenize input locally
    const tokenization = this.tokenizer.tokenize(text);

    // Run inference on Triton
    const { labels, confidences } = await this.runTritonInference(tokenization);

    // Decode BIO tags to entities
    const rawEntities = decodeBIOTags(
      tokenization.tokens,
      labels,
      confidences,
      text
    );

    // Convert to SpanMatch format with confidence filtering
    const minConfidence = this.getMinConfidence(policy);
    let spans = convertToSpanMatches(rawEntities, minConfidence);

    // Post-process spans
    spans = cleanupSpanBoundaries(spans, text);
    spans = mergeAdjacentSpans(spans, text);

    // Filter by enabled types in policy
    if (policy !== undefined) {
      spans = spans.filter(
        (span) =>
          policy.enabledTypes.has(span.type) &&
          policy.nerEnabledTypes.has(span.type)
      );
    }

    const endTime = performance.now();

    return {
      spans,
      processingTimeMs: endTime - startTime,
      modelVersion: this.config.modelVersion,
    };
  }

  /**
   * Runs inference on Triton server
   */
  private async runTritonInference(
    tokenization: TokenizationResult
  ): Promise<{ labels: string[]; confidences: number[] }> {
    if (this.client === null) {
      throw new Error("Triton client not initialized");
    }

    const seqLength = tokenization.inputIds.length;

    // Convert to BigInt64Array for Triton
    const inputIds = BigInt64Array.from(tokenization.inputIds.map(BigInt));
    const attentionMask = BigInt64Array.from(
      tokenization.attentionMask.map(BigInt)
    );

    // Call Triton
    const result = await this.client.infer(inputIds, attentionMask, seqLength);

    // Process logits to get labels and confidences
    return this.processLogits(result.logits, seqLength);
  }

  /**
   * Processes model logits to extract labels and confidences
   */
  private processLogits(
    logits: Float32Array,
    seqLength: number
  ): { labels: string[]; confidences: number[] } {
    const numLabels = this.config.labelMap.length;

    const labels: string[] = [];
    const confidences: number[] = [];

    for (let i = 0; i < seqLength; i++) {
      // Get logits for this token
      const tokenLogits: number[] = [];
      for (let j = 0; j < numLabels; j++) {
        tokenLogits.push(logits[i * numLabels + j] ?? 0);
      }

      // Apply softmax
      const probs = softmax(tokenLogits);

      // Get argmax
      let maxIdx = 0;
      let maxProb = probs[0] ?? 0;
      for (let j = 1; j < probs.length; j++) {
        if ((probs[j] ?? 0) > maxProb) {
          maxProb = probs[j] ?? 0;
          maxIdx = j;
        }
      }

      labels.push(this.config.labelMap[maxIdx] ?? "O");
      confidences.push(maxProb);
    }

    return { labels, confidences };
  }

  /**
   * Gets minimum confidence threshold from policy
   */
  private getMinConfidence(policy?: AnonymizationPolicy): number {
    if (policy === undefined) return 0.5;

    let minThreshold = 1.0;
    for (const type of policy.nerEnabledTypes) {
      const threshold = policy.confidenceThresholds.get(type) ?? 0.5;
      if (threshold < minThreshold) {
        minThreshold = threshold;
      }
    }

    return minThreshold;
  }

  /**
   * Gets model version
   */
  get version(): string {
    return this.config.modelVersion;
  }

  /**
   * Checks if model is loaded
   */
  get loaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Disposes of model resources
   */
  async dispose(): Promise<void> {
    if (this.client !== null) {
      this.client.close();
      this.client = null;
    }
    this.tokenizer = null;
    this.isLoaded = false;
  }
}

/**
 * Creates a Triton NER model instance
 */
export function createTritonNERModel(
  config: TritonNERModelConfig
): TritonNERModel {
  return new TritonNERModel(config);
}

