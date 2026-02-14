/**
 * AbuseIPDB API response types
 * https://docs.abuseipdb.com/#check-endpoint
 *
 * Describes the raw JSON shape returned by `GET /api/v2/check`.
 */

/** Individual report entry returned when `verbose=true`. */
export interface AbuseIPDBReport {
  reportedAt: string;
  comment: string;
  categories: number[];
  reporterId: number;
  reporterCountryCode: string;
  reporterCountryName: string;
}

/** The `data` object inside the AbuseIPDB check response. */
export interface AbuseIPDBCheckData {
  ipAddress: string;
  isPublic: boolean;
  ipVersion: number;
  isWhitelisted: boolean | null;
  abuseConfidenceScore: number;
  countryCode: string | null;
  usageType: string | null;
  isp: string | null;
  domain: string | null;
  hostnames: string[];
  isTor: boolean;
  totalReports: number;
  numDistinctUsers: number;
  lastReportedAt: string | null;
  /** Only present when `verbose=true`. */
  reports?: AbuseIPDBReport[];
}

/** Top-level response from `GET /api/v2/check`. */
export interface AbuseIPDBResponse {
  data: AbuseIPDBCheckData;
}
