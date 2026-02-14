import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';
import type { AbuseIPDBResponse } from './types/abuseipdb-response.js';

/**
 * AbuseIPDB provider - Threat intelligence database
 * https://docs.abuseipdb.com/
 * Free tier: 1,000 checks/day
 */
export class AbuseIPDBProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    if (!this.config.apiKey) {
      throw new Error('AbuseIPDB API key is required');
    }

    const url = `${this.config.baseUrl}/check`;
    const params = new URLSearchParams({
      ipAddress: ip,
      maxAgeInDays: '90',
      verbose: 'true',
    });

    const response = await this.fetchWithTimeout(
      `${url}?${params}`,
      {
        headers: {
          Key: this.config.apiKey,
          Accept: 'application/json',
        },
        signal,
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('AbuseIPDB rate limit exceeded');
      }
      if (response.status === 422) {
        throw new Error('AbuseIPDB: Invalid IP address format');
      }
      throw new Error(
        `AbuseIPDB returned ${response.status}: ${response.statusText}`
      );
    }

    const result = await response.json() as AbuseIPDBResponse;
    const data = result.data;

    if (!data) {
      throw new Error('AbuseIPDB returned invalid response');
    }

    const abuseScore = data.abuseConfidenceScore || 0;

    // Extract threat indicators
    const isTor = data.isTor === true ? true : undefined;
    const isVpn = data.usageType?.toLowerCase().includes('vpn') ? true : undefined;
    const isProxy = data.usageType?.toLowerCase().includes('proxy') ? true : undefined;
    const isHosting = data.usageType?.toLowerCase().includes('hosting') ||
                      data.usageType?.toLowerCase().includes('data center') ? true : undefined;

    return {
      asn: data.isp ? undefined : undefined, // AbuseIPDB doesn't provide ASN directly
      org: data.isp || null,
      country: data.countryCode || null,
      region: null,
      city: null,
      latitude: null,
      longitude: null,
      timezone: null,
      isTor,
      isVpn,
      isProxy,
      isHosting,
      abuseScore,
      lastSeen: data.lastReportedAt || null,
      raw: data as unknown as Record<string, unknown>,
    };
  }
}
