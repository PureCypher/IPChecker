import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * abuse.ch provider - Multiple threat intelligence feeds
 * https://abuse.ch/
 * Free, no API key required
 * Provides: URLhaus (malware URLs), ThreatFox (IOCs), Feodo Tracker (botnets)
 */
export class AbuseChProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    // Query multiple abuse.ch feeds in parallel
    const [urlhaus, threatfox, feodo] = await Promise.allSettled([
      this.queryURLhaus(ip, signal),
      this.queryThreatFox(ip, signal),
      this.queryFeodoTracker(ip, signal),
    ]);

    const urlhausData = urlhaus.status === 'fulfilled' ? urlhaus.value : null;
    const threatfoxData = threatfox.status === 'fulfilled' ? threatfox.value : null;
    const feodoData = feodo.status === 'fulfilled' ? feodo.value : null;

    let threatScore = 0;
    const threatIndicators: string[] = [];

    // Process URLhaus results (malware distribution)
    if (urlhausData?.query_status === 'ok' && urlhausData.urls && urlhausData.urls.length > 0) {
      threatScore += Math.min(50, urlhausData.urls.length * 10);
      threatIndicators.push(`URLhaus: ${urlhausData.urls.length} malware URLs hosted`);

      // Extract unique malware types
      const malwareTypes = new Set<string>();
      for (const url of urlhausData.urls) {
        if (url.threat) malwareTypes.add(url.threat);
      }
      if (malwareTypes.size > 0) {
        threatIndicators.push(`Malware types: ${Array.from(malwareTypes).slice(0, 5).join(', ')}`);
      }
    }

    // Process ThreatFox results (IOC database)
    if (threatfoxData?.query_status === 'ok' && threatfoxData.data && threatfoxData.data.length > 0) {
      threatScore += Math.min(40, threatfoxData.data.length * 15);
      threatIndicators.push(`ThreatFox: ${threatfoxData.data.length} IOC entries`);

      // Extract malware families
      const malwareFamilies = new Set<string>();
      for (const ioc of threatfoxData.data) {
        if (ioc.malware) malwareFamilies.add(ioc.malware);
        if (ioc.malware_printable) malwareFamilies.add(ioc.malware_printable);
      }
      if (malwareFamilies.size > 0) {
        threatIndicators.push(`Malware families: ${Array.from(malwareFamilies).slice(0, 5).join(', ')}`);
      }
    }

    // Process Feodo Tracker results (botnet C2)
    if (feodoData?.query_status === 'ok') {
      threatScore += 60; // Botnet C2 is serious
      threatIndicators.push('Feodo Tracker: Botnet C2 server detected');

      if (feodoData.malware) {
        threatIndicators.push(`Botnet family: ${feodoData.malware}`);
      }
      if (feodoData.first_seen) {
        threatIndicators.push(`First seen: ${feodoData.first_seen}`);
      }
      if (feodoData.last_online) {
        threatIndicators.push(`Last online: ${feodoData.last_online}`);
      }
    }

    // Determine flags based on findings
    const isHosting = (urlhausData?.urls?.length || 0) > 0;
    const isBotnetC2 = feodoData?.query_status === 'ok';

    return {
      isHosting,
      abuseScore: Math.min(100, threatScore),
      raw: {
        urlhaus: urlhausData || { query_status: 'no_results' },
        threatfox: threatfoxData || { query_status: 'no_results' },
        feodoTracker: feodoData || { query_status: 'no_results' },
        isBotnetC2,
        threatIndicators,
      },
    };
  }

  /**
   * Query URLhaus API for malware URLs
   */
  private async queryURLhaus(ip: string, signal: AbortSignal): Promise<any> {
    try {
      const response = await this.fetchWithTimeout(
        'https://urlhaus-api.abuse.ch/v1/host/',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `host=${encodeURIComponent(ip)}`,
          signal,
        },
        this.config.timeoutMs
      );

      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  /**
   * Query ThreatFox API for IOCs
   */
  private async queryThreatFox(ip: string, signal: AbortSignal): Promise<any> {
    try {
      const response = await this.fetchWithTimeout(
        'https://threatfox-api.abuse.ch/api/v1/',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: 'search_ioc',
            search_term: ip,
          }),
          signal,
        },
        this.config.timeoutMs
      );

      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  /**
   * Query Feodo Tracker API for botnet C2 servers
   */
  private async queryFeodoTracker(ip: string, signal: AbortSignal): Promise<any> {
    try {
      const response = await this.fetchWithTimeout(
        'https://feodotracker.abuse.ch/api/v1/',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `query=search_ip&ip=${encodeURIComponent(ip)}`,
          signal,
        },
        this.config.timeoutMs
      );

      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }
}
