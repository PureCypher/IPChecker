import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * IPGeolocation.io API response interface
 */
interface IPGeolocationResponse {
  ip: string;
  continent_code?: string;
  continent_name?: string;
  country_code2?: string;
  country_code3?: string;
  country_name?: string;
  country_capital?: string;
  state_prov?: string;
  district?: string;
  city?: string;
  zipcode?: string;
  latitude?: string;
  longitude?: string;
  is_eu?: boolean;
  calling_code?: string;
  country_tld?: string;
  languages?: string;
  country_flag?: string;
  geoname_id?: string;
  isp?: string;
  connection_type?: string;
  organization?: string;
  asn?: string;
  time_zone?: {
    name?: string;
    offset?: number;
    current_time?: string;
    current_time_unix?: number;
    is_dst?: boolean;
    dst_savings?: number;
  };
  security?: {
    threat_score?: number;
    is_tor?: boolean;
    is_proxy?: boolean;
    is_vpn?: boolean;
    is_anonymous?: boolean;
    is_known_attacker?: boolean;
    is_bot?: boolean;
    is_spam?: boolean;
    is_cloud_provider?: boolean;
  };
}

/**
 * IPGeolocation.io provider
 * https://ipgeolocation.io/documentation.html
 * Free tier: 1,000 requests/day
 */
export class IPGeolocationProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    if (!this.config.apiKey) {
      throw new Error('IPGeolocation API key is required');
    }

    const params = new URLSearchParams({
      apiKey: this.config.apiKey,
      ip,
      fields: 'geo,time_zone,currency,security',
    });

    const url = `${this.config.baseUrl}?${params}`;

    const response = await this.fetchWithTimeout(
      url,
      {
        headers: {
          Accept: 'application/json',
        },
        signal,
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      if (response.status === 423) {
        throw new Error('IPGeolocation API key limit exceeded');
      }
      if (response.status === 403) {
        throw new Error('IPGeolocation API key is invalid');
      }
      throw new Error(
        `IPGeolocation returned ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json() as IPGeolocationResponse;

    // Parse coordinates
    let latitude: number | null = null;
    let longitude: number | null = null;

    if (data.latitude && data.longitude) {
      const lat = parseFloat(data.latitude);
      const lon = parseFloat(data.longitude);
      if (!isNaN(lat) && !isNaN(lon)) {
        latitude = lat;
        longitude = lon;
      }
    }

    // Extract security/threat information
    const security = data.security || {};
    const isTor = security.is_tor === true ? true : undefined;
    const isProxy = security.is_proxy === true ? true : undefined;
    const isVpn = security.is_vpn === true ? true : undefined;
    const threatScore = security.threat_score || 0;

    return {
      asn: data.asn || null,
      org: data.organization || data.isp || null,
      country: data.country_code2 || null,
      region: data.state_prov || null,
      city: data.city || null,
      latitude,
      longitude,
      timezone: data.time_zone?.name || null,
      isTor,
      isProxy,
      isVpn,
      abuseScore: threatScore,
      raw: data as unknown as Record<string, unknown>,
    };
  }
}
