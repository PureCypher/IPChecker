import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CorrelatedIpRecord, ProviderResult } from '@ipintel/shared';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test.
// We use class syntax so the mocks work with `new` in the constructor.
// ---------------------------------------------------------------------------

const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockCacheDelete = vi.fn();
const mockCacheConnect = vi.fn();
const mockCacheDisconnect = vi.fn();

vi.mock('../cache.js', () => ({
  CacheService: class {
    get = mockCacheGet;
    set = mockCacheSet;
    delete = mockCacheDelete;
    connect = mockCacheConnect;
    disconnect = mockCacheDisconnect;
  },
}));

const mockDbGetIpRecord = vi.fn();
const mockDbSaveIpRecord = vi.fn();
const mockDbConnect = vi.fn();
const mockDbDisconnect = vi.fn();
const mockDbUpdateProviderStats = vi.fn();

vi.mock('../database.js', () => ({
  DatabaseService: class {
    getIpRecord = mockDbGetIpRecord;
    saveIpRecord = mockDbSaveIpRecord;
    connect = mockDbConnect;
    disconnect = mockDbDisconnect;
    updateProviderStats = mockDbUpdateProviderStats;
  },
}));

const mockCorrelate = vi.fn();

vi.mock('../correlation.js', () => ({
  CorrelationService: class {
    correlate = mockCorrelate;
  },
}));

const mockQueryAll = vi.fn();

vi.mock('../../providers/provider-manager.js', () => ({
  ProviderManager: class {
    queryAll = mockQueryAll;
  },
}));

const mockAnalyzeIP = vi.fn();

vi.mock('../llm-analysis.js', () => ({
  LLMAnalysisService: class {
    analyzeIP = mockAnalyzeIP;
  },
}));

vi.mock('../../utils/ip-validation.js', () => ({
  validateAndNormalizeIp: vi.fn((ip: string) => {
    // Minimal stub: reject obviously bad input, pass through everything else
    if (ip === 'bad-ip') throw { code: 'INVALID_FORMAT', message: 'Invalid' };
    return ip.trim();
  }),
  isValidationError: vi.fn((err: unknown) => {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      'message' in err
    );
  }),
}));

