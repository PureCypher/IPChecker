import type { CorrelatedIpRecord, ProviderResult, BulkLookupResponse, BulkLookupResult, LLMAnalysis } from '@ipintel/shared';
import { CacheService } from './cache.js';
import { DatabaseService } from './database.js';
import { CorrelationService } from './correlation.js';
import { LLMAnalysisService } from './llm-analysis.js';
import { ProviderManager } from '../providers/provider-manager.js';
import {
  validateAndNormalizeIp,
  isValidationError,
} from '../utils/ip-validation.js';
import { getEnvNumber, getEnvBool } from '../utils/helpers.js';
import { logger } from '../config/logger.js';
import pLimit from 'p-limit';

/**
 * Main IP Lookup Service
 * Coordinates cache, database, providers, and correlation
 */
export class IpLookupService {
  private cache: CacheService;
  private database: DatabaseService;
  private correlation: CorrelationService;
  private providerManager: ProviderManager;
  private llmAnalysis: LLMAnalysisService;
  private readonly cacheTtlSeconds: number;
  private readonly globalTimeoutMs: number;
  private readonly llmEnabled: boolean;
  private pendingLookups: Map<string, Promise<CorrelatedIpRecord>>;

  constructor() {
    this.cache = new CacheService();
    this.database = new DatabaseService();
    this.correlation = new CorrelationService();
    this.providerManager = new ProviderManager();
    this.llmAnalysis = new LLMAnalysisService();
    this.cacheTtlSeconds = getEnvNumber('CACHE_TTL_SECONDS', 2592000);
    this.globalTimeoutMs = getEnvNumber('LOOKUP_GLOBAL_TIMEOUT_MS', 5000);
    this.llmEnabled = getEnvBool('LLM_ENABLED', true);
    this.pendingLookups = new Map();
  }

  /**
   * Initialize all services
   */
  async initialize(): Promise<void> {
    await Promise.all([this.cache.connect(), this.database.connect()]);
    logger.info('IP Lookup Service initialized');
  }

  /**
   * Shutdown all services
   */
  async shutdown(): Promise<void> {
    await Promise.all([this.cache.disconnect(), this.database.disconnect()]);
    logger.info('IP Lookup Service shut down');
  }

  /**
   * Lookup IP address with caching, fallback, and correlation.
   * Uses request coalescing to prevent cache stampede: concurrent lookups
   * for the same IP share a single in-flight provider query.
   */
  async lookup(
    ipInput: string,
    forceRefresh = false,
    includeLLMAnalysis = true
  ): Promise<CorrelatedIpRecord> {
    // Step 1: Validate and normalize IP
    let ip: string;
    try {
      ip = validateAndNormalizeIp(ipInput);
    } catch (error) {
      if (isValidationError(error)) {
        throw error;
      }
      throw new Error(`IP validation failed: ${error}`);
    }

    // Step 2: Check cache (unless force refresh)
    if (!forceRefresh) {
      const cached = await this.cache.get(ip);
      if (cached) {
        logger.debug({ ip }, 'Cache HIT');
        // Add LLM analysis if not present and requested
        if (includeLLMAnalysis && this.llmEnabled && !cached.metadata?.llmAnalysis) {
          return this.addLLMAnalysis(cached);
        }
        return cached;
      }
      logger.debug({ ip }, 'Cache MISS');

      // Step 3: Check database (stale-while-revalidate)
      const dbRecord = await this.database.getIpRecord(ip);
      if (dbRecord) {
        logger.debug({ ip }, 'Database HIT');

        // Add LLM analysis if requested
        const recordWithAnalysis = includeLLMAnalysis && this.llmEnabled
          ? await this.addLLMAnalysis(dbRecord)
          : dbRecord;

        // Populate cache from database
        await this.cache.set(ip, recordWithAnalysis);

        return recordWithAnalysis;
      }
      logger.debug({ ip }, 'Database MISS');
    } else {
      logger.debug({ ip }, 'Force refresh requested');
    }

    // Step 4: Request coalescing — if a lookup is already in-flight for
    // this IP, reuse its promise so we don't hit providers multiple times.
    const coalescingKey = `${ip}:${forceRefresh}:${includeLLMAnalysis}`;
    const pending = this.pendingLookups.get(coalescingKey);
    if (pending) {
      logger.debug({ ip }, 'Coalescing with in-flight lookup');
      return pending;
    }

    const lookupPromise = this.executeProviderLookup(ip, includeLLMAnalysis);
    this.pendingLookups.set(coalescingKey, lookupPromise);

    try {
      return await lookupPromise;
    } finally {
      this.pendingLookups.delete(coalescingKey);
    }
  }

