import type {
  ProviderResult,
  Vulnerability,
  TemporalTrend,
  MalwareFamily,
  ThreatCampaign,
  Infrastructure,
  AbusePatterns,
  MitreMapping,
} from '@ipintel/shared';
import { logger } from '../config/logger.js';

/**
 * Centralized service for extracting enriched threat intelligence from provider data
 */
export class ThreatIntelExtractor {
  /**
   * Extract Shodan CVE vulnerabilities with severity estimation
   */
  extractShodanCVEs(raw: any): Vulnerability[] {
    if (!raw?.vulns || !Array.isArray(raw.vulns) || raw.vulns.length === 0) {
      return [];
    }

    return raw.vulns.map((cve: string) => {
      const severity = this.estimateCVESeverity(cve);

      return {
        cve,
        severity,
        description: `Vulnerability ${cve} detected on exposed service`,
      };
    });
  }

  /**
   * Estimate CVE severity based on heuristics (year and known patterns)
   * In production, this could be enhanced with NVD API lookups
   */
  private estimateCVESeverity(cve: string): 'critical' | 'high' | 'medium' | 'low' {
    try {
      const year = parseInt(cve.split('-')[1]!);

      // Recent CVEs (2023+) are more likely to be actively exploited
      if (year >= 2023) {
        return 'high';
      }

      // CVEs from 2020-2022 may still be relevant
      if (year >= 2020) {
        return 'medium';
      }

      // Older CVEs are lower priority unless system is very outdated
      return 'low';
    } catch {
      // If we can't parse the CVE, assume medium severity
      return 'medium';
    }
  }

  /**
   * Extract CrowdSec temporal trends to show attack evolution over time
   */
  extractCrowdSecTemporal(raw: any): TemporalTrend[] {
    if (!raw?.scores) {
      return [];
    }

    const trends: TemporalTrend[] = [];
    const periods: Array<'last_day' | 'last_week' | 'last_month'> =
      ['last_day', 'last_week', 'last_month'];

    for (let i = 0; i < periods.length; i++) {
      const period = periods[i]!;
      const scores = raw.scores[period];

      if (!scores) continue;

      // Determine trend direction by comparing to previous period
      let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';

      if (i > 0) {
        const prevPeriod = periods[i - 1]!;
        const prevScores = raw.scores[prevPeriod];

        if (prevScores) {
          trend = this.calculateTrend(
            scores.aggressiveness,
            prevScores.aggressiveness
          );
        }
      }

      trends.push({
        period,
        aggressiveness: scores.aggressiveness || 0,
        threat: scores.threat || 0,
        trend,
      });
    }

    return trends;
  }

  /**
   * Calculate trend direction based on score changes
   */
  private calculateTrend(
    current: number,
    previous: number
  ): 'increasing' | 'stable' | 'decreasing' {
    const delta = current - previous;

    // Threshold of 0.5 to avoid noise
    if (delta > 0.5) return 'increasing';
    if (delta < -0.5) return 'decreasing';
    return 'stable';
  }

  /**
   * Extract and normalize malware families across all providers
   */
  extractMalwareFamilies(providers: ProviderResult[]): MalwareFamily[] {
    const families = new Map<string, MalwareFamily>();

    for (const provider of providers) {
      if (!provider.success || !provider.raw) continue;

      const raw = provider.raw as any;

      // ThreatFox data (abuse.ch)
      if (raw.threatfox?.data && Array.isArray(raw.threatfox.data)) {
        for (const ioc of raw.threatfox.data) {
          const name = this.normalizeMalwareName(
            ioc.malware_printable || ioc.malware
          );

          if (name) {
            families.set(name, {
              name,
              source: 'ThreatFox',
              confidence: 'confirmed',
            });
          }
        }
      }

      // Feodo Tracker (abuse.ch botnet C2)
      if (raw.feodoTracker?.malware) {
        const name = this.normalizeMalwareName(raw.feodoTracker.malware);
        if (name) {
          families.set(name, {
            name,
            source: 'Feodo Tracker',
            confidence: 'confirmed',
          });
        }
      }

      // URLhaus (abuse.ch malware distribution)
      if (raw.urlhaus?.urls && Array.isArray(raw.urlhaus.urls)) {
        for (const url of raw.urlhaus.urls) {
          if (url.threat) {
            const name = this.normalizeMalwareName(url.threat);
            if (name) {
              families.set(name, {
                name,
                source: 'URLhaus',
                confidence: 'confirmed',
              });
            }
          }
        }
      }

      // AlienVault OTX malware
      if (raw.malware && Array.isArray(raw.malware)) {
        for (const malware of raw.malware) {
          const name = this.normalizeMalwareName(malware);
          if (name && typeof name === 'string') {
            families.set(name, {
              name,
              source: 'AlienVault OTX',
              confidence: 'suspected',
            });
          }
        }
      }
    }

    return Array.from(families.values());
  }

