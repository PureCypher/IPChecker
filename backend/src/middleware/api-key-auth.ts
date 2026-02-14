import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

// Shared Prisma client for API key lookups.
// A single instance is sufficient here because:
// - The middleware is loaded once at startup
// - PrismaClient internally manages a connection pool
let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }
  return prisma;
}

/**
 * Hash an API key using SHA-256 for database lookup.
 */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Extract the API key from the request.
 * Checks `X-API-Key` header first, then `api_key` query parameter.
 */
function extractApiKey(request: FastifyRequest): string | null {
  // Header takes priority
  const headerKey = request.headers['x-api-key'];
  if (headerKey && typeof headerKey === 'string') {
    return headerKey;
  }

  // Fall back to query parameter
  const query = request.query as Record<string, unknown>;
  if (query?.api_key && typeof query.api_key === 'string') {
    return query.api_key;
  }

  return null;
}

/**
 * Fastify preHandler hook that validates API keys on lookup routes.
 *
 * Behaviour:
 * - If `REQUIRE_API_KEY` is `false`, the hook is a no-op (all requests pass).
 * - Extracts the key from `X-API-Key` header or `api_key` query param.
 * - Hashes the key with SHA-256 and looks it up in the `api_keys` table.
 * - Returns 401 if no key is provided, 403 if the key is invalid or disabled.
 * - Asynchronously updates `lastUsedAt` and increments `requestCount`
 *   (fire-and-forget so the response is not blocked).
 */
export async function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip auth entirely when not required
  if (!config.requireApiKey) {
    return;
  }

  const rawKey = extractApiKey(request);

  if (!rawKey) {
    return reply.code(401).send({
      error: 'Unauthorized',
      code: 'API_KEY_REQUIRED',
      message:
        'An API key is required. Provide it via the X-API-Key header or api_key query parameter.',
    });
  }

  const keyHash = hashApiKey(rawKey);

  try {
    const db = getPrisma();

    const apiKey = await db.apiKey.findUnique({
      where: { keyHash },
    });

    if (!apiKey) {
      return reply.code(403).send({
        error: 'Forbidden',
        code: 'INVALID_API_KEY',
        message: 'The provided API key is not valid.',
      });
    }

    if (!apiKey.enabled) {
      return reply.code(403).send({
        error: 'Forbidden',
        code: 'API_KEY_DISABLED',
        message: 'This API key has been disabled. Contact an administrator.',
      });
    }

    // Fire-and-forget: update usage stats without blocking the response
    db.apiKey
      .update({
        where: { id: apiKey.id },
        data: {
          lastUsedAt: new Date(),
          requestCount: { increment: 1 },
        },
      })
      .catch((err: unknown) => {
        logger.warn({ err, apiKeyId: apiKey.id }, 'Failed to update API key usage stats');
      });
  } catch (err) {
    logger.error({ err }, 'API key authentication error');
    return reply.code(500).send({
      error: 'Internal server error',
      code: 'AUTH_ERROR',
      message: 'An error occurred while validating the API key.',
    });
  }
}
