import type {
  ProviderConfig,
  ProviderResult,
  CircuitBreakerStatus,
} from '@ipintel/shared';

/**
 * Base provider interface that all IP lookup providers must implement
 */
export interface Provider {
  readonly config: ProviderConfig;

  /**
   * Check if provider is enabled
   */
  isEnabled(): boolean;

  /**
   * Perform IP lookup
   * @param ip - Validated and normalized IP address
   * @param signal - AbortSignal for request cancellation
   */
  lookup(ip: string, signal: AbortSignal): Promise<ProviderResult>;

  /**
   * Get current circuit breaker status
   */
  getHealthStatus(): CircuitBreakerStatus;

  /**
   * Reset circuit breaker (for testing/admin purposes)
   */
  resetCircuitBreaker(): void;
}

/**
 * Circuit breaker state
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  resetTimeoutMs: number; // Time to wait before trying again
  halfOpenAttempts: number; // Number of test requests in half-open state
}
