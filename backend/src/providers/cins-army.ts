import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * CINS Army List Provider
 * Collective Intelligence Network Security (CINS) Army List
 * Tracks IPs that have been reported for malicious activity
 * API: http://cinsscore.com/
 * Cost: Free
 */
export class CinsArmyProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    // CINS Army list URL
    const response = await this.fetchWithTimeout(
      'http://cinsscore.com/list/ci-badguys.txt',
      { signal },
      this.config.timeoutMs
    );

    if (!response.ok) {
      throw new Error(`CINS Army returned ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const ips = text.split('\n').filter(line => line && !line.startsWith('#'));

    const isListed = ips.includes(ip);

    // Also check CINS score API if available
    let cinsScore = 0;
    try {
      const scoreResponse = await this.fetchWithTimeout(
        `http://cinsscore.com/api/score/${ip}`,
        { signal },
        this.config.timeoutMs
      );

      if (scoreResponse.ok) {
        const scoreData = await scoreResponse.json() as any;
        cinsScore = scoreData?.score || 0;
      }
    } catch {
      // Score API might not be available
    }

    return {
      abuseScore: isListed ? 85 : cinsScore,
      raw: {
        listed: isListed,
        cinsScore,
        totalBadGuys: ips.length,
        note: isListed
          ? 'IP found on CINS Army badguys list - confirmed malicious activity'
          : 'Not found on CINS Army list',
      },
    };
  }
}
