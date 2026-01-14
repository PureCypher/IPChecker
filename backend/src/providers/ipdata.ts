import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * IPData.co API response interface
 */
interface IpDataResponse {
  ip: string;
  is_eu: boolean;
  city?: string;
  region?: string;
  region_code?: string;
  country_name?: string;
  country_code?: string;
  continent_name?: string;
  continent_code?: string;
  latitude?: number;
  longitude?: number;
  postal?: string;
  calling_code?: string;
  flag?: string;
  emoji_flag?: string;
  emoji_unicode?: string;
  asn?: {
    asn: string | number;
    name?: string;
    domain?: string;
    route?: string;
    type?: string;
  };
  carrier?: {
    name?: string;
    mcc?: string;
    mnc?: string;
  };
  time_zone?: {
    name?: string;
    abbr?: string;
    offset?: string;
    is_dst?: boolean;
    current_time?: string;
  };
  threat?: {
    is_tor?: boolean;
    is_vpn?: boolean;
    is_proxy?: boolean;
    is_anonymous?: boolean;
    is_known_attacker?: boolean;
    is_known_abuser?: boolean;
    is_threat?: boolean;
    is_bogon?: boolean;
  };
}

/**
 * IPData.co provider (free tier: 1.5k req/day)
 * https://docs.ipdata.co
 */
export class IpDataProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    // Append API key as query parameter if provided
    const url = this.config.apiKey
      ? `${this.config.baseUrl}/${ip}?api-key=${this.config.apiKey}`
      : `${this.config.baseUrl}/${ip}`;

    const response = await this.fetchWithTimeout(
      url,
      { signal },
      this.config.timeoutMs
    );

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('IPData rate limit exceeded');
      }
      if (response.status === 403) {
        throw new Error('IPData API key invalid or missing');
      }
      throw new Error(
        `IPData returned ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json() as IpDataResponse;

    // Extract ASN data
    let asn: string | undefined;
    if (data.asn?.asn) {
      const asnValue = String(data.asn.asn);
      // Normalize ASN format - ensure it starts with "AS" but don't duplicate
      asn = asnValue.startsWith('AS') ? asnValue : `AS${asnValue}`;
    }
    const org = data.asn?.name || data.carrier?.name || null;

    // Parse threat data if available
    let abuseScore: number | undefined;
    if (data.threat) {
      // IPData provides various threat indicators, we'll create a composite score
      const threatFactors = [
        data.threat.is_tor ? 80 : 0,
        data.threat.is_proxy ? 60 : 0,
        data.threat.is_anonymous ? 50 : 0,
        data.threat.is_known_attacker ? 90 : 0,
        data.threat.is_known_abuser ? 70 : 0,
        data.threat.is_threat ? 85 : 0,
        data.threat.is_bogon ? 100 : 0,
      ];

      const maxThreat = Math.max(...threatFactors);
      abuseScore = maxThreat > 0 ? maxThreat : undefined;
    }

    return {
      asn,
      org,
      country: data.country_code || null,
      region: data.region || null,
      city: data.city || null,
      latitude: typeof data.latitude === 'number' ? data.latitude : null,
      longitude: typeof data.longitude === 'number' ? data.longitude : null,
      timezone: data.time_zone?.name || null,
      isProxy: data.threat?.is_proxy === true ? true : undefined,
      isVpn: data.threat?.is_vpn === true ? true : undefined,
      isTor: data.threat?.is_tor === true ? true : undefined,
      isHosting:
        data.asn?.type === 'hosting' || data.asn?.type === 'business'
          ? true
          : undefined,
      abuseScore: abuseScore ?? null,
      raw: data as unknown as Record<string, unknown>,
    };
  }
}
