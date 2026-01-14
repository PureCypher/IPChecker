import type { FastifyInstance } from 'fastify';
import type { IpLookupService } from '../services/ip-lookup.js';
import { config } from '../config/env.js';
import { validateAndNormalizeIp } from '../utils/ip-validation.js';

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

    if (!apiKey || apiKey !== config.adminApiKey) {
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
    handler: async (request, reply) => {
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
    handler: async (request, reply) => {
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
    handler: async (request, reply) => {
      const deletedCount = await ipLookupService.cleanupExpired();
      return reply.code(200).send({
        message: 'Cleanup completed',
        deletedRecords: deletedCount,
      });
    },
  });
}
