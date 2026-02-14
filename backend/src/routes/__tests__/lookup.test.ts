import { describe, it, expect, vi, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { lookupRoutes } from '../lookup.js';
import type { CorrelatedIpRecord, BulkLookupResponse } from '@ipintel/shared';
import { ValidationErrorCode } from '@ipintel/shared';

/**
 * Minimal correlated record fixture used across tests.
 */
function createMockRecord(ip: string): CorrelatedIpRecord {
  const now = new Date().toISOString();
  return {
    ip,
    location: {
      country: 'US',
      region: 'California',
      city: 'Mountain View',
      coordinates: { lat: 37.386, lon: -122.084 },
      timezone: 'America/Los_Angeles',
      accuracy: 'city',
    },
    flags: {
      isProxy: false,
      isVpn: false,
      isTor: false,
      confidence: 85,
    },
    threat: {
      abuseScore: 10,
      riskLevel: 'low',
    },
    metadata: {
      providers: [
        {
          provider: 'test-provider',
          success: true,
          latencyMs: 100,
          country: 'US',
        },
      ],
      source: 'live',
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      ttlSeconds: 3600,
      providersQueried: 1,
      providersSucceeded: 1,
    },
  };
}

/**
 * Creates a mock IpLookupService for lookup route tests.
 */
function createMockIpLookupService() {
  return {
    lookup: vi.fn(),
    bulkLookup: vi.fn(),
  };
}

describe('lookup routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  /**
   * Helper that builds a Fastify instance with only the lookup routes registered.
   */
  async function buildApp(mockService: ReturnType<typeof createMockIpLookupService>) {
    app = Fastify({ logger: false });
    await app.register(lookupRoutes, {
      prefix: '/api/v1',
      ipLookupService: mockService as any,
    });
    await app.ready();
    return app;
  }

  // ─── POST /api/v1/lookup ────────────────────────────

  describe('POST /api/v1/lookup', () => {
    it('should return 200 with correlated record for a valid public IP', async () => {
      const mockService = createMockIpLookupService();
      const record = createMockRecord('8.8.8.8');
      mockService.lookup.mockResolvedValue(record);
      await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/lookup',
        payload: { ip: '8.8.8.8' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ip).toBe('8.8.8.8');
      expect(body.location.country).toBe('US');
      expect(mockService.lookup).toHaveBeenCalledWith('8.8.8.8', false, true);
    });

    it('should forward forceRefresh and includeLLMAnalysis options', async () => {
      const mockService = createMockIpLookupService();
      mockService.lookup.mockResolvedValue(createMockRecord('1.1.1.1'));
      await buildApp(mockService);

      await app.inject({
        method: 'POST',
        url: '/api/v1/lookup',
        payload: { ip: '1.1.1.1', forceRefresh: true, includeLLMAnalysis: false },
      });

      expect(mockService.lookup).toHaveBeenCalledWith('1.1.1.1', true, false);
    });

    it('should return 400 for an invalid IP address format', async () => {
      const mockService = createMockIpLookupService();
      mockService.lookup.mockRejectedValue({
        code: ValidationErrorCode.INVALID_FORMAT,
        message: 'Invalid IPv4 address format: not-an-ip',
      });
      await buildApp(mockService);

      // 'not-an-ip' doesn't look like an IP, so DNS resolution is attempted first
      // and fails with DNS_RESOLUTION_FAILED
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/lookup',
        payload: { ip: 'not-an-ip' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('DNS_RESOLUTION_FAILED');
    });

    it('should return 400 for a private IP address', async () => {
      const mockService = createMockIpLookupService();
      mockService.lookup.mockRejectedValue({
        code: ValidationErrorCode.PRIVATE_IP,
        message: 'Private IP addresses cannot be queried: 192.168.1.1',
      });
      await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/lookup',
        payload: { ip: '192.168.1.1' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe(ValidationErrorCode.PRIVATE_IP);
      expect(body.suggestion).toContain('Private');
    });

    it('should return 400 for a reserved IP address', async () => {
      const mockService = createMockIpLookupService();
      mockService.lookup.mockRejectedValue({
        code: ValidationErrorCode.RESERVED_IP,
        message: 'Reserved IP addresses cannot be queried: 127.0.0.1',
      });
      await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/lookup',
        payload: { ip: '127.0.0.1' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe(ValidationErrorCode.RESERVED_IP);
    });

    it('should return 503 when all providers fail', async () => {
      const mockService = createMockIpLookupService();
      mockService.lookup.mockRejectedValue(new Error('All providers failed or timed out'));
      await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/lookup',
        payload: { ip: '8.8.8.8' },
      });

      // The 503 response schema is `type: 'object'` without additionalProperties,
      // so Fastify's serializer strips custom fields. We verify the status code only.
      expect(response.statusCode).toBe(503);
    });

    it('should return 500 for unexpected errors', async () => {
      const mockService = createMockIpLookupService();
      mockService.lookup.mockRejectedValue(new Error('Something unexpected'));
      await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/lookup',
        payload: { ip: '8.8.8.8' },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().code).toBe('INTERNAL_ERROR');
    });

    it('should return 400 when body is missing the ip field', async () => {
      const mockService = createMockIpLookupService();
      await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/lookup',
        payload: {},
      });

      // Fastify schema validation rejects missing required field
      expect(response.statusCode).toBe(400);
    });
  });

  // ─── POST /api/v1/lookup/bulk ───────────────────────

  describe('POST /api/v1/lookup/bulk', () => {
    it('should return 200 with results for valid IPs', async () => {
      const mockService = createMockIpLookupService();
      const bulkResponse: BulkLookupResponse = {
        results: [
          { ip: '8.8.8.8', success: true, data: createMockRecord('8.8.8.8') },
          { ip: '1.1.1.1', success: true, data: createMockRecord('1.1.1.1') },
        ],
        summary: {
          total: 2,
          successful: 2,
          failed: 0,
          processingTimeMs: 200,
        },
      };
      mockService.bulkLookup.mockResolvedValue(bulkResponse);
      await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/lookup/bulk',
        payload: { ips: ['8.8.8.8', '1.1.1.1'] },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.results).toHaveLength(2);
      expect(body.summary.total).toBe(2);
      expect(body.summary.successful).toBe(2);
    });

    it('should return 400 when ips array exceeds 100 items', async () => {
      const mockService = createMockIpLookupService();
      await buildApp(mockService);

      // Generate 101 IPs
      const ips = Array.from({ length: 101 }, (_, i) => `1.0.0.${i % 256}`);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/lookup/bulk',
        payload: { ips },
      });

      // The schema maxItems: 100 or the handler check should reject this
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when ips array is empty', async () => {
      const mockService = createMockIpLookupService();
      await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/lookup/bulk',
        payload: { ips: [] },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when ips field is missing', async () => {
      const mockService = createMockIpLookupService();
      await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/lookup/bulk',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when one of the IPs is invalid (private)', async () => {
      const mockService = createMockIpLookupService();
      await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/lookup/bulk',
        payload: { ips: ['8.8.8.8', '192.168.1.1'] },
      });

      // The bulk 400 response schema is `type: 'object'` without additionalProperties,
      // so Fastify's serializer strips custom fields. We verify the status code.
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when one of the IPs has bad format', async () => {
      const mockService = createMockIpLookupService();
      await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/lookup/bulk',
        payload: { ips: ['8.8.8.8', 'bad-ip'] },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should default forceRefresh to false and includeLLMAnalysis to false', async () => {
      const mockService = createMockIpLookupService();
      const bulkResponse: BulkLookupResponse = {
        results: [{ ip: '8.8.8.8', success: true, data: createMockRecord('8.8.8.8') }],
        summary: { total: 1, successful: 1, failed: 0, processingTimeMs: 50 },
      };
      mockService.bulkLookup.mockResolvedValue(bulkResponse);
      await buildApp(mockService);

      await app.inject({
        method: 'POST',
        url: '/api/v1/lookup/bulk',
        payload: { ips: ['8.8.8.8'] },
      });

      expect(mockService.bulkLookup).toHaveBeenCalledWith(['8.8.8.8'], false, false);
    });

    it('should return 500 when bulkLookup throws an unexpected error', async () => {
      const mockService = createMockIpLookupService();
      mockService.bulkLookup.mockRejectedValue(new Error('Unexpected failure'));
      await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/lookup/bulk',
        payload: { ips: ['8.8.8.8'] },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().code).toBe('INTERNAL_ERROR');
    });
  });

  // ─── GET /api/v1/lookup/:ip ─────────────────────────

  describe('GET /api/v1/lookup/:ip', () => {
    it('should return 200 for a valid public IP', async () => {
      const mockService = createMockIpLookupService();
      mockService.lookup.mockResolvedValue(createMockRecord('8.8.4.4'));
      await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/lookup/8.8.4.4',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().ip).toBe('8.8.4.4');
    });

    it('should parse query string options correctly', async () => {
      const mockService = createMockIpLookupService();
      mockService.lookup.mockResolvedValue(createMockRecord('8.8.4.4'));
      await buildApp(mockService);

      await app.inject({
        method: 'GET',
        url: '/api/v1/lookup/8.8.4.4?forceRefresh=true&includeLLMAnalysis=false',
      });

      expect(mockService.lookup).toHaveBeenCalledWith('8.8.4.4', true, false);
    });

    it('should return 400 for an invalid IP via GET', async () => {
      const mockService = createMockIpLookupService();
      mockService.lookup.mockRejectedValue({
        code: ValidationErrorCode.INVALID_FORMAT,
        message: 'Invalid IPv4 address format: garbage',
      });
      await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/lookup/garbage',
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
