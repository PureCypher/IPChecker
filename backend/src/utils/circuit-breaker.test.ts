import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker } from './circuit-breaker.js';
import { CircuitBreakerState } from '../types/provider.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;
  const config = {
    failureThreshold: 3,
    resetTimeoutMs: 1000,
    halfOpenAttempts: 2,
  };

  beforeEach(() => {
    breaker = new CircuitBreaker('test-provider', config);
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      const status = breaker.getStatus();
      expect(status.state).toBe(CircuitBreakerState.CLOSED);
      expect(status.healthy).toBe(true);
      expect(status.failures).toBe(0);
    });

    it('should be healthy when closed', () => {
      expect(breaker.isHealthy()).toBe(true);
    });
  });

  describe('successful executions', () => {
    it('should execute function and return result', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should reset failure count on success', async () => {
      // Cause some failures (but not enough to open)
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {}
      }
      expect(breaker.getStatus().failures).toBe(2);

      // Success should reset
      await breaker.execute(async () => 'ok');
      expect(breaker.getStatus().failures).toBe(0);
    });
  });

  describe('failure handling', () => {
    it('should increment failure count on error', async () => {
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {}

      expect(breaker.getStatus().failures).toBe(1);
    });

    it('should open circuit after threshold failures', async () => {
      for (let i = 0; i < config.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {}
      }

      const status = breaker.getStatus();
      expect(status.state).toBe(CircuitBreakerState.OPEN);
      expect(status.healthy).toBe(false);
      expect(status.nextRetryAt).toBeDefined();
    });

    it('should reject requests when circuit is open', async () => {
      // Open the circuit
      for (let i = 0; i < config.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {}
      }

      // Further requests should be rejected immediately
      await expect(breaker.execute(async () => 'never called')).rejects.toThrow(
        'Circuit breaker OPEN for test-provider'
      );
    });
  });

  describe('half-open state', () => {
    it('should transition to half-open after reset timeout', async () => {
      // Open the circuit
      for (let i = 0; i < config.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {}
      }

      // Mock time passing
      vi.useFakeTimers();
      vi.advanceTimersByTime(config.resetTimeoutMs + 100);

      // Next call should work (transition to half-open)
      const result = await breaker.execute(async () => 'recovered');
      expect(result).toBe('recovered');

      vi.useRealTimers();
    });

    it('should close circuit after enough successes in half-open', async () => {
      // Open the circuit
      for (let i = 0; i < config.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {}
      }

      // Mock time passing
      vi.useFakeTimers();
      vi.advanceTimersByTime(config.resetTimeoutMs + 100);

      // Execute enough successful requests
      for (let i = 0; i < config.halfOpenAttempts; i++) {
        await breaker.execute(async () => 'ok');
      }

      const status = breaker.getStatus();
      expect(status.state).toBe(CircuitBreakerState.CLOSED);
      expect(status.healthy).toBe(true);

      vi.useRealTimers();
    });

    it('should reopen circuit on failure in half-open state', async () => {
      // Open the circuit
      for (let i = 0; i < config.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {}
      }

      // Mock time passing
      vi.useFakeTimers();
      vi.advanceTimersByTime(config.resetTimeoutMs + 100);

      // One success, then failure
      await breaker.execute(async () => 'ok');

      try {
        await breaker.execute(async () => {
          throw new Error('fail again');
        });
      } catch {}

      const status = breaker.getStatus();
      expect(status.state).toBe(CircuitBreakerState.OPEN);

      vi.useRealTimers();
    });
  });

  describe('reset', () => {
    it('should reset all state', async () => {
      // Open the circuit
      for (let i = 0; i < config.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {}
      }

      breaker.reset();

      const status = breaker.getStatus();
      expect(status.state).toBe(CircuitBreakerState.CLOSED);
      expect(status.healthy).toBe(true);
      expect(status.failures).toBe(0);
      expect(status.nextRetryAt).toBeUndefined();
    });

    it('should allow requests after reset', async () => {
      // Open the circuit
      for (let i = 0; i < config.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {}
      }

      breaker.reset();

      const result = await breaker.execute(async () => 'works');
      expect(result).toBe('works');
    });
  });
});
