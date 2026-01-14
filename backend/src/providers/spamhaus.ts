import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';
import { promises as dns } from 'dns';

/**
 * Spamhaus Provider
 * Checks IP against Spamhaus blocklists via DNS lookup
 * Uses Zen combined blocklist (includes SBL, XBL, PBL, CSS, DROP, EDROP)
 * API: DNS-based (zen.spamhaus.org)
 * Cost: Free for reasonable non-commercial use
 */
export class SpamhausProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    // Reverse IP for DNS lookup
    const octets = ip.split('.').reverse();
    const reversedIp = octets.join('.');
    const dnsQuery = `${reversedIp}.zen.spamhaus.org`;

    let isListed = false;
    let returnCode: string | null = null;
    let listType: string | null = null;
    let abuseScore = 0;

    try {
      const addresses = await dns.resolve4(dnsQuery);
      if (addresses && addresses.length > 0) {
        isListed = true;
        returnCode = addresses[0];

        // Interpret return codes
        // https://www.spamhaus.org/zen/
        const codeMap: Record<string, { list: string; severity: number }> = {
          '127.0.0.2': { list: 'SBL - Spammer', severity: 90 },
          '127.0.0.3': { list: 'SBL - Spammer', severity: 90 },
          '127.0.0.4': { list: 'XBL - Exploited/Proxy', severity: 85 },
          '127.0.0.9': { list: 'SBL - Spammer', severity: 90 },
          '127.0.0.10': { list: 'PBL - Policy Block', severity: 50 },
          '127.0.0.11': { list: 'PBL - Policy Block', severity: 50 },
        };

        const info = codeMap[returnCode] || { list: 'Spamhaus Listed', severity: 80 };
        listType = info.list;
        abuseScore = info.severity;

        return {
          abuseScore,
          raw: {
            listed: true,
            listType,
            returnCode,
            dnsQuery,
            note: `Listed on Spamhaus: ${listType}`,
          },
        };
      }
    } catch (dnsError: any) {
      // NXDOMAIN means not listed
      if (dnsError.code === 'ENOTFOUND' || dnsError.code === 'ENODATA') {
        isListed = false;
      } else if (dnsError.code === 'ESERVFAIL' || dnsError.code === 'ETIMEOUT') {
        // DNS server failure or timeout - treat as service unavailable
        throw new Error(`Spamhaus DNS query failed: ${dnsError.code}`);
      } else {
        throw new Error(`Spamhaus DNS error: ${dnsError.message || dnsError.code}`);
      }
    }

    return {
      abuseScore: 0,
      raw: {
        listed: false,
        dnsQuery,
        note: 'Not listed on any Spamhaus blocklists',
      },
    };
  }
}
