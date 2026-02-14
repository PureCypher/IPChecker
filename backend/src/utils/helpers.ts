import { createHash, randomBytes } from 'crypto';

/**
 * Generates a unique request ID
 */
export function generateRequestId(): string {
  return `req_${randomBytes(16).toString('hex')}`;
}

/**
 * Generates a unique job ID
 */
export function generateJobId(): string {
  return `job_${randomBytes(16).toString('hex')}`;
}

/**
 * Creates SHA-256 hash of an object (for change detection)
 */
export function hashObject(obj: unknown): string {
  const str = JSON.stringify(obj, Object.keys(obj as object).sort());
  return createHash('sha256').update(str).digest('hex');
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    retries: number;
    delayMs: number;
    maxDelayMs?: number;
    signal?: AbortSignal;
  }
): Promise<T> {
  const { retries, delayMs, maxDelayMs = 10000, signal } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      throw new Error('Aborted');
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < retries) {
        // Exponential backoff with jitter
        const delay = Math.min(
          delayMs * Math.pow(2, attempt) + Math.random() * 1000,
          maxDelayMs
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Formats bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Formats milliseconds to human-readable duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Safely parse JSON with fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Calculate TTL in seconds from expiration date
 */
export function calculateTtl(expiresAt: Date): number {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.floor(diff / 1000));
}

/**
 * Check if a date is expired
 */
export function isExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

/**
 * Parse environment variable as number with default
 */
export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse environment variable as boolean with default
 */
export function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Alias for getEnvBoolean for consistency
 */
export function getEnvBool(key: string, defaultValue: boolean): boolean {
  return getEnvBoolean(key, defaultValue);
}

/**
 * Parse environment variable as string with default
 */
export function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}
