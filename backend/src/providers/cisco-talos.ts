import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * Cisco Talos Intelligence Provider
 * IP and domain reputation data from Cisco's threat intelligence
 * API: Web scraping (no official API for free tier)
 * Cost: Free (web lookup)
 */
export class CiscoTalosProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    // Talos reputation API endpoint
    const url = `https://talosintelligence.com/reputation_center/lookup?search=${ip}`;

    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'https://talosintelligence.com/',
          },
          signal,
        },
        this.config.timeoutMs
      );
    } catch (fetchError: any) {
      throw new Error(`Cisco Talos connection failed: ${fetchError.message || 'Network error'}`);
    }

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Cisco Talos blocked automated access - service requires manual lookup');
      }
      if (response.status === 429) {
        throw new Error('Cisco Talos rate limit exceeded');
      }
      throw new Error(`Cisco Talos returned ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Parse reputation from HTML (simplified parsing)
    const reputationMatch = html.match(/Email Reputation[:\s]+([A-Za-z\s]+)/i);
    const webReputationMatch = html.match(/Web Reputation[:\s]+([A-Za-z\s]+)/i);
    const threatMatch = html.match(/threat[:\s]+([A-Za-z\s]+)/i);

    const emailReputation = reputationMatch?.[1]?.trim().toLowerCase() || 'unknown';
    const webReputation = webReputationMatch?.[1]?.trim().toLowerCase() || 'unknown';
    const threatLevel = threatMatch?.[1]?.trim().toLowerCase() || 'unknown';

    // Calculate abuse score based on reputation
    let abuseScore = 0;
    if (emailReputation.includes('poor') || webReputation.includes('poor')) {
      abuseScore = 75;
    } else if (emailReputation.includes('neutral') || webReputation.includes('neutral')) {
      abuseScore = 40;
    } else if (emailReputation.includes('good') || webReputation.includes('good')) {
      abuseScore = 10;
    }

    return {
      abuseScore,
      raw: {
        emailReputation,
        webReputation,
        threatLevel,
        lookupUrl: url,
      },
    };
  }
}
