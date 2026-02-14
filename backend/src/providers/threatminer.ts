import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * ThreatMiner provider - Free threat intelligence
 * https://www.threatminer.org/api.php
 * Rate limit: 10 queries/minute
 * No API key required
 */
export class ThreatMinerProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    // Query multiple endpoints for comprehensive data
    const [whoisData, passiveDns, relatedMalware, reports] = await Promise.allSettled([
      this.queryEndpoint(ip, 1, signal), // WHOIS
      this.queryEndpoint(ip, 2, signal), // Passive DNS
      this.queryEndpoint(ip, 4, signal), // Related malware samples
      this.queryEndpoint(ip, 6, signal), // Report tagging
    ]);

    const whois = whoisData.status === 'fulfilled' ? whoisData.value : null;
    const dns = passiveDns.status === 'fulfilled' ? passiveDns.value : null;
    const malware = relatedMalware.status === 'fulfilled' ? relatedMalware.value : null;
    const reportTags = reports.status === 'fulfilled' ? reports.value : null;

    // Calculate threat score based on findings
    let threatScore = 0;
    const threatIndicators: string[] = [];

    // Check for malware associations
    if (malware && Array.isArray(malware) && malware.length > 0) {
      threatScore += Math.min(50, malware.length * 10);
      threatIndicators.push(`${malware.length} malware samples associated`);
    }

    // Check for report tags (indicates known malicious activity)
    if (reportTags && Array.isArray(reportTags) && reportTags.length > 0) {
      threatScore += Math.min(30, reportTags.length * 5);
      threatIndicators.push(`${reportTags.length} threat reports`);
    }

    // Check passive DNS for suspicious domains
    if (dns && Array.isArray(dns) && dns.length > 0) {
      // High number of DNS records can indicate malicious infrastructure
      if (dns.length > 50) {
        threatScore += 20;
        threatIndicators.push('High DNS activity detected');
      }
    }

    // Extract organization from WHOIS if available
    let org: string | null = null;
    if (whois && Array.isArray(whois) && whois.length > 0) {
      const whoisRecord = whois[0];
      org = whoisRecord.org_name || whoisRecord.org || null;
    }

    return {
      org,
      abuseScore: Math.min(100, threatScore),
      raw: {
        whois: whois || [],
        passiveDns: dns ? dns.slice(0, 20) : [], // Limit DNS records
        malwareSamples: malware ? malware.slice(0, 10) : [],
        reportTags: reportTags || [],
        threatIndicators,
      },
    };
  }

  private async queryEndpoint(
    ip: string,
    rt: number,
    signal: AbortSignal
  ): Promise<any> {
    const url = `${this.config.baseUrl}?q=${encodeURIComponent(ip)}&rt=${rt}`;

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
      if (response.status === 429) {
        throw new Error('ThreatMiner rate limit exceeded (10 req/min)');
      }
      throw new Error(`ThreatMiner returned ${response.status}`);
    }

    const data = await response.json() as { status_code: string | number; results?: any[] };

    // ThreatMiner returns status_code 200 for results, 404 for not found
    if (data.status_code === '404' || data.status_code === 404) {
      return [];
    }

    return data.results || [];
  }
}