  /**
   * Execute the provider query, correlation, and persistence steps.
   * Separated from lookup() so request coalescing can wrap it.
   */
  private async executeProviderLookup(
    ip: string,
    includeLLMAnalysis: boolean
  ): Promise<CorrelatedIpRecord> {
    // Query providers
    const providerResults = await this.providerManager.queryAll(
      ip,
      this.globalTimeoutMs
    );

    // Track provider stats
    await this.trackProviderStats(providerResults);

    // Check if we got any successful results
    const successfulResults = providerResults.filter((r) => r.success);
    if (successfulResults.length === 0) {
      throw new Error('All providers failed or timed out');
    }

    // Correlate results
    let correlatedRecord = this.correlation.correlate(
      ip,
      providerResults,
      'live',
      this.cacheTtlSeconds
    );

    // Add LLM analysis if enabled
    if (includeLLMAnalysis && this.llmEnabled) {
      correlatedRecord = await this.addLLMAnalysis(correlatedRecord);
    }

    // Save to cache and database
    await Promise.all([
      this.cache.set(ip, correlatedRecord),
      this.database.saveIpRecord(correlatedRecord),
    ]);

    logger.info({ ip, providers: successfulResults.length }, 'Live lookup completed');

    return correlatedRecord;
  }

  /**
   * Add LLM analysis to a correlated record
   */
  private async addLLMAnalysis(record: CorrelatedIpRecord): Promise<CorrelatedIpRecord> {
    try {
      const analysis = await this.llmAnalysis.analyzeIP(record);
      if (analysis) {
        return {
          ...record,
          metadata: {
            ...record.metadata,
            llmAnalysis: analysis as unknown as LLMAnalysis,
          },
        };
      }
    } catch (error) {
      logger.warn({ error, ip: record.ip }, 'LLM analysis failed, continuing without');
    }
    return record;
  }

