import { describe, it, expect } from 'vitest';
import { validateAndNormalizeIp, isValidationError } from './ip-validation.js';
import { ValidationErrorCode } from '@ipintel/shared';

describe('ip-validation', () => {
  describe('validateAndNormalizeIp', () => {
    describe('valid IPv4 addresses', () => {
      it('should accept valid public IPv4 addresses', () => {
        expect(validateAndNormalizeIp('8.8.8.8')).toBe('8.8.8.8');
        expect(validateAndNormalizeIp('1.1.1.1')).toBe('1.1.1.1');
        expect(validateAndNormalizeIp('208.67.222.222')).toBe('208.67.222.222');
      });

      it('should trim whitespace from input', () => {
        expect(validateAndNormalizeIp('  8.8.8.8  ')).toBe('8.8.8.8');
        expect(validateAndNormalizeIp('\t1.1.1.1\n')).toBe('1.1.1.1');
      });
    });

    describe('invalid IPv4 addresses', () => {
      it('should reject empty input', () => {
        expect(() => validateAndNormalizeIp('')).toThrow();
        expect(() => validateAndNormalizeIp('   ')).toThrow();
      });

      it('should reject malformed IPv4 addresses', () => {
        expect(() => validateAndNormalizeIp('256.1.1.1')).toThrow();
        expect(() => validateAndNormalizeIp('1.2.3')).toThrow();
        expect(() => validateAndNormalizeIp('1.2.3.4.5')).toThrow();
        expect(() => validateAndNormalizeIp('abc.def.ghi.jkl')).toThrow();
      });
    });

    describe('private IPv4 addresses', () => {
      it('should reject 10.x.x.x private range', () => {
        const error = getValidationError(() => validateAndNormalizeIp('10.0.0.1'));
        expect(error?.code).toBe(ValidationErrorCode.PRIVATE_IP);
      });

      it('should reject 172.16.x.x - 172.31.x.x private range', () => {
        expect(() => validateAndNormalizeIp('172.16.0.1')).toThrow();
        expect(() => validateAndNormalizeIp('172.31.255.255')).toThrow();
        // 172.15.x.x and 172.32.x.x should be allowed
        expect(validateAndNormalizeIp('172.15.0.1')).toBe('172.15.0.1');
        expect(validateAndNormalizeIp('172.32.0.1')).toBe('172.32.0.1');
      });

      it('should reject 192.168.x.x private range', () => {
        const error = getValidationError(() => validateAndNormalizeIp('192.168.1.1'));
        expect(error?.code).toBe(ValidationErrorCode.PRIVATE_IP);
      });
    });

    describe('reserved IPv4 addresses', () => {
      it('should reject loopback addresses (127.x.x.x)', () => {
        const error = getValidationError(() => validateAndNormalizeIp('127.0.0.1'));
        expect(error?.code).toBe(ValidationErrorCode.RESERVED_IP);
      });

      it('should reject link-local addresses (169.254.x.x)', () => {
        const error = getValidationError(() => validateAndNormalizeIp('169.254.1.1'));
        expect(error?.code).toBe(ValidationErrorCode.RESERVED_IP);
      });

      it('should reject multicast addresses (224-239.x.x.x)', () => {
        expect(() => validateAndNormalizeIp('224.0.0.1')).toThrow();
        expect(() => validateAndNormalizeIp('239.255.255.255')).toThrow();
      });

      it('should reject 0.x.x.x range', () => {
        const error = getValidationError(() => validateAndNormalizeIp('0.0.0.0'));
        expect(error?.code).toBe(ValidationErrorCode.RESERVED_IP);
      });

      it('should reject broadcast address', () => {
        const error = getValidationError(() => validateAndNormalizeIp('255.255.255.255'));
        expect(error?.code).toBe(ValidationErrorCode.RESERVED_IP);
      });
    });

    describe('valid IPv6 addresses', () => {
      it('should accept valid public IPv6 addresses', () => {
        expect(validateAndNormalizeIp('2001:4860:4860::8888')).toBe('2001:4860:4860::8888');
        expect(validateAndNormalizeIp('2606:4700:4700::1111')).toBe('2606:4700:4700::1111');
      });

      it('should normalize IPv6 addresses to correct form', () => {
        // Full form should be normalized
        const result = validateAndNormalizeIp('2001:0db8:0000:0000:0000:0000:0000:0001');
        expect(result).toBe('2001:db8::1');
      });
    });

    describe('reserved IPv6 addresses', () => {
      it('should reject loopback address (::1)', () => {
        const error = getValidationError(() => validateAndNormalizeIp('::1'));
        expect(error?.code).toBe(ValidationErrorCode.RESERVED_IP);
      });

      it('should reject link-local addresses (fe80::/10)', () => {
        const error = getValidationError(() => validateAndNormalizeIp('fe80::1'));
        expect(error?.code).toBe(ValidationErrorCode.RESERVED_IP);
      });

      it('should reject unique local addresses (fc00::/7)', () => {
        const error1 = getValidationError(() => validateAndNormalizeIp('fc00::1'));
        expect(error1?.code).toBe(ValidationErrorCode.PRIVATE_IP);

        const error2 = getValidationError(() => validateAndNormalizeIp('fd00::1'));
        expect(error2?.code).toBe(ValidationErrorCode.PRIVATE_IP);
      });
    });

    describe('IPv4-mapped IPv6 addresses', () => {
      it('should validate the IPv4 part of IPv4-mapped IPv6 addresses', () => {
        // Public IPv4 mapped to IPv6 should work
        expect(validateAndNormalizeIp('::ffff:8.8.8.8')).toBe('8.8.8.8');
      });

      it('should reject private IPv4 mapped to IPv6', () => {
        expect(() => validateAndNormalizeIp('::ffff:192.168.1.1')).toThrow();
      });
    });
  });

  describe('isValidationError', () => {
    it('should return true for valid validation errors', () => {
      const error = { code: ValidationErrorCode.INVALID_FORMAT, message: 'test' };
      expect(isValidationError(error)).toBe(true);
    });

    it('should return false for non-validation errors', () => {
      expect(isValidationError(null)).toBe(false);
      expect(isValidationError(undefined)).toBe(false);
      expect(isValidationError({})).toBe(false);
      expect(isValidationError({ code: 'UNKNOWN', message: 'test' })).toBe(false);
      expect(isValidationError(new Error('test'))).toBe(false);
    });
  });
});

/**
 * Helper to capture validation errors
 */
function getValidationError(fn: () => unknown): { code: ValidationErrorCode; message: string } | null {
  try {
    fn();
    return null;
  } catch (error) {
    if (isValidationError(error)) {
      return error;
    }
    return null;
  }
}
