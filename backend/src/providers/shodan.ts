import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';
import type { ShodanResponse } from './types/shodan-response.js';

/**
 * Shodan provider - Internet-wide infrastructure scanner
 * https://developer.shodan.io/api
 * Free tier: Limited queries (requires API key)
 */
export class ShodanProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    if (!this.config.apiKey) {
      throw new Error('Shodan API key is required');
    }

    const url = `${this.config.baseUrl}/shodan/host/${ip}?key=${this.config.apiKey}`;

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
      if (response.status === 401) {
        throw new Error('Shodan API key is invalid');
      }
      if (response.status === 404) {
        // IP not found in Shodan database - not an error
        return {
          asn: null,
          org: null,
          country: null,
          region: null,
          city: null,
          latitude: null,
          longitude: null,
          raw: { message: 'No information available' },
        };
      }
      if (response.status === 429) {
        throw new Error('Shodan rate limit exceeded');
      }
      throw new Error(
        `Shodan returned ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json() as ShodanResponse;

    // Parse coordinates
    let latitude: number | null = null;
    let longitude: number | null = null;

    if (data.latitude !== undefined && data.longitude !== undefined) {
      latitude = data.latitude;
      longitude = data.longitude;
    }

    // Extract ASN information
    const asn = data.asn ? `AS${data.asn}` : null;

    // Determine if this is a hosting/cloud provider
    const tags = data.tags || [];
    const isHosting = tags.some((tag: string) =>
      ['cloud', 'hosting', 'datacenter', 'vps'].some((keyword) =>
        tag.toLowerCase().includes(keyword)
      )
    );

    // Check for VPN/Proxy indicators
    const isVpn = tags.some((tag: string) =>
      tag.toLowerCase().includes('vpn')
    );
    const isProxy = tags.some((tag: string) =>
      tag.toLowerCase().includes('proxy')
    );
    const isTor = tags.some((tag: string) =>
      tag.toLowerCase().includes('tor')
    );

    return {
      asn,
      org: data.org || data.isp || null,
      country: data.country_code || null,
      region: data.region_code || null,
      city: data.city || null,
      latitude,
      longitude,
      timezone: null,
      isHosting: isHosting ? true : undefined,
      isVpn: isVpn ? true : undefined,
      isProxy: isProxy ? true : undefined,
      isTor: isTor ? true : undefined,
      lastSeen: data.last_update || null,
      raw: data as unknown as Record<string, unknown>,
    };
  }
}