  /**
   * Bulk lookup multiple IP addresses
   */
  async bulkLookup(
    ips: string[],
    forceRefresh = false,
    includeLLMAnalysis = false,
    concurrency = 5
  ): Promise<BulkLookupResponse> {
    const startTime = Date.now();
    const limiter = pLimit(concurrency);

    const results: BulkLookupResult[] = await Promise.all(
      ips.map((ip) =>
        limiter(async () => {
          try {
            const data = await this.lookup(ip, forceRefresh, includeLLMAnalysis);
            return {
              ip,
              success: true,
              data,
            };
          } catch (error) {
            return {
              ip,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          }
        })
      )
    );

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return {
      results,
      summary: {
        total: ips.length,
        successful,
        failed,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Get cached record if exists (for polling async jobs)
   */
  async getCached(ip: string): Promise<CorrelatedIpRecord | null> {
    const normalized = validateAndNormalizeIp(ip);

    // Try cache first
    const cached = await this.cache.get(normalized);
    if (cached) return cached;

    // Try database
    const dbRecord = await this.database.getIpRecord(normalized);
    if (dbRecord) {
      // Populate cache
      await this.cache.set(normalized, dbRecord);
      return dbRecord;
    }

    return null;
  }

  /**
   * Clear cache for a specific IP
   */
  async clearCache(ip: string): Promise<void> {
    const normalized = validateAndNormalizeIp(ip);
    await this.cache.delete(normalized);
  }

  /**
   * Get provider health status
   */
  getProvidersHealth(): ReturnType<ProviderManager['getProvidersHealth']> {
    return this.providerManager.getProvidersHealth();
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<{
    redis: { status: 'up' | 'down'; latencyMs?: number };
    postgres: { status: 'up' | 'down'; latencyMs?: number };
    providers: { available: number; healthy: number };
    llm: { status: 'up' | 'down'; model: string; latencyMs?: number };
  }> {
    const [redisHealth, postgresHealth, llmHealth] = await Promise.all([
      this.cache.healthCheck(),
      this.database.healthCheck(),
      this.llmAnalysis.getHealthStatus(),
    ]);

    const providersHealth = this.providerManager.getProvidersHealth();
    const healthyProviders = providersHealth.filter((p) => p.healthy).length;

    return {
      redis: redisHealth,
      postgres: postgresHealth,
      providers: {
        available: providersHealth.length,
        healthy: healthyProviders,
      },
      llm: {
        status: llmHealth.available ? 'up' : 'down',
        model: llmHealth.model,
        latencyMs: llmHealth.latencyMs,
      },
    };
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<ReturnType<CacheService['getStats']>> {
    return this.cache.getStats();
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<ReturnType<DatabaseService['getStats']>> {
    return this.database.getStats();
  }

  /**
   * Cleanup expired database records
   */
  async cleanupExpired(): Promise<number> {
    return this.database.cleanupExpired();
  }

  /**
   * Get activity stats (lookup counts by hour for last 24h)
   */
  async getActivityStats(): Promise<
    Array<{ hour: string; lookups: number; cached: number }>
  > {
    return this.database.getActivityStats();
  }

  /**
   * Get threat level distribution
   */
  async getThreatDistribution(): Promise<{
    high: number;
    medium: number;
    low: number;
    unknown: number;
  }> {
    return this.database.getThreatDistribution();
  }

  /**
   * Get all provider stats
   */
  async getAllProviderStats(
    days = 7
  ): Promise<
    Array<{
      provider: string;
      successRate: number;
      avgLatencyMs: number;
      totalRequests: number;
      successCount: number;
      failureCount: number;
    }>
  > {
    return this.database.getAllProviderStats(days);
  }

  /**
   * Get the provider manager (for streaming lookups)
   */
  getProviderManager(): ProviderManager {
    return this.providerManager;
  }

  /**
   * Get the correlation service (for streaming lookups)
   */
  getCorrelationService(): CorrelationService {
    return this.correlation;
  }

  /**
   * Get cache TTL seconds
   */
  getCacheTtlSeconds(): number {
    return this.cacheTtlSeconds;
  }

  /**
   * Get global timeout ms
   */
  getGlobalTimeoutMs(): number {
    return this.globalTimeoutMs;
  }

  /**
   * Check if LLM is enabled
   */
  isLlmEnabled(): boolean {
    return this.llmEnabled;
  }

  /**
   * Save result to cache and database
   */
  async saveResult(ip: string, record: CorrelatedIpRecord): Promise<void> {
    await Promise.all([
      this.cache.set(ip, record),
      this.database.saveIpRecord(record),
    ]);
  }

  /**
   * Track provider statistics in database
   */
  private async trackProviderStats(
    results: ProviderResult[]
  ): Promise<void> {
    const promises = results.map((result) =>
      this.database.updateProviderStats(
        result.provider,
        result.success,
        result.latencyMs,
        result.error
      )
    );

    await Promise.all(promises).catch((error) => {
      logger.error({ error }, 'Failed to track provider stats');
    });
  }

  /**
   * Get provider statistics from database
   */
  async getProviderStats(
    provider: string,
    days = 7
  ): Promise<{
    successRate: number;
    avgLatencyMs: number;
    totalRequests: number;
  }> {
    return this.database.getProviderStats(provider, days);
  }
}