  /**
   * Normalize malware family names for consistency
   */
  private normalizeMalwareName(name: string | any): string {
    if (!name || typeof name !== 'string') return '';

    const normalized = name.toLowerCase().trim();

    // Malware family aliases and canonical names
    const aliases: Record<string, string> = {
      'emotet': 'Emotet',
      'trickbot': 'TrickBot',
      'qakbot': 'QBot',
      'qbot': 'QBot',
      'cobalt': 'Cobalt Strike',
      'cobaltstrike': 'Cobalt Strike',
      'hancitor': 'Hancitor',
      'dridex': 'Dridex',
      'ursnif': 'Ursnif',
      'gozi': 'Gozi',
      'icedid': 'IcedID',
      'bazar': 'BazarLoader',
      'bazarloader': 'BazarLoader',
      'ransomware': 'Ransomware',
      'mirai': 'Mirai',
      'zeus': 'Zeus',
      'zbot': 'Zeus',
    };

    // Check for known aliases
    for (const [pattern, canonical] of Object.entries(aliases)) {
      if (normalized.includes(pattern)) {
        return canonical;
      }
    }

    // Capitalize first letter if no match found
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  /**
   * Extract AlienVault OTX threat campaign information
   */
  extractOTXCampaigns(raw: any): ThreatCampaign[] {
    if (!raw?.pulse_info?.pulses || !Array.isArray(raw.pulse_info.pulses)) {
      return [];
    }

    return raw.pulse_info.pulses.map((pulse: any) => ({
      pulseName: pulse.name || 'Unknown Campaign',
      description: pulse.description,
      tags: pulse.tags || [],
    }));
  }

  /**
   * Extract Pulsedive infrastructure fingerprints
   */
  extractPulsediveInfra(raw: any): Infrastructure {
    const infrastructure: Infrastructure = {};

    // SSL certificate fingerprint
    if (raw?.properties?.ssl) {
      infrastructure.sslFingerprint = {
        issuer: raw.properties.ssl.issuer || 'Unknown',
        subject: raw.properties.ssl.subject || 'Unknown',
        validity: raw.properties.ssl.validity || 'Unknown',
      };
    }

    // HTTP fingerprint
    if (raw?.properties?.http) {
      infrastructure.httpFingerprint = {
        server: raw.properties.http.server || 'Unknown',
        title: raw.properties.http.title || 'Unknown',
        statusCode: raw.properties.http.status_code || 0,
      };
    }

    // DNS records
    if (raw?.properties?.dns?.ptr) {
      infrastructure.dnsRecords = [raw.properties.dns.ptr];
    }

    return infrastructure;
  }

  /**
   * Extract IPQualityScore abuse patterns and velocity
   */
  extractAbusePatterns(raw: any): AbusePatterns | null {
    if (!raw) return null;

    const velocity = raw.abuse_velocity || 'none';
    const connectionType = raw.connection_type || 'Unknown';
    const recentAbuse = raw.recent_abuse || false;

    // Determine abuse trend based on velocity and recent activity
    let abuseTrend: 'escalating' | 'stable' | 'declining' = 'stable';

    if (velocity === 'high' && recentAbuse) {
      abuseTrend = 'escalating';
    } else if (velocity === 'low' || !recentAbuse) {
      abuseTrend = 'declining';
    }

    return {
      velocity: velocity as 'high' | 'medium' | 'low' | 'none',
      connectionType,
      recentAbuse,
      abuseTrend,
    };
  }

  /**
   * Enhanced MITRE ATT&CK mapping with confidence scores and evidence
   */
  enhanceMitreMapping(
    indicators: string[],
    behaviors: string[],
    attackTypes: string[]
  ): MitreMapping[] {
    const mappings: MitreMapping[] = [];
    const allText = [...indicators, ...behaviors, ...attackTypes]
      .join(' ')
      .toLowerCase();

    // Comprehensive attack pattern to MITRE technique mapping
    const patterns = [
      {
        keywords: ['brute force', 'brute-force', 'password spray'],
        technique: 'T1110',
        tactic: 'Credential Access',
        name: 'Brute Force',
      },
      {
        keywords: ['port scan', 'network scan', 'scanning'],
        technique: 'T1046',
        tactic: 'Discovery',
        name: 'Network Service Discovery',
      },
      {
        keywords: ['ddos', 'denial of service', 'dos attack'],
        technique: 'T1498',
        tactic: 'Impact',
        name: 'Network Denial of Service',
      },
      {
        keywords: ['botnet', 'c2', 'c&c', 'command and control'],
        technique: 'T1071',
        tactic: 'Command and Control',
        name: 'Application Layer Protocol',
      },
      {
        keywords: ['ssh attack', 'ssh brute', 'ssh'],
        technique: 'T1021.004',
        tactic: 'Lateral Movement',
        name: 'Remote Services: SSH',
      },
      {
        keywords: ['web attack', 'web application', 'exploit', 'http attack'],
        technique: 'T1190',
        tactic: 'Initial Access',
        name: 'Exploit Public-Facing Application',
      },
      {
        keywords: ['tor', 'proxy', 'vpn', 'anonymiz'],
        technique: 'T1090',
        tactic: 'Command and Control',
        name: 'Proxy',
      },
      {
        keywords: ['cryptomining', 'crypto mining', 'mining'],
        technique: 'T1496',
        tactic: 'Impact',
        name: 'Resource Hijacking',
      },
      {
        keywords: ['phishing', 'spear phishing'],
        technique: 'T1566',
        tactic: 'Initial Access',
        name: 'Phishing',
      },
      {
        keywords: ['malware', 'trojan', 'backdoor', 'rat'],
        technique: 'T1204',
        tactic: 'Execution',
        name: 'User Execution',
      },
      {
        keywords: ['sql injection', 'sqli'],
        technique: 'T1190',
        tactic: 'Initial Access',
        name: 'Exploit Public-Facing Application',
      },
      {
        keywords: ['rdp', 'remote desktop'],
        technique: 'T1021.001',
        tactic: 'Lateral Movement',
        name: 'Remote Services: RDP',
      },
      {
        keywords: ['dns tunneling', 'dns exfiltration'],
        technique: 'T1071.004',
        tactic: 'Command and Control',
        name: 'Application Layer Protocol: DNS',
      },
    ];

    for (const pattern of patterns) {
      const matches = pattern.keywords.filter((keyword) =>
        allText.includes(keyword.toLowerCase())
      );

      if (matches.length > 0) {
        // Calculate confidence based on number of matches and specificity
        const confidence = Math.min(95, matches.length * 30 + 40);

        mappings.push({
          technique: `${pattern.technique} - ${pattern.name}`,
          tactic: pattern.tactic,
          confidence,
          evidence: matches,
        });
      }
    }

    // Sort by confidence (highest first)
    return mappings.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Extract all enriched threat intelligence from provider results
   */
  extractAll(providers: ProviderResult[]): {
    vulnerabilities: Vulnerability[];
    temporalTrends: TemporalTrend[];
    malwareFamilies: MalwareFamily[];
    threatCampaigns: ThreatCampaign[];
    infrastructure: Infrastructure;
    abusePatterns: AbusePatterns | null;
  } {
    const result = {
      vulnerabilities: [] as Vulnerability[],
      temporalTrends: [] as TemporalTrend[],
      malwareFamilies: [] as MalwareFamily[],
      threatCampaigns: [] as ThreatCampaign[],
      infrastructure: {} as Infrastructure,
      abusePatterns: null as AbusePatterns | null,
    };

    for (const provider of providers) {
      if (!provider.success || !provider.raw) continue;

      try {
        // Extract Shodan CVEs
        if (provider.provider === 'shodan.io') {
          const cves = this.extractShodanCVEs(provider.raw);
          result.vulnerabilities.push(...cves);
        }

        // Extract CrowdSec temporal trends
        if (provider.provider === 'crowdsec.net') {
          const trends = this.extractCrowdSecTemporal(provider.raw);
          result.temporalTrends.push(...trends);
        }

        // Extract AlienVault OTX campaigns
        if (provider.provider === 'otx.alienvault.com') {
          const campaigns = this.extractOTXCampaigns(provider.raw);
          result.threatCampaigns.push(...campaigns);
        }

        // Extract Pulsedive infrastructure
        if (provider.provider === 'pulsedive.com') {
          const infra = this.extractPulsediveInfra(provider.raw);
          result.infrastructure = { ...result.infrastructure, ...infra };
        }

        // Extract IPQualityScore abuse patterns
        if (provider.provider === 'ipqualityscore.com') {
          const patterns = this.extractAbusePatterns(provider.raw);
          if (patterns) {
            result.abusePatterns = patterns;
          }
        }
      } catch (error) {
        logger.warn({ error, provider: provider.provider }, 'Failed to extract threat intelligence');
      }
    }

    // Extract malware families from all providers
    result.malwareFamilies = this.extractMalwareFamilies(providers);

    return result;
  }
}
