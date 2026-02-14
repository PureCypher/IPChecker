import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * BGPView provider - ASN and network intelligence
 * https://bgpview.io/
 * Free, no API key required
 * Provides detailed ASN, prefix, and network ownership information
 */
export class BGPViewProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    const url = `${this.config.baseUrl}/ip/${ip}`;

    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        url,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; IPIntel/1.0)',
          },
          signal,
        },
        this.config.timeoutMs
      );
    } catch (fetchError: any) {
      // Handle network errors gracefully
      if (fetchError.name === 'AbortError' || fetchError.code === 'ECONNREFUSED') {
        throw new Error('BGPView service unavailable');
      }
      throw new Error(`BGPView fetch failed: ${fetchError.message || 'Network error'}`);
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('BGPView rate limit exceeded');
      }
      if (response.status === 404) {
        return {
          raw: { message: 'IP not found in BGP routing tables' },
        };
      }
      if (response.status >= 500) {
        throw new Error('BGPView service error');
      }
      throw new Error(`BGPView returned ${response.status}`);
    }

    interface BGPViewResponse {
      status: string;
      data?: {
        prefixes?: Array<{
          prefix?: string;
          asn?: {
            asn: number;
            name?: string;
            description?: string;
            country_code?: string;
          };
        }>;
        rir_allocation?: {
          rir_name?: string;
        };
        ptr_record?: string;
      };
    }

    const result = await response.json() as BGPViewResponse;
    const data = result.data;

    if (!data || result.status !== 'ok') {
      return {
        raw: { message: 'No BGP data available for this IP' },
      };
    }

    // Extract prefix information
    const prefixes = data.prefixes || [];
    const primaryPrefix = prefixes[0];

    // Extract ASN information
    let asn: string | null = null;
    let org: string | null = null;
    let country: string | null = null;

    if (primaryPrefix?.asn) {
      asn = `AS${primaryPrefix.asn.asn}`;
      org = primaryPrefix.asn.name || primaryPrefix.asn.description || null;
      country = primaryPrefix.asn.country_code || null;
    }

    // Analyze network characteristics for threat indicators
    const threatIndicators: string[] = [];
    let threatScore = 0;

    // Check if IP is in multiple prefixes (can indicate hosting/CDN)
    if (prefixes.length > 2) {
      threatIndicators.push(`Announced in ${prefixes.length} prefixes`);
    }

    // Check prefix size - very small prefixes (/30, /31, /32) might indicate targeted allocation
    if (primaryPrefix?.prefix) {
      const prefixSize = parseInt(primaryPrefix.prefix.split('/')[1] ?? '', 10);
      if (prefixSize >= 28) {
        threatIndicators.push(`Small prefix allocation (/${prefixSize})`);
      }
    }

    // Check RIR allocation
    const rir = data.rir_allocation;
    if (rir) {
      threatIndicators.push(`RIR: ${rir.rir_name || 'Unknown'}`);
    }

    // Check PTR record
    const ptrRecord = data.ptr_record;
    if (ptrRecord) {
      // Check for suspicious PTR patterns
      if (ptrRecord.includes('dynamic') || ptrRecord.includes('pool') || ptrRecord.includes('dhcp')) {
        threatScore += 10;
        threatIndicators.push('Dynamic/residential IP detected');
      }
      if (ptrRecord.includes('vps') || ptrRecord.includes('cloud') || ptrRecord.includes('server')) {
        threatIndicators.push('VPS/Cloud hosting detected');
      }
    }

    return {
      asn,
      org,
      country,
      raw: {
        prefixes: prefixes.slice(0, 5), // Limit to first 5 prefixes
        ptrRecord,
        rirAllocation: rir,
        threatIndicators,
        relatedPrefixCount: prefixes.length,
      },
      abuseScore: threatScore > 0 ? threatScore : undefined,
    };
  }
}
