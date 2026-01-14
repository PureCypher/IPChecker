import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import fastifyApiReference from '@scalar/fastify-api-reference';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { IpLookupService } from './services/ip-lookup.js';
import { lookupRoutes } from './routes/lookup.js';
import { healthRoutes } from './routes/health.js';
import { adminRoutes } from './routes/admin.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Main server application
 */
async function main() {
  const startTime = Date.now();

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
  await fastify.register(cors, {
    origin: true, // Allow all origins in development
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
    errorResponseBuilder: (request, context) => {
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
  fastify.addHook('onSend', async (request, reply) => {
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

  // Serve static frontend files in production
  if (config.nodeEnv === 'production') {
    try {
      const frontendPath = join(__dirname, '../../../../frontend/dist');
      const { default: fastifyStatic } = await import('@fastify/static');

      await fastify.register(fastifyStatic, {
        root: frontendPath,
        prefix: '/',
      });

      // SPA fallback - serve index.html for all non-API routes
      fastify.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith('/api')) {
          reply.code(404).send({
            error: 'Not Found',
            code: 'NOT_FOUND',
            message: 'The requested endpoint does not exist',
          });
        } else {
          const indexPath = join(frontendPath, 'index.html');
          const indexHtml = readFileSync(indexPath, 'utf-8');
          reply.type('text/html').send(indexHtml);
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
