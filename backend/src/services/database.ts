import { PrismaClient } from '@prisma/client';
import type { InputJsonValue } from '@prisma/client/runtime/library';
import type { CorrelatedIpRecord, Flags, Threat, ProviderResult, ConflictReport } from '@ipintel/shared';
import { hashObject, calculateTtl, isExpired } from '../utils/helpers.js';
import { logger } from '../config/logger.js';

/**
 * Database service for PostgreSQL operations
 */
export class DatabaseService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'error', 'warn']
          : ['error'],
    });
  }

  /**
   * Connect to database
   */
  async connect(): Promise<void> {
    await this.prisma.$connect();
    logger.info('Connected to PostgreSQL');
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /**
   * Get IP record from database
   */
  async getIpRecord(ip: string): Promise<CorrelatedIpRecord | null> {
    try {
      const record = await this.prisma.ipRecord.findUnique({
        where: { ip },
      });

      if (!record) return null;

      // Check if record is expired
      if (isExpired(record.expiresAt)) {
        return null;
      }

      // Convert to CorrelatedIpRecord format
      const correlated: CorrelatedIpRecord = {
        ip: record.ip,
        asn: record.asn || undefined,
        org: record.org || undefined,
        location: {
          country: record.country || undefined,
          region: record.region || undefined,
          city: record.city || undefined,
          coordinates:
            record.latitude && record.longitude
              ? {
                  lat: parseFloat(record.latitude.toString()),
                  lon: parseFloat(record.longitude.toString()),
                }
              : undefined,
          timezone: record.timezone || undefined,
        },
        flags: record.flags as Flags,
        threat: record.threat as Threat,
        metadata: {
          providers: record.providers as ProviderResult[],
          conflicts: record.conflicts as ConflictReport[] | undefined,
          source: 'db',
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
          expiresAt: record.expiresAt.toISOString(),
          ttlSeconds: calculateTtl(record.expiresAt),
        },
      };

      return correlated;
    } catch (error) {
      logger.error({ error, ip }, 'Database get error');
      return null;
    }
  }

  /**
   * Save IP record to database
   */
  async saveIpRecord(record: CorrelatedIpRecord): Promise<void> {
    try {
      const hash = hashObject({
        asn: record.asn,
        org: record.org,
        location: record.location,
        flags: record.flags,
        threat: record.threat,
      });

      const expiresAt = new Date(record.metadata.expiresAt);

      await this.prisma.ipRecord.upsert({
        where: { ip: record.ip },
        create: {
          ip: record.ip,
          asn: record.asn,
          org: record.org,
          country: record.location.country,
          region: record.location.region,
          city: record.location.city,
          latitude: record.location.coordinates?.lat,
          longitude: record.location.coordinates?.lon,
          timezone: record.location.timezone,
          flags: record.flags as InputJsonValue,
          threat: record.threat as InputJsonValue,
          providers: record.metadata.providers as InputJsonValue,
          conflicts: record.metadata.conflicts as InputJsonValue,
          source: record.metadata.source,
          hash,
          expiresAt,
        },
        update: {
          asn: record.asn,
          org: record.org,
          country: record.location.country,
          region: record.location.region,
          city: record.location.city,
          latitude: record.location.coordinates?.lat,
          longitude: record.location.coordinates?.lon,
          timezone: record.location.timezone,
          flags: record.flags as InputJsonValue,
          threat: record.threat as InputJsonValue,
          providers: record.metadata.providers as InputJsonValue,
          conflicts: record.metadata.conflicts as InputJsonValue,
          source: record.metadata.source,
          hash,
          expiresAt,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error({ error, ip: record.ip }, 'Database save error');
      throw error;
    }
  }

  /**
   * Delete IP record from database
   */
  async deleteIpRecord(ip: string): Promise<void> {
    try {
      await this.prisma.ipRecord.delete({
        where: { ip },
      });
    } catch (error) {
      logger.error({ error, ip }, 'Database delete error');
    }
  }

  /**
   * Clean up expired records (run as cron job)
   */
  async cleanupExpired(): Promise<number> {
    try {
      // Delete records expired more than 7 days ago (grace period)
      const gracePeriod = new Date();
      gracePeriod.setDate(gracePeriod.getDate() - 7);

      const result = await this.prisma.ipRecord.deleteMany({
        where: {
          expiresAt: {
            lt: gracePeriod,
          },
        },
      });

      logger.info({ count: result.count }, 'Cleaned up expired IP records');
      return result.count;
    } catch (error) {
      logger.error({ error }, 'Database cleanup error');
      return 0;
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalRecords: number;
    expiredRecords: number;
    recentRecords: number;
  }> {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [totalRecords, expiredRecords, recentRecords] = await Promise.all([
        this.prisma.ipRecord.count(),
        this.prisma.ipRecord.count({
          where: { expiresAt: { lt: now } },
        }),
        this.prisma.ipRecord.count({
          where: { createdAt: { gte: oneDayAgo } },
        }),
      ]);

      return {
        totalRecords,
        expiredRecords,
        recentRecords,
      };
    } catch (error) {
      logger.error({ error }, 'Database getStats error');
      return {
        totalRecords: 0,
        expiredRecords: 0,
        recentRecords: 0,
      };
    }
  }

  /**
   * Check database health
   */
  async healthCheck(): Promise<{ status: 'up' | 'down'; latencyMs?: number }> {
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - start;

      return { status: 'up', latencyMs };
    } catch (error) {
      return { status: 'down' };
    }
  }

  /**
   * Update provider statistics
   */
  async updateProviderStats(
    provider: string,
    success: boolean,
    latencyMs: number,
    error?: string
  ): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await this.prisma.providerStat.upsert({
        where: {
          provider_date: {
            provider,
            date: today,
          },
        },
        create: {
          provider,
          date: today,
          successCount: success ? 1 : 0,
          failureCount: success ? 0 : 1,
          timeoutCount: error?.includes('timeout') ? 1 : 0,
          avgLatencyMs: latencyMs,
          p95LatencyMs: latencyMs,
          lastError: error,
        },
        update: {
          successCount: success ? { increment: 1 } : undefined,
          failureCount: success ? undefined : { increment: 1 },
          timeoutCount: error?.includes('timeout') ? { increment: 1 } : undefined,
          lastError: error,
          // TODO: Proper p95 calculation with histogram
        },
      });
    } catch (error) {
      logger.error({ error, provider }, 'Failed to update provider stats');
    }
  }

  /**
   * Get provider statistics
   */
  async getProviderStats(
    provider: string,
    days = 7
  ): Promise<{
    successRate: number;
    avgLatencyMs: number;
    totalRequests: number;
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const stats = await this.prisma.providerStat.findMany({
        where: {
          provider,
          date: { gte: startDate },
        },
      });

      if (stats.length === 0) {
        return { successRate: 0, avgLatencyMs: 0, totalRequests: 0 };
      }

      const totalSuccess = stats.reduce((sum: number, s: { successCount: number }) => sum + s.successCount, 0);
      const totalFailure = stats.reduce((sum: number, s: { failureCount: number }) => sum + s.failureCount, 0);
      const totalRequests = totalSuccess + totalFailure;

      const successRate =
        totalRequests > 0 ? totalSuccess / totalRequests : 0;

      const avgLatencies = stats
        .filter((s: { avgLatencyMs: number | null }) => s.avgLatencyMs !== null)
        .map((s: { avgLatencyMs: number | null }) => s.avgLatencyMs!);
      const avgLatencyMs =
        avgLatencies.length > 0
          ? avgLatencies.reduce((sum: number, l: number) => sum + l, 0) / avgLatencies.length
          : 0;

      return {
        successRate,
        avgLatencyMs,
        totalRequests,
      };
    } catch (error) {
      logger.error({ error, provider }, 'Failed to get provider stats');
      return { successRate: 0, avgLatencyMs: 0, totalRequests: 0 };
    }
  }

  /**
   * Get lookup activity grouped by hour for the last 24 hours
   */
  async getActivityStats(): Promise<
    Array<{ hour: string; lookups: number; cached: number }>
  > {
    try {
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get all records created in the last 24 hours
      const records = await this.prisma.ipRecord.findMany({
        where: {
          createdAt: { gte: twentyFourHoursAgo },
        },
        select: {
          createdAt: true,
          source: true,
        },
      });

      // Group by hour
      const hourMap = new Map<string, { lookups: number; cached: number }>();

      // Initialize all 24 hours with zeros
      for (let i = 23; i >= 0; i--) {
        const hourDate = new Date(now.getTime() - i * 60 * 60 * 1000);
        const hourKey = `${hourDate.getHours().toString().padStart(2, '0')}:00`;
        hourMap.set(hourKey, { lookups: 0, cached: 0 });
      }

      // Populate with actual data
      for (const record of records) {
        const hourKey = `${record.createdAt.getHours().toString().padStart(2, '0')}:00`;
        const entry = hourMap.get(hourKey);
        if (entry) {
          entry.lookups++;
          if (record.source === 'cache' || record.source === 'db') {
            entry.cached++;
          }
        }
      }

      return Array.from(hourMap.entries()).map(([hour, data]) => ({
        hour,
        lookups: data.lookups,
        cached: data.cached,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to get activity stats');
      return [];
    }
  }

  /**
   * Get threat level distribution across all stored IP records
   */
  async getThreatDistribution(): Promise<{
    high: number;
    medium: number;
    low: number;
    unknown: number;
  }> {
    try {
      const records = await this.prisma.ipRecord.findMany({
        select: {
          threat: true,
        },
      });

      const distribution = { high: 0, medium: 0, low: 0, unknown: 0 };

      for (const record of records) {
        const threat = record.threat as { riskLevel?: string } | null;
        const level = threat?.riskLevel;
        if (level === 'high') distribution.high++;
        else if (level === 'medium') distribution.medium++;
        else if (level === 'low') distribution.low++;
        else distribution.unknown++;
      }

      return distribution;
    } catch (error) {
      logger.error({ error }, 'Failed to get threat distribution');
      return { high: 0, medium: 0, low: 0, unknown: 0 };
    }
  }

  /**
   * Get all provider stats (success rates and latencies) for the last N days
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
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const stats = await this.prisma.providerStat.findMany({
        where: {
          date: { gte: startDate },
        },
      });

      // Group by provider
      const providerMap = new Map<
        string,
        { success: number; failure: number; latencies: number[] }
      >();

      for (const stat of stats) {
        const existing = providerMap.get(stat.provider) || {
          success: 0,
          failure: 0,
          latencies: [],
        };
        existing.success += stat.successCount;
        existing.failure += stat.failureCount;
        if (stat.avgLatencyMs !== null) {
          existing.latencies.push(stat.avgLatencyMs);
        }
        providerMap.set(stat.provider, existing);
      }

      return Array.from(providerMap.entries()).map(([provider, data]) => {
        const total = data.success + data.failure;
        const avgLatency =
          data.latencies.length > 0
            ? data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length
            : 0;

        return {
          provider,
          successRate: total > 0 ? data.success / total : 0,
          avgLatencyMs: Math.round(avgLatency),
          totalRequests: total,
          successCount: data.success,
          failureCount: data.failure,
        };
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get all provider stats');
      return [];
    }
  }
}
