import { Address4, Address6 } from 'ip-address';
import { ValidationErrorCode, type ValidationError } from '@ipintel/shared';

/**
 * Validates and normalizes an IP address
 * Returns normalized IP string or throws ValidationError
 */
export function validateAndNormalizeIp(input: string): string {
  // Trim whitespace
  const trimmed = input.trim();

  if (!trimmed) {
    throw createValidationError(
      ValidationErrorCode.INVALID_FORMAT,
      'IP address cannot be empty'
    );
  }

  // Try IPv4 first
  if (isLikelyIPv4(trimmed)) {
    return validateIPv4(trimmed);
  }

  // Try IPv6
  return validateIPv6(trimmed);
}

/**
 * Quick check if string looks like IPv4
 */
function isLikelyIPv4(input: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(input);
}

/**
 * Validates and normalizes IPv4 address
 */
function validateIPv4(input: string): string {
  let addr: Address4;

  try {
    addr = new Address4(input);
  } catch {
    throw createValidationError(
      ValidationErrorCode.INVALID_FORMAT,
      `Invalid IPv4 address format: ${input}`
    );
  }

  const ip = addr.address;

  // Check for private ranges
  if (isPrivateIPv4(ip)) {
    throw createValidationError(
      ValidationErrorCode.PRIVATE_IP,
      `Private IP addresses cannot be queried: ${ip}`
    );
  }

  // Check for reserved ranges
  if (isReservedIPv4(ip)) {
    throw createValidationError(
      ValidationErrorCode.RESERVED_IP,
      `Reserved IP addresses cannot be queried: ${ip}`
    );
  }

  return ip;
}

/**
 * Validates and normalizes IPv6 address
 */
function validateIPv6(input: string): string {
  let addr: Address6;

  try {
    addr = new Address6(input);
  } catch {
    throw createValidationError(
      ValidationErrorCode.INVALID_FORMAT,
      `Invalid IPv6 address format: ${input}`
    );
  }

  // Check if it's an IPv4-mapped IPv6 address
  if (addr.is4()) {
    const ipv4 = addr.to4().address;
    // Validate the IPv4 part
    return validateIPv4(ipv4);
  }

  const ip = addr.correctForm();

  // Check for link-local
  if (isLinkLocalIPv6(ip)) {
    throw createValidationError(
      ValidationErrorCode.RESERVED_IP,
      `Link-local IPv6 addresses cannot be queried: ${ip}`
    );
  }

  // Check for loopback
  if (ip === '::1' || ip.startsWith('::1')) {
    throw createValidationError(
      ValidationErrorCode.RESERVED_IP,
      `Loopback IPv6 addresses cannot be queried: ${ip}`
    );
  }

  // Check for unique local addresses (fc00::/7)
  if (isUniqueLocalIPv6(ip)) {
    throw createValidationError(
      ValidationErrorCode.PRIVATE_IP,
      `Unique local IPv6 addresses cannot be queried: ${ip}`
    );
  }

  return ip;
}

/**
 * Check if IPv4 is in private ranges
 * - 10.0.0.0/8
 * - 172.16.0.0/12
 * - 192.168.0.0/16
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  const [a, b] = parts;

  // 10.0.0.0/8
  if (a === 10) return true;

  // 172.16.0.0/12
  if (a === 172 && b! >= 16 && b! <= 31) return true;

  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;

  return false;
}

/**
 * Check if IPv4 is in reserved ranges
 * - 127.0.0.0/8 (loopback)
 * - 169.254.0.0/16 (link-local)
 * - 224.0.0.0/4 (multicast)
 * - 0.0.0.0/8 (this network)
 * - 255.255.255.255/32 (broadcast)
 */
function isReservedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  const [a, b] = parts;

  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;

  // 224.0.0.0/4 (multicast)
  if (a! >= 224 && a! <= 239) return true;

  // 0.0.0.0/8 (this network)
  if (a === 0) return true;

  // 255.255.255.255 (broadcast)
  if (ip === '255.255.255.255') return true;

  return false;
}

/**
 * Check if IPv6 is link-local (fe80::/10)
 */
function isLinkLocalIPv6(ip: string): boolean {
  return ip.toLowerCase().startsWith('fe80:');
}

/**
 * Check if IPv6 is unique local (fc00::/7)
 */
function isUniqueLocalIPv6(ip: string): boolean {
  const first = ip.substring(0, 2).toLowerCase();
  return first === 'fc' || first === 'fd';
}

/**
 * Creates a validation error object
 */
function createValidationError(
  code: ValidationErrorCode,
  message: string
): ValidationError {
  return { code, message };
}

/**
 * Type guard to check if error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    Object.values(ValidationErrorCode).includes(
      (error as ValidationError).code
    )
  );
}
