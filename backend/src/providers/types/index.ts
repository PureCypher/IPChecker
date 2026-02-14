/**
 * Typed interfaces for external provider API responses.
 *
 * Each file describes the raw JSON shape returned by a provider's API
 * before normalization into the shared `ProviderResult` type.
 */

export type { AbuseIPDBResponse, AbuseIPDBCheckData, AbuseIPDBReport } from './abuseipdb-response.js';
export type { ShodanResponse, ShodanBanner } from './shodan-response.js';
export type { IpInfoResponse, IpInfoPrivacy, IpInfoCompany, IpInfoCarrier, IpInfoAbuse, IpInfoAsn } from './ipinfo-response.js';
export type { VirusTotalResponse, VirusTotalData, VirusTotalIpAttributes, VirusTotalAnalysisStats, VirusTotalAnalysisResult } from './virustotal-response.js';
export type { GreyNoiseResponse } from './greynoise-response.js';
