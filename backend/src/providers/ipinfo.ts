import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';
import type { IpInfoResponse } from './types/ipinfo-response.js';

/**
 * IPInfo.io provider (free tier: 50k req/month)
 * https://ipinfo.io/developers
 */
export class IpInfoProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    const url = `${this.config.baseUrl}/${ip}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    // Add authorization header if API key is provided
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    const response = await this.fetchWithTimeout(
      url,
      { headers, signal },
      this.config.timeoutMs
    );

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('IPInfo rate limit exceeded');
      }
      throw new Error(
        `IPInfo returned ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json() as IpInfoResponse;

    // Parse ASN and org from 'org' field (format: "AS15169 Google LLC")
    let asn: string | undefined;
    let org: string | undefined;

    if (data.org) {
      const asMatch = data.org.match(/^AS(\d+)\s+(.+)$/);
      if (asMatch) {
        asn = `AS${asMatch[1]}`;
        org = asMatch[2];
      } else {
        org = data.org;
      }
    }

    // Parse coordinates from 'loc' field (format: "37.3860,-122.0840")
    let latitude: number | null = null;
    let longitude: number | null = null;

    if (data.loc) {
      const [lat, lon] = data.loc.split(',').map(Number);
      if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
        latitude = lat;
        longitude = lon;
      }
    }

    // Check privacy data if available
    const privacy = data.privacy || {};
    const isVpn = privacy.vpn === true ? true : undefined;
    const isProxy = privacy.proxy === true ? true : undefined;
    const isTor = privacy.tor === true ? true : undefined;
    const isHosting = privacy.hosting === true ? true : undefined;

    return {
      asn,
      org,
      country: data.country || null,
      region: data.region || null,
      city: data.city || null,
      latitude,
      longitude,
      timezone: data.timezone || null,
      isVpn,
      isProxy,
      isTor,
      isHosting,
      raw: data as unknown as Record<string, unknown>,
    };
  }
}
