import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { IpLookupService } from '../services/ip-lookup.js';
import { config } from '../config/env.js';
import { validateAndNormalizeIp } from '../utils/ip-validation.js';

/**
 * Timing-safe comparison of two strings.
 * Prevents timing side-channel attacks by ensuring the comparison
 * takes constant time regardless of where strings differ.
 */
function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');

  // If lengths differ, we still perform a constant-time comparison
  // against bufA itself to avoid leaking length information through timing.
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Admin routes (protected by API key)
 */
export async function adminRoutes(
  fastify: FastifyInstance,
  options: { ipLookupService: IpLookupService }
) {
  const { ipLookupService } = options;

  // Admin authentication hook
  fastify.addHook('preHandler', async (request, reply) => {
    const apiKey = request.headers['x-admin-key'];

    if (!apiKey || typeof apiKey !== 'string' || !timingSafeCompare(apiKey, config.adminApiKey)) {
      return reply.code(403).send({
        error: 'Forbidden',
        code: 'INVALID_ADMIN_KEY',
        message: 'Valid X-Admin-Key header required',
      });
    }
  });

  /**
   * GET /api/v1/cache/:ip - Get cache info for IP
   */
  fastify.get<{
    Params: { ip: string };
  }>('/cache/:ip', {
    schema: {
      description: 'Get cache information for an IP address',
      tags: ['admin'],
      security: [{ adminKey: [] }],
      params: {
        type: 'object',
        properties: {
          ip: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      try {
        const ip = validateAndNormalizeIp(request.params.ip);
        const record = await ipLookupService.getCached(ip);

        if (!record) {
          return reply.code(404).send({
            error: 'Not found in cache',
            exists: false,
          });
        }

        return reply.code(200).send({
          exists: true,
          ttl: record.metadata.ttlSeconds,
          record,
        });
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : 'Invalid IP',
        });
      }
    },
  });

  /**
   * DELETE /api/v1/cache/:ip - Clear cache for IP
   */
  fastify.delete<{
    Params: { ip: string };
  }>('/cache/:ip', {
    schema: {
      description: 'Clear cache for an IP address',
      tags: ['admin'],
      security: [{ adminKey: [] }],
      params: {
        type: 'object',
        properties: {
          ip: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      try {
        const ip = validateAndNormalizeIp(request.params.ip);
        await ipLookupService.clearCache(ip);
        return reply.code(204).send();
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : 'Invalid IP',
        });
      }
    },
  });

  /**
   * GET /api/v1/stats/cache - Get cache statistics
   */
  fastify.get('/stats/cache', {
    schema: {
      description: 'Get cache statistics',
      tags: ['admin'],
      security: [{ adminKey: [] }],
    },
    handler: async (_request, reply) => {
      const stats = await ipLookupService.getCacheStats();
      return reply.code(200).send(stats);
    },
  });

  /**
   * GET /api/v1/stats/database - Get database statistics
   */
  fastify.get('/stats/database', {
    schema: {
      description: 'Get database statistics',
      tags: ['admin'],
      security: [{ adminKey: [] }],
    },
    handler: async (_request, reply) => {
      const stats = await ipLookupService.getDatabaseStats();
      return reply.code(200).send(stats);
    },
  });

  /**
   * POST /api/v1/cleanup - Cleanup expired records
   */
  fastify.post('/cleanup', {
    schema: {
      description: 'Cleanup expired database records',
      tags: ['admin'],
      security: [{ adminKey: [] }],
    },
    handler: async (_request, reply) => {
      const deletedCount = await ipLookupService.cleanupExpired();
      return reply.code(200).send({
        message: 'Cleanup completed',
        deletedRecords: deletedCount,
      });
    },
  });

  // ── API Key Management ──────────────────────────────────────────────

  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  /**
   * POST /api/v1/admin/keys - Create a new API key
   *
   * Generates a cryptographically random key prefixed with "ipck_".
   * Returns the plaintext key exactly ONCE in the response.
   * The key is stored as a SHA-256 hash and cannot be retrieved later.
   */
  fastify.post<{
    Body: { name: string; rateLimit?: number };
  }>('/admin/keys', {
    schema: {
      description: 'Create a new API key. The plaintext key is returned only once.',
      tags: ['admin'],
      security: [{ adminKey: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            description: 'Human-readable label for the key',
            minLength: 1,
            maxLength: 255,
          },
          rateLimit: {
            type: 'number',
            description: 'Requests per minute (default: 100)',
            minimum: 1,
            maximum: 10000,
            default: 100,
          },
        },
      },
      response: {
        201: {
          description: 'API key created successfully',
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            key: { type: 'string', description: 'Plaintext key — save this, it will not be shown again' },
            prefix: { type: 'string' },
            rateLimit: { type: 'number' },
            createdAt: { type: 'string' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const { name, rateLimit = 100 } = request.body;

      // Generate a random key: ipck_ + 32 random hex bytes (69 chars total)
      const rawKey = `ipck_${crypto.randomBytes(32).toString('hex')}`;
      const prefix = rawKey.substring(0, 8);
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

      const apiKey = await prisma.apiKey.create({
        data: {
          name,
          keyHash,
          prefix,
          rateLimit,
        },
      });

      return reply.code(201).send({
        id: apiKey.id,
        name: apiKey.name,
        key: rawKey,
        prefix: apiKey.prefix,
        rateLimit: apiKey.rateLimit,
        createdAt: apiKey.createdAt.toISOString(),
      });
    },
  });

  /**
   * GET /api/v1/admin/keys - List all API keys
   *
   * Returns metadata and usage stats. Never exposes the full key or hash.
   */
  fastify.get('/admin/keys', {
    schema: {
      description: 'List all API keys with usage statistics',
      tags: ['admin'],
      security: [{ adminKey: [] }],
      response: {
        200: {
          description: 'List of API keys',
          type: 'object',
          properties: {
            keys: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  prefix: { type: 'string' },
                  rateLimit: { type: 'number' },
                  enabled: { type: 'boolean' },
                  lastUsedAt: { type: ['string', 'null'] },
                  requestCount: { type: 'number' },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                },
              },
            },
            total: { type: 'number' },
          },
        },
      },
    },
    handler: async (_request, reply) => {
      const keys = await prisma.apiKey.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          prefix: true,
          rateLimit: true,
          enabled: true,
          lastUsedAt: true,
          requestCount: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return reply.code(200).send({
        keys: keys.map((k: { id: string; name: string; prefix: string; rateLimit: number; enabled: boolean; lastUsedAt: Date | null; requestCount: number; createdAt: Date; updatedAt: Date }) => ({
          ...k,
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          createdAt: k.createdAt.toISOString(),
          updatedAt: k.updatedAt.toISOString(),
        })),
        total: keys.length,
      });
    },
  });

  /**
   * DELETE /api/v1/admin/keys/:id - Revoke (delete) an API key
   */
  fastify.delete<{
    Params: { id: string };
  }>('/admin/keys/:id', {
    schema: {
      description: 'Revoke an API key by its ID',
      tags: ['admin'],
      security: [{ adminKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      response: {
        200: {
          description: 'API key revoked',
          type: 'object',
          properties: {
            message: { type: 'string' },
            id: { type: 'string' },
          },
        },
        404: {
          description: 'API key not found',
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params;

      try {
        await prisma.apiKey.delete({
          where: { id },
        });

        return reply.code(200).send({
          message: 'API key revoked successfully',
          id,
        });
      } catch (error) {
        // Prisma throws P2025 when the record does not exist
        if (
          error instanceof Error &&
          'code' in error &&
          (error as { code: string }).code === 'P2025'
        ) {
          return reply.code(404).send({
            error: 'API key not found',
            code: 'KEY_NOT_FOUND',
          });
        }
        throw error;
      }
    },
  });
}
