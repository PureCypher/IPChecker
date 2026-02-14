import type { FastifyInstance } from 'fastify';
import type { IpLookupService } from '../services/ip-lookup.js';
import { config } from '../config/env.js';
import {
  SystemHealthJsonSchema,
  ProviderHealthArrayJsonSchema,
} from '../utils/schema-converter.js';

/**
 * Health check routes
 */
export async function healthRoutes(
  fastify: FastifyInstance,
  options: { ipLookupService: IpLookupService; startTime: number }
) {
  const { ipLookupService, startTime } = options;

  /**
   * GET /api/health - System health check
   */
  fastify.get('/health', {
    schema: {
      description: 'Get system health status',
      tags: ['health'],
      response: {
        200: {
          description: 'System health status',
          ...SystemHealthJsonSchema,
        },
      },
    },
    handler: async (_request, reply) => {
      const systemHealth = await ipLookupService.getSystemHealth();

      // Determine overall status
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (
        systemHealth.redis.status === 'down' ||
        systemHealth.postgres.status === 'down'
      ) {
        status = 'unhealthy';
      } else if (systemHealth.providers.healthy === 0) {
        status = 'degraded';
      } else if (
        systemHealth.providers.healthy < systemHealth.providers.available
      ) {
        status = 'degraded';
      }

      return reply.code(200).send({
        status,
        version: config.appVersion,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString(),
        services: systemHealth,
      });
    },
  });

  /**
   * GET /api/health/live - Kubernetes liveness probe
   */
  fastify.get('/health/live', {
    schema: {
      description: 'Liveness probe (basic check)',
      tags: ['health'],
    },
    handler: async (_request, reply) => {
      return reply.code(200).send({ status: 'alive' });
    },
  });

  /**
   * GET /api/health/ready - Kubernetes readiness probe
   */
  fastify.get('/health/ready', {
    schema: {
      description: 'Readiness probe (check dependencies)',
      tags: ['health'],
    },
    handler: async (_request, reply) => {
      const systemHealth = await ipLookupService.getSystemHealth();

      // Ready if Redis and Postgres are up and at least one provider is healthy
      const isReady =
        systemHealth.redis.status === 'up' &&
        systemHealth.postgres.status === 'up' &&
        systemHealth.providers.healthy > 0;

      if (isReady) {
        return reply.code(200).send({ status: 'ready' });
      } else {
        return reply.code(503).send({ status: 'not ready', services: systemHealth });
      }
    },
  });

  /**
   * GET /api/v1/providers - Get provider health status
   */
  fastify.get('/v1/providers', {
    schema: {
      description: 'Get provider health status',
      tags: ['health'],
      response: {
        200: {
          description: 'Provider health status list',
          ...ProviderHealthArrayJsonSchema,
        },
      },
    },
    handler: async (_request, reply) => {
      const providersHealth = ipLookupService.getProvidersHealth();

      // Get stats for each provider
      const providersWithStats = await Promise.all(
        providersHealth.map(async (provider) => {
          const stats = await ipLookupService.getProviderStats(provider.name);
          return {
            ...provider,
            stats: {
              successRate: stats.successRate,
              avgLatencyMs: Math.round(stats.avgLatencyMs),
            },
          };
        })
      );

      return reply.code(200).send(providersWithStats);
    },
  });
}
