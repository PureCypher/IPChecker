import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * IP-API.com response interface
 */
interface IpApiResponse {
  status: 'success' | 'fail';
  message?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  as?: string;
  proxy?: boolean;
  hosting?: boolean;
  mobile?: boolean;
  query?: string;
}

/**
 * IP-API.com provider (free tier: 45 req/min)
 * https://ip-api.com/docs
 */
export class IpApiProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    const url = `${this.config.baseUrl}/${ip}?fields=66846719`;
    // fields param includes: status,message,country,countryCode,region,regionName,city,
    // lat,lon,timezone,isp,org,as,proxy,hosting,mobile

    const response = await this.fetchWithTimeout(
      url,
      { signal },
      this.config.timeoutMs
    );

    if (!response.ok) {
      throw new Error(
        `IP-API returned ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json() as IpApiResponse;

    // Check for API error
    if (data.status === 'fail') {
      throw new Error(data.message || 'Unknown error from IP-API');
    }

    // Parse ASN from 'as' field (format: "AS15169 Google LLC")
    let asn: string | undefined;
    let org: string | undefined;

    if (data.as) {
      const asMatch = data.as.match(/^AS(\d+)\s+(.+)$/);
      if (asMatch) {
        asn = `AS${asMatch[1]}`;
        org = asMatch[2];
      } else {
        org = data.as;
      }
    }

    // Override org if 'org' field is present
    if (data.org) {
      org = data.org;
    }

    // If no org but isp present, use isp
    if (!org && data.isp) {
      org = data.isp;
    }

    return {
      asn,
      org,
      country: data.countryCode || null,
      region: data.regionName || data.region || null,
      city: data.city || null,
      latitude: typeof data.lat === 'number' ? data.lat : null,
      longitude: typeof data.lon === 'number' ? data.lon : null,
      timezone: data.timezone || null,
      isProxy: data.proxy === true ? true : undefined,
      isHosting: data.hosting === true ? true : undefined,
      isMobile: data.mobile === true ? true : undefined,
      raw: data as unknown as Record<string, unknown>,
    };
  }
}
