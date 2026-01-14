import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * Blocklist.de Provider
 * Real-time blocklists for various attack types
 * API: https://www.blocklist.de/en/export.html
 * Cost: Free
 */
export class BlocklistDeProvider extends BaseProvider {
  private readonly blocklists = [
    { name: 'ssh', url: 'https://lists.blocklist.de/lists/ssh.txt', severity: 70 },
    { name: 'mail', url: 'https://lists.blocklist.de/lists/mail.txt', severity: 60 },
    { name: 'apache', url: 'https://lists.blocklist.de/lists/apache.txt', severity: 65 },
    { name: 'ftp', url: 'https://lists.blocklist.de/lists/ftp.txt', severity: 60 },
    { name: 'bruteforce', url: 'https://lists.blocklist.de/lists/bruteforcelogin.txt', severity: 80 },
  ];

  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    const detections: Array<{ type: string; severity: number }> = [];

    // Check IP against all blocklists in parallel
    await Promise.all(
      this.blocklists.map(async (blocklist) => {
        try {
          const response = await this.fetchWithTimeout(
            blocklist.url,
            { signal },
            this.config.timeoutMs
          );

          if (!response.ok) {
            return;
          }

          const text = await response.text();
          const ips = text.split('\n').filter(line => line && !line.startsWith('#'));

          if (ips.includes(ip)) {
            detections.push({
              type: blocklist.name,
              severity: blocklist.severity,
            });
          }
        } catch (error) {
          // Continue if one blocklist fails
          return;
        }
      })
    );

    const isListed = detections.length > 0;
    const maxSeverity = isListed ? Math.max(...detections.map(d => d.severity)) : 0;

    return {
      abuseScore: maxSeverity,
      raw: {
        listed: isListed,
        detections: detections.map(d => d.type),
        attackTypes: detections,
        summary: isListed
          ? `Listed on ${detections.length} blocklist(s): ${detections.map(d => d.type).join(', ')}`
          : 'Not found on any blocklists',
      },
    };
  }
}
