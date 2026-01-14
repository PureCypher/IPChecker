import type {
  ProviderConfig,
  ProviderResult,
  CircuitBreakerStatus,
} from '@ipintel/shared';
import type { Provider } from '../types/provider.js';
import { CircuitBreaker } from '../utils/circuit-breaker.js';
import { retry } from '../utils/helpers.js';
import { getEnvNumber } from '../utils/helpers.js';

/**
 * Base provider class with circuit breaker and retry logic
 */
export abstract class BaseProvider implements Provider {
  protected circuitBreaker: CircuitBreaker;

  constructor(public readonly config: ProviderConfig) {
    this.circuitBreaker = new CircuitBreaker(config.name, {
      failureThreshold: getEnvNumber('CIRCUIT_BREAKER_FAILURE_THRESHOLD', 5),
      resetTimeoutMs: getEnvNumber('CIRCUIT_BREAKER_RESET_TIMEOUT_MS', 60000),
      halfOpenAttempts: getEnvNumber('CIRCUIT_BREAKER_HALF_OPEN_ATTEMPTS', 1),
    });
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async lookup(ip: string, signal: AbortSignal): Promise<ProviderResult> {
    if (!this.isEnabled()) {
      return {
        provider: this.config.name,
        success: false,
        latencyMs: 0,
        error: 'Provider is disabled',
      };
    }

    const startTime = Date.now();

    try {
      // Execute with circuit breaker protection
      const result = await this.circuitBreaker.execute(async () => {
        // Retry logic with exponential backoff
        return await retry(
          () => this.performLookup(ip, signal),
          {
            retries: this.config.retries,
            delayMs: this.config.retryDelayMs,
            signal,
          }
        );
      });

      const latencyMs = Date.now() - startTime;

      return {
        ...result,
        provider: this.config.name,
        success: true,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        provider: this.config.name,
        success: false,
        latencyMs,
        error: errorMessage,
      };
    }
  }

  getHealthStatus(): CircuitBreakerStatus {
    const status = this.circuitBreaker.getStatus();
    return {
      healthy: status.healthy,
      failures: status.failures,
      nextRetryAt: status.nextRetryAt,
    };
  }

  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Perform the actual IP lookup (to be implemented by subclasses)
   * @param ip - Validated and normalized IP address
   * @param signal - AbortSignal for request cancellation
   */
  protected abstract performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>>;

  /**
   * Helper to make HTTP requests with timeout
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}
