/**
 * Converts Zod schemas from @ipintel/shared into Fastify-compatible JSON Schema objects.
 *
 * Fastify uses JSON Schema for request/response validation and OpenAPI/Swagger doc generation.
 * Rather than pulling in `zod-to-json-schema` as a dependency, we manually define the JSON
 * Schema equivalents of the key Zod schemas. This keeps the dependency tree lean and gives
 * us full control over the generated OpenAPI documentation.
 */

// ─────────────────────────────────────────────────────
// Reusable sub-schemas
// ─────────────────────────────────────────────────────

const LocationJsonSchema = {
  type: 'object',
  properties: {
    country: { type: 'string', minLength: 2, maxLength: 2, description: 'ISO 3166-1 alpha-2 country code' },
    region: { type: 'string' },
    city: { type: 'string' },
    coordinates: {
      type: 'object',
      properties: {
        lat: { type: 'number' },
        lon: { type: 'number' },
      },
    },
    timezone: { type: 'string', description: 'IANA timezone identifier' },
    accuracy: { type: 'string', enum: ['city', 'region', 'country'] },
  },
  additionalProperties: false,
} as const;

const FlagsJsonSchema = {
  type: 'object',
  properties: {
    isProxy: { type: 'boolean' },
    isVpn: { type: 'boolean' },
    isTor: { type: 'boolean' },
    isHosting: { type: 'boolean' },
    isMobile: { type: 'boolean' },
    vpnProvider: { type: ['string', 'null'] },
    confidence: { type: 'number', minimum: 0, maximum: 100 },
  },
  additionalProperties: false,
} as const;

const ThreatJsonSchema = {
  type: 'object',
  properties: {
    abuseScore: { type: 'number', minimum: 0, maximum: 100 },
    riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
    lastReported: { type: 'string', description: 'ISO 8601 timestamp' },
  },
  additionalProperties: false,
} as const;

const ConflictReportJsonSchema = {
  type: 'object',
  properties: {
    field: { type: 'string' },
    values: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          value: {},
          providers: { type: 'array', items: { type: 'string' } },
          trustScore: { type: 'number' },
        },
      },
    },
    resolved: {},
    reason: { type: 'string' },
  },
} as const;

const ThreatIndicatorDetailJsonSchema = {
  type: 'object',
  properties: {
    indicator: { type: 'string' },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
    category: { type: 'string' },
  },
} as const;

const VulnerabilityJsonSchema = {
  type: 'object',
  properties: {
    cve: { type: 'string' },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    cvssScore: { type: 'number' },
    description: { type: 'string' },
  },
} as const;

const TemporalTrendJsonSchema = {
  type: 'object',
  properties: {
    period: { type: 'string', enum: ['last_day', 'last_week', 'last_month'] },
    aggressiveness: { type: 'number' },
    threat: { type: 'number' },
    trend: { type: 'string', enum: ['increasing', 'stable', 'decreasing'] },
  },
} as const;

const MalwareFamilyJsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    source: { type: 'string' },
    confidence: { type: 'string', enum: ['confirmed', 'suspected'] },
  },
} as const;

const ThreatCampaignJsonSchema = {
  type: 'object',
  properties: {
    pulseName: { type: 'string' },
    description: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
  },
} as const;

const InfrastructureJsonSchema = {
  type: 'object',
  properties: {
    sslFingerprint: {
      type: 'object',
      properties: {
        issuer: { type: 'string' },
        subject: { type: 'string' },
        validity: { type: 'string' },
      },
    },
    httpFingerprint: {
      type: 'object',
      properties: {
        server: { type: 'string' },
        title: { type: 'string' },
        statusCode: { type: 'number' },
      },
    },
    dnsRecords: { type: 'array', items: { type: 'string' } },
  },
} as const;

const AbusePatternsJsonSchema = {
  type: 'object',
  properties: {
    velocity: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
    connectionType: { type: 'string' },
    recentAbuse: { type: 'boolean' },
    abuseTrend: { type: 'string', enum: ['escalating', 'stable', 'declining'] },
  },
} as const;

const MitreMappingJsonSchema = {
  type: 'object',
  properties: {
    technique: { type: 'string' },
    tactic: { type: 'string' },
    confidence: { type: 'number' },
    evidence: { type: 'array', items: { type: 'string' } },
  },
} as const;

const LLMAnalysisJsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    riskAssessment: { type: 'string' },
    recommendations: { type: 'array', items: { type: 'string' } },
    threatIndicators: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 100 },
    analysisTimestamp: { type: 'string' },
    modelUsed: { type: 'string' },
    verdict: { type: 'string', enum: ['BLOCK', 'INVESTIGATE', 'MONITOR', 'ALLOW'] },
    severityLevel: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'safe'] },
    executiveSummary: { type: 'string' },
    technicalDetails: { type: 'string' },
    mitreAttackTechniques: { type: 'array', items: { type: 'string' } },
    indicatorDetails: { type: 'array', items: ThreatIndicatorDetailJsonSchema },
    reasoning: { type: 'string' },
    vulnerabilities: { type: 'array', items: VulnerabilityJsonSchema },
    temporalTrends: { type: 'array', items: TemporalTrendJsonSchema },
    malwareFamilies: { type: 'array', items: MalwareFamilyJsonSchema },
    threatCampaigns: { type: 'array', items: ThreatCampaignJsonSchema },
    infrastructure: InfrastructureJsonSchema,
    abusePatterns: AbusePatternsJsonSchema,
    mitreMapping: { type: 'array', items: MitreMappingJsonSchema },
  },
} as const;

