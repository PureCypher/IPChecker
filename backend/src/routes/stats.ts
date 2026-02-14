import type { FastifyInstance } from 'fastify';
import type { IpLookupService } from '../services/ip-lookup.js';

/**
 * Public stats routes (no admin auth required)
 * These endpoints serve the dashboard with analytics data.
 */
export async function statsRoutes(
  fastify: FastifyInstance,
  options: { ipLookupService: IpLookupService }
) {
  const { ipLookupService } = options;

  /**
   * GET /api/v1/stats/activity - Lookup activity grouped by hour (last 24h)
   */
  fastify.get('/stats/activity', {
    schema: {
      description: 'Get lookup activity counts grouped by hour for the last 24 hours',
      tags: ['stats'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              hour: { type: 'string' },
              lookups: { type: 'number' },
              cached: { type: 'number' },
            },
          },
        },
      },
    },
    handler: async (_request, reply) => {
      const activity = await ipLookupService.getActivityStats();
      return reply.code(200).send(activity);
    },
  });

  /**
   * GET /api/v1/stats/threats - Threat level distribution
   */
  fastify.get('/stats/threats', {
    schema: {
      description: 'Get threat level distribution across all stored IP records',
      tags: ['stats'],
      response: {
        200: {
          type: 'object',
          properties: {
            high: { type: 'number' },
            medium: { type: 'number' },
            low: { type: 'number' },
            unknown: { type: 'number' },
          },
        },
      },
    },
    handler: async (_request, reply) => {
      const threats = await ipLookupService.getThreatDistribution();
      return reply.code(200).send(threats);
    },
  });

  /**
   * GET /api/v1/stats/providers - Provider success rates and latencies
   */
  fastify.get('/stats/providers', {
    schema: {
      description: 'Get provider success rates and average latencies',
      tags: ['stats'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              provider: { type: 'string' },
              successRate: { type: 'number' },
              avgLatencyMs: { type: 'number' },
              totalRequests: { type: 'number' },
              successCount: { type: 'number' },
              failureCount: { type: 'number' },
            },
          },
        },
      },
    },
    handler: async (_request, reply) => {
      const providerStats = await ipLookupService.getAllProviderStats();
      return reply.code(200).send(providerStats);
    },
  });
}
