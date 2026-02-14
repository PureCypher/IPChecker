import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * Pulsedive provider - Community threat intelligence platform
 * https://pulsedive.com/
 * Free tier: 30 requests/day, 1000/month
 * Provides: Risk scores, threat feeds, linked indicators, properties
 */
export class PulsediveProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    if (!this.config.apiKey) {
      throw new Error('Pulsedive API key is required');
    }

    const params = new URLSearchParams({
      indicator: ip,
      key: this.config.apiKey,
      pretty: '0',
    });

    const url = `${this.config.baseUrl}/info.php?${params}`;

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
        throw new Error('Pulsedive rate limit exceeded (30/day)');
      }
      if (response.status === 404) {
        // IP not in database
        return {
          raw: {
            found: false,
            message: 'IP not found in Pulsedive database',
          },
        };
      }
      throw new Error(`Pulsedive returned ${response.status}`);
    }

    interface PulsediveResponse {
      iid?: number;
      indicator?: string;
      type?: string;
      risk?: string;
      risk_recommended?: string;
      manualrisk?: number;
      retired?: string;
      stamp_added?: string;
      stamp_updated?: string;
      stamp_seen?: string;
      stamp_probed?: string;
      stamp_retired?: string;
      recent?: number;
      submissions?: Array<{
        name?: string;
        stamp?: string;
      }>;
      threats?: Array<{
        tid?: number;
        name?: string;
        category?: string;
        risk?: string;
        stamp_linked?: string;
      }>;
      feeds?: Array<{
        fid?: number;
        name?: string;
        category?: string;
        organization?: string;
      }>;
      comments?: Array<{
        cid?: number;
        comment?: string;
        stamp?: string;
      }>;
      attributes?: {
        port?: string[];
        protocol?: string[];
        technology?: string[];
      };
      properties?: {
        geo?: {
          country?: string;
          countrycode?: string;
          city?: string;
          region?: string;
          org?: string;
          asn?: string;
          latitude?: number;
          longitude?: number;
        };
        dns?: {
          ptr?: string;
        };
        whois?: {
          registrar?: string;
          org?: string;
        };
        http?: {
          title?: string;
          server?: string;
          code?: number;
        };
        ssl?: {
          issuer?: string;
          subject?: string;
        };
      };
      riskfactors?: Array<{
        rfid?: number;
        description?: string;
        risk?: string;
      }>;
      redirects?: Array<{
        indicator?: string;
        type?: string;
      }>;
      links?: Array<{
        iid?: number;
        indicator?: string;
        type?: string;
        risk?: string;
      }>;
      error?: string;
    }

    const data = await response.json() as PulsediveResponse;

    if (data.error) {
      if (data.error.includes('not found')) {
        return {
          raw: {
            found: false,
            message: 'IP not found in Pulsedive database',
          },
        };
      }
      throw new Error(`Pulsedive error: ${data.error}`);
    }

    const threatIndicators: string[] = [];
    let threatScore = 0;

    // Map risk level to score
    const riskMap: Record<string, number> = {
      'none': 0,
      'low': 20,
      'medium': 50,
      'high': 75,
      'critical': 100,
      'unknown': 10,
    };

    const risk = data.risk?.toLowerCase() || 'unknown';
    threatScore = riskMap[risk] || 10;

    if (risk !== 'none' && risk !== 'unknown') {
      threatIndicators.push(`Pulsedive risk: ${data.risk}`);
    }

    // Check threats
    if (data.threats && data.threats.length > 0) {
      const threatNames = data.threats.slice(0, 5).map(t => t.name);
      threatIndicators.push(`Linked threats: ${threatNames.join(', ')}`);
      threatScore = Math.min(100, threatScore + data.threats.length * 10);
    }

    // Check feeds (presence in threat feeds)
    if (data.feeds && data.feeds.length > 0) {
      threatIndicators.push(`Present in ${data.feeds.length} threat feeds`);
      const feedNames = data.feeds.slice(0, 3).map(f => f.name);
      threatIndicators.push(`Feeds: ${feedNames.join(', ')}`);
      threatScore = Math.min(100, threatScore + data.feeds.length * 5);
    }

    // Check risk factors
    if (data.riskfactors && data.riskfactors.length > 0) {
      const factors = data.riskfactors.slice(0, 5).map(rf => rf.description);
      threatIndicators.push(`Risk factors: ${factors.join('; ')}`);
    }

    // Check if recently active
    if (data.recent === 1) {
      threatIndicators.push('Recently active indicator');
    }

    // Check if retired (historical threat)
    if (data.retired === 'true' || data.retired === '1') {
      threatIndicators.push('Retired indicator (historical)');
      threatScore = Math.max(0, threatScore - 20);
    }

    // Extract geo properties
    const geo = data.properties?.geo;

    return {
      asn: geo?.asn || null,
      org: geo?.org || null,
      country: geo?.countrycode || geo?.country || null,
      region: geo?.region || null,
      city: geo?.city || null,
      latitude: geo?.latitude || null,
      longitude: geo?.longitude || null,
      abuseScore: threatScore,
      raw: {
        found: true,
        indicatorId: data.iid,
        risk: data.risk,
        riskRecommended: data.risk_recommended,
        threats: data.threats || [],
        feeds: data.feeds || [],
        riskfactors: data.riskfactors || [],
        attributes: data.attributes,
        properties: data.properties,
        links: data.links?.slice(0, 10) || [],
        stampAdded: data.stamp_added,
        stampUpdated: data.stamp_updated,
        stampSeen: data.stamp_seen,
        recent: data.recent,
        retired: data.retired,
        threatIndicators,
      },
    };
  }
}
