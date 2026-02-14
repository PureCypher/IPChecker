import type { CircuitBreakerConfig } from '../types/provider.js';
import { CircuitBreakerState } from '../types/provider.js';

/**
 * Circuit Breaker implementation for provider resilience
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextRetryAt?: Date;

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig
  ) {}

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitBreakerState.OPEN) {
      // Check if it's time to try again
      if (this.nextRetryAt && new Date() >= this.nextRetryAt) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new Error(`Circuit breaker OPEN for ${this.name}`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;

      // If enough successes in half-open state, close the circuit
      if (this.successCount >= this.config.halfOpenAttempts) {
        this.state = CircuitBreakerState.CLOSED;
        this.nextRetryAt = undefined;
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;

    // If in half-open state, go back to open on any failure
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN;
      this.nextRetryAt = new Date(Date.now() + this.config.resetTimeoutMs);
      return;
    }

    // If failure threshold exceeded, open the circuit
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextRetryAt = new Date(Date.now() + this.config.resetTimeoutMs);
    }
  }

  /**
   * Get current status
   */
  getStatus(): {
    healthy: boolean;
    failures: number;
    nextRetryAt?: Date;
    state: CircuitBreakerState;
  } {
    return {
      healthy: this.state === CircuitBreakerState.CLOSED,
      failures: this.failureCount,
      nextRetryAt: this.nextRetryAt,
      state: this.state,
    };
  }

  /**
   * Reset the circuit breaker (for testing/admin purposes)
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextRetryAt = undefined;
  }

  /**
   * Check if circuit is healthy
   */
  isHealthy(): boolean {
    return this.state === CircuitBreakerState.CLOSED;
  }
}
