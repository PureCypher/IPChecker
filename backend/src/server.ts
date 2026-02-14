import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import fastifyApiReference from '@scalar/fastify-api-reference';
import { config } from './config/env.js';
import { initSentry, captureException, addBreadcrumb } from './config/sentry.js';
import { IpLookupService } from './services/ip-lookup.js';
import { lookupRoutes } from './routes/lookup.js';
import { healthRoutes } from './routes/health.js';
import { adminRoutes } from './routes/admin.js';
import { statsRoutes } from './routes/stats.js';
import { streamingLookupRoutes } from './routes/streaming-lookup.js';
import { metricsRoutes } from './routes/metrics.js';
import { metrics } from './utils/metrics.js';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Main server application
 */
async function main() {
  const startTime = Date.now();

  // Initialize Sentry early, before anything else
  await initSentry();

  // Initialize Fastify
  const fastify = Fastify({
    logger: true,
    requestIdLogLabel: 'reqId',
    disableRequestLogging: false,
    trustProxy: true,
  });

  // Initialize IP Lookup Service
  const ipLookupService = new IpLookupService();
  await ipLookupService.initialize();

  // CORS
  const corsOrigin: boolean | string[] = (() => {
    if (config.nodeEnv === 'production') {
      if (config.corsOrigin) {
        return config.corsOrigin.split(',').map((o) => o.trim());
      }
      fastify.log.warn(
        'CORS_ORIGIN is not set in production — CORS is disabled. Set CORS_ORIGIN to allow cross-origin requests.'
      );
      return false;
    }
    return true; // Allow all origins in development
  })();

  await fastify.register(cors, {
    origin: corsOrigin,
    credentials: true,
  });

  // Rate Limiting
  await fastify.register(rateLimit, {
    global: true,
    max: config.rateLimitPerMinute,
    timeWindow: '1 minute',
    ban: config.rateLimitBurst,
    cache: 10000,
    allowList: ['127.0.0.1'],
    errorResponseBuilder: (_request, context) => {
      return {
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Try again in ${context.after}`,
        retryAfter: context.after,
      };
    },
  });

  // Swagger/OpenAPI
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: config.appName,
        description:
          'Production-grade IP intelligence platform with multi-provider aggregation',
        version: config.appVersion,
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Development server',
        },
      ],
      tags: [
        { name: 'lookup', description: 'IP lookup operations' },
        { name: 'health', description: 'Health check endpoints' },
        { name: 'admin', description: 'Admin operations (requires API key)' },
      ],
      components: {
        securitySchemes: {
          adminKey: {
            type: 'apiKey',
            name: 'X-Admin-Key',
            in: 'header',
            description: 'Admin API key for protected endpoints',
          },
          apiKey: {
            type: 'apiKey',
            name: 'X-API-Key',
            in: 'header',
            description: 'API key for lookup endpoints (also accepted as ?api_key= query parameter)',
          },
        },
      },
    },
  });

  // Scalar API Documentation (modern alternative to Swagger UI)
  await fastify.register(fastifyApiReference, {
    routePrefix: '/api/docs',
    configuration: {
      title: `${config.appName} API`,
      theme: 'purple',
      darkMode: true,
      layout: 'modern',
    },
  });

  // Security headers
  fastify.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
    // CSP that allows map tiles, inline styles (for CSS-in-JS libraries like goober), and API connections
    reply.header(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'", // Required for CSS-in-JS (goober, etc.)
        "img-src 'self' data: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://tile.openstreetmap.org blob:",
        "connect-src 'self' https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com",
        "font-src 'self' data:",
        "frame-ancestors 'none'",
      ].join('; ')
    );
  });

  // ---- Prometheus metrics hooks ----
  // Store request start time so we can compute duration in onResponse
  fastify.addHook('onRequest', async (request) => {
    (request as any).__metricsStart = process.hrtime.bigint();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const startNs: bigint | undefined = (request as any).__metricsStart;
    if (startNs !== undefined) {
      const durationSec =
        Number(process.hrtime.bigint() - startNs) / 1_000_000_000;

      // Normalise the path to avoid high-cardinality label explosion
      const path = request.routeOptions?.url ?? request.url;
      const method = request.method;
      const status = String(reply.statusCode);

      metrics.incCounter('ipintel_requests_total', { method, path, status });
      metrics.observeHistogram(
        'ipintel_request_duration_seconds',
        { method, path },
        durationSec
      );
    }
  });

  // ---- Sentry error handler ----
  fastify.setErrorHandler((error, request, reply) => {
    // Attach request context as a Sentry breadcrumb
    addBreadcrumb({
      category: 'http',
      message: `${request.method} ${request.url}`,
      level: 'error',
      data: {
        method: request.method,
        url: request.url,
        ip: request.ip,
        statusCode: error.statusCode ?? 500,
      },
    });

    // Send the error to Sentry
    captureException(error, {
      method: request.method,
      url: request.url,
      ip: request.ip,
    });

    // Let Fastify handle the HTTP response as normal
    const statusCode = error.statusCode ?? 500;
    request.log.error(error);
    reply.code(statusCode).send({
      error: error.name ?? 'Internal Server Error',
      code: (error as any).code ?? 'INTERNAL_ERROR',
      message:
        statusCode >= 500
          ? 'An internal server error occurred'
          : error.message,
    });
  });

  // Register routes
  await fastify.register(lookupRoutes, {
    prefix: '/api/v1',
    ipLookupService,
  });

  await fastify.register(healthRoutes, {
    prefix: '/api',
    ipLookupService,
    startTime,
  });

  await fastify.register(adminRoutes, {
    prefix: '/api/v1',
    ipLookupService,
  });

  await fastify.register(statsRoutes, {
    prefix: '/api/v1',
    ipLookupService,
  });

  await fastify.register(streamingLookupRoutes, {
    prefix: '/api/v1',
    ipLookupService,
  });

  // Metrics endpoint (no auth, no prefix — exposed at /metrics)
  await fastify.register(metricsRoutes);

  // Serve static frontend files in production
  if (config.nodeEnv === 'production') {
    try {
      const frontendPath = join(__dirname, '../../../../frontend/dist');
      const { default: fastifyStatic } = await import('@fastify/static');

      await fastify.register(fastifyStatic, {
        root: frontendPath,
        prefix: '/',
      });

      // Cache index.html at startup to avoid blocking readFileSync on every request
      const indexPath = join(frontendPath, 'index.html');
      let cachedIndexHtml: string | null = null;

      if (existsSync(indexPath)) {
        cachedIndexHtml = readFileSync(indexPath, 'utf-8');
        fastify.log.info('Cached index.html for SPA fallback');
      } else {
        fastify.log.warn(
          `index.html not found at ${indexPath} — SPA fallback will return 404 for non-API routes`
        );
      }

      // SPA fallback - serve index.html for all non-API routes
      fastify.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith('/api')) {
          reply.code(404).send({
            error: 'Not Found',
            code: 'NOT_FOUND',
            message: 'The requested endpoint does not exist',
          });
        } else if (cachedIndexHtml) {
          reply.type('text/html').send(cachedIndexHtml);
        } else {
          reply.code(404).send({
            error: 'Not Found',
            code: 'NOT_FOUND',
            message: 'Frontend is not available',
          });
        }
      });
    } catch (error) {
      fastify.log.warn('Frontend files not found, serving API only');
    }
  }

  // Graceful shutdown
  const shutdown = async () => {
    fastify.log.info('Shutting down gracefully...');
    await ipLookupService.shutdown();
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start server
  try {
    await fastify.listen({
      port: config.port,
      host: config.host,
    });

    fastify.log.info(`Server listening on http://${config.host}:${config.port}`);
    fastify.log.info(`API Documentation: http://${config.host}:${config.port}/api/docs`);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

// Run server
main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
