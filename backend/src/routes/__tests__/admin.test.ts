import { describe, it, expect, vi, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { CorrelatedIpRecord } from '@ipintel/shared';

// Mock the config module so we control the admin API key in tests.
const TEST_ADMIN_KEY = 'test-admin-key-that-is-at-least-32-chars-long!!';

vi.mock('../../config/env.js', () => ({
  config: {
    adminApiKey: TEST_ADMIN_KEY,
    nodeEnv: 'test',
    appVersion: '1.0.0-test',
  },
}));

// Mock @prisma/client so the route plugin does not attempt a real DB connection.
vi.mock('@prisma/client', () => {
  class PrismaClient {
    apiKey = {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    };
    $connect = vi.fn();
    $disconnect = vi.fn();
  }
  return { PrismaClient };
});

// Import after mocks are set up.
const { adminRoutes } = await import('../admin.js');

/**
 * Creates a minimal mock CorrelatedIpRecord for cache tests.
 */
function createMockRecord(ip: string): CorrelatedIpRecord {
  const now = new Date().toISOString();
  return {
    ip,
    location: { country: 'US', accuracy: 'country' },
    flags: { confidence: 80 },
    threat: { riskLevel: 'low' },
    metadata: {
      providers: [{ provider: 'test', success: true, latencyMs: 100 }],
      source: 'live',
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      ttlSeconds: 3600,
    },
  };
}

/**
 * Creates a mock IpLookupService for admin route tests.
 */
function createMockIpLookupService() {
  return {
    getCached: vi.fn(),
    clearCache: vi.fn(),
    getCacheStats: vi.fn().mockResolvedValue({
      hits: 100,
      misses: 20,
      keys: 50,
    }),
    getDatabaseStats: vi.fn().mockResolvedValue({
      totalRecords: 500,
      activeRecords: 480,
      expiredRecords: 20,
    }),
    cleanupExpired: vi.fn().mockResolvedValue(15),
  };
}

describe('admin routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  /**
   * Helper that builds a Fastify instance with admin routes registered.
   */
  async function buildApp(mockService: ReturnType<typeof createMockIpLookupService>) {
    app = Fastify({ logger: false });
    await app.register(adminRoutes, {
      prefix: '/api/v1',
      ipLookupService: mockService as any,
    });
    await app.ready();
    return app;
  }

  // ─── Authentication ─────────────────────────────────

  describe('authentication', () => {
    it('should return 403 when x-admin-key header is missing', async () => {
      const mockService = createMockIpLookupService();
      await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/stats/cache',
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('INVALID_ADMIN_KEY');
    });

    it('should return 403 when x-admin-key header has wrong value', async () => {
      const mockService = createMockIpLookupService();
      await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/stats/cache',
        headers: { 'x-admin-key': 'wrong-key-value' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('INVALID_ADMIN_KEY');
    });

    it('should return 403 when x-admin-key header is empty string', async () => {
      const mockService = createMockIpLookupService();
      await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/stats/cache',
        headers: { 'x-admin-key': '' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should allow access with a valid admin key', async () => {
      const mockService = createMockIpLookupService();
      await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/stats/cache',
        headers: { 'x-admin-key': TEST_ADMIN_KEY },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should enforce auth on all admin endpoints', async () => {
      const mockService = createMockIpLookupService();
      await buildApp(mockService);

      const endpoints = [
        { method: 'GET' as const, url: '/api/v1/cache/8.8.8.8' },
        { method: 'DELETE' as const, url: '/api/v1/cache/8.8.8.8' },
        { method: 'GET' as const, url: '/api/v1/stats/cache' },
        { method: 'GET' as const, url: '/api/v1/stats/database' },
        { method: 'POST' as const, url: '/api/v1/cleanup' },
      ];

      for (const endpoint of endpoints) {
        const response = await app.inject({
          method: endpoint.method,
          url: endpoint.url,
        });

        expect(response.statusCode).toBe(403);
      }
    });
  });

  // ─── GET /api/v1/cache/:ip ──────────────────────────

  describe('GET /api/v1/cache/:ip', () => {
    it('should return cached record when it exists', async () => {
      const mockService = createMockIpLookupService();
      const record = createMockRecord('8.8.8.8');
      mockService.getCached.mockResolvedValue(record);
      await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/cache/8.8.8.8',
        headers: { 'x-admin-key': TEST_ADMIN_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.exists).toBe(true);
      expect(body.record.ip).toBe('8.8.8.8');
    });

    it('should return 404 when IP is not in cache', async () => {
      const mockService = createMockIpLookupService();
      mockService.getCached.mockResolvedValue(null);
      await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/cache/8.8.8.8',
        headers: { 'x-admin-key': TEST_ADMIN_KEY },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().exists).toBe(false);
    });

    it('should return 400 for an invalid IP in the cache lookup', async () => {
      const mockService = createMockIpLookupService();
      await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/cache/not-an-ip',
        headers: { 'x-admin-key': TEST_ADMIN_KEY },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ─── DELETE /api/v1/cache/:ip ───────────────────────

  describe('DELETE /api/v1/cache/:ip', () => {
    it('should return 204 on successful cache clear', async () => {
      const mockService = createMockIpLookupService();
      mockService.clearCache.mockResolvedValue(undefined);
      await buildApp(mockService);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/cache/8.8.8.8',
        headers: { 'x-admin-key': TEST_ADMIN_KEY },
      });

      expect(response.statusCode).toBe(204);
      expect(mockService.clearCache).toHaveBeenCalled();
    });

    it('should return 400 for an invalid IP in cache delete', async () => {
      const mockService = createMockIpLookupService();
      await buildApp(mockService);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/cache/garbage',
        headers: { 'x-admin-key': TEST_ADMIN_KEY },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ─── GET /api/v1/stats/cache ────────────────────────

  describe('GET /api/v1/stats/cache', () => {
    it('should return cache statistics', async () => {
      const mockService = createMockIpLookupService();
      await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/stats/cache',
        headers: { 'x-admin-key': TEST_ADMIN_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.hits).toBe(100);
      expect(body.misses).toBe(20);
      expect(body.keys).toBe(50);
    });
  });

  // ─── GET /api/v1/stats/database ─────────────────────

  describe('GET /api/v1/stats/database', () => {
    it('should return database statistics', async () => {
      const mockService = createMockIpLookupService();
      await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/stats/database',
        headers: { 'x-admin-key': TEST_ADMIN_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.totalRecords).toBe(500);
    });
  });

  // ─── POST /api/v1/cleanup ──────────────────────────

  describe('POST /api/v1/cleanup', () => {
    it('should return cleanup result with deleted count', async () => {
      const mockService = createMockIpLookupService();
      await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/cleanup',
        headers: { 'x-admin-key': TEST_ADMIN_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.message).toBe('Cleanup completed');
      expect(body.deletedRecords).toBe(15);
    });
  });
});
