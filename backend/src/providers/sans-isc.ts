import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * SANS Internet Storm Center Provider
 * Tracks scanning/attack activity across the internet
 * API: https://isc.sans.edu/api/
 * Cost: Free
 */
export class SANSISCProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    // SANS ISC IP lookup
    const response = await this.fetchWithTimeout(
      `https://isc.sans.edu/api/ip/${ip}?json`,
      {
        headers: {
          'User-Agent': 'IPIntel/1.0',
        },
        signal,
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      throw new Error(`SANS ISC returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const ipInfo = data?.ip;

    if (!ipInfo) {
      throw new Error('No data available');
    }

    const attacks = parseInt(ipInfo.attacks || '0', 10);
    const count = parseInt(ipInfo.count || '0', 10);
    const mindate = ipInfo.mindate;
    const maxdate = ipInfo.maxdate;
    const threatFeeds = parseInt(ipInfo.threatfeeds || '0', 10);

    // Calculate abuse score based on attack count and threat feeds
    let abuseScore = 0;
    if (attacks > 100) {
      abuseScore = 90;
    } else if (attacks > 50) {
      abuseScore = 75;
    } else if (attacks > 10) {
      abuseScore = 60;
    } else if (attacks > 0) {
      abuseScore = 40;
    }

    // Boost score if on threat feeds
    if (threatFeeds > 0) {
      abuseScore = Math.min(100, abuseScore + 20);
    }

    return {
      abuseScore,
      raw: {
        attacks,
        reports: count,
        firstSeen: mindate,
        lastSeen: maxdate,
        threatFeeds,
        asn: ipInfo.asabusecontact,
        network: ipInfo.network,
        comment: ipInfo.comment,
        note: attacks > 0
          ? `SANS ISC: ${attacks} attacks reported, seen on ${threatFeeds} threat feed(s)`
          : 'No attack reports in SANS ISC database',
      },
    };
  }
}
