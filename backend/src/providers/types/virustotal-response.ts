/**
 * VirusTotal API v3 response types
 * https://developers.virustotal.com/reference/ip-info
 *
 * Describes the raw JSON shape returned by `GET /api/v3/ip_addresses/{ip}`.
 */

/** Per-engine analysis result. */
export interface VirusTotalAnalysisResult {
  category: string;
  result: string;
  method: string;
  engine_name: string;
}

/** Aggregated analysis statistics. */
export interface VirusTotalAnalysisStats {
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
  timeout: number;
}

/** IP address attributes returned by VirusTotal. */
export interface VirusTotalIpAttributes {
  /** Autonomous System Number. */
  asn?: number;
  /** Owner of the AS. */
  as_owner?: string;
  /** Two-letter country code. */
  country?: string;
  /** Continent code. */
  continent?: string;
  /** CIDR network. */
  network?: string;
  /** Unix timestamp of the last analysis. */
  last_analysis_date?: number;
  /** Aggregated detection statistics. */
  last_analysis_stats?: VirusTotalAnalysisStats;
  /** Per-engine analysis results keyed by engine name. */
  last_analysis_results?: Record<string, VirusTotalAnalysisResult>;
  /** Community reputation score. */
  reputation?: number;
  /** Raw WHOIS text. */
  whois?: string;
  /** Unix timestamp of when the WHOIS was last updated. */
  whois_date?: number;
  /** Regional Internet Registry (e.g. "ARIN", "RIPE"). */
  regional_internet_registry?: string;
  /** Total number of community votes. */
  total_votes?: {
    harmless: number;
    malicious: number;
  };
  /** HTTPS certificate information if available. */
  last_https_certificate?: Record<string, unknown>;
  /** Date of last HTTPS certificate fetch. */
  last_https_certificate_date?: number;
  /** Tags assigned by VirusTotal. */
  tags?: string[];
  /** Jarm fingerprint. */
  jarm?: string;
}

/** The `data` wrapper returned by the VirusTotal v3 API. */
export interface VirusTotalData {
  id: string;
  type: string;
  attributes?: VirusTotalIpAttributes;
  links?: {
    self: string;
  };
}

/** Top-level response from `GET /api/v3/ip_addresses/{ip}`. */
export interface VirusTotalResponse {
  data?: VirusTotalData;
}
