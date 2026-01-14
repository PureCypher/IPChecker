import type { FastifyInstance } from 'fastify';
import type { IpLookupService } from '../services/ip-lookup.js';
import { LookupRequestSchema, ValidationErrorCode, BulkLookupRequest } from '@ipintel/shared';
import { isValidationError, validateAndNormalizeIp } from '../utils/ip-validation.js';
import { generateRequestId } from '../utils/helpers.js';

interface LookupBody {
  ip: string;
  forceRefresh?: boolean;
  includeLLMAnalysis?: boolean;
}

/**
 * IP Lookup routes
 */
export async function lookupRoutes(
  fastify: FastifyInstance,
  options: { ipLookupService: IpLookupService }
) {
  const { ipLookupService } = options;

  /**
   * POST /api/v1/lookup - Lookup IP address
   */
  fastify.post<{
    Body: LookupBody;
  }>('/lookup', {
    schema: {
      description: 'Lookup IP address information with optional AI analysis',
      tags: ['lookup'],
      body: {
        type: 'object',
        required: ['ip'],
        properties: {
          ip: {
            type: 'string',
            description: 'IPv4 or IPv6 address',
            examples: ['8.8.8.8', '2001:4860:4860::8888'],
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
          type: 'object',
          additionalProperties: true,
        },
        400: {
          description: 'Invalid IP address',
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'object' },
            suggestion: { type: 'string' },
            timestamp: { type: 'string' },
            requestId: { type: 'string' },
          },
        },
        503: {
          description: 'All providers failed',
          type: 'object',
        },
      },
    },
    handler: async (request, reply) => {
      const requestId = generateRequestId();
      const { ip, forceRefresh = false, includeLLMAnalysis = true } = request.body;

      try {
        const result = await ipLookupService.lookup(ip, forceRefresh, includeLLMAnalysis);
        return reply.code(200).send(result);
      } catch (error) {
        if (isValidationError(error)) {
          return reply.code(400).send({
            error: error.message,
            code: error.code,
            details: { input: ip },
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
          type: 'object',
          properties: {
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
                processingTimeMs: { type: 'number' },
              },
            },
          },
        },
        400: {
          description: 'Invalid request',
          type: 'object',
        },
      },
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
   * GET /api/v1/lookup/:ip - Lookup IP address (idempotent alternative)
   */
  fastify.get<{
    Params: { ip: string };
    Querystring: { includeLLMAnalysis?: string; forceRefresh?: string };
  }>('/lookup/:ip', {
    schema: {
      description: 'Lookup IP address information (GET)',
      tags: ['lookup'],
      params: {
        type: 'object',
        properties: {
          ip: {
            type: 'string',
            description: 'IPv4 or IPv6 address',
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
      const { ip } = request.params;
      const includeLLMAnalysis = request.query.includeLLMAnalysis !== 'false';
      const forceRefresh = request.query.forceRefresh === 'true';

      try {
        const result = await ipLookupService.lookup(ip, forceRefresh, includeLLMAnalysis);
        return reply.code(200).send(result);
      } catch (error) {
        if (isValidationError(error)) {
          return reply.code(400).send({
            error: error.message,
            code: error.code,
            details: { input: ip },
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
      return 'Try a valid IPv4 (e.g., 8.8.8.8) or IPv6 address (e.g., 2001:4860:4860::8888)';
    case ValidationErrorCode.PRIVATE_IP:
      return 'Private IP addresses cannot be queried. Use a public IP address.';
    case ValidationErrorCode.RESERVED_IP:
      return 'Reserved IP addresses cannot be queried. Use a public IP address.';
    default:
      return 'Please provide a valid public IP address.';
  }
}
