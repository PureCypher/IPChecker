import 'dotenv/config';
import { getEnvNumber, getEnvString, getEnvBoolean } from '../utils/helpers.js';

/**
 * Application configuration loaded from environment variables
 */
export const config = {
  // Server
  nodeEnv: getEnvString('NODE_ENV', 'development'),
  port: getEnvNumber('PORT', 3000),
  host: getEnvString('HOST', '0.0.0.0'),

  // Database
  databaseUrl: getEnvString(
    'DATABASE_URL',
    'postgresql://postgres:postgres@localhost:5432/ipintel'
  ),
  redisUrl: getEnvString('REDIS_URL', 'redis://localhost:6379'),

  // Admin
  adminApiKey: getEnvString('ADMIN_API_KEY', 'change-me-in-production'),

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
