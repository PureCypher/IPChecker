import type { FastifyInstance } from 'fastify';
import { metrics } from '../utils/metrics.js';

/**
 * Prometheus metrics endpoint
 */
export async function metricsRoutes(fastify: FastifyInstance) {
  /**
   * GET /metrics — Prometheus text exposition format
   * This endpoint does NOT require authentication.
   */
  fastify.get('/metrics', {
    schema: {
      description: 'Prometheus metrics endpoint',
      tags: ['health'],
      response: {
        200: {
          description: 'Prometheus text format metrics',
          type: 'string',
        },
      },
    },
    handler: async (_request, reply) => {
      const body = metrics.serialize();
      return reply
        .code(200)
        .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
        .send(body);
    },
  });
}
