import type {
  ProviderConfig,
  ProviderResult,
  CircuitBreakerStatus,
} from '@ipintel/shared';
import type { Provider } from '../types/provider.js';
import { CircuitBreaker } from '../utils/circuit-breaker.js';
import { retry } from '../utils/helpers.js';
import { getEnvNumber } from '../utils/helpers.js';
import { captureException } from '../config/sentry.js';
import { metrics } from '../utils/metrics.js';

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

      metrics.incCounter('ipintel_provider_requests_total', {
        provider: this.config.name,
        status: 'success',
      });

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

      metrics.incCounter('ipintel_provider_requests_total', {
        provider: this.config.name,
        status: 'error',
      });

      // Report provider failures to Sentry
      captureException(error, {
        provider: this.config.name,
        ip,
        latencyMs,
      });

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
   * Composes the per-request timeout with an optional caller signal (e.g. global timeout)
   * so that either timeout can cancel the in-flight request.
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);

    // Compose the per-request timeout signal with the caller's signal (if provided)
    // so both the per-request timeout AND the global timeout can cancel the request
    const callerSignal = options.signal as AbortSignal | undefined;
    const composedSignal = callerSignal
      ? AbortSignal.any([timeoutController.signal, callerSignal])
      : timeoutController.signal;

    try {
      const response = await fetch(url, {
        ...options,
        signal: composedSignal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}
