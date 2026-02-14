import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';
import type { VirusTotalResponse } from './types/virustotal-response.js';

/**
 * VirusTotal provider - Malware and threat intelligence
 * https://developers.virustotal.com/reference/ip-info
 * Free tier: 4 requests/minute, 500/day
 */
export class VirusTotalProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    if (!this.config.apiKey) {
      throw new Error('VirusTotal API key is required');
    }

    const url = `${this.config.baseUrl}/ip_addresses/${ip}`;

    const response = await this.fetchWithTimeout(
      url,
      {
        headers: {
          'x-apikey': this.config.apiKey,
          Accept: 'application/json',
        },
        signal,
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('VirusTotal API key is invalid');
      }
      if (response.status === 404) {
        throw new Error('IP address not found in VirusTotal database');
      }
      if (response.status === 429) {
        throw new Error('VirusTotal rate limit exceeded');
      }
      throw new Error(
        `VirusTotal returned ${response.status}: ${response.statusText}`
      );
    }

    const result = await response.json() as VirusTotalResponse;
    const data = result.data?.attributes || {};

    // Extract location data
    const asn = data.asn ? `AS${data.asn}` : null;
    const org = data.as_owner || null;
    const country = data.country || null;

    // Extract threat statistics
    const stats = data.last_analysis_stats;
    const malicious = stats?.malicious ?? 0;
    const suspicious = stats?.suspicious ?? 0;
    const harmless = stats?.harmless ?? 0;
    const undetected = stats?.undetected ?? 0;
    const total = malicious + suspicious + harmless + undetected;

    // Calculate abuse score (percentage of malicious + suspicious)
    const abuseScore = total > 0
      ? Math.round(((malicious + suspicious) / total) * 100)
      : 0;

    // Last analysis date
    const lastSeen = data.last_analysis_date
      ? new Date(data.last_analysis_date * 1000).toISOString()
      : null;

    return {
      asn,
      org,
      country,
      region: data.continent || null,
      city: null,
      latitude: null,
      longitude: null,
      timezone: null,
      abuseScore,
      lastSeen,
      raw: data as unknown as Record<string, unknown>,
    };
  }
}
