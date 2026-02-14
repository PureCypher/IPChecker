import type { FastifyInstance } from 'fastify';
import type { IpLookupService } from '../services/ip-lookup.js';
import { validateAndNormalizeIp, isValidationError } from '../utils/ip-validation.js';
import { apiKeyAuth } from '../middleware/api-key-auth.js';
import { logger } from '../config/logger.js';

/**
 * Streaming lookup routes (SSE)
 */
export async function streamingLookupRoutes(
  fastify: FastifyInstance,
  options: { ipLookupService: IpLookupService }
) {
  const { ipLookupService } = options;

  // Apply API key authentication (same as standard lookup routes)
  fastify.addHook('preHandler', apiKeyAuth);

  /**
   * GET /api/v1/lookup/stream?ip=X.X.X.X — Server-Sent Events endpoint
   *
   * Streams progress events as each provider completes, then sends the
   * final correlated result.
   *
   * Events:
   *   - provider_complete: fired per provider with success/failure info
   *   - lookup_complete: fired once with the full correlated record
   *   - lookup_error: fired if the lookup fails entirely
   */
  fastify.get<{
    Querystring: {
      ip: string;
      forceRefresh?: string;
      includeLLMAnalysis?: string;
    };
  }>('/lookup/stream', {
    schema: {
      description: 'Stream IP lookup progress via Server-Sent Events',
      tags: ['lookup'],
      querystring: {
        type: 'object',
        required: ['ip'],
        properties: {
          ip: { type: 'string', description: 'IPv4 or IPv6 address' },
          forceRefresh: { type: 'string', description: 'Force refresh (true/false)', default: 'false' },
          includeLLMAnalysis: { type: 'string', description: 'Include AI analysis (true/false)', default: 'true' },
        },
      },
    },
    handler: async (request, reply) => {
      const { ip: ipInput, forceRefresh: forceRefreshStr, includeLLMAnalysis: llmStr } = request.query;
      const forceRefresh = forceRefreshStr === 'true';
      const includeLLMAnalysis = llmStr !== 'false';

      // Validate IP
      let ip: string;
      try {
        ip = validateAndNormalizeIp(ipInput);
      } catch (error) {
        if (isValidationError(error)) {
          return reply.code(400).send({
            error: error.message,
            code: error.code,
          });
        }
        return reply.code(400).send({
          error: 'Invalid IP address',
        });
      }

      // Set SSE headers using raw response
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      });

      // Track client disconnect
      let clientDisconnected = false;
      request.raw.on('close', () => {
        clientDisconnected = true;
      });

      /**
       * Write an SSE event to the response stream
       */
      const sendEvent = (data: Record<string, unknown>) => {
        if (clientDisconnected) return;
        try {
          raw.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch {
          clientDisconnected = true;
        }
      };

      try {
        // Check cache first (unless force refresh)
        if (!forceRefresh) {
          const cached = await ipLookupService.getCached(ip);
          if (cached) {
            sendEvent({
              event: 'lookup_complete',
              data: cached,
              cached: true,
            });
            raw.end();
            return reply.hijack();
          }
        }

        // Get services needed for streaming lookup
        const providerManager = ipLookupService.getProviderManager();
        const correlationService = ipLookupService.getCorrelationService();
        const cacheTtlSeconds = ipLookupService.getCacheTtlSeconds();
        const globalTimeoutMs = ipLookupService.getGlobalTimeoutMs();
        const total = providerManager.getProviderCount();

        // Send initial event with total provider count
        sendEvent({
          event: 'lookup_start',
          ip,
          total,
        });

        // Query all providers with progress callback
        const providerResults = await providerManager.queryAll(
          ip,
          globalTimeoutMs,
          (progressEvent) => {
            sendEvent({
              event: 'provider_complete',
              provider: progressEvent.provider,
              success: progressEvent.success,
              index: progressEvent.index,
              total: progressEvent.total,
            });
          }
        );

        if (clientDisconnected) {
          return reply.hijack();
        }

        // Check if we got any successful results
        const successfulResults = providerResults.filter((r) => r.success);
        if (successfulResults.length === 0) {
          sendEvent({
            event: 'lookup_error',
            error: 'All providers failed or timed out',
          });
          raw.end();
          return reply.hijack();
        }

        // Correlate results
        const correlatedRecord = correlationService.correlate(
          ip,
          providerResults,
          'live',
          cacheTtlSeconds
        );

        // Save to cache and database in background
        ipLookupService.saveResult(ip, correlatedRecord).catch((err) => {
          logger.error({ err, ip }, 'Failed to save streaming lookup result');
        });

        // Send correlation complete event
        sendEvent({
          event: 'correlation_complete',
          data: correlatedRecord,
        });

        // If LLM analysis is requested and enabled, do it as a separate step
        if (includeLLMAnalysis && ipLookupService.isLlmEnabled()) {
          sendEvent({
            event: 'llm_start',
          });

          try {
            // Use the public lookup method's LLM logic by re-fetching
            // with LLM analysis. The result is already cached so this
            // will just add the LLM analysis layer.
            const withLlm = await ipLookupService.lookup(ip, false, true);
            sendEvent({
              event: 'lookup_complete',
              data: withLlm,
            });
          } catch {
            // LLM failed, send the result without it
            sendEvent({
              event: 'lookup_complete',
              data: correlatedRecord,
            });
          }
        } else {
          sendEvent({
            event: 'lookup_complete',
            data: correlatedRecord,
          });
        }

        raw.end();
        return reply.hijack();
      } catch (error) {
        logger.error({ error, ip }, 'Streaming lookup failed');

        if (!clientDisconnected) {
          sendEvent({
            event: 'lookup_error',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          raw.end();
        }
        return reply.hijack();
      }
    },
  });
}