const ProviderResultJsonSchema = {
  type: 'object',
  properties: {
    provider: { type: 'string' },
    success: { type: 'boolean' },
    latencyMs: { type: 'number' },
    error: { type: 'string' },
    asn: { type: ['string', 'null'] },
    org: { type: ['string', 'null'] },
    country: { type: ['string', 'null'], description: 'ISO 3166-1 alpha-2' },
    region: { type: ['string', 'null'] },
    city: { type: ['string', 'null'] },
    latitude: { type: ['number', 'null'] },
    longitude: { type: ['number', 'null'] },
    timezone: { type: ['string', 'null'], description: 'IANA timezone' },
    isProxy: { type: 'boolean' },
    isVpn: { type: 'boolean' },
    isTor: { type: 'boolean' },
    isHosting: { type: 'boolean' },
    isMobile: { type: 'boolean' },
    vpnProvider: { type: ['string', 'null'] },
    abuseScore: { type: ['number', 'null'], minimum: 0, maximum: 100 },
    lastSeen: { type: ['string', 'null'], description: 'ISO 8601 timestamp' },
    raw: { type: 'object', additionalProperties: true },
  },
} as const;

const MetadataJsonSchema = {
  type: 'object',
  properties: {
    providers: { type: 'array', items: ProviderResultJsonSchema },
    conflicts: { type: 'array', items: ConflictReportJsonSchema },
    source: { type: 'string', enum: ['cache', 'db', 'live', 'stale'] },
    createdAt: { type: 'string', description: 'ISO 8601 timestamp' },
    updatedAt: { type: 'string', description: 'ISO 8601 timestamp' },
    expiresAt: { type: 'string', description: 'ISO 8601 timestamp' },
    ttlSeconds: { type: 'number' },
    warnings: { type: 'array', items: { type: 'string' } },
    partialData: { type: 'boolean' },
    providersQueried: { type: 'number' },
    providersSucceeded: { type: 'number' },
    llmAnalysis: LLMAnalysisJsonSchema,
  },
} as const;

// ─────────────────────────────────────────────────────
// Exported top-level schemas for Fastify route definitions
// ─────────────────────────────────────────────────────

/**
 * JSON Schema for a CorrelatedIpRecord — the primary response body
 * returned by the single-IP lookup endpoint.
 */
export const CorrelatedIpRecordJsonSchema = {
  type: 'object',
  properties: {
    ip: { type: 'string' },
    asn: { type: 'string' },
    org: { type: 'string' },
    location: LocationJsonSchema,
    flags: FlagsJsonSchema,
    threat: ThreatJsonSchema,
    metadata: MetadataJsonSchema,
  },
  required: ['ip', 'location', 'flags', 'threat', 'metadata'],
} as const;

/**
 * JSON Schema for BulkLookupResponse — returned by the bulk lookup endpoint.
 */
export const BulkLookupResponseJsonSchema = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ip: { type: 'string' },
          success: { type: 'boolean' },
          data: CorrelatedIpRecordJsonSchema,
          error: { type: 'string' },
        },
        required: ['ip', 'success'],
      },
    },
    summary: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        successful: { type: 'number' },
        failed: { type: 'number' },
        processingTimeMs: { type: 'number' },
      },
      required: ['total', 'successful', 'failed', 'processingTimeMs'],
    },
  },
  required: ['results', 'summary'],
} as const;

/**
 * JSON Schema for ErrorResponse — standard error envelope.
 */
export const ErrorResponseJsonSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    code: { type: 'string' },
    message: { type: 'string' },
    statusCode: { type: 'number' },
    details: {},
    suggestion: { type: 'string' },
    timestamp: { type: 'string', description: 'ISO 8601 timestamp' },
    requestId: { type: 'string' },
  },
} as const;

/**
 * JSON Schema for SystemHealth — returned by the health endpoint.
 */
export const SystemHealthJsonSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
    version: { type: 'string' },
    uptime: { type: 'number', description: 'Uptime in seconds' },
    timestamp: { type: 'string', description: 'ISO 8601 timestamp' },
    services: {
      type: 'object',
      properties: {
        redis: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['up', 'down'] },
            latencyMs: { type: 'number' },
          },
          required: ['status'],
        },
        postgres: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['up', 'down'] },
            latencyMs: { type: 'number' },
          },
          required: ['status'],
        },
        providers: {
          type: 'object',
          properties: {
            available: { type: 'number' },
            healthy: { type: 'number' },
          },
          required: ['available', 'healthy'],
        },
      },
      required: ['redis', 'postgres', 'providers'],
    },
  },
  required: ['status', 'version', 'uptime', 'timestamp', 'services'],
} as const;

/**
 * JSON Schema for ProviderHealth array — returned by the providers endpoint.
 */
export const ProviderHealthArrayJsonSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      enabled: { type: 'boolean' },
      healthy: { type: 'boolean' },
      trustRank: { type: 'number' },
      stats: {
        type: 'object',
        properties: {
          successRate: { type: 'number' },
          avgLatencyMs: { type: 'number' },
        },
      },
    },
    required: ['name', 'enabled', 'healthy'],
  },
} as const;
