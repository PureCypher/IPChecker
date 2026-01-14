import { PrismaClient, Prisma } from '@prisma/client';
import type { CorrelatedIpRecord, Flags, Threat, ProviderResult, ConflictReport } from '@ipintel/shared';
import { hashObject, calculateTtl, isExpired } from '../utils/helpers.js';
import { getEnvNumber } from '../utils/helpers.js';
import { logger } from '../config/logger.js';

/**
 * Database service for PostgreSQL operations
 */
export class DatabaseService {
  private prisma: PrismaClient;
  private readonly cacheTtlSeconds: number;

  constructor() {
    this.prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'error', 'warn']
          : ['error'],
    });

    // Default: 30 days
    this.cacheTtlSeconds = getEnvNumber('CACHE_TTL_SECONDS', 2592000);
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
          flags: record.flags as Prisma.InputJsonValue,
          threat: record.threat as Prisma.InputJsonValue,
          providers: record.metadata.providers as Prisma.InputJsonValue,
          conflicts: record.metadata.conflicts as Prisma.InputJsonValue,
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
          flags: record.flags as Prisma.InputJsonValue,
          threat: record.threat as Prisma.InputJsonValue,
          providers: record.metadata.providers as Prisma.InputJsonValue,
          conflicts: record.metadata.conflicts as Prisma.InputJsonValue,
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

      const totalSuccess = stats.reduce((sum, s) => sum + s.successCount, 0);
      const totalFailure = stats.reduce((sum, s) => sum + s.failureCount, 0);
      const totalRequests = totalSuccess + totalFailure;

      const successRate =
        totalRequests > 0 ? totalSuccess / totalRequests : 0;

      const avgLatencies = stats
        .filter((s) => s.avgLatencyMs !== null)
        .map((s) => s.avgLatencyMs!);
      const avgLatencyMs =
        avgLatencies.length > 0
          ? avgLatencies.reduce((sum, l) => sum + l, 0) / avgLatencies.length
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
}
