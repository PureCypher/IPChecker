import { z } from 'zod';

// ═════════════════════════════════════════════════════
// Provider Configuration & Results
// ═════════════════════════════════════════════════════

export const ProviderConfigSchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url(),
  timeoutMs: z.number().default(3000),
  retries: z.number().default(2),
  retryDelayMs: z.number().default(500),
  trustRank: z.number().min(1).max(10).default(5),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const ProviderResultSchema = z.object({
  provider: z.string(),
  success: z.boolean(),
  latencyMs: z.number(),
  error: z.string().optional(),

  // Normalized fields
  asn: z.string().nullable().optional(),
  org: z.string().nullable().optional(),
  country: z.string().length(2).nullable().optional(), // ISO 3166-1 alpha-2
  region: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  timezone: z.string().nullable().optional(), // IANA timezone

  // Boolean flags
  isProxy: z.boolean().optional(),
  isVpn: z.boolean().optional(),
  isTor: z.boolean().optional(),
  isHosting: z.boolean().optional(),
  isMobile: z.boolean().optional(),

  // VPN/Proxy provider information
  vpnProvider: z.string().nullable().optional(),

  // Threat intelligence
  abuseScore: z.number().min(0).max(100).nullable().optional(),
  lastSeen: z.string().nullable().optional(), // ISO 8601

  // Raw provider response
  raw: z.record(z.unknown()).optional(),
});

export type ProviderResult = z.infer<typeof ProviderResultSchema>;

export interface CircuitBreakerStatus {
  healthy: boolean;
  failures: number;
  nextRetryAt?: Date;
}

// ═════════════════════════════════════════════════════
// Correlated IP Record
// ═════════════════════════════════════════════════════

export const LocationSchema = z.object({
  country: z.string().length(2).optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  coordinates: z.object({
    lat: z.number(),
    lon: z.number(),
  }).optional(),
  timezone: z.string().optional(),
  accuracy: z.enum(['city', 'region', 'country']).optional(),
});

export type Location = z.infer<typeof LocationSchema>;

export const FlagsSchema = z.object({
  isProxy: z.boolean().optional(),
  isVpn: z.boolean().optional(),
  isTor: z.boolean().optional(),
  isHosting: z.boolean().optional(),
  isMobile: z.boolean().optional(),
  vpnProvider: z.string().nullable().optional(),
  confidence: z.number().min(0).max(100).optional(),
});

export type Flags = z.infer<typeof FlagsSchema>;

export const ThreatSchema = z.object({
  abuseScore: z.number().min(0).max(100).optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  lastReported: z.string().optional(), // ISO 8601
});

export type Threat = z.infer<typeof ThreatSchema>;

export const ConflictReportSchema = z.object({
  field: z.string(),
  values: z.array(z.object({
    value: z.unknown(),
    providers: z.array(z.string()),
    trustScore: z.number(),
  })),
  resolved: z.unknown(),
  reason: z.string(),
});

export type ConflictReport = z.infer<typeof ConflictReportSchema>;

export const ThreatIndicatorDetailSchema = z.object({
  indicator: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  category: z.string(),
});

export type ThreatIndicatorDetail = z.infer<typeof ThreatIndicatorDetailSchema>;

// Enhanced threat intelligence schemas
export const VulnerabilitySchema = z.object({
  cve: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  cvssScore: z.number().optional(),
  description: z.string().optional(),
});

export type Vulnerability = z.infer<typeof VulnerabilitySchema>;

export const TemporalTrendSchema = z.object({
  period: z.enum(['last_day', 'last_week', 'last_month']),
  aggressiveness: z.number(),
  threat: z.number(),
  trend: z.enum(['increasing', 'stable', 'decreasing']),
});

export type TemporalTrend = z.infer<typeof TemporalTrendSchema>;

export const MalwareFamilySchema = z.object({
  name: z.string(),
  source: z.string(),
  confidence: z.enum(['confirmed', 'suspected']),
});

export type MalwareFamily = z.infer<typeof MalwareFamilySchema>;

export const ThreatCampaignSchema = z.object({
  pulseName: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()),
});

export type ThreatCampaign = z.infer<typeof ThreatCampaignSchema>;

export const InfrastructureSchema = z.object({
  sslFingerprint: z.object({
    issuer: z.string(),
    subject: z.string(),
    validity: z.string(),
  }).optional(),
  httpFingerprint: z.object({
    server: z.string(),
    title: z.string(),
    statusCode: z.number(),
  }).optional(),
  dnsRecords: z.array(z.string()).optional(),
});

export type Infrastructure = z.infer<typeof InfrastructureSchema>;

export const AbusePatternsSchema = z.object({
  velocity: z.enum(['high', 'medium', 'low', 'none']),
  connectionType: z.string(),
  recentAbuse: z.boolean(),
  abuseTrend: z.enum(['escalating', 'stable', 'declining']),
});

export type AbusePatterns = z.infer<typeof AbusePatternsSchema>;

export const MitreMappingSchema = z.object({
  technique: z.string(),
  tactic: z.string(),
  confidence: z.number(),
  evidence: z.array(z.string()),
});

export type MitreMapping = z.infer<typeof MitreMappingSchema>;