vi.mock('../../config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../utils/helpers.js', () => ({
  getEnvNumber: vi.fn((_key: string, def: number) => def),
  getEnvBool: vi.fn((_key: string, def: boolean) => def),
  getEnvString: vi.fn((_key: string, def: string) => def),
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------
import { IpLookupService } from '../ip-lookup.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRecord(
  ip: string,
  overrides: Partial<CorrelatedIpRecord> = {}
): CorrelatedIpRecord {
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
    ...overrides,
  };
}

function createProviderResult(
  overrides: Partial<ProviderResult> & { provider: string }
): ProviderResult {
  return {
    success: true,
    latencyMs: 120,
    country: 'US',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IpLookupService', () => {
  let service: IpLookupService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: LLM analysis returns null (disabled/not relevant)
    mockAnalyzeIP.mockResolvedValue(null);
    mockDbUpdateProviderStats.mockResolvedValue(undefined);
    mockCacheSet.mockResolvedValue(undefined);
    mockDbSaveIpRecord.mockResolvedValue(undefined);

    service = new IpLookupService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Cache hit path ────────────────────────────────────────────────────

  describe('cache hit path', () => {
    it('should return cached result without querying providers', async () => {
      const cachedRecord = createMockRecord('8.8.8.8', {
        metadata: {
          ...createMockRecord('8.8.8.8').metadata,
          source: 'cache',
          llmAnalysis: { summary: 'cached analysis' } as any,
        },
      });

      mockCacheGet.mockResolvedValue(cachedRecord);

      const result = await service.lookup('8.8.8.8');

      expect(result).toEqual(cachedRecord);
      expect(mockCacheGet).toHaveBeenCalledWith('8.8.8.8');
      expect(mockDbGetIpRecord).not.toHaveBeenCalled();
      expect(mockQueryAll).not.toHaveBeenCalled();
    });

    it('should add LLM analysis when cached record lacks it and LLM is enabled', async () => {
      const cachedRecord = createMockRecord('8.8.8.8', {
        metadata: {
          ...createMockRecord('8.8.8.8').metadata,
          source: 'cache',
          // no llmAnalysis
        },
      });
      mockCacheGet.mockResolvedValue(cachedRecord);
      mockAnalyzeIP.mockResolvedValue({
        summary: 'Fresh LLM analysis',
      });

      const result = await service.lookup('8.8.8.8', false, true);

      expect(mockAnalyzeIP).toHaveBeenCalledWith(cachedRecord);
      expect(result.metadata.llmAnalysis).toEqual({
        summary: 'Fresh LLM analysis',
      });
      // Should NOT query providers
      expect(mockQueryAll).not.toHaveBeenCalled();
    });

    it('should skip LLM analysis when includeLLMAnalysis is false', async () => {
      const cachedRecord = createMockRecord('8.8.8.8');
      mockCacheGet.mockResolvedValue(cachedRecord);

      const result = await service.lookup('8.8.8.8', false, false);

      expect(result).toEqual(cachedRecord);
      expect(mockAnalyzeIP).not.toHaveBeenCalled();
    });
  });

  // ─── Database fallback path ────────────────────────────────────────────

  describe('database fallback path', () => {
    it('should return DB record when cache misses and DB has non-expired record', async () => {
      mockCacheGet.mockResolvedValue(null);

      const dbRecord = createMockRecord('8.8.8.8', {
        metadata: {
          ...createMockRecord('8.8.8.8').metadata,
          source: 'db',
        },
      });
      mockDbGetIpRecord.mockResolvedValue(dbRecord);

      const result = await service.lookup('8.8.8.8', false, false);

      expect(result).toEqual(dbRecord);
      expect(mockCacheGet).toHaveBeenCalledWith('8.8.8.8');
      expect(mockDbGetIpRecord).toHaveBeenCalledWith('8.8.8.8');
      // Should populate cache from DB
      expect(mockCacheSet).toHaveBeenCalledWith('8.8.8.8', dbRecord);
      // Should NOT query providers
      expect(mockQueryAll).not.toHaveBeenCalled();
    });

    it('should add LLM analysis to DB record when requested', async () => {
      mockCacheGet.mockResolvedValue(null);

      const dbRecord = createMockRecord('8.8.8.8', {
        metadata: {
          ...createMockRecord('8.8.8.8').metadata,
          source: 'db',
        },
      });
      mockDbGetIpRecord.mockResolvedValue(dbRecord);
      mockAnalyzeIP.mockResolvedValue({ summary: 'LLM enriched' });

      const result = await service.lookup('8.8.8.8', false, true);

      expect(mockAnalyzeIP).toHaveBeenCalledWith(dbRecord);
      expect(result.metadata.llmAnalysis).toEqual({ summary: 'LLM enriched' });
      // Cache should be populated with the LLM-enriched record
      expect(mockCacheSet).toHaveBeenCalledWith(
        '8.8.8.8',
        expect.objectContaining({
          metadata: expect.objectContaining({
            llmAnalysis: { summary: 'LLM enriched' },
          }),
        })
      );
    });
  });

  // ─── Provider query + correlation path ─────────────────────────────────

  describe('provider query + correlation path', () => {
    it('should query providers, correlate, and persist when cache and DB miss', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockDbGetIpRecord.mockResolvedValue(null);

      const providerResults: ProviderResult[] = [
        createProviderResult({ provider: 'ip-api.com', country: 'US' }),
        createProviderResult({ provider: 'ipinfo.io', country: 'US' }),
      ];
      mockQueryAll.mockResolvedValue(providerResults);

      const correlatedRecord = createMockRecord('8.8.8.8');
      mockCorrelate.mockReturnValue(correlatedRecord);

      const result = await service.lookup('8.8.8.8', false, false);

      expect(mockQueryAll).toHaveBeenCalledWith('8.8.8.8', 5000);
      expect(mockCorrelate).toHaveBeenCalledWith(
        '8.8.8.8',
        providerResults,
        'live',
        2592000 // default cacheTtlSeconds
      );
      expect(mockCacheSet).toHaveBeenCalledWith('8.8.8.8', correlatedRecord);
      expect(mockDbSaveIpRecord).toHaveBeenCalledWith(correlatedRecord);
      expect(result).toEqual(correlatedRecord);
    });

    it('should add LLM analysis to correlated record when enabled', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockDbGetIpRecord.mockResolvedValue(null);

      const providerResults: ProviderResult[] = [
        createProviderResult({ provider: 'ip-api.com' }),
      ];
      mockQueryAll.mockResolvedValue(providerResults);

      const correlatedRecord = createMockRecord('8.8.8.8');
      mockCorrelate.mockReturnValue(correlatedRecord);
      mockAnalyzeIP.mockResolvedValue({ summary: 'Live LLM analysis' });

      const result = await service.lookup('8.8.8.8', false, true);

      expect(mockAnalyzeIP).toHaveBeenCalledWith(correlatedRecord);
      expect(result.metadata.llmAnalysis).toEqual({
        summary: 'Live LLM analysis',
      });
    });

    it('should track provider stats after querying', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockDbGetIpRecord.mockResolvedValue(null);

      const providerResults: ProviderResult[] = [
        createProviderResult({ provider: 'ip-api.com', latencyMs: 100 }),
        { provider: 'ipinfo.io', success: false, latencyMs: 0, error: 'timeout' },
      ];
      mockQueryAll.mockResolvedValue(providerResults);

      const correlatedRecord = createMockRecord('8.8.8.8');
      mockCorrelate.mockReturnValue(correlatedRecord);

      await service.lookup('8.8.8.8', false, false);

      expect(mockDbUpdateProviderStats).toHaveBeenCalledTimes(2);
      expect(mockDbUpdateProviderStats).toHaveBeenCalledWith(
        'ip-api.com',
        true,
        100,
        undefined
      );
      expect(mockDbUpdateProviderStats).toHaveBeenCalledWith(
        'ipinfo.io',
        false,
        0,
        'timeout'
      );
    });
  });

  // ─── Force refresh behavior ────────────────────────────────────────────

  describe('force refresh behavior', () => {
    it('should bypass cache and database when forceRefresh is true', async () => {
      const providerResults: ProviderResult[] = [
        createProviderResult({ provider: 'ip-api.com' }),
      ];
      mockQueryAll.mockResolvedValue(providerResults);

      const correlatedRecord = createMockRecord('8.8.8.8');
      mockCorrelate.mockReturnValue(correlatedRecord);

      await service.lookup('8.8.8.8', true, false);

      expect(mockCacheGet).not.toHaveBeenCalled();
      expect(mockDbGetIpRecord).not.toHaveBeenCalled();
      expect(mockQueryAll).toHaveBeenCalledWith('8.8.8.8', 5000);
    });

    it('should still persist to cache and database after force refresh', async () => {
      const providerResults: ProviderResult[] = [
        createProviderResult({ provider: 'ip-api.com' }),
      ];
      mockQueryAll.mockResolvedValue(providerResults);

      const correlatedRecord = createMockRecord('8.8.8.8');
      mockCorrelate.mockReturnValue(correlatedRecord);

      await service.lookup('8.8.8.8', true, false);

      expect(mockCacheSet).toHaveBeenCalledWith('8.8.8.8', correlatedRecord);
      expect(mockDbSaveIpRecord).toHaveBeenCalledWith(correlatedRecord);
    });
  });

  // ─── Request coalescing ────────────────────────────────────────────────

  describe('request coalescing', () => {
    it('should share a single provider query for concurrent lookups of the same IP', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockDbGetIpRecord.mockResolvedValue(null);

      const providerResults: ProviderResult[] = [
        createProviderResult({ provider: 'ip-api.com' }),
      ];

      // Make queryAll return a promise that we control so both callers
      // are guaranteed to be in-flight before it resolves.
      let resolveQuery!: (value: ProviderResult[]) => void;
      const queryPromise = new Promise<ProviderResult[]>((resolve) => {
        resolveQuery = resolve;
      });
      mockQueryAll.mockReturnValue(queryPromise);

      const correlatedRecord = createMockRecord('8.8.8.8');
      mockCorrelate.mockReturnValue(correlatedRecord);

      // Fire two concurrent lookups for the same IP
      const lookup1 = service.lookup('8.8.8.8', false, false);
      const lookup2 = service.lookup('8.8.8.8', false, false);

      // Resolve the single provider query
      resolveQuery(providerResults);

      const [result1, result2] = await Promise.all([lookup1, lookup2]);

      // Both should get the same result
      expect(result1).toEqual(correlatedRecord);
      expect(result2).toEqual(correlatedRecord);

      // Provider should only have been queried ONCE
      expect(mockQueryAll).toHaveBeenCalledTimes(1);
    });

    it('should not coalesce lookups for different IPs', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockDbGetIpRecord.mockResolvedValue(null);

      const providerResults1: ProviderResult[] = [
        createProviderResult({ provider: 'ip-api.com', country: 'US' }),
      ];
      const providerResults2: ProviderResult[] = [
        createProviderResult({ provider: 'ip-api.com', country: 'DE' }),
      ];

      let callCount = 0;
      mockQueryAll.mockImplementation(() => {
        callCount++;
        return Promise.resolve(
          callCount === 1 ? providerResults1 : providerResults2
        );
      });

      const record1 = createMockRecord('8.8.8.8');
      const record2 = createMockRecord('1.1.1.1');

      let correlateCallCount = 0;
      mockCorrelate.mockImplementation(() => {
        correlateCallCount++;
        return correlateCallCount === 1 ? record1 : record2;
      });

      const [result1, result2] = await Promise.all([
        service.lookup('8.8.8.8', false, false),
        service.lookup('1.1.1.1', false, false),
      ]);

      expect(result1.ip).toBe('8.8.8.8');
      expect(result2.ip).toBe('1.1.1.1');

      // Each IP should trigger its own provider query
      expect(mockQueryAll).toHaveBeenCalledTimes(2);
    });

    it('should clean up pending lookup after completion so subsequent lookups work', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockDbGetIpRecord.mockResolvedValue(null);

      const providerResults: ProviderResult[] = [
        createProviderResult({ provider: 'ip-api.com' }),
      ];
      mockQueryAll.mockResolvedValue(providerResults);

      const record = createMockRecord('8.8.8.8');
      mockCorrelate.mockReturnValue(record);

      // First lookup
      await service.lookup('8.8.8.8', false, false);

      // Second lookup (should NOT coalesce — first one is complete)
      await service.lookup('8.8.8.8', false, false);

      // Two separate calls (the second call gets a cache miss again
      // because our mock always returns null)
      expect(mockQueryAll).toHaveBeenCalledTimes(2);
    });

    it('should clean up pending lookup even when the provider query fails', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockDbGetIpRecord.mockResolvedValue(null);

      // First call fails
      mockQueryAll.mockResolvedValueOnce([
        { provider: 'ip-api.com', success: false, latencyMs: 0, error: 'fail' },
      ]);

      await expect(
        service.lookup('8.8.8.8', false, false)
      ).rejects.toThrow('All providers failed or timed out');

      // Second call should proceed independently (not stuck on stale promise)
      const providerResults: ProviderResult[] = [
        createProviderResult({ provider: 'ip-api.com' }),
      ];
      mockQueryAll.mockResolvedValueOnce(providerResults);

      const record = createMockRecord('8.8.8.8');
      mockCorrelate.mockReturnValue(record);

      const result = await service.lookup('8.8.8.8', false, false);
      expect(result).toEqual(record);
    });

    it('should propagate errors to all coalesced callers', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockDbGetIpRecord.mockResolvedValue(null);

      // Use a deferred promise so both callers are in-flight
      let rejectQuery!: (reason: Error) => void;
      const queryPromise = new Promise<ProviderResult[]>((_, reject) => {
        rejectQuery = reject;
      });
      mockQueryAll.mockReturnValue(queryPromise);

      const lookup1 = service.lookup('8.8.8.8', false, false);
      const lookup2 = service.lookup('8.8.8.8', false, false);

      // Make the single provider query fail
      rejectQuery(new Error('Network failure'));

      // Both callers should see the error — we use allSettled to capture both
      const [r1, r2] = await Promise.allSettled([lookup1, lookup2]);

      expect(r1.status).toBe('rejected');
      expect(r2.status).toBe('rejected');
      if (r1.status === 'rejected') {
        expect((r1.reason as Error).message).toContain('Network failure');
      }
      if (r2.status === 'rejected') {
        expect((r2.reason as Error).message).toContain('Network failure');
      }
    });
  });

  // ─── Error handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should throw when all providers fail', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockDbGetIpRecord.mockResolvedValue(null);

      mockQueryAll.mockResolvedValue([
        { provider: 'ip-api.com', success: false, latencyMs: 0, error: 'timeout' },
        { provider: 'ipinfo.io', success: false, latencyMs: 0, error: 'rate limited' },
      ]);

      await expect(
        service.lookup('8.8.8.8', false, false)
      ).rejects.toThrow('All providers failed or timed out');
    });

    it('should throw validation error for invalid IP', async () => {
      await expect(service.lookup('bad-ip')).rejects.toMatchObject({
        code: 'INVALID_FORMAT',
      });

      // Should not attempt any cache/DB/provider calls
      expect(mockCacheGet).not.toHaveBeenCalled();
      expect(mockDbGetIpRecord).not.toHaveBeenCalled();
      expect(mockQueryAll).not.toHaveBeenCalled();
    });

    it('should succeed when some (but not all) providers fail', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockDbGetIpRecord.mockResolvedValue(null);

      const providerResults: ProviderResult[] = [
        createProviderResult({ provider: 'ip-api.com', country: 'US' }),
        { provider: 'ipinfo.io', success: false, latencyMs: 0, error: 'timeout' },
      ];
      mockQueryAll.mockResolvedValue(providerResults);

      const correlatedRecord = createMockRecord('8.8.8.8');
      mockCorrelate.mockReturnValue(correlatedRecord);

      const result = await service.lookup('8.8.8.8', false, false);

      expect(result).toEqual(correlatedRecord);
    });

    it('should gracefully handle LLM analysis failure and still return result', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockDbGetIpRecord.mockResolvedValue(null);

      const providerResults: ProviderResult[] = [
        createProviderResult({ provider: 'ip-api.com' }),
      ];
      mockQueryAll.mockResolvedValue(providerResults);

      const correlatedRecord = createMockRecord('8.8.8.8');
      mockCorrelate.mockReturnValue(correlatedRecord);
      mockAnalyzeIP.mockRejectedValue(new Error('Ollama unavailable'));

      const result = await service.lookup('8.8.8.8', false, true);

      // Should still return the correlated record (without LLM analysis)
      expect(result.ip).toBe('8.8.8.8');
    });
  });
});
