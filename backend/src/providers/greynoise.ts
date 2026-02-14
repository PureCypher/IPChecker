import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';
import type { GreyNoiseResponse } from './types/greynoise-response.js';

/**
 * GreyNoise Community API provider - Internet scanner/noise detection
 * https://docs.greynoise.io/reference/get_v3-community-ip
 * Free community API - No API key required for basic lookups
 * Identifies mass scanners, botnets, and benign services
 */
export class GreyNoiseProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    const url = `${this.config.baseUrl}/${ip}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    // API key is optional for community endpoint
    if (this.config.apiKey) {
      headers['key'] = this.config.apiKey;
    }

    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        url,
        { headers, signal },
        this.config.timeoutMs
      );
    } catch (fetchError: unknown) {
      const message = fetchError instanceof Error ? fetchError.message : 'Network error';
      throw new Error(`GreyNoise connection failed: ${message}`);
    }

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? ` - retry after ${retryAfter} seconds` : '';
        throw new Error(`GreyNoise rate limit exceeded${waitTime}. Consider using an API key for higher limits.`);
      }
      if (response.status === 401) {
        throw new Error('GreyNoise invalid API key');
      }
      if (response.status === 404) {
        // IP not found in GreyNoise - this is actually good (not a known scanner)
        return {
          raw: {
            noise: false,
            riot: false,
            message: 'IP not observed in internet background noise',
          },
        };
      }
      throw new Error(`GreyNoise returned ${response.status}`);
    }

    const data = await response.json() as GreyNoiseResponse;

    // Calculate threat implications
    let threatScore = 0;
    const threatIndicators: string[] = [];

    // Check if IP is "noise" (mass scanner, botnet, etc.)
    if (data.noise === true) {
      threatScore += 40;
      threatIndicators.push('Detected as internet background noise/scanner');
    }

    // Check if IP is in RIOT dataset (benign services like Google, Microsoft, etc.)
    // RIOT = Rule It Out - known benign services
    if (data.riot === true) {
      threatScore = Math.max(0, threatScore - 30);
      threatIndicators.push('Part of known benign service (RIOT)');
    }

    // Check classification
    if (data.classification) {
      switch (data.classification) {
        case 'malicious':
          threatScore += 50;
          threatIndicators.push('Classified as malicious');
          break;
        case 'unknown':
          threatScore += 10;
          threatIndicators.push('Unknown classification');
          break;
        case 'benign':
          threatScore = Math.max(0, threatScore - 20);
          threatIndicators.push('Classified as benign');
          break;
      }
    }

    // Extract bot/scanner type if available
    if (data.name) {
      threatIndicators.push(`Identified as: ${data.name}`);
    }

    // Check last seen date
    if (data.last_seen) {
      const lastSeen = new Date(data.last_seen);
      const daysSince = Math.floor((Date.now() - lastSeen.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince < 7) {
        threatScore += 10;
        threatIndicators.push(`Active scanner (last seen ${daysSince} days ago)`);
      }
    }

    return {
      abuseScore: Math.min(100, Math.max(0, threatScore)),
      raw: {
        noise: data.noise,
        riot: data.riot,
        classification: data.classification,
        name: data.name,
        link: data.link,
        lastSeen: data.last_seen,
        message: data.message,
        threatIndicators,
      },
    };
  }
}
