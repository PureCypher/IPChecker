import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * IBM X-Force Exchange Provider
 * Threat intelligence from IBM Security
 * API: https://api.xforce.ibmcloud.com/doc/
 * Cost: Free tier available (requires API key)
 */
export class IBMXForceProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    if (!this.config.apiKey) {
      throw new Error('IBM X-Force API key required');
    }

    // X-Force uses Basic Auth with API key:password format
    const [apiKey, apiPassword] = this.config.apiKey.split(':');
    const auth = Buffer.from(`${apiKey}:${apiPassword}`).toString('base64');

    // Get IP reputation
    const response = await this.fetchWithTimeout(
      `https://api.xforce.ibmcloud.com/ipr/${ip}`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
        },
        signal,
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      throw new Error(`IBM X-Force returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as any;

    // Get malware information
    let malwareData: any = null;
    try {
      const malwareResponse = await this.fetchWithTimeout(
        `https://api.xforce.ibmcloud.com/ipr/malware/${ip}`,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
          },
          signal,
        },
        this.config.timeoutMs
      );

      if (malwareResponse.ok) {
        malwareData = await malwareResponse.json() as any;
      }
    } catch {
      // Malware endpoint might not have data
    }

    const score = data.score || 0;
    const categories = data.cats || {};
    const history = data.history || [];
    const malware = malwareData?.malware || [];

    // X-Force score: 1-10 (10 = most malicious)
    const abuseScore = Math.min(100, score * 10);

    return {
      abuseScore,
      raw: {
        score,
        risk: score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low',
        categories: Object.keys(categories),
        categoryDescriptions: categories,
        reputation: data.reputation || 'Unknown',
        country: data.geo?.country,
        reasonDescription: data.reason,
        malwareCount: malware.length,
        malwareFamilies: malware.slice(0, 5).map((m: any) => m.family),
        historicalActivity: history.length,
        note: score > 0
          ? `X-Force risk score: ${score}/10 - ${Object.keys(categories).join(', ')}`
          : 'No threat intelligence available',
      },
    };
  }
}
