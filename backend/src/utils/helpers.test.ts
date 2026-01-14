import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateRequestId,
  generateJobId,
  hashObject,
  sleep,
  retry,
  formatBytes,
  formatDuration,
  safeJsonParse,
  calculateTtl,
  isExpired,
  getEnvNumber,
  getEnvBoolean,
  getEnvBool,
  getEnvString,
} from './helpers.js';

describe('helpers', () => {
  describe('generateRequestId', () => {
    it('should generate unique request IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      expect(id1).not.toBe(id2);
    });

    it('should start with req_ prefix', () => {
      const id = generateRequestId();
      expect(id).toMatch(/^req_[a-f0-9]{32}$/);
    });
  });

  describe('generateJobId', () => {
    it('should generate unique job IDs', () => {
      const id1 = generateJobId();
      const id2 = generateJobId();
      expect(id1).not.toBe(id2);
    });

    it('should start with job_ prefix', () => {
      const id = generateJobId();
      expect(id).toMatch(/^job_[a-f0-9]{32}$/);
    });
  });

  describe('hashObject', () => {
    it('should generate consistent hashes for same objects', () => {
      const obj = { a: 1, b: 2 };
      const hash1 = hashObject(obj);
      const hash2 = hashObject(obj);
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different objects', () => {
      const hash1 = hashObject({ a: 1 });
      const hash2 = hashObject({ a: 2 });
      expect(hash1).not.toBe(hash2);
    });

    it('should be insensitive to key order', () => {
      const hash1 = hashObject({ a: 1, b: 2 });
      const hash2 = hashObject({ b: 2, a: 1 });
      expect(hash1).toBe(hash2);
    });

    it('should generate SHA-256 hex strings', () => {
      const hash = hashObject({ test: true });
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('sleep', () => {
    it('should delay for specified milliseconds', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });

  describe('retry', () => {
    it('should return result on first successful attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retry(fn, { retries: 3, delayMs: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const result = await retry(fn, { retries: 3, delayMs: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after all retries exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));

      await expect(retry(fn, { retries: 2, delayMs: 10 })).rejects.toThrow('always fails');
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should abort when signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const fn = vi.fn().mockResolvedValue('success');

      await expect(
        retry(fn, { retries: 3, delayMs: 10, signal: controller.signal })
      ).rejects.toThrow('Aborted');
    });
  });

  describe('formatBytes', () => {
    it('should format 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('should format bytes', () => {
      expect(formatBytes(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
    });

    it('should format gigabytes', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(30000)).toBe('30.0s');
    });

    it('should format minutes', () => {
      expect(formatDuration(90000)).toBe('1.5m');
    });

    it('should format hours', () => {
      expect(formatDuration(5400000)).toBe('1.5h');
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
    });

    it('should return fallback for invalid JSON', () => {
      expect(safeJsonParse('invalid', { default: true })).toEqual({ default: true });
    });

    it('should return fallback for empty string', () => {
      expect(safeJsonParse('', [])).toEqual([]);
    });
  });

  describe('calculateTtl', () => {
    it('should calculate TTL correctly', () => {
      const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
      const ttl = calculateTtl(futureDate);
      expect(ttl).toBeGreaterThan(3595);
      expect(ttl).toBeLessThanOrEqual(3600);
    });

    it('should return 0 for past dates', () => {
      const pastDate = new Date(Date.now() - 1000);
      expect(calculateTtl(pastDate)).toBe(0);
    });
  });

  describe('isExpired', () => {
    it('should return true for past dates', () => {
      const pastDate = new Date(Date.now() - 1000);
      expect(isExpired(pastDate)).toBe(true);
    });

    it('should return false for future dates', () => {
      const futureDate = new Date(Date.now() + 10000);
      expect(isExpired(futureDate)).toBe(false);
    });
  });

  describe('environment variable helpers', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    describe('getEnvNumber', () => {
      it('should return parsed number from env', () => {
        process.env.TEST_NUM = '42';
        expect(getEnvNumber('TEST_NUM', 0)).toBe(42);
      });

      it('should return default for missing env', () => {
        expect(getEnvNumber('MISSING_NUM', 99)).toBe(99);
      });

      it('should return default for non-numeric value', () => {
        process.env.TEST_NUM = 'not-a-number';
        expect(getEnvNumber('TEST_NUM', 100)).toBe(100);
      });
    });

    describe('getEnvBoolean', () => {
      it('should return true for "true"', () => {
        process.env.TEST_BOOL = 'true';
        expect(getEnvBoolean('TEST_BOOL', false)).toBe(true);
      });

      it('should return true for "1"', () => {
        process.env.TEST_BOOL = '1';
        expect(getEnvBoolean('TEST_BOOL', false)).toBe(true);
      });

      it('should return false for other values', () => {
        process.env.TEST_BOOL = 'false';
        expect(getEnvBoolean('TEST_BOOL', true)).toBe(false);
      });

      it('should return default for missing env', () => {
        expect(getEnvBoolean('MISSING_BOOL', true)).toBe(true);
      });
    });

    describe('getEnvBool', () => {
      it('should be an alias for getEnvBoolean', () => {
        process.env.TEST_BOOL = 'true';
        expect(getEnvBool('TEST_BOOL', false)).toBe(getEnvBoolean('TEST_BOOL', false));
      });
    });

    describe('getEnvString', () => {
      it('should return env value', () => {
        process.env.TEST_STR = 'hello';
        expect(getEnvString('TEST_STR', 'default')).toBe('hello');
      });

      it('should return default for missing env', () => {
        expect(getEnvString('MISSING_STR', 'fallback')).toBe('fallback');
      });
    });
  });
});
