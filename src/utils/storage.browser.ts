/**
 * Storage Abstraction Layer - Browser-Only Version
 *
 * This module provides the same interface as storage.ts but only includes
 * the browser implementation. It's used by the browser entry point to avoid
 * bundler warnings about Node.js modules.
 *
 * DO NOT import storage-node.js here - that's the whole point!
 */

import { BrowserStorageProvider } from "./storage-browser.js";

/**
 * Storage provider interface
 * Implementations exist for Node.js (fs) and browser (IndexedDB/OPFS)
 */
export interface StorageProvider {
  /**
   * Reads a file as binary data
   */
  readFile(path: string): Promise<Uint8Array>;

  /**
   * Reads a file as text
   * @param encoding - Character encoding (default: 'utf-8', also supports 'latin1')
   */
  readTextFile(path: string, encoding?: string): Promise<string>;

  /**
   * Writes data to a file
   * Creates parent directories if they don't exist
   */
  writeFile(path: string, data: Uint8Array | string): Promise<void>;

  /**
   * Checks if a file or directory exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Creates a directory (and parent directories if needed)
   */
  mkdir(path: string): Promise<void>;

  /**
   * Removes a file or directory
   */
  rm(
    path: string,
    options?: { recursive?: boolean; force?: boolean }
  ): Promise<void>;

  /**
   * Gets the cache directory path for a given subdirectory
   * @param subdir - Subdirectory name (e.g., 'models', 'semantic-data')
   */
  getCacheDir(subdir: string): string;
}

// ============================================================================
// Runtime Detection
// ============================================================================

/**
 * Detects if running in Node.js environment
 */
export function isNode(): boolean {
  return (
    typeof process !== "undefined" &&
    process.versions !== undefined &&
    process.versions.node !== undefined
  );
}

/**
 * Detects if running in browser environment
 */
export function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.document !== "undefined"
  );
}

/**
 * Detects if running in a Web Worker
 */
export function isWebWorker(): boolean {
  return (
    typeof self !== "undefined" &&
    typeof (self as unknown as { WorkerGlobalScope?: unknown })
      .WorkerGlobalScope !== "undefined"
  );
}

// ============================================================================
// Storage Provider Singleton
// ============================================================================

let storageProviderInstance: StorageProvider | null = null;

/**
 * Gets the browser storage provider
 * Browser-only version - always returns BrowserStorageProvider
 */
export function getStorageProvider(): Promise<StorageProvider> {
  if (storageProviderInstance !== null) {
    return Promise.resolve(storageProviderInstance);
  }

  if (isNode()) {
    // In browser build, we shouldn't hit this path
    // But if we do (e.g., SSR), throw a clear error
    return Promise.reject(
      new Error(
        "Node.js environment detected but using browser-only storage module.\n" +
          "Import from 'rehydra' (not 'rehydra/browser') for Node.js support."
      )
    );
  }

  storageProviderInstance = new BrowserStorageProvider();
  return Promise.resolve(storageProviderInstance);
}

/**
 * Resets the storage provider (useful for testing)
 */
export function resetStorageProvider(): void {
  storageProviderInstance = null;
}

/**
 * Sets a custom storage provider (useful for testing)
 */
export function setStorageProvider(provider: StorageProvider): void {
  storageProviderInstance = provider;
}