export const LLMAnalysisSchema = z.object({
  summary: z.string(),
  riskAssessment: z.string(),
  recommendations: z.array(z.string()),
  threatIndicators: z.array(z.string()),
  confidence: z.number().min(0).max(100),
  analysisTimestamp: z.string(),
  modelUsed: z.string(),
  // Enhanced fields
  verdict: z.enum(['BLOCK', 'INVESTIGATE', 'MONITOR', 'ALLOW']).optional(),
  severityLevel: z.enum(['critical', 'high', 'medium', 'low', 'safe']).optional(),
  executiveSummary: z.string().optional(),
  technicalDetails: z.string().optional(),
  mitreAttackTechniques: z.array(z.string()).optional(),
  indicatorDetails: z.array(ThreatIndicatorDetailSchema).optional(),
  // New enriched threat intelligence fields
  reasoning: z.string().optional(),
  vulnerabilities: z.array(VulnerabilitySchema).optional(),
  temporalTrends: z.array(TemporalTrendSchema).optional(),
  malwareFamilies: z.array(MalwareFamilySchema).optional(),
  threatCampaigns: z.array(ThreatCampaignSchema).optional(),
  infrastructure: InfrastructureSchema.optional(),
  abusePatterns: AbusePatternsSchema.optional(),
  mitreMapping: z.array(MitreMappingSchema).optional(),
});

export type LLMAnalysis = z.infer<typeof LLMAnalysisSchema>;

export const MetadataSchema = z.object({
  providers: z.array(ProviderResultSchema),
  conflicts: z.array(ConflictReportSchema).optional(),
  source: z.enum(['cache', 'db', 'live', 'stale']),
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(), // ISO 8601
  expiresAt: z.string(), // ISO 8601
  ttlSeconds: z.number(),
  warnings: z.array(z.string()).optional(),
  partialData: z.boolean().optional(),
  providersQueried: z.number().optional(),
  providersSucceeded: z.number().optional(),
  llmAnalysis: LLMAnalysisSchema.optional(),
});

export type Metadata = z.infer<typeof MetadataSchema>;

export const CorrelatedIpRecordSchema = z.object({
  ip: z.string(),
  asn: z.string().optional(),
  org: z.string().optional(),
  location: LocationSchema,
  flags: FlagsSchema,
  threat: ThreatSchema,
  metadata: MetadataSchema,
});

export type CorrelatedIpRecord = z.infer<typeof CorrelatedIpRecordSchema>;

// ═════════════════════════════════════════════════════
// API Request/Response Types
// ═════════════════════════════════════════════════════

export const LookupRequestSchema = z.object({
  ip: z.string(),
  forceRefresh: z.boolean().default(false),
  includeLLMAnalysis: z.boolean().default(true),
});

export type LookupRequest = z.infer<typeof LookupRequestSchema>;

export const BulkLookupRequestSchema = z.object({
  ips: z.array(z.string()).min(1).max(100),
  forceRefresh: z.boolean().default(false),
  includeLLMAnalysis: z.boolean().default(false),
});

export type BulkLookupRequest = z.infer<typeof BulkLookupRequestSchema>;

export const BulkLookupResultSchema = z.object({
  ip: z.string(),
  success: z.boolean(),
  data: CorrelatedIpRecordSchema.optional(),
  error: z.string().optional(),
});

export type BulkLookupResult = z.infer<typeof BulkLookupResultSchema>;

export const BulkLookupResponseSchema = z.object({
  results: z.array(BulkLookupResultSchema),
  summary: z.object({
    total: z.number(),
    successful: z.number(),
    failed: z.number(),
    processingTimeMs: z.number(),
  }),
});

export type BulkLookupResponse = z.infer<typeof BulkLookupResponseSchema>;

export const LookupResponseSchema = z.union([
  CorrelatedIpRecordSchema,
  z.object({
    status: z.literal('processing'),
    ip: z.string(),
    jobId: z.string(),
    estimatedCompletionMs: z.number(),
    pollUrl: z.string(),
  }),
]);

export type LookupResponse = z.infer<typeof LookupResponseSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.unknown().optional(),
  suggestion: z.string().optional(),
  timestamp: z.string(),
  requestId: z.string(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const ProviderHealthSchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
  healthy: z.boolean(),
  stats: z.object({
    successRate: z.number(),
    avgLatencyMs: z.number(),
  }).optional(),
});

export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;

export const SystemHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string(),
  services: z.object({
    redis: z.object({
      status: z.enum(['up', 'down']),
      latencyMs: z.number().optional(),
    }),
    postgres: z.object({
      status: z.enum(['up', 'down']),
      latencyMs: z.number().optional(),
    }),
    providers: z.object({
      available: z.number(),
      healthy: z.number(),
    }),
  }),
});

export type SystemHealth = z.infer<typeof SystemHealthSchema>;

// ═════════════════════════════════════════════════════
// Validation Error Types
// ═════════════════════════════════════════════════════

export enum ValidationErrorCode {
  INVALID_IP = 'INVALID_IP',
  PRIVATE_IP = 'PRIVATE_IP',
  RESERVED_IP = 'RESERVED_IP',
  INVALID_FORMAT = 'INVALID_FORMAT',
}

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  field?: string;
}
