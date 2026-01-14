import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * Tor Project Exit Node Provider
 * Checks if IP is a known Tor exit node
 * API: https://check.torproject.org/torbulkexitlist
 * Cost: Free
 */
export class TorProjectProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    // Fetch the bulk exit list
    const response = await this.fetchWithTimeout(
      'https://check.torproject.org/torbulkexitlist',
      { signal },
      this.config.timeoutMs
    );

    if (!response.ok) {
      throw new Error(`Tor Project returned ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const exitNodes = text.split('\n').filter(line => line && !line.startsWith('#'));

    const isTorExit = exitNodes.includes(ip);

    return {
      isTor: isTorExit,
      abuseScore: isTorExit ? 50 : 0, // Tor isn't malicious but flagged for anonymity
      raw: {
        isTorExitNode: isTorExit,
        totalExitNodes: exitNodes.length,
        note: isTorExit
          ? 'This IP is a Tor exit node - traffic is anonymized'
          : 'Not a Tor exit node',
      },
    };
  }
}
