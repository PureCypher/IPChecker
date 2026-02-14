import { Address4, Address6 } from 'ip-address';

/**
 * Maximum number of IPs allowed from a CIDR expansion.
 * /24 = 256 IPs for IPv4.
 */
const MAX_CIDR_IPS = 256;

/**
 * Minimum allowed prefix length for IPv4 CIDR (i.e. /24 or narrower).
 */
const MIN_IPV4_PREFIX = 24;

/**
 * Minimum allowed prefix length for IPv6 CIDR (i.e. /120 or narrower, ~256 IPs).
 */
const MIN_IPV6_PREFIX = 120;

export interface CidrExpansionResult {
  ips: string[];
  network: string;
  prefixLength: number;
  totalIps: number;
}

/**
 * Validates a CIDR notation string.
 * Returns parsed information or throws an error with a descriptive message.
 */
export function validateCidr(cidr: string): { ip: string; prefixLength: number; isV6: boolean } {
  const trimmed = cidr.trim();

  if (!trimmed.includes('/')) {
    throw new Error(
      `Invalid CIDR notation: missing prefix length. Expected format like "192.168.1.0/24", got "${trimmed}"`
    );
  }

  const [ipPart, prefixPart] = trimmed.split('/');
  const prefixLength = parseInt(prefixPart!, 10);

  if (isNaN(prefixLength) || prefixLength < 0) {
    throw new Error(
      `Invalid CIDR prefix length: "${prefixPart}". Must be a non-negative integer.`
    );
  }

  // Try IPv4 first
  const isV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipPart!);

  if (isV4) {
    try {
      new Address4(ipPart!);
    } catch {
      throw new Error(`Invalid IPv4 address in CIDR: "${ipPart}"`);
    }

    if (prefixLength > 32) {
      throw new Error(
        `Invalid IPv4 CIDR prefix length: /${prefixLength}. Must be between 0 and 32.`
      );
    }

    if (prefixLength < MIN_IPV4_PREFIX) {
      throw new Error(
        `CIDR range too large: /${prefixLength} would expand to ${Math.pow(2, 32 - prefixLength)} IPs. ` +
        `Maximum allowed is /${MIN_IPV4_PREFIX} (${MAX_CIDR_IPS} IPs).`
      );
    }

    return { ip: ipPart!, prefixLength, isV6: false };
  }

  // Try IPv6
  try {
    new Address6(ipPart!);
  } catch {
    throw new Error(`Invalid IP address in CIDR: "${ipPart}"`);
  }

  if (prefixLength > 128) {
    throw new Error(
      `Invalid IPv6 CIDR prefix length: /${prefixLength}. Must be between 0 and 128.`
    );
  }

  if (prefixLength < MIN_IPV6_PREFIX) {
    throw new Error(
      `CIDR range too large: /${prefixLength} would expand to too many IPs. ` +
      `Maximum allowed for IPv6 is /${MIN_IPV6_PREFIX} (${MAX_CIDR_IPS} IPs).`
    );
  }

  return { ip: ipPart!, prefixLength, isV6: true };
}

/**
 * Expands an IPv4 CIDR notation to individual IP addresses.
 *
 * Only supports ranges up to /24 (256 IPs) to prevent abuse.
 * Uses the `ip-address` package for correct parsing.
 *
 * @param cidr - CIDR string, e.g. "192.168.1.0/24"
 * @returns Array of individual IP address strings
 * @throws Error if CIDR is invalid or range is too large
 */
export function expandCidr(cidr: string): CidrExpansionResult {
  const { ip, prefixLength, isV6 } = validateCidr(cidr);

  if (isV6) {
    return expandCidrV6(ip, prefixLength);
  }

  return expandCidrV4(ip, prefixLength);
}

/**
 * Expands an IPv4 CIDR to individual addresses.
 */
function expandCidrV4(ip: string, prefixLength: number): CidrExpansionResult {
  const addr = new Address4(`${ip}/${prefixLength}`);
  const startAddress = addr.startAddress();
  const startParts = startAddress.address.split('.').map(Number);

  // Calculate the number of host IPs
  const hostBits = 32 - prefixLength;
  const totalIps = Math.pow(2, hostBits);

  // Convert start IP to a 32-bit number
  const startNum =
    (startParts[0]! << 24) +
    (startParts[1]! << 16) +
    (startParts[2]! << 8) +
    startParts[3]!;

  const ips: string[] = [];

  for (let i = 0; i < totalIps; i++) {
    const num = (startNum + i) >>> 0; // unsigned right shift to handle overflow
    const a = (num >>> 24) & 0xff;
    const b = (num >>> 16) & 0xff;
    const c = (num >>> 8) & 0xff;
    const d = num & 0xff;
    ips.push(`${a}.${b}.${c}.${d}`);
  }

  return {
    ips,
    network: `${startAddress.address}/${prefixLength}`,
    prefixLength,
    totalIps,
  };
}

/**
 * Expands an IPv6 CIDR to individual addresses.
 * Only supports /120 or narrower (max 256 IPs).
 */
function expandCidrV6(ip: string, prefixLength: number): CidrExpansionResult {
  const addr = new Address6(`${ip}/${prefixLength}`);
  const startAddress = addr.startAddress();

  const hostBits = 128 - prefixLength;
  const totalIps = Math.pow(2, hostBits);

  // For small ranges, we can work with the last groups of the address
  const startBigInt = addressToBigInt(startAddress.address);

  const ips: string[] = [];
  for (let i = 0; i < totalIps; i++) {
    const currentBigInt = startBigInt + BigInt(i);
    ips.push(bigIntToAddress6(currentBigInt));
  }

  return {
    ips,
    network: `${startAddress.correctForm()}/${prefixLength}`,
    prefixLength,
    totalIps,
  };
}

/**
 * Converts a full IPv6 address string to a BigInt.
 */
function addressToBigInt(address: string): bigint {
  const addr = new Address6(address);
  // Get the full 32-char hex representation
  const hex = addr.parsedAddress.map(g => g).join('');
  return BigInt(`0x${hex}`);
}

/**
 * Converts a BigInt back to a correctly formatted IPv6 address string.
 */
function bigIntToAddress6(num: bigint): string {
  const hex = num.toString(16).padStart(32, '0');
  const groups: string[] = [];
  for (let i = 0; i < 32; i += 4) {
    groups.push(hex.slice(i, i + 4));
  }
  const fullAddr = groups.join(':');
  const addr = new Address6(fullAddr);
  return addr.correctForm();
}
