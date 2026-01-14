import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * CrowdSec CTI provider - Community-driven threat intelligence
 * https://www.crowdsec.net/cyber-threat-intelligence
 * Free tier: 50 queries/day with API key
 * Provides: Attack classifications, behaviors, threat scores, IP reputation
 */
export class CrowdSecProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    if (!this.config.apiKey) {
      throw new Error('CrowdSec API key is required');
    }

    const url = `${this.config.baseUrl}/smoke/${ip}`;

    const response = await this.fetchWithTimeout(
      url,
      {
        headers: {
          'x-api-key': this.config.apiKey,
          Accept: 'application/json',
        },
        signal,
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('CrowdSec rate limit exceeded (50/day)');
      }
      if (response.status === 404) {
        // IP not found - actually good, means not in threat database
        return {
          abuseScore: 0,
          raw: {
            found: false,
            message: 'IP not found in CrowdSec threat database',
          },
        };
      }
      throw new Error(`CrowdSec returned ${response.status}`);
    }

    interface CrowdSecResponse {
      ip: string;
      ip_range_score: number;
      ip_range: string;
      as_name?: string;
      as_num?: number;
      location?: {
        country?: string;
        city?: string;
        latitude?: number;
        longitude?: number;
      };
      reverse_dns?: string;
      behaviors?: Array<{
        name: string;
        label: string;
        description: string;
      }>;
      history?: {
        first_seen?: string;
        last_seen?: string;
        full_age?: number;
        days_age?: number;
      };
      classifications?: {
        false_positives?: Array<{ name: string; label: string }>;
        classifications?: Array<{ name: string; label: string; description: string }>;
      };
      attack_details?: Array<{
        name: string;
        label: string;
        description: string;
        references?: string[];
      }>;
      target_countries?: Record<string, number>;
      scores?: {
        overall?: {
          aggressiveness: number;
          threat: number;
          trust: number;
          anomaly: number;
          total: number;
        };
        last_day?: {
          aggressiveness: number;
          threat: number;
          trust: number;
          anomaly: number;
          total: number;
        };
        last_week?: {
          aggressiveness: number;
          threat: number;
          trust: number;
          anomaly: number;
          total: number;
        };
        last_month?: {
          aggressiveness: number;
          threat: number;
          trust: number;
          anomaly: number;
          total: number;
        };
      };
      references?: Array<{
        name: string;
        description: string;
      }>;
    }

    const data = await response.json() as CrowdSecResponse;

    // Calculate threat score from CrowdSec scores
    let threatScore = 0;
    const threatIndicators: string[] = [];

    // Use overall scores if available
    if (data.scores?.overall) {
      const scores = data.scores.overall;
      // CrowdSec scores are 0-5, normalize to 0-100
      threatScore = Math.round((scores.total / 5) * 100);

      if (scores.aggressiveness > 2) {
        threatIndicators.push(`High aggressiveness score (${scores.aggressiveness}/5)`);
      }
      if (scores.threat > 2) {
        threatIndicators.push(`High threat score (${scores.threat}/5)`);
      }
      if (scores.anomaly > 2) {
        threatIndicators.push(`Anomalous behavior detected (${scores.anomaly}/5)`);
      }
    }

    // Extract behaviors
    if (data.behaviors && data.behaviors.length > 0) {
      const behaviorLabels = data.behaviors.map(b => b.label || b.name);
      threatIndicators.push(`Behaviors: ${behaviorLabels.join(', ')}`);
    }

    // Extract attack details
    if (data.attack_details && data.attack_details.length > 0) {
      const attackLabels = data.attack_details.slice(0, 5).map(a => a.label || a.name);
      threatIndicators.push(`Attack types: ${attackLabels.join(', ')}`);
    }

    // Extract classifications
    if (data.classifications?.classifications && data.classifications.classifications.length > 0) {
      const classLabels = data.classifications.classifications.map(c => c.label || c.name);
      threatIndicators.push(`Classifications: ${classLabels.join(', ')}`);
    }

    // Check history
    if (data.history) {
      if (data.history.last_seen) {
        const lastSeen = new Date(data.history.last_seen);
        const daysSince = Math.floor((Date.now() - lastSeen.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince < 7) {
          threatIndicators.push(`Recently active (last seen ${daysSince} days ago)`);
        }
      }
      if (data.history.full_age && data.history.full_age > 30) {
        threatIndicators.push(`Long-term threat actor (${data.history.full_age} days tracked)`);
      }
    }

    return {
      asn: data.as_num ? `AS${data.as_num}` : null,
      org: data.as_name || null,
      country: data.location?.country || null,
      city: data.location?.city || null,
      latitude: data.location?.latitude || null,
      longitude: data.location?.longitude || null,
      abuseScore: Math.min(100, threatScore),
      raw: {
        found: true,
        ipRangeScore: data.ip_range_score,
        ipRange: data.ip_range,
        reverseDns: data.reverse_dns,
        behaviors: data.behaviors || [],
        attackDetails: data.attack_details || [],
        classifications: data.classifications?.classifications || [],
        history: data.history,
        scores: data.scores,
        targetCountries: data.target_countries,
        references: data.references,
        threatIndicators,
      },
    };
  }
}
