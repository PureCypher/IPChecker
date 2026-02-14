import Redis from 'ioredis';
import type { CorrelatedIpRecord } from '@ipintel/shared';
import { getEnvNumber, getEnvString } from '../utils/helpers.js';
import { logger } from '../config/logger.js';

/**
 * Redis cache service with 30-day TTL
 */
export class CacheService {
  private redis: Redis;
  private readonly cacheTtlSeconds: number;
  private readonly refreshThresholdSeconds: number;

  constructor() {
    const redisUrl = getEnvString('REDIS_URL', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
    });

    // Default: 30 days (2592000 seconds)
    this.cacheTtlSeconds = getEnvNumber('CACHE_TTL_SECONDS', 2592000);

    // Default: 25 days (2160000 seconds)
    this.refreshThresholdSeconds = getEnvNumber(
      'CACHE_REFRESH_THRESHOLD_SECONDS',
      2160000
    );

    this.redis.on('error', (error) => {
      logger.error({ error }, 'Redis connection error');
    });

    this.redis.on('connect', () => {
      logger.info('Connected to Redis');
    });
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (this.redis.status !== 'ready') {
      await this.redis.connect();
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Get cache key for an IP address
   */
  private getCacheKey(ip: string): string {
    return `ipintel:v1:${ip}`;
  }

  /**
   * Get IP record from cache
   */
  async get(ip: string): Promise<CorrelatedIpRecord | null> {
    try {
      const key = this.getCacheKey(ip);
      const data = await this.redis.get(key);

      if (!data) return null;

      const record = JSON.parse(data) as CorrelatedIpRecord;

      // Check TTL and refresh if needed
      const ttl = await this.redis.ttl(key);

      // If TTL is less than threshold, mark for background refresh
      if (ttl > 0 && ttl < this.refreshThresholdSeconds) {
        // Extend TTL to full 30 days
        await this.redis.expire(key, this.cacheTtlSeconds);

        // Update metadata
        record.metadata.ttlSeconds = this.cacheTtlSeconds;
      } else if (ttl > 0) {
        // Update TTL in metadata
        record.metadata.ttlSeconds = ttl;
      }

      // Update source to cache
      record.metadata.source = 'cache';

      return record;
    } catch (error) {
      logger.error({ error, ip }, 'Cache get error');
      return null;
    }
  }

  /**
   * Set IP record in cache
   */
  async set(ip: string, record: CorrelatedIpRecord): Promise<void> {
    try {
      const key = this.getCacheKey(ip);
      const data = JSON.stringify(record);

      await this.redis.setex(key, this.cacheTtlSeconds, data);
    } catch (error) {
      logger.error({ error, ip }, 'Cache set error');
      // Don't throw - cache failures shouldn't break the app
    }
  }

  /**
   * Delete IP record from cache
   */
  async delete(ip: string): Promise<void> {
    try {
      const key = this.getCacheKey(ip);
      await this.redis.del(key);
    } catch (error) {
      logger.error({ error, ip }, 'Cache delete error');
    }
  }

  /**
   * Check if cache entry exists
   */
  async exists(ip: string): Promise<boolean> {
    try {
      const key = this.getCacheKey(ip);
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error({ error, ip }, 'Cache exists error');
      return false;
    }
  }

  /**
   * Get TTL for cache entry
   */
  async getTtl(ip: string): Promise<number | null> {
    try {
      const key = this.getCacheKey(ip);
      const ttl = await this.redis.ttl(key);

      if (ttl === -2) return null; // Key doesn't exist
      if (ttl === -1) return null; // Key has no expiration

      return ttl;
    } catch (error) {
      logger.error({ error, ip }, 'Cache getTtl error');
      return null;
    }
  }

  /**
   * Check Redis health
   */
  async healthCheck(): Promise<{ status: 'up' | 'down'; latencyMs?: number }> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latencyMs = Date.now() - start;

      return { status: 'up', latencyMs };
    } catch (error) {
      return { status: 'down' };
    }
  }

  /**
   * Count keys using SCAN (non-blocking alternative to KEYS)
   */
  private async countKeysWithScan(pattern: string): Promise<number> {
    let cursor = '0';
    let count = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      count += keys.length;
    } while (cursor !== '0');

    return count;
  }

  /**
   * Get all keys using SCAN (non-blocking alternative to KEYS)
   */
  private async getKeysWithScan(pattern: string): Promise<string[]> {
    let cursor = '0';
    const allKeys: string[] = [];

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      allKeys.push(...keys);
    } while (cursor !== '0');

    return allKeys;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    keys: number;
    memory: string;
    hits: number;
    misses: number;
  }> {
    try {
      const info = await this.redis.info('stats');
      const memory = await this.redis.info('memory');

      // Parse info strings
      const statsMatch = info.match(/keyspace_hits:(\d+)/);
      const missesMatch = info.match(/keyspace_misses:(\d+)/);
      const memoryMatch = memory.match(/used_memory_human:(\S+)/);

      // Count keys with our prefix using SCAN (non-blocking)
      const keyCount = await this.countKeysWithScan('ipintel:v1:*');

      return {
        keys: keyCount,
        memory: memoryMatch ? memoryMatch[1] ?? 'unknown' : 'unknown',
        hits: statsMatch ? parseInt(statsMatch[1] ?? '0') : 0,
        misses: missesMatch ? parseInt(missesMatch[1] ?? '0') : 0,
      };
    } catch (error) {
      logger.error({ error }, 'Cache getStats error');
      return { keys: 0, memory: 'unknown', hits: 0, misses: 0 };
    }
  }

  /**
   * Clear all cache entries (for testing/admin)
   */
  async clear(): Promise<void> {
    try {
      // Use SCAN to get keys non-blocking
      const keys = await this.getKeysWithScan('ipintel:v1:*');
      if (keys.length > 0) {
        // Delete in batches to avoid blocking
        const batchSize = 100;
        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, i + batchSize);
          await this.redis.del(...batch);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Cache clear error');
    }
  }
}
