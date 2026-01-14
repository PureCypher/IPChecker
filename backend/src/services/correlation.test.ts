import { describe, it, expect, beforeEach } from 'vitest';
import { CorrelationService } from './correlation.js';
import type { ProviderResult } from '@ipintel/shared';

describe('CorrelationService', () => {
  let service: CorrelationService;

  beforeEach(() => {
    service = new CorrelationService();
  });

  describe('correlate', () => {
    const testIp = '8.8.8.8';
    const cacheTtl = 3600;

    it('should create a correlated record from provider results', () => {
      const results: ProviderResult[] = [
        createProviderResult({
          provider: 'ip-api.com',
          country: 'United States',
          city: 'Mountain View',
          latitude: 37.386,
          longitude: -122.0838,
        }),
      ];

      const record = service.correlate(testIp, results, 'live', cacheTtl);

      expect(record.ip).toBe(testIp);
      expect(record.location.country).toBe('United States');
      expect(record.location.city).toBe('Mountain View');
      expect(record.metadata.source).toBe('live');
    });

    it('should handle empty results', () => {
      const record = service.correlate(testIp, [], 'live', cacheTtl);

      expect(record.ip).toBe(testIp);
      expect(record.location.country).toBeUndefined();
      expect(record.flags.confidence).toBe(0);
    });

    describe('value correlation', () => {
      it('should use majority vote for conflicting values', () => {
        const results: ProviderResult[] = [
          createProviderResult({ provider: 'a', country: 'United States' }),
          createProviderResult({ provider: 'b', country: 'United States' }),
          createProviderResult({ provider: 'c', country: 'Canada' }),
        ];

        const record = service.correlate(testIp, results, 'live', cacheTtl);

        expect(record.location.country).toBe('United States');
        expect(record.metadata.conflicts).toBeDefined();
        expect(record.metadata.conflicts![0].reason).toBe('majority vote');
      });

      it('should use trust rank when vote is tied', () => {
        const results: ProviderResult[] = [
          createProviderResult({ provider: 'abuseipdb.com', country: 'United States' }), // trust 9
          createProviderResult({ provider: 'ip-api.com', country: 'Canada' }), // trust 6
        ];

        const record = service.correlate(testIp, results, 'live', cacheTtl);

        // Should prefer abuseipdb.com due to higher trust rank
        expect(record.location.country).toBe('United States');
        expect(record.metadata.conflicts![0].reason).toBe('highest trust');
      });
    });

    describe('coordinate correlation', () => {
      it('should average coordinates from multiple providers', () => {
        const results: ProviderResult[] = [
          createProviderResult({ provider: 'a', latitude: 40.0, longitude: -74.0 }),
          createProviderResult({ provider: 'b', latitude: 42.0, longitude: -76.0 }),
        ];

        const record = service.correlate(testIp, results, 'live', cacheTtl);

        expect(record.location.coordinates?.lat).toBe(41.0);
        expect(record.location.coordinates?.lon).toBe(-75.0);
      });
    });

    describe('boolean flag correlation', () => {
      it('should return true if any provider reports true', () => {
        const results: ProviderResult[] = [
          createProviderResult({ provider: 'a', isVpn: false }),
          createProviderResult({ provider: 'b', isVpn: true }),
        ];

        const record = service.correlate(testIp, results, 'live', cacheTtl);

        expect(record.flags.isVpn).toBe(true);
      });

      it('should return false if all providers report false', () => {
        const results: ProviderResult[] = [
          createProviderResult({ provider: 'a', isVpn: false }),
          createProviderResult({ provider: 'b', isVpn: false }),
        ];

        const record = service.correlate(testIp, results, 'live', cacheTtl);

        expect(record.flags.isVpn).toBe(false);
      });

      it('should return undefined if no provider has the data', () => {
        const results: ProviderResult[] = [createProviderResult({ provider: 'a' })];

        const record = service.correlate(testIp, results, 'live', cacheTtl);

        expect(record.flags.isVpn).toBeUndefined();
      });
    });

    describe('abuse score correlation', () => {
      it('should use maximum abuse score (most conservative)', () => {
        const results: ProviderResult[] = [
          createProviderResult({ provider: 'a', abuseScore: 25 }),
          createProviderResult({ provider: 'b', abuseScore: 75 }),
          createProviderResult({ provider: 'c', abuseScore: 50 }),
        ];

        const record = service.correlate(testIp, results, 'live', cacheTtl);

        expect(record.threat.abuseScore).toBe(75);
      });
    });

    describe('risk level calculation', () => {
      it('should be high for Tor exit nodes', () => {
        const results: ProviderResult[] = [
          createProviderResult({ provider: 'a', isTor: true }),
        ];

        const record = service.correlate(testIp, results, 'live', cacheTtl);

        expect(record.threat.riskLevel).toBe('high');
      });

      it('should be high for abuse score >= 70', () => {
        const results: ProviderResult[] = [
          createProviderResult({ provider: 'a', abuseScore: 80 }),
        ];

        const record = service.correlate(testIp, results, 'live', cacheTtl);

        expect(record.threat.riskLevel).toBe('high');
      });

      it('should be medium for VPN/proxy', () => {
        const results: ProviderResult[] = [
          createProviderResult({ provider: 'a', isVpn: true }),
        ];

        const record = service.correlate(testIp, results, 'live', cacheTtl);

        expect(record.threat.riskLevel).toBe('medium');
      });

      it('should be medium for abuse score >= 30', () => {
        const results: ProviderResult[] = [
          createProviderResult({ provider: 'a', abuseScore: 40 }),
        ];

        const record = service.correlate(testIp, results, 'live', cacheTtl);

        expect(record.threat.riskLevel).toBe('medium');
      });

      it('should be low for clean IPs with data', () => {
        const results: ProviderResult[] = [
          createProviderResult({
            provider: 'a',
            abuseScore: 10,
            isVpn: false,
            isProxy: false,
            isTor: false,
          }),
        ];

        const record = service.correlate(testIp, results, 'live', cacheTtl);

        expect(record.threat.riskLevel).toBe('low');
      });
    });

    describe('metadata', () => {
      it('should track failed providers in warnings', () => {
        const results: ProviderResult[] = [
          createProviderResult({ provider: 'working-provider', country: 'US' }),
          { provider: 'failed-provider', success: false, error: 'API timeout' },
        ];

        const record = service.correlate(testIp, results, 'live', cacheTtl);

        expect(record.metadata.warnings).toBeDefined();
        expect(record.metadata.warnings![0]).toContain('failed-provider');
        expect(record.metadata.partialData).toBe(true);
        expect(record.metadata.providersQueried).toBe(2);
        expect(record.metadata.providersSucceeded).toBe(1);
      });

      it('should calculate expiration time correctly', () => {
        const results: ProviderResult[] = [
          createProviderResult({ provider: 'a', country: 'US' }),
        ];

        const record = service.correlate(testIp, results, 'live', 3600);

        const createdAt = new Date(record.metadata.createdAt);
        const expiresAt = new Date(record.metadata.expiresAt!);
        const diff = (expiresAt.getTime() - createdAt.getTime()) / 1000;

        expect(diff).toBe(3600);
      });

      it('should set location accuracy based on available data', () => {
        const cityResult = createProviderResult({
          provider: 'a',
          country: 'US',
          region: 'CA',
          city: 'San Francisco',
        });
        expect(
          service.correlate(testIp, [cityResult], 'live', cacheTtl).location.accuracy
        ).toBe('city');

        const regionResult = createProviderResult({
          provider: 'a',
          country: 'US',
          region: 'CA',
        });
        expect(
          service.correlate(testIp, [regionResult], 'live', cacheTtl).location.accuracy
        ).toBe('region');

        const countryResult = createProviderResult({ provider: 'a', country: 'US' });
        expect(
          service.correlate(testIp, [countryResult], 'live', cacheTtl).location.accuracy
        ).toBe('country');
      });
    });
  });
});

/**
 * Helper to create provider results with defaults
 */
function createProviderResult(
  overrides: Partial<ProviderResult> & { provider: string }
): ProviderResult {
  return {
    success: true,
    responseTimeMs: 100,
    ...overrides,
  };
}
