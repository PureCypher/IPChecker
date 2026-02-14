import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { IpLookupService } from '../services/ip-lookup.js';
import { promises as dns } from 'dns';
import { ValidationErrorCode, BulkLookupRequest } from '@ipintel/shared';
import { isValidationError, validateAndNormalizeIp } from '../utils/ip-validation.js';
import { generateRequestId } from '../utils/helpers.js';
import { apiKeyAuth } from '../middleware/api-key-auth.js';
import { expandCidr } from '../utils/cidr.js';
import {
  CorrelatedIpRecordJsonSchema,
  BulkLookupResponseJsonSchema,
  ErrorResponseJsonSchema,
} from '../utils/schema-converter.js';

// ═════════════════════════════════════════════════════
// Types
// ═════════════════════════════════════════════════════

interface LookupBody {
  ip: string;
  forceRefresh?: boolean;
  includeLLMAnalysis?: boolean;
}

interface CidrLookupBody {
  cidr: string;
  forceRefresh?: boolean;
  includeLLMAnalysis?: boolean;
}

interface DnsResolutionResult {
  resolvedIp: string;
  originalHostname: string | null;
}

// ═════════════════════════════════════════════════════
// DNS Resolution Helper
// ═════════════════════════════════════════════════════

/**
 * Basic regex patterns to detect if input looks like an IP address.
 * If it does NOT match either pattern, we attempt DNS resolution.
 */
const IPV4_PATTERN = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const IPV6_PATTERN = /^[0-9a-fA-F:]+$/;

/**
 * Checks whether the input looks like an IP address (v4 or v6).
 */
function looksLikeIp(input: string): boolean {
  const trimmed = input.trim();
  if (IPV4_PATTERN.test(trimmed)) return true;
  // IPv6 must contain at least one colon and only hex digits + colons
  if (trimmed.includes(':') && IPV6_PATTERN.test(trimmed)) return true;
  return false;
}

/**
 * Resolves the input to an IP address. If the input doesn't look like an IP,
 * attempts DNS resolution (A record lookup). Returns the resolved IP and
 * optionally the original hostname.
 */
async function resolveInputToIp(input: string): Promise<DnsResolutionResult> {
  const trimmed = input.trim();

  if (looksLikeIp(trimmed)) {
    return { resolvedIp: trimmed, originalHostname: null };
  }

  // Input doesn't look like an IP -- treat as hostname and resolve via DNS
  try {
    const addresses = await dns.resolve4(trimmed);
    if (addresses.length === 0) {
      throw new Error(`DNS resolution returned no addresses for hostname: ${trimmed}`);
    }
    return { resolvedIp: addresses[0]!, originalHostname: trimmed };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown DNS error';
    throw new DnsResolutionError(
      `Could not resolve hostname "${trimmed}" to an IP address: ${message}`,
      trimmed
    );
  }
}

/**
 * Custom error class for DNS resolution failures.
 */
class DnsResolutionError extends Error {
  public readonly hostname: string;
  public readonly code = 'DNS_RESOLUTION_FAILED';

  constructor(message: string, hostname: string) {
    super(message);
    this.name = 'DnsResolutionError';
    this.hostname = hostname;
  }
}

// ═════════════════════════════════════════════════════
// Per-IP Bulk Rate Limiter
// ═════════════════════════════════════════════════════

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limiter that tracks the number of IPs looked up
 * per requester (identified by request IP) within a sliding window.
 */
class BulkRateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private readonly maxIpsPerMinute: number;
  private readonly windowMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxIpsPerMinute = 500) {
    this.maxIpsPerMinute = maxIpsPerMinute;
    this.windowMs = 60_000; // 1 minute

    // Periodic cleanup of expired entries every 30 seconds
    this.cleanupTimer = setInterval(() => this.cleanup(), 30_000);
    // Allow the process to exit without waiting for this timer
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Check if the requester can process `ipCount` IPs.
   * Returns { allowed: true } or { allowed: false, retryAfterSeconds, currentCount, limit }.
   */
  check(
    requesterIp: string,
    ipCount: number
  ): { allowed: true } | { allowed: false; retryAfterSeconds: number; currentCount: number; limit: number } {
    const now = Date.now();
    const entry = this.store.get(requesterIp);

    // If no entry or expired, allow and reset
    if (!entry || now >= entry.resetAt) {
      if (ipCount > this.maxIpsPerMinute) {
        return {
          allowed: false,
          retryAfterSeconds: 60,
          currentCount: 0,
          limit: this.maxIpsPerMinute,
        };
      }
      this.store.set(requesterIp, {
        count: ipCount,
        resetAt: now + this.windowMs,
      });
      return { allowed: true };
    }

    // Check if adding this batch would exceed the limit
    if (entry.count + ipCount > this.maxIpsPerMinute) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      return {
        allowed: false,
        retryAfterSeconds,
        currentCount: entry.count,
        limit: this.maxIpsPerMinute,
      };
    }

    // Allowed -- increment
    entry.count += ipCount;
    return { allowed: true };
  }

  /**
   * Remove expired entries from the store.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Destroy the cleanup timer. Call on server shutdown.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

// ═════════════════════════════════════════════════════
// Routes
// ═════════════════════════════════════════════════════

/**
 * IP Lookup routes
 */
