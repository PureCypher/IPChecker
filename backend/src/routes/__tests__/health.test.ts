import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { healthRoutes } from '../health.js';

/**
 * Creates a mock IpLookupService with configurable system health responses.
 */
function createMockIpLookupService(overrides: Record<string, unknown> = {}) {
  return {
    getSystemHealth: vi.fn().mockResolvedValue({
      redis: { status: 'up', latencyMs: 1 },
      postgres: { status: 'up', latencyMs: 2 },
      providers: { available: 3, healthy: 3 },
      llm: { status: 'up', model: 'test-model', latencyMs: 10 },
      ...overrides,
    }),
    getProvidersHealth: vi.fn().mockReturnValue([
      { name: 'provider-a', enabled: true, healthy: true, trustRank: 8 },
      { name: 'provider-b', enabled: true, healthy: true, trustRank: 6 },
    ]),
    getProviderStats: vi.fn().mockResolvedValue({
      successRate: 0.95,
      avgLatencyMs: 150,
      totalRequests: 1000,
    }),
  };
}

describe('health routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  // ─── GET /api/health/live ───────────────────────────

  describe('GET /api/health/live', () => {
    it('should return 200 with { status: "alive" }', async () => {
      const mockService = createMockIpLookupService();
      app = Fastify({ logger: false });
      await app.register(healthRoutes, {
        prefix: '/api',
        ipLookupService: mockService as any,
        startTime: Date.now(),
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/api/health/live',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'alive' });
    });

    it('should not call any external services', async () => {
      const mockService = createMockIpLookupService();
      app = Fastify({ logger: false });
      await app.register(healthRoutes, {
        prefix: '/api',
        ipLookupService: mockService as any,
        startTime: Date.now(),
      });
      await app.ready();

      await app.inject({ method: 'GET', url: '/api/health/live' });

      expect(mockService.getSystemHealth).not.toHaveBeenCalled();
    });
  });

  // ─── GET /api/health/ready ──────────────────────────

  describe('GET /api/health/ready', () => {
    it('should return 200 with { status: "ready" } when all services are up', async () => {
      const mockService = createMockIpLookupService();
      app = Fastify({ logger: false });
      await app.register(healthRoutes, {
        prefix: '/api',
        ipLookupService: mockService as any,
        startTime: Date.now(),
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/api/health/ready',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ready' });
    });

    it('should return 503 when Redis is down', async () => {
      const mockService = createMockIpLookupService();
      mockService.getSystemHealth.mockResolvedValue({
        redis: { status: 'down' },
        postgres: { status: 'up', latencyMs: 2 },
        providers: { available: 3, healthy: 3 },
        llm: { status: 'up', model: 'test-model', latencyMs: 10 },
      });

      app = Fastify({ logger: false });
      await app.register(healthRoutes, {
        prefix: '/api',
        ipLookupService: mockService as any,
        startTime: Date.now(),
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/api/health/ready',
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().status).toBe('not ready');
    });

    it('should return 503 when Postgres is down', async () => {
      const mockService = createMockIpLookupService();
      mockService.getSystemHealth.mockResolvedValue({
        redis: { status: 'up', latencyMs: 1 },
        postgres: { status: 'down' },
        providers: { available: 3, healthy: 3 },
        llm: { status: 'up', model: 'test-model', latencyMs: 10 },
      });

      app = Fastify({ logger: false });
      await app.register(healthRoutes, {
        prefix: '/api',
        ipLookupService: mockService as any,
        startTime: Date.now(),
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/api/health/ready',
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().status).toBe('not ready');
    });

    it('should return 503 when no providers are healthy', async () => {
      const mockService = createMockIpLookupService();
      mockService.getSystemHealth.mockResolvedValue({
        redis: { status: 'up', latencyMs: 1 },
        postgres: { status: 'up', latencyMs: 2 },
        providers: { available: 3, healthy: 0 },
        llm: { status: 'up', model: 'test-model', latencyMs: 10 },
      });

      app = Fastify({ logger: false });
      await app.register(healthRoutes, {
        prefix: '/api',
        ipLookupService: mockService as any,
        startTime: Date.now(),
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/api/health/ready',
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().status).toBe('not ready');
    });

    it('should include service details when not ready', async () => {
      const mockService = createMockIpLookupService();
      const unhealthyState = {
        redis: { status: 'down' },
        postgres: { status: 'up', latencyMs: 2 },
        providers: { available: 3, healthy: 1 },
        llm: { status: 'up', model: 'test-model', latencyMs: 10 },
      };
      mockService.getSystemHealth.mockResolvedValue(unhealthyState);

      app = Fastify({ logger: false });
      await app.register(healthRoutes, {
        prefix: '/api',
        ipLookupService: mockService as any,
        startTime: Date.now(),
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/api/health/ready',
      });

      const body = response.json();
      expect(body.services).toBeDefined();
      expect(body.services.redis.status).toBe('down');
    });
  });

  // ─── GET /api/health ────────────────────────────────

  describe('GET /api/health', () => {
    it('should return healthy status when all services are up', async () => {
      const mockService = createMockIpLookupService();
      app = Fastify({ logger: false });
      await app.register(healthRoutes, {
        prefix: '/api',
        ipLookupService: mockService as any,
        startTime: Date.now() - 60000,
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('healthy');
      expect(body.version).toBeDefined();
      expect(body.uptime).toBeGreaterThanOrEqual(59);
      expect(body.timestamp).toBeDefined();
      expect(body.services).toBeDefined();
    });

    it('should return unhealthy status when Redis is down', async () => {
      const mockService = createMockIpLookupService();
      mockService.getSystemHealth.mockResolvedValue({
        redis: { status: 'down' },
        postgres: { status: 'up', latencyMs: 2 },
        providers: { available: 3, healthy: 3 },
        llm: { status: 'up', model: 'test-model', latencyMs: 10 },
      });

      app = Fastify({ logger: false });
      await app.register(healthRoutes, {
        prefix: '/api',
        ipLookupService: mockService as any,
        startTime: Date.now(),
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.json().status).toBe('unhealthy');
    });

    it('should return degraded status when some providers are unhealthy', async () => {
      const mockService = createMockIpLookupService();
      mockService.getSystemHealth.mockResolvedValue({
        redis: { status: 'up', latencyMs: 1 },
        postgres: { status: 'up', latencyMs: 2 },
        providers: { available: 3, healthy: 1 },
        llm: { status: 'up', model: 'test-model', latencyMs: 10 },
      });

      app = Fastify({ logger: false });
      await app.register(healthRoutes, {
        prefix: '/api',
        ipLookupService: mockService as any,
        startTime: Date.now(),
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.json().status).toBe('degraded');
    });

    it('should return degraded status when no providers are healthy', async () => {
      const mockService = createMockIpLookupService();
      mockService.getSystemHealth.mockResolvedValue({
        redis: { status: 'up', latencyMs: 1 },
        postgres: { status: 'up', latencyMs: 2 },
        providers: { available: 3, healthy: 0 },
        llm: { status: 'up', model: 'test-model', latencyMs: 10 },
      });

      app = Fastify({ logger: false });
      await app.register(healthRoutes, {
        prefix: '/api',
        ipLookupService: mockService as any,
        startTime: Date.now(),
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.json().status).toBe('degraded');
    });
  });

  // ─── GET /api/v1/providers ──────────────────────────

  describe('GET /api/v1/providers', () => {
    it('should return provider health with stats', async () => {
      const mockService = createMockIpLookupService();
      app = Fastify({ logger: false });
      await app.register(healthRoutes, {
        prefix: '/api',
        ipLookupService: mockService as any,
        startTime: Date.now(),
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/providers',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe('provider-a');
      expect(body[0].stats.successRate).toBe(0.95);
      expect(body[0].stats.avgLatencyMs).toBe(150);
    });
  });
});
