/**
 * Validate IPv4 address
 */
export function isValidIPv4(ip: string): boolean {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(ip);
}

/**
 * Validate IPv6 address
 */
export function isValidIPv6(ip: string): boolean {
  // Full IPv6 regex pattern
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
  return ipv6Regex.test(ip);
}

/**
 * Validate IP address (IPv4 or IPv6)
 */
export function isValidIP(ip: string): boolean {
  return isValidIPv4(ip) || isValidIPv6(ip);
}

/**
 * Check if IP is private/reserved
 */
export function isPrivateIP(ip: string): boolean {
  if (!isValidIPv4(ip)) return false;

  const parts = ip.split('.').map(Number);

  // 10.0.0.0/8
  if (parts[0] === 10) return true;

  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] !== undefined && parts[1] >= 16 && parts[1] <= 31) return true;

  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] !== undefined && parts[1] === 168) return true;

  // 127.0.0.0/8 (localhost)
  if (parts[0] === 127) return true;

  // 169.254.0.0/16 (link-local)
  if (parts[0] === 169 && parts[1] !== undefined && parts[1] === 254) return true;

  return false;
}

/**
 * Normalize IP address (trim and lowercase)
 */
export function normalizeIP(ip: string): string {
  return ip.trim().toLowerCase();
}

/**
 * Get IP version
 */
export function getIPVersion(ip: string): 4 | 6 | null {
  if (isValidIPv4(ip)) return 4;
  if (isValidIPv6(ip)) return 6;
  return null;
}

/**
 * Validate and get error message
 */
export function validateIPWithMessage(ip: string): { valid: boolean; error?: string } {
  const normalized = normalizeIP(ip);

  if (!normalized) {
    return { valid: false, error: 'IP address is required' };
  }

  if (!isValidIP(normalized)) {
    return { valid: false, error: 'Invalid IP address format' };
  }

  if (isPrivateIP(normalized)) {
    return { valid: false, error: 'Private IP addresses cannot be looked up' };
  }

  return { valid: true };
}