export async function lookupRoutes(
  fastify: FastifyInstance,
  options: { ipLookupService: IpLookupService }
) {
  const { ipLookupService } = options;

  // Initialize the per-IP bulk rate limiter
  const bulkRateLimiter = new BulkRateLimiter(
    parseInt(process.env.BULK_RATE_LIMIT_IPS_PER_MINUTE || '500', 10)
  );

  // Clean up rate limiter on server close
  fastify.addHook('onClose', () => {
    bulkRateLimiter.destroy();
  });

  // Apply API key authentication to all routes in this plugin scope
  fastify.addHook('preHandler', apiKeyAuth);

  /**
   * POST /api/v1/lookup - Lookup IP address or hostname
   */
  fastify.post<{
    Body: LookupBody;
  }>('/lookup', {
    schema: {
      description: 'Lookup IP address or hostname with optional AI analysis. Hostnames are automatically resolved via DNS.',
      tags: ['lookup'],
      body: {
        type: 'object',
        required: ['ip'],
        properties: {
          ip: {
            type: 'string',
            description: 'IPv4 address, IPv6 address, or hostname (will be resolved via DNS)',
            examples: ['8.8.8.8', '2001:4860:4860::8888', 'example.com'],
          },
          forceRefresh: {
            type: 'boolean',
            description: 'Force refresh from providers (bypass cache)',
            default: false,
          },
          includeLLMAnalysis: {
            type: 'boolean',
            description: 'Include AI-powered threat analysis',
            default: true,
          },
        },
      },
      response: {
        200: {
          description: 'IP information found',
          ...CorrelatedIpRecordJsonSchema,
        },
        400: {
          description: 'Invalid IP address or hostname',
          ...ErrorResponseJsonSchema,
        },
        503: {
          description: 'All providers failed',
          ...ErrorResponseJsonSchema,
        },
      },
    },
    handler: async (request, reply) => {
      const requestId = generateRequestId();
      const { ip: rawInput, forceRefresh = false, includeLLMAnalysis = true } = request.body;

      // Step 1: Resolve hostname to IP if needed
      let resolvedIp: string;
      let originalHostname: string | null = null;

      try {
        const resolved = await resolveInputToIp(rawInput);
        resolvedIp = resolved.resolvedIp;
        originalHostname = resolved.originalHostname;
      } catch (error) {
        if (error instanceof DnsResolutionError) {
          return reply.code(400).send({
            error: error.message,
            code: error.code,
            details: { input: rawInput, hostname: error.hostname },
            suggestion: 'Provide a valid hostname that resolves to a public IP address, or use an IP address directly.',
            timestamp: new Date().toISOString(),
            requestId,
          });
        }
        throw error;
      }

      // Step 2: Perform lookup
      try {
        const result = await ipLookupService.lookup(resolvedIp, forceRefresh, includeLLMAnalysis);

        // Include original hostname in the response if DNS resolution was used
        if (originalHostname) {
          return reply.code(200).send({
            ...result,
            resolvedFrom: {
              hostname: originalHostname,
              resolvedIp,
            },
          });
        }

        return reply.code(200).send(result);
      } catch (error) {
        if (isValidationError(error)) {
          return reply.code(400).send({
            error: error.message,
            code: error.code,
            details: { input: rawInput, ...(originalHostname ? { resolvedFrom: originalHostname } : {}) },
            suggestion: getSuggestion(error.code),
            timestamp: new Date().toISOString(),
            requestId,
          });
        }

        if (
          error instanceof Error &&
          error.message.includes('All providers failed')
        ) {
          return reply.code(503).send({
            error: error.message,
            code: 'PROVIDERS_UNAVAILABLE',
            timestamp: new Date().toISOString(),
            requestId,
          });
        }

        request.log.error({ error, requestId }, 'Lookup failed');
        return reply.code(500).send({
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
          timestamp: new Date().toISOString(),
          requestId,
        });
      }
    },
  });

  /**
   * POST /api/v1/lookup/bulk - Bulk lookup multiple IP addresses
   */
  fastify.post<{
    Body: BulkLookupRequest;
  }>('/lookup/bulk', {
    schema: {
      description: 'Lookup multiple IP addresses in bulk',
      tags: ['lookup'],
      body: {
        type: 'object',
        required: ['ips'],
        properties: {
          ips: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 100,
            description: 'Array of IPv4 or IPv6 addresses (max 100)',
          },
          forceRefresh: {
            type: 'boolean',
            description: 'Force refresh from providers',
            default: false,
          },
          includeLLMAnalysis: {
            type: 'boolean',
            description: 'Include AI analysis (slower, disabled by default for bulk)',
            default: false,
          },
        },
      },
      response: {
        200: {
          description: 'Bulk lookup results',
          ...BulkLookupResponseJsonSchema,
        },
        400: {
          description: 'Invalid request',
          ...ErrorResponseJsonSchema,
        },
        429: {
          description: 'Rate limit exceeded',
          ...ErrorResponseJsonSchema,
        },
      },
    },
    preHandler: async (request: FastifyRequest<{ Body: BulkLookupRequest }>, reply: FastifyReply) => {
      const requestId = generateRequestId();
      const body = request.body;

      if (!body?.ips || !Array.isArray(body.ips)) {
        return; // Let the main handler deal with validation
      }

      const requesterIp = request.ip;
      const rateLimitResult = bulkRateLimiter.check(requesterIp, body.ips.length);

      if (rateLimitResult.allowed === false) {
        reply.header('Retry-After', rateLimitResult.retryAfterSeconds.toString());
        return reply.code(429).send({
          error: `Rate limit exceeded. You have used ${rateLimitResult.currentCount} of ${rateLimitResult.limit} allowed IPs per minute. This batch of ${body.ips.length} IPs would exceed the limit.`,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: rateLimitResult.retryAfterSeconds,
          details: {
            currentUsage: rateLimitResult.currentCount,
            limit: rateLimitResult.limit,
            requested: body.ips.length,
          },
          timestamp: new Date().toISOString(),
          requestId,
        });
      }
    },
    handler: async (request, reply) => {
      const requestId = generateRequestId();
      const { ips, forceRefresh = false, includeLLMAnalysis = false } = request.body;

      if (!Array.isArray(ips) || ips.length === 0) {
        return reply.code(400).send({
          error: 'IPs array is required and must not be empty',
          code: 'INVALID_REQUEST',
          timestamp: new Date().toISOString(),
          requestId,
        });
      }

      if (ips.length > 100) {
        return reply.code(400).send({
          error: 'Maximum 100 IPs per request',
          code: 'TOO_MANY_IPS',
          timestamp: new Date().toISOString(),
          requestId,
        });
      }

      // Validate all IPs upfront to fail fast
      const validatedIps: string[] = [];
      const validationErrors: { ip: string; error: string }[] = [];

      for (const ip of ips) {
        try {
          const normalized = validateAndNormalizeIp(ip);
          validatedIps.push(normalized);
        } catch (error) {
          validationErrors.push({
            ip,
            error: error instanceof Error ? error.message : 'Invalid IP',
          });
        }
      }

      // If any IPs are invalid, return errors immediately
      if (validationErrors.length > 0) {
        return reply.code(400).send({
          error: `${validationErrors.length} invalid IP address(es)`,
          code: 'INVALID_IPS',
          details: {
            invalidIps: validationErrors,
            validCount: validatedIps.length,
            invalidCount: validationErrors.length,
          },
          timestamp: new Date().toISOString(),
          requestId,
        });
      }

      try {
        const result = await ipLookupService.bulkLookup(
          validatedIps,
          forceRefresh,
          includeLLMAnalysis
        );
        return reply.code(200).send(result);
      } catch (error) {
        request.log.error({ error, requestId }, 'Bulk lookup failed');
        return reply.code(500).send({
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
          timestamp: new Date().toISOString(),
          requestId,
        });
      }
    },
  });

  /**
   * POST /api/v1/lookup/cidr - Lookup all IPs in a CIDR range
   */
  fastify.post<{
    Body: CidrLookupBody;
  }>('/lookup/cidr', {
    schema: {
      description: 'Lookup all IP addresses in a CIDR range (max /24 for IPv4, /120 for IPv6)',
      tags: ['lookup'],
      body: {
        type: 'object',
        required: ['cidr'],
        properties: {
          cidr: {
            type: 'string',
            description: 'CIDR notation (e.g., "192.168.1.0/28"). Max /24 for IPv4.',
            examples: ['198.51.100.0/28', '203.0.113.0/29'],
          },
          forceRefresh: {
            type: 'boolean',
            description: 'Force refresh from providers',
            default: false,
          },
          includeLLMAnalysis: {
            type: 'boolean',
            description: 'Include AI analysis (slower, disabled by default for CIDR)',
            default: false,
          },
        },
      },
      response: {
        200: {
          description: 'CIDR lookup results',
          type: 'object',
          properties: {
            cidr: {
              type: 'object',
              properties: {
                input: { type: 'string' },
                network: { type: 'string' },
                prefixLength: { type: 'number' },
                totalIps: { type: 'number' },
              },
            },
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  ip: { type: 'string' },
                  success: { type: 'boolean' },
                  data: { type: 'object', additionalProperties: true },
                  error: { type: 'string' },
                },
                additionalProperties: true,
              },
            },
            summary: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                successful: { type: 'number' },
                failed: { type: 'number' },
                skipped: { type: 'number' },
                processingTimeMs: { type: 'number' },
              },
            },
          },
        },
        400: {
          description: 'Invalid CIDR notation',
          ...ErrorResponseJsonSchema,
        },
        429: {
          description: 'Rate limit exceeded',
          ...ErrorResponseJsonSchema,
        },
      },
    },
    preHandler: async (request: FastifyRequest<{ Body: CidrLookupBody }>, reply: FastifyReply) => {
      const requestId = generateRequestId();
      const body = request.body;

      if (!body?.cidr) {
        return; // Let the main handler deal with validation
      }

      // Pre-validate the CIDR to determine IP count for rate limiting
      let ipCount: number;
      try {
        const trimmed = body.cidr.trim();
        if (!trimmed.includes('/')) {
          return; // Let the main handler deal with CIDR validation errors
        }
        const prefixLength = parseInt(trimmed.split('/')[1]!, 10);
        if (isNaN(prefixLength)) {
          return; // Let the main handler deal with CIDR validation errors
        }
        const isV4 = /^\d{1,3}\./.test(trimmed);
        const hostBits = isV4 ? 32 - prefixLength : 128 - prefixLength;
        ipCount = Math.pow(2, hostBits);
      } catch {
        return; // Let the main handler deal with CIDR validation errors
      }

      const requesterIp = request.ip;
      const rateLimitResult = bulkRateLimiter.check(requesterIp, ipCount);

      if (rateLimitResult.allowed === false) {
        reply.header('Retry-After', rateLimitResult.retryAfterSeconds.toString());
        return reply.code(429).send({
          error: `Rate limit exceeded. You have used ${rateLimitResult.currentCount} of ${rateLimitResult.limit} allowed IPs per minute. This CIDR range would expand to ${ipCount} IPs, exceeding the limit.`,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: rateLimitResult.retryAfterSeconds,
          details: {
            currentUsage: rateLimitResult.currentCount,
            limit: rateLimitResult.limit,
            requested: ipCount,
          },
          timestamp: new Date().toISOString(),
          requestId,
        });
      }
    },
    handler: async (request, reply) => {
      const requestId = generateRequestId();
      const { cidr, forceRefresh = false, includeLLMAnalysis = false } = request.body;

      if (!cidr || typeof cidr !== 'string') {
        return reply.code(400).send({
          error: 'CIDR notation is required',
          code: 'INVALID_REQUEST',
          timestamp: new Date().toISOString(),
          requestId,
        });
      }

      // Step 1: Expand CIDR to individual IPs
      let expansion;
      try {
        expansion = expandCidr(cidr);
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : 'Invalid CIDR notation',
          code: 'INVALID_CIDR',
          details: { input: cidr },
          suggestion: 'Provide a valid CIDR notation (e.g., "192.168.1.0/28"). Maximum range is /24 (256 IPs).',
          timestamp: new Date().toISOString(),
          requestId,
        });
      }

      // Step 2: Validate all expanded IPs
      const validatedIps: string[] = [];
      const validationErrors: { ip: string; error: string }[] = [];

      for (const ip of expansion.ips) {
        try {
          const normalized = validateAndNormalizeIp(ip);
          validatedIps.push(normalized);
        } catch (error) {
          validationErrors.push({
            ip,
            error: error instanceof Error ? error.message : 'Invalid IP',
          });
        }
      }

      // For CIDR, we allow partial lookups (some IPs may be private/reserved)
      // Only fail if ALL IPs are invalid
      if (validatedIps.length === 0 && validationErrors.length > 0) {
        return reply.code(400).send({
          error: 'All IPs in the CIDR range are invalid (private or reserved)',
          code: 'INVALID_CIDR_RANGE',
          details: {
            cidr: expansion.network,
            totalIps: expansion.totalIps,
            sampleErrors: validationErrors.slice(0, 5),
          },
          timestamp: new Date().toISOString(),
          requestId,
        });
      }

      // Step 3: Perform bulk lookup on valid IPs
      try {
        const result = await ipLookupService.bulkLookup(
          validatedIps,
          forceRefresh,
          includeLLMAnalysis
        );

        // Add skipped (invalid) IPs to the results as errors
        const skippedResults = validationErrors.map((ve) => ({
          ip: ve.ip,
          success: false,
          error: ve.error,
        }));

        return reply.code(200).send({
          cidr: {
            input: cidr,
            network: expansion.network,
            prefixLength: expansion.prefixLength,
            totalIps: expansion.totalIps,
          },
          results: [...result.results, ...skippedResults],
          summary: {
            total: expansion.totalIps,
            successful: result.summary.successful,
            failed: result.summary.failed + validationErrors.length,
            skipped: validationErrors.length,
            processingTimeMs: result.summary.processingTimeMs,
          },
        });
      } catch (error) {
        request.log.error({ error, requestId }, 'CIDR lookup failed');
        return reply.code(500).send({
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
          timestamp: new Date().toISOString(),
          requestId,
        });
      }
    },
  });

  /**
   * GET /api/v1/lookup/:ip - Lookup IP address or hostname (idempotent alternative)
   */
  fastify.get<{
    Params: { ip: string };
    Querystring: { includeLLMAnalysis?: string; forceRefresh?: string };
  }>('/lookup/:ip', {
    schema: {
      description: 'Lookup IP address or hostname (GET). Hostnames are automatically resolved via DNS.',
      tags: ['lookup'],
      params: {
        type: 'object',
        properties: {
          ip: {
            type: 'string',
            description: 'IPv4 address, IPv6 address, or hostname',
          },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          includeLLMAnalysis: {
            type: 'string',
            description: 'Include AI analysis (true/false)',
            default: 'true',
          },
          forceRefresh: {
            type: 'string',
            description: 'Force refresh from providers (true/false)',
            default: 'false',
          },
        },
      },
    },
    handler: async (request, reply) => {
      const requestId = generateRequestId();
      const { ip: rawInput } = request.params;
      const includeLLMAnalysis = request.query.includeLLMAnalysis !== 'false';
      const forceRefresh = request.query.forceRefresh === 'true';

      // Step 1: Resolve hostname to IP if needed
      let resolvedIp: string;
      let originalHostname: string | null = null;

      try {
        const resolved = await resolveInputToIp(rawInput);
        resolvedIp = resolved.resolvedIp;
        originalHostname = resolved.originalHostname;
      } catch (error) {
        if (error instanceof DnsResolutionError) {
          return reply.code(400).send({
            error: error.message,
            code: error.code,
            details: { input: rawInput, hostname: error.hostname },
            suggestion: 'Provide a valid hostname that resolves to a public IP address, or use an IP address directly.',
            timestamp: new Date().toISOString(),
            requestId,
          });
        }
        throw error;
      }

      // Step 2: Perform lookup
      try {
        const result = await ipLookupService.lookup(resolvedIp, forceRefresh, includeLLMAnalysis);

        // Include original hostname in the response if DNS resolution was used
        if (originalHostname) {
          return reply.code(200).send({
            ...result,
            resolvedFrom: {
              hostname: originalHostname,
              resolvedIp,
            },
          });
        }

        return reply.code(200).send(result);
      } catch (error) {
        if (isValidationError(error)) {
          return reply.code(400).send({
            error: error.message,
            code: error.code,
            details: { input: rawInput, ...(originalHostname ? { resolvedFrom: originalHostname } : {}) },
            suggestion: getSuggestion(error.code),
            timestamp: new Date().toISOString(),
            requestId,
          });
        }

        if (
          error instanceof Error &&
          error.message.includes('All providers failed')
        ) {
          return reply.code(503).send({
            error: error.message,
            code: 'PROVIDERS_UNAVAILABLE',
            timestamp: new Date().toISOString(),
            requestId,
          });
        }

        request.log.error({ error, requestId }, 'Lookup failed');
        return reply.code(500).send({
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
          timestamp: new Date().toISOString(),
          requestId,
        });
      }
    },
  });
}

/**
 * Get suggestion message for validation error code
 */
function getSuggestion(code: ValidationErrorCode): string {
  switch (code) {
    case ValidationErrorCode.INVALID_FORMAT:
      return 'Try a valid IPv4 (e.g., 8.8.8.8) or IPv6 address (e.g., 2001:4860:4860::8888), or a hostname (e.g., example.com)';
    case ValidationErrorCode.PRIVATE_IP:
      return 'Private IP addresses cannot be queried. Use a public IP address.';
    case ValidationErrorCode.RESERVED_IP:
      return 'Reserved IP addresses cannot be queried. Use a public IP address.';
    default:
      return 'Please provide a valid public IP address or a resolvable hostname.';
  }
}
