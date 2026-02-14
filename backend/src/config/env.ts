import 'dotenv/config';
import { getEnvNumber, getEnvString, getEnvBoolean } from '../utils/helpers.js';

const MIN_ADMIN_KEY_LENGTH = 32;

/**
 * Validate the admin API key based on the current environment.
 *
 * - Production: ADMIN_API_KEY must be set and at least 32 characters.
 *   The server will refuse to start otherwise.
 * - Development: A shorter key is allowed, but a warning is logged
 *   if the key is weak or missing.
 */
function validateAdminApiKey(nodeEnv: string): string {
  const key = process.env['ADMIN_API_KEY'];

  if (nodeEnv === 'production') {
    if (!key) {
      throw new Error(
        'ADMIN_API_KEY environment variable is required in production. ' +
          'Generate one with: openssl rand -base64 32'
      );
    }
    if (key.length < MIN_ADMIN_KEY_LENGTH) {
      throw new Error(
        `ADMIN_API_KEY must be at least ${MIN_ADMIN_KEY_LENGTH} characters in production ` +
          `(current length: ${key.length}). Generate one with: openssl rand -base64 32`
      );
    }
    return key;
  }

  // Non-production environments
  if (!key) {
    console.warn(
      '[SECURITY WARNING] ADMIN_API_KEY is not set. ' +
        'Admin endpoints will be inaccessible. ' +
        'Set ADMIN_API_KEY in your .env file (generate with: openssl rand -base64 32).'
    );
    // Return empty string - admin routes will always reject since no key can match
    return '';
  }

  if (key.length < MIN_ADMIN_KEY_LENGTH) {
    console.warn(
      `[SECURITY WARNING] ADMIN_API_KEY is only ${key.length} characters. ` +
        `A minimum of ${MIN_ADMIN_KEY_LENGTH} characters is recommended. ` +
        'Generate a strong key with: openssl rand -base64 32'
    );
  }

  return key;
}

const nodeEnv = getEnvString('NODE_ENV', 'development');

/**
 * Validate that DATABASE_URL is configured.
 *
 * - Production: DATABASE_URL must be set explicitly. The server will
 *   refuse to start without it to prevent accidental use of default
 *   credentials.
 * - Development: Falls back to a local default but logs a warning so
 *   developers are aware the variable is missing.
 */
function validateDatabaseUrl(env: string): string {
  const url = process.env['DATABASE_URL'];

  if (env === 'production') {
    if (!url) {
      throw new Error(
        'DATABASE_URL environment variable is required in production. ' +
          'Example: postgresql://postgres:<password>@db:5432/ipintel'
      );
    }
    return url;
  }

  // Non-production environments
  if (!url) {
    console.warn(
      '[SECURITY WARNING] DATABASE_URL is not set. ' +
        'Falling back to default local credentials (postgresql://postgres:postgres@localhost:5432/ipintel). ' +
        'Set DATABASE_URL in your .env file for production use.'
    );
    return 'postgresql://postgres:postgres@localhost:5432/ipintel';
  }

  return url;
}

/**
 * Validate that REDIS_URL is configured.
 *
 * - Production: REDIS_URL must be set explicitly. The server will
 *   refuse to start without it to prevent running against an
 *   unauthenticated Redis instance.
 * - Development: Falls back to a local default but logs a warning.
 */
function validateRedisUrl(env: string): string {
  const url = process.env['REDIS_URL'];

  if (env === 'production') {
    if (!url) {
      throw new Error(
        'REDIS_URL environment variable is required in production. ' +
          'Example: redis://:<password>@redis:6379'
      );
    }
    return url;
  }

  // Non-production environments
  if (!url) {
    console.warn(
      '[SECURITY WARNING] REDIS_URL is not set. ' +
        'Falling back to default local Redis (redis://localhost:6379). ' +
        'Set REDIS_URL in your .env file for production use.'
    );
    return 'redis://localhost:6379';
  }

  return url;
}

/**
 * Application configuration loaded from environment variables
 */
export const config = {
  // Server
  nodeEnv,
  port: getEnvNumber('PORT', 3000),
  host: getEnvString('HOST', '0.0.0.0'),

  // Database
  databaseUrl: validateDatabaseUrl(nodeEnv),
  redisUrl: validateRedisUrl(nodeEnv),

  // Admin
  adminApiKey: validateAdminApiKey(nodeEnv),

  // API Key Authentication
  // Default: required in production, optional in development
  requireApiKey: getEnvBoolean(
    'REQUIRE_API_KEY',
    nodeEnv === 'production'
  ),

  // Caching
  cacheTtlSeconds: getEnvNumber('CACHE_TTL_SECONDS', 2592000), // 30 days
  cacheRefreshThresholdSeconds: getEnvNumber(
    'CACHE_REFRESH_THRESHOLD_SECONDS',
    2160000
  ), // 25 days

  // Providers
  lookupGlobalTimeoutMs: getEnvNumber('LOOKUP_GLOBAL_TIMEOUT_MS', 5000),
  providerConcurrency: getEnvNumber('PROVIDER_CONCURRENCY', 4),
  providerTimeoutMs: getEnvNumber('PROVIDER_TIMEOUT_MS', 3000),
  providerRetries: getEnvNumber('PROVIDER_RETRIES', 2),
  providerRetryDelayMs: getEnvNumber('PROVIDER_RETRY_DELAY_MS', 500),

  // Rate Limiting
  rateLimitPerMinute: getEnvNumber('RATE_LIMIT_PER_MINUTE', 60),
  rateLimitBurst: getEnvNumber('RATE_LIMIT_BURST', 10),
  rateLimitBlockDuration: getEnvNumber('RATE_LIMIT_BLOCK_DURATION', 300),

  // High Load Detection
  highLoadEventLoopLagMs: getEnvNumber('HIGH_LOAD_EVENT_LOOP_LAG_MS', 50),
  highLoadP95LatencyMs: getEnvNumber('HIGH_LOAD_P95_LATENCY_MS', 800),
  highLoadRedisPoolUsagePct: getEnvNumber(
    'HIGH_LOAD_REDIS_POOL_USAGE_PCT',
    80
  ),
  highLoadPostgresConnections: getEnvNumber(
    'HIGH_LOAD_POSTGRES_CONNECTIONS',
    18
  ),
  highLoadPendingJobs: getEnvNumber('HIGH_LOAD_PENDING_JOBS', 100),

  // Circuit Breaker
  circuitBreakerFailureThreshold: getEnvNumber(
    'CIRCUIT_BREAKER_FAILURE_THRESHOLD',
    5
  ),
  circuitBreakerResetTimeoutMs: getEnvNumber(
    'CIRCUIT_BREAKER_RESET_TIMEOUT_MS',
    60000
  ),
  circuitBreakerHalfOpenAttempts: getEnvNumber(
    'CIRCUIT_BREAKER_HALF_OPEN_ATTEMPTS',
    1
  ),

  // CORS
  corsOrigin: getEnvString('CORS_ORIGIN', ''),

  // Logging
  logLevel: getEnvString('LOG_LEVEL', 'info'),
  logPretty: getEnvBoolean('LOG_PRETTY', false),

  // Observability
  sentryDsn: getEnvString('SENTRY_DSN', ''),
  sentryEnvironment: getEnvString('SENTRY_ENVIRONMENT', 'production'),

  // App metadata
  appName: getEnvString('PUBLIC_APP_NAME', 'IP Intelligence Correlator'),
  appVersion: '1.0.0',
} as const;

export type Config = typeof config;
