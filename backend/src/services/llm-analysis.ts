import type { CorrelatedIpRecord } from '@ipintel/shared';
import { getEnvNumber, getEnvString, getEnvBool } from '../utils/helpers.js';
import { logger } from '../config/logger.js';
import { ThreatIntelExtractor } from './threat-intel-extractors.js';

export interface ThreatIndicatorDetail {
  indicator: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
}

export interface LLMAnalysisResult {
  summary: string;
  riskAssessment: string;
  recommendations: string[];
  threatIndicators: string[];
  confidence: number;
  analysisTimestamp: string;
  modelUsed: string;
  // Enhanced fields
  verdict: 'BLOCK' | 'INVESTIGATE' | 'MONITOR' | 'ALLOW';
  severityLevel: 'critical' | 'high' | 'medium' | 'low' | 'safe';
  executiveSummary: string;
  technicalDetails: string;
  mitreAttackTechniques?: string[];
  indicatorDetails?: ThreatIndicatorDetail[];
  // New enriched threat intelligence fields
  reasoning?: string;
  vulnerabilities?: Array<{
    cve?: string;
    severity?: 'critical' | 'high' | 'medium' | 'low';
    cvssScore?: number;
    description?: string;
  }>;
  temporalTrends?: Array<{
    period?: 'last_day' | 'last_week' | 'last_month';
    aggressiveness?: number;
    threat?: number;
    trend?: 'increasing' | 'stable' | 'decreasing';
  }>;
  malwareFamilies?: Array<{
    name?: string;
    source?: string;
    confidence?: 'confirmed' | 'suspected';
  }>;
  threatCampaigns?: Array<{
    pulseName?: string;
    description?: string;
    tags?: string[];
  }>;
  infrastructure?: {
    sslFingerprint?: {
      issuer?: string;
      subject?: string;
      validity?: string;
    };
    httpFingerprint?: {
      server?: string;
      title?: string;
      statusCode?: number;
    };
    dnsRecords?: string[];
  };
  abusePatterns?: {
    velocity?: 'high' | 'medium' | 'low' | 'none';
    connectionType?: string;
    recentAbuse?: boolean;
    abuseTrend?: 'escalating' | 'stable' | 'declining';
  };
  mitreMapping?: Array<{
    technique?: string;
    tactic?: string;
    confidence?: number;
    evidence?: string[];
  }>;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Simple in-memory cache entry for LLM responses
 */
interface CacheEntry {
  response: LLMAnalysisResult;
  timestamp: number;
}

/**
 * LLM Analysis Service - Uses Ollama with local models for intelligent IP threat analysis
 */
export class LLMAnalysisService {
  private ollamaUrl: string;
  private model: string;
  private enabled: boolean;
  private timeoutMs: number;
  private threatIntelExtractor: ThreatIntelExtractor;
  private responseCache: Map<string, CacheEntry>;
  private cacheTTL: number; // Cache TTL in milliseconds

  constructor() {
    this.ollamaUrl = getEnvString('OLLAMA_URL', 'http://ollama:11434');
    this.model = getEnvString('OLLAMA_MODEL', 'mistral:latest');
    this.enabled = getEnvBool('LLM_ENABLED', true);
    this.timeoutMs = getEnvNumber('LLM_TIMEOUT_MS', 30000);
    this.threatIntelExtractor = new ThreatIntelExtractor();
    this.responseCache = new Map<string, CacheEntry>();
    this.cacheTTL = getEnvNumber('LLM_CACHE_TTL_MS', 1800000); // Default 30 minutes

    // Clean up expired cache entries every 10 minutes
    setInterval(() => this.cleanExpiredCache(), 600000);
  }

  /**
   * Generate cache key from IP record (based on IP and threat indicators)
   */
  private getCacheKey(record: CorrelatedIpRecord): string {
    // Create a cache key that includes IP and key threat indicators
    const abuseScore = record.threat?.abuseScore ?? 0;
    const riskLevel = record.threat?.riskLevel ?? 'unknown';
    const providersCount = record.metadata?.providersSucceeded ?? 0;

    // Include major threat flags in cache key
    const flags = [
      record.flags?.isTor ? 'tor' : '',
      record.flags?.isVpn ? 'vpn' : '',
      record.flags?.isProxy ? 'proxy' : '',
      abuseScore > 50 ? 'highabuse' : ''
    ].filter(Boolean).join('-');

    return `${record.ip}:${riskLevel}:${providersCount}:${flags}`;
  }

  /**
   * Get cached LLM response if available and not expired
   */
  private getCachedResponse(cacheKey: string): LLMAnalysisResult | null {
    const cached = this.responseCache.get(cacheKey);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTTL) {
      this.responseCache.delete(cacheKey);
      return null;
    }

    logger.debug({ cacheKey, age }, 'LLM cache hit');
    return cached.response;
  }

  /**
   * Cache LLM response
   */
  private setCachedResponse(cacheKey: string, response: LLMAnalysisResult): void {
    this.responseCache.set(cacheKey, {
      response,
      timestamp: Date.now()
    });

    // Limit cache size to prevent memory issues
    if (this.responseCache.size > 1000) {
      const oldestKey = this.responseCache.keys().next().value;
      if (oldestKey) this.responseCache.delete(oldestKey);
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.responseCache.entries()) {
      if (now - entry.timestamp > this.cacheTTL) {
        this.responseCache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug({ removed, remaining: this.responseCache.size }, 'Cleaned expired LLM cache entries');
    }
  }

  /**
   * Check if LLM analysis is enabled and available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Analyze an IP record using the LLM for intelligent threat assessment
   */
  async analyzeIP(record: CorrelatedIpRecord): Promise<LLMAnalysisResult | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      // Check cache first
      const cacheKey = this.getCacheKey(record);
      const cached = this.getCachedResponse(cacheKey);
      if (cached) {
        return cached;
      }

      // Cache miss - generate new analysis
      const prompt = this.buildAnalysisPrompt(record);
      const response = await this.callOllama(prompt);

      if (!response) {
        return null;
      }

      const result = this.parseAnalysisResponse(response, record);

      // Cache the result
      if (result) {
        this.setCachedResponse(cacheKey, result);
      }

      return result;
    } catch (error) {
      logger.error({ error }, 'LLM analysis failed');
      return null;
    }
  }

  /**
   * Build the analysis prompt from IP record data
   */
  private buildAnalysisPrompt(record: CorrelatedIpRecord): string {
    // Collect all relevant data points
    const dataPoints = this.collectDataPoints(record);
    const threatIntel = this.extractThreatIntelligence(record);
    const attackContext = this.extractAttackContext(record);
    const preAnalysis = this.performPreAnalysis(record);

    const providersSucceeded = record.metadata?.providersSucceeded ?? 0;
    const providersQueried = record.metadata?.providersQueried ?? 0;
    const dataQuality = providersSucceeded >= 8 ? 'HIGH' : providersSucceeded >= 5 ? 'MEDIUM' : 'LOW';

    // Concise JSON schema with key requirements
    const jsonExample = {
      reasoning: "Write 3-5 paragraphs: (1) IP identification with TIER 1 source confirmation, (2) Cross-source correlation with specific numbers/dates, (3) Contradiction analysis weighted by trust tiers, (4) Severity justification with evidence, (5) Confidence factors. ALWAYS cite: source names, exact numbers, first/last seen dates, malware families, campaign names.",
      verdict: "BLOCK | INVESTIGATE | MONITOR | ALLOW",
      severityLevel: "critical | high | medium | low | safe",
      executiveSummary: "Single sentence: [SEVERITY] threat - [KEY FINDING] ([TOP SOURCE]) with [EVIDENCE]; recommend [ACTION]",
      summary: "2-3 paragraphs with org/location context, specific threats with sources, handling rationale",
      riskAssessment: "Technical analysis: malicious behaviors (numbers+sources), timeline (first/last seen), impact, confidence justification",
      recommendations: ["3-5 specific technical actions", "GOOD: 'Block at firewall, query SIEM for connections in last 90d'", "BAD: 'Monitor the IP'"],
      threatIndicators: ["5-10 specific indicators", "Format: '847 AbuseIPDB reports (SSH brute-force)'", "NOT: 'abuse reports'"],
      confidence: 85
    };

    return `You are a senior SOC analyst. Analyze this IP and output ONLY valid JSON (no markdown, no code blocks).

## TARGET: ${record.ip}
Org: ${dataPoints.org} | Location: ${dataPoints.location} | ASN: ${record.asn || 'Unknown'}
Network: ${dataPoints.networkType} | Abuse: ${dataPoints.abuseScore} | Risk: ${record.threat?.riskLevel || 'unknown'}
Data Quality: ${dataQuality} (${providersSucceeded}/${providersQueried} sources)

## SOURCE TRUST TIERS (weight by tier when correlating):
TIER 1 (9-10/10): abuse.ch (10/10), AbuseIPDB (9/10), VirusTotal (9/10), AlienVault OTX (9/10)
TIER 2 (7-8/10): GreyNoise (8/10), CrowdSec (8/10), Shodan (8/10), IPQualityScore (8/10)
TIER 3 (6-7/10): ThreatMiner (7/10), Pulsedive (7/10)

## THREAT INTELLIGENCE
${threatIntel || 'No detailed threat intelligence available.'}

## ATTACK PATTERNS
${attackContext || 'No specific attack patterns identified.'}

## PRE-ANALYSIS
Concerns: ${preAnalysis.concerns.length > 0 ? preAnalysis.concerns.join('; ') : 'None'}
Benign: ${preAnalysis.benignIndicators.length > 0 ? preAnalysis.benignIndicators.join('; ') : 'None'}
MITRE: ${preAnalysis.mitreTechniques.length > 0 ? preAnalysis.mitreTechniques.join('; ') : 'None'}

## ANALYSIS METHOD
1. CORRELATE: Cross-reference sources, weight TIER 1 highest, explain conflicts
2. CHARACTERIZE: Confirmed vs suspected threats, active vs historical, specific IOCs (malware families, campaigns, CVEs)
3. TEMPORAL: Analyze first/last seen dates, activity trends (escalating/stable/declining)
4. FALSE POSITIVE CHECK: Legitimate infra (CDN/cloud)? GreyNoise RIOT? Benign > malicious?
5. RISK: Threat level, attack surface (open ports/CVEs), business impact

## OUTPUT FORMAT
${JSON.stringify(jsonExample, null, 2)}

## REQUIREMENTS
✓ Cite specific sources, numbers, dates, malware families, campaigns
✓ Reasoning: 3-5 paragraphs with evidence-based analysis
✓ Handle conflicts: explain which source to trust and why
✗ No generic statements ("multiple reports" → "847 AbuseIPDB reports")
✗ No vague language ("may be" → make determination based on evidence)

Output JSON only:`;
  }

  /**
   * Collect and format data points from the record
   */
  private collectDataPoints(record: CorrelatedIpRecord): {
    org: string;
    location: string;
    networkType: string;
    abuseScore: string;
    flags: string[];
  } {
    const flags: string[] = [];
    if (record.flags?.isProxy) flags.push('Proxy');
    if (record.flags?.isVpn) flags.push('VPN');
    if (record.flags?.isTor) flags.push('Tor Exit Node');
    if (record.flags?.isHosting) flags.push('Hosting/Datacenter');
    if (record.flags?.isMobile) flags.push('Mobile Network');

    const location = record.location
      ? [record.location.city, record.location.region, record.location.country]
          .filter(Boolean)
          .join(', ') || 'Unknown'
      : 'Unknown';

    const abuseScore = record.threat?.abuseScore;

    return {
      org: record.org || 'Unknown organization',
      location,
      networkType: flags.length > 0 ? flags.join(', ') : 'Standard residential/business',
      abuseScore: abuseScore !== undefined ? `${abuseScore}/100` : 'Not available',
      flags,
    };
  }

  /**
   * Perform pre-analysis to guide the LLM
   */
  private performPreAnalysis(record: CorrelatedIpRecord): {
    verdict: string;
    actionVerdict: 'BLOCK' | 'INVESTIGATE' | 'MONITOR' | 'ALLOW';
    severity: 'critical' | 'high' | 'medium' | 'low' | 'safe';
    confidence: number;
    concerns: string[];
    benignIndicators: string[];
    recommendations: string[];
    indicators: string[];
    mitreTechniques: string[];
  } {
    const concerns: string[] = [];
    const benignIndicators: string[] = [];
    const mitreTechniques: string[] = [];

    const dataPoints = this.collectDataPoints(record);
    const abuseScore = record.threat?.abuseScore ?? 0;

    // Analyze provider data for concerns and benign indicators
    const providers = record.metadata?.providers || [];
    for (const p of providers) {
      if (!p.success || !p.raw) continue;
      const raw = p.raw as Record<string, unknown>;

      // Critical threats
      if (raw.isBotnetC2 === true) {
        concerns.push('CONFIRMED BOTNET C2');
        mitreTechniques.push('T1071 - Application Layer Protocol', 'T1573 - Encrypted Channel');
      }
      const feodoTracker = raw.feodoTracker as Record<string, unknown> | undefined;
      if (feodoTracker?.query_status === 'ok') {
        concerns.push(`Active botnet: ${feodoTracker.malware || 'Unknown family'}`);
        mitreTechniques.push('T1071 - Application Layer Protocol');
      }

      // VirusTotal detections
      if (typeof raw.malicious === 'number' && raw.malicious > 0) {
        concerns.push(`${raw.malicious} VirusTotal detections`);
      }

      // Abuse reports
      if (typeof raw.totalReports === 'number' && raw.totalReports > 10) {
        concerns.push(`${raw.totalReports} abuse reports`);
      }

      // Attack categories from AbuseIPDB
      if (Array.isArray(raw.categories) && raw.categories.length > 0) {
        const attackMap: Record<number, { name: string; mitre?: string }> = {
          4: { name: 'DDoS', mitre: 'T1498 - Network Denial of Service' },
          14: { name: 'Port Scanning', mitre: 'T1046 - Network Service Discovery' },
          15: { name: 'Hacking', mitre: 'T1190 - Exploit Public-Facing Application' },
          18: { name: 'Brute Force', mitre: 'T1110 - Brute Force' },
          21: { name: 'Web App Attack', mitre: 'T1190 - Exploit Public-Facing Application' },
          22: { name: 'SSH Attack', mitre: 'T1021.004 - Remote Services: SSH' },
        };
        for (const cat of raw.categories as number[]) {
          const attack = attackMap[cat];
          if (attack) {
            concerns.push(attack.name);
            if (attack.mitre && !mitreTechniques.includes(attack.mitre)) {
              mitreTechniques.push(attack.mitre);
            }
          }
        }
      }

      // Benign indicators
      if (raw.riot === true) benignIndicators.push('GreyNoise RIOT (known service)');
      if (raw.classification === 'benign') benignIndicators.push('GreyNoise benign classification');
    }

    // Infrastructure context
    if (record.flags?.isTor) {
      concerns.push('Tor exit node');
      mitreTechniques.push('T1090.003 - Proxy: Multi-hop Proxy');
    }
    if (record.org?.toLowerCase().includes('cloudflare')) {
      benignIndicators.push('Cloudflare CDN infrastructure');
    }
    if (record.org?.toLowerCase().includes('google')) {
      benignIndicators.push('Google infrastructure');
    }
    if (record.org?.toLowerCase().includes('amazon') || record.org?.toLowerCase().includes('aws')) {
      benignIndicators.push('AWS infrastructure');
    }

    // Determine severity and verdict
    let severity: 'critical' | 'high' | 'medium' | 'low' | 'safe';
    let actionVerdict: 'BLOCK' | 'INVESTIGATE' | 'MONITOR' | 'ALLOW';

    const hasCriticalThreat = concerns.some(c =>
      c.includes('BOTNET') || c.includes('botnet') || c.includes('C2')
    );
    const hasBenign = benignIndicators.length > 0;

    if (hasCriticalThreat) {
      severity = 'critical';
      actionVerdict = 'BLOCK';
    } else if (abuseScore >= 80 && !hasBenign) {
      severity = 'critical';
      actionVerdict = 'BLOCK';
    } else if (abuseScore >= 50 || concerns.length >= 3) {
      severity = hasBenign ? 'medium' : 'high';
      actionVerdict = hasBenign ? 'INVESTIGATE' : 'BLOCK';
    } else if (abuseScore >= 25 || concerns.length >= 1) {
      severity = 'medium';
      actionVerdict = 'INVESTIGATE';
    } else if (hasBenign && concerns.length === 0) {
      severity = 'safe';
      actionVerdict = 'ALLOW';
    } else {
      severity = 'low';
      actionVerdict = 'MONITOR';
    }

    // Build verdict string
    let verdict: string;
    if (concerns.length > 0 && benignIndicators.length > 0) {
      verdict = `MIXED: Concerns (${concerns.slice(0, 3).join(', ')}) vs Benign (${benignIndicators.slice(0, 2).join(', ')})`;
    } else if (concerns.length > 0) {
      verdict = `MALICIOUS: ${concerns.slice(0, 4).join(', ')}`;
    } else if (benignIndicators.length > 0) {
      verdict = `BENIGN: ${benignIndicators.slice(0, 3).join(', ')}`;
    } else {
      verdict = 'UNKNOWN: Insufficient threat intelligence';
    }

    // Calculate confidence
    const providersSucceeded = record.metadata?.providersSucceeded ?? 0;
    let confidence = 50 + (providersSucceeded * 5);
    if (concerns.length > 0) confidence += 10;
    if (benignIndicators.length > 0) confidence += 5;
    if (hasCriticalThreat) confidence = 95;
    confidence = Math.min(98, Math.max(40, confidence));

    // Build recommendations and indicators
    const recommendations = this.buildRecommendations(record, severity);
    const indicators = this.buildThreatIndicators(record, dataPoints.flags);

    return {
      verdict,
      actionVerdict,
      severity,
      confidence,
      concerns,
      benignIndicators,
      recommendations,
      indicators,
      mitreTechniques: mitreTechniques.slice(0, 5),
    };
  }

  /**
   * Build severity-appropriate recommendations
   */
  private buildRecommendations(_record: CorrelatedIpRecord, severity: string): string[] {
    if (severity === 'critical') {
      return [
        'BLOCK IMMEDIATELY at perimeter firewall',
        'Hunt for any successful connections from this IP in logs',
        'Check authentication logs for brute force attempts',
        'Review endpoint telemetry for signs of compromise',
        'Add to internal threat intelligence blocklists'
      ];
    }

    if (severity === 'high') {
      return [
        'Block this IP at firewall level',
        'Review all access logs for interactions with this IP',
        'Enable enhanced monitoring for traffic from this source',
        'Correlate with SIEM alerts for related activity',
        'Consider adding to watchlist for ongoing monitoring'
      ];
    }

    if (severity === 'medium') {
      return [
        'Enable enhanced logging for this IP',
        'Monitor traffic patterns for suspicious activity',
        'Review access frequency and request patterns',
        'Consider rate limiting if traffic is excessive'
      ];
    }

    if (severity === 'low') {
      return [
        'Continue standard monitoring',
        'Review access patterns periodically',
        'No immediate action required'
      ];
    }

    // Safe
    return [
      'No action required - legitimate infrastructure',
      'Continue standard monitoring procedures'
    ];
  }

  /**
   * Build comprehensive threat indicators list
   */
  private buildThreatIndicators(record: CorrelatedIpRecord, flags: string[]): string[] {
    const indicators: string[] = [];

    // Add flags
    flags.forEach(f => indicators.push(f));

    // Add abuse score indicator if significant
    const abuseScore = record.threat?.abuseScore;
    if (abuseScore !== undefined && abuseScore >= 25) {
      indicators.push(`Abuse score: ${abuseScore}/100`);
    }

    // Extract from provider data
    const providers = record.metadata?.providers || [];
    for (const p of providers) {
      if (!p.success || !p.raw) continue;
      const raw = p.raw as Record<string, unknown>;

      // AbuseIPDB report count
      if (typeof raw.totalReports === 'number' && raw.totalReports > 0) {
        indicators.push(`${raw.totalReports} AbuseIPDB reports`);
      }

      // VirusTotal detections
      if (typeof raw.malicious === 'number' && raw.malicious > 0) {
        indicators.push(`${raw.malicious} VirusTotal malicious detections`);
      }

      // Botnet C2
      if (raw.isBotnetC2 === true) {
        indicators.push('CONFIRMED BOTNET C2');
      }

      // Shodan vulnerabilities
      if (Array.isArray(raw.vulns) && raw.vulns.length > 0) {
        indicators.push(`${raw.vulns.length} CVEs detected`);
      }

      // Open ports of concern
      if (Array.isArray(raw.ports)) {
        const concerningPorts = raw.ports.filter((port: unknown) =>
          typeof port === 'number' && [22, 23, 3389, 445, 139].includes(port)
        );
        if (concerningPorts.length > 0) {
          indicators.push(`Sensitive ports open: ${concerningPorts.join(', ')}`);
        }
      }
    }

    return indicators.length > 0 ? indicators.slice(0, 8) : ['None identified'];
  }

  /**
   * Extract attack context from abuse reports and threat intel
   */
  private extractAttackContext(record: CorrelatedIpRecord): string {
    const contexts: string[] = [];
    const providers = record.metadata?.providers || [];

    for (const p of providers) {
      if (!p.success || !p.raw) continue;
      const raw = p.raw as Record<string, unknown>;

      // AbuseIPDB categories
      if (Array.isArray(raw.categories)) {
        const categoryMap: Record<number, string> = {
          3: 'Fraud Orders', 4: 'DDoS Attack', 5: 'FTP Brute-Force',
          6: 'Ping of Death', 7: 'Phishing', 8: 'Fraud VoIP',
          9: 'Open Proxy', 10: 'Web Spam', 11: 'Email Spam',
          14: 'Port Scan', 15: 'Hacking', 18: 'Brute-Force',
          19: 'Bad Web Bot', 20: 'Exploited Host', 21: 'Web App Attack',
          22: 'SSH', 23: 'IoT Targeted'
        };
        const attacks = (raw.categories as number[])
          .map(c => categoryMap[c])
          .filter(Boolean);
        if (attacks.length > 0) {
          contexts.push(`Attack types: ${attacks.slice(0, 4).join(', ')}`);
        }
      }

      // Malware families from ThreatFox/URLhaus
      const urlhaus = raw.urlhaus as Record<string, unknown> | undefined;
      if (urlhaus?.urls && Array.isArray(urlhaus.urls)) {
        const threats = new Set<string>();
        for (const url of urlhaus.urls as Array<{ threat?: string }>) {
          if (url.threat) threats.add(url.threat);
        }
        if (threats.size > 0) {
          contexts.push(`Malware: ${Array.from(threats).slice(0, 3).join(', ')}`);
        }
      }

      // Feodo tracker malware family
      const feodoTracker = raw.feodoTracker as Record<string, unknown> | undefined;
      if (feodoTracker?.malware) {
        contexts.push(`Botnet family: ${feodoTracker.malware}`);
      }

      // GreyNoise actor info
      if (typeof raw.name === 'string' && raw.name) {
        contexts.push(`Identified as: ${raw.name}`);
      }
    }

    return contexts.join('. ');
  }

  /**
   * Extract detailed threat intelligence from provider raw data with structured formatting
   */
  private extractThreatIntelligence(record: CorrelatedIpRecord): string {
    const sections: string[] = [];
    const providers = record.metadata?.providers || [];

    for (const provider of providers) {
      if (!provider.success || !provider.raw) continue;

      const raw = provider.raw as any;
      const providerIntel: string[] = [];

      // ThreatMiner data - Enhanced with specific details
      if (provider.provider === 'threatminer.org') {
        providerIntel.push(`**ThreatMiner Intelligence:**`);

        if (raw.malwareSamples?.length > 0) {
          providerIntel.push(`  - Malware Samples: ${raw.malwareSamples.length} associated samples`);
          // Extract specific sample hashes (first 3)
          const samples = raw.malwareSamples.slice(0, 3).map((s: any) => {
            if (typeof s === 'string') return s;
            return s.hash || s.md5 || s.sha256 || 'Unknown hash';
          });
          if (samples.length > 0) {
            providerIntel.push(`    Samples: ${samples.join(', ')}`);
          }
        }

        if (raw.reportTags?.length > 0) {
          providerIntel.push(`  - Threat Reports: ${raw.reportTags.length} reports reference this IP`);
          // Extract report tags
          const tags = Array.isArray(raw.reportTags) ? raw.reportTags.slice(0, 5).join(', ') : raw.reportTags;
          providerIntel.push(`    Tags: ${tags}`);
        }

        if (raw.passiveDns?.length > 0) {
          providerIntel.push(`  - Passive DNS: ${raw.passiveDns.length} historical DNS records`);
          const domains = raw.passiveDns.slice(0, 3).map((d: any) => d.domain || d).join(', ');
          if (domains) providerIntel.push(`    Domains: ${domains}`);
        }

        if (raw.threatIndicators?.length > 0) {
          providerIntel.push(`  - Threat Indicators: ${raw.threatIndicators.join(', ')}`);
        }

        if (providerIntel.length > 1) sections.push(providerIntel.join('\n'));
      }

      // AlienVault OTX data - Enhanced with pulse details
      if (provider.provider === 'otx.alienvault.com') {
        providerIntel.push(`**AlienVault OTX Intelligence:**`);

        if (raw.general?.pulse_info?.count > 0) {
          providerIntel.push(`  - Threat Pulses: Referenced in ${raw.general.pulse_info.count} active threat campaigns`);

          // Extract detailed pulse information
          if (raw.pulses?.length > 0) {
            providerIntel.push(`  - Campaign Details:`);
            for (const pulse of raw.pulses.slice(0, 3)) {
              const pulseName = pulse.name || 'Unnamed Campaign';
              const pulseDate = pulse.created ? new Date(pulse.created).toLocaleDateString() : 'Unknown date';
              providerIntel.push(`    • "${pulseName}" (${pulseDate})`);

              if (pulse.description) {
                const desc = pulse.description.substring(0, 100) + (pulse.description.length > 100 ? '...' : '');
                providerIntel.push(`      Description: ${desc}`);
              }

              if (pulse.tags && pulse.tags.length > 0) {
                providerIntel.push(`      Tags: ${pulse.tags.slice(0, 5).join(', ')}`);
              }
            }
          }
        }

        if (raw.malwareSampleCount > 0) {
          providerIntel.push(`  - Malware Samples: ${raw.malwareSampleCount} samples linked to this IP`);
        }

        if (raw.threatIndicators?.length > 0) {
          providerIntel.push(`  - IOC Indicators: ${raw.threatIndicators.join(', ')}`);
        }

        if (providerIntel.length > 1) sections.push(providerIntel.join('\n'));
      }

      // GreyNoise data - Enhanced with actor profiling
      if (provider.provider === 'greynoise.io') {
        providerIntel.push(`**GreyNoise Intelligence:**`);

        if (raw.classification) {
          const classification = raw.classification.toUpperCase();
          providerIntel.push(`  - Classification: ${classification}`);
        }

        if (raw.noise === true) {
          providerIntel.push(`  - Activity: Internet background noise/scanning activity detected`);
        }

        if (raw.riot === true) {
          providerIntel.push(`  - RIOT Dataset: Known benign service provider`);
          if (raw.trust_level) {
            providerIntel.push(`    Trust Level: ${raw.trust_level}`);
          }
        }

        if (raw.name) {
          providerIntel.push(`  - Actor Identification: ${raw.name}`);
        }

        if (raw.tags && raw.tags.length > 0) {
          providerIntel.push(`  - Tags: ${raw.tags.join(', ')}`);
        }

        if (raw.metadata) {
          if (raw.metadata.organization) {
            providerIntel.push(`  - Organization: ${raw.metadata.organization}`);
          }
          if (raw.metadata.category) {
            providerIntel.push(`  - Category: ${raw.metadata.category}`);
          }
        }

        if (raw.first_seen) {
          providerIntel.push(`  - First Seen: ${raw.first_seen}`);
        }
        if (raw.last_seen) {
          providerIntel.push(`  - Last Seen: ${raw.last_seen}`);
        }

        if (raw.threatIndicators?.length > 0) {
          providerIntel.push(`  - Indicators: ${raw.threatIndicators.join(', ')}`);
        }

        if (providerIntel.length > 1) sections.push(providerIntel.join('\n'));
      }

      // CrowdSec CTI data - Enhanced with behavioral analysis
      if (provider.provider === 'crowdsec.net') {
        providerIntel.push(`**CrowdSec CTI Intelligence:**`);

        if (raw.reputation) {
          providerIntel.push(`  - Reputation Score: ${raw.reputation}`);
        }

        if (raw.behaviors?.length > 0) {
          providerIntel.push(`  - Observed Behaviors (${raw.behaviors.length} total):`);
          for (const behavior of raw.behaviors.slice(0, 5)) {
            const label = behavior.label || behavior.name || behavior;
            const count = behavior.count || '';
            providerIntel.push(`    • ${label}${count ? ` (${count} occurrences)` : ''}`);
          }
        }

        if (raw.attackDetails?.length > 0) {
          providerIntel.push(`  - Attack Details:`);
          for (const attack of raw.attackDetails.slice(0, 3)) {
            const attackName = attack.name || attack.label || attack;
            const scenario = attack.scenario || '';
            providerIntel.push(`    • ${attackName}${scenario ? ` - ${scenario}` : ''}`);
          }
        }

        if (raw.targetCountries?.length > 0) {
          providerIntel.push(`  - Geographic Targeting: ${raw.targetCountries.slice(0, 5).join(', ')}`);
        }

        if (raw.scores) {
          providerIntel.push(`  - Threat Scores:`);
          for (const [metric, value] of Object.entries(raw.scores)) {
            if (typeof value === 'object' && value !== null) {
              const scoreObj = value as any;
              if (scoreObj.aggressiveness !== undefined || scoreObj.threat !== undefined) {
                providerIntel.push(`    ${metric}: Aggressiveness ${scoreObj.aggressiveness || 0}/5, Threat ${scoreObj.threat || 0}/5`);
              }
            } else if (typeof value === 'number' && value > 0) {
              providerIntel.push(`    ${metric}: ${value}`);
            }
          }
        }

        if (raw.threatIndicators?.length > 0) {
          providerIntel.push(`  - Indicators: ${raw.threatIndicators.join(', ')}`);
        }

        if (providerIntel.length > 1) sections.push(providerIntel.join('\n'));
      }

      // IPQualityScore data - Enhanced with fraud analysis
      if (provider.provider === 'ipqualityscore.com') {
        providerIntel.push(`**IPQualityScore Intelligence:**`);

        if (raw.fraud_score !== undefined) {
          const score = raw.fraud_score;
          const risk = score >= 75 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW';
          providerIntel.push(`  - Fraud Score: ${score}/100 (${risk} RISK)`);
        }

        const detections: string[] = [];
        if (raw.bot_status === true) detections.push('Bot traffic');
        if (raw.is_crawler === true) detections.push('Crawler');
        if (raw.recent_abuse === true) detections.push('Recent abuse');
        if (raw.vpn === true) detections.push('VPN');
        if (raw.proxy === true) detections.push('Proxy');
        if (raw.tor === true) detections.push('Tor');

        if (detections.length > 0) {
          providerIntel.push(`  - Detections: ${detections.join(', ')}`);
        }

        if (raw.connection_type) {
          providerIntel.push(`  - Connection Type: ${raw.connection_type}`);
        }

        if (raw.abuse_velocity) {
          providerIntel.push(`  - Abuse Velocity: ${raw.abuse_velocity.toUpperCase()}`);
        }

        if (raw.operating_system) {
          providerIntel.push(`  - Operating System: ${raw.operating_system}`);
        }

        if (raw.threatIndicators?.length > 0) {
          providerIntel.push(`  - Indicators: ${raw.threatIndicators.join(', ')}`);
        }

        if (providerIntel.length > 1) sections.push(providerIntel.join('\n'));
      }

      // Pulsedive data - Enhanced with feed correlation
      if (provider.provider === 'pulsedive.com') {
        providerIntel.push(`**Pulsedive Intelligence:**`);

        if (raw.risk) {
          providerIntel.push(`  - Risk Category: ${raw.risk.toUpperCase()}`);
        }

        if (raw.riskScore !== undefined) {
          providerIntel.push(`  - Risk Score: ${raw.riskScore}`);
        }

        if (raw.threats?.length > 0) {
          providerIntel.push(`  - Associated Threats:`);
          for (const threat of raw.threats.slice(0, 5)) {
            const threatName = threat.name || threat;
            const category = threat.category || '';
            providerIntel.push(`    • ${threatName}${category ? ` (${category})` : ''}`);
          }
        }

        if (raw.feeds?.length > 0) {
          providerIntel.push(`  - Threat Feeds (${raw.feeds.length} total):`);
          const feedNames = raw.feeds.slice(0, 5).map((f: any) => f.name || f).join(', ');
          providerIntel.push(`    ${feedNames}`);
        }

        if (raw.linkedIndicators > 0) {
          providerIntel.push(`  - Linked Indicators: ${raw.linkedIndicators} related IOCs`);
        }

        if (raw.threatIndicators?.length > 0) {
          providerIntel.push(`  - Indicators: ${raw.threatIndicators.join(', ')}`);
        }

        if (providerIntel.length > 1) sections.push(providerIntel.join('\n'));
      }

      // abuse.ch data - Enhanced with malware distribution analysis
      if (provider.provider === 'abuse.ch') {
        providerIntel.push(`**abuse.ch Intelligence:**`);

        // URLhaus malware distribution
        if (raw.urlhaus?.query_status === 'ok' && raw.urlhaus?.urls?.length > 0) {
          providerIntel.push(`  - URLhaus: ${raw.urlhaus.urls.length} malware distribution URLs detected`);

          const malwareDetails = new Map<string, { count: number; urls: string[] }>();
          for (const url of raw.urlhaus.urls) {
            const threat = url.threat || 'Unknown';
            if (!malwareDetails.has(threat)) {
              malwareDetails.set(threat, { count: 0, urls: [] });
            }
            const details = malwareDetails.get(threat)!;
            details.count++;
            if (details.urls.length < 2 && url.url) {
              details.urls.push(url.url);
            }
          }

          providerIntel.push(`  - Malware Distribution:`);
          for (const [malware, details] of malwareDetails.entries()) {
            providerIntel.push(`    • ${malware}: ${details.count} URL(s)`);
            if (details.urls.length > 0) {
              providerIntel.push(`      URLs: ${details.urls.join(', ')}`);
            }
          }
        }

        // ThreatFox IOCs
        if (raw.threatfox?.query_status === 'ok' && raw.threatfox?.data?.length > 0) {
          providerIntel.push(`  - ThreatFox: ${raw.threatfox.data.length} IOC entries`);

          const iocDetails: string[] = [];
          for (const ioc of raw.threatfox.data.slice(0, 3)) {
            const family = ioc.malware_printable || ioc.malware || 'Unknown';
            const iocType = ioc.ioc_type || '';
            const confidence = ioc.confidence_level || '';
            iocDetails.push(`${family}${iocType ? ` (${iocType})` : ''}${confidence ? ` - ${confidence} confidence` : ''}`);
          }

          if (iocDetails.length > 0) {
            providerIntel.push(`  - IOC Details:`);
            iocDetails.forEach(detail => providerIntel.push(`    • ${detail}`));
          }
        }

        // Feodo Tracker botnet C2
        if (raw.feodoTracker?.query_status === 'ok') {
          providerIntel.push(`  - ⚠️  FEODO TRACKER: CONFIRMED ACTIVE BOTNET C2 SERVER`);

          if (raw.feodoTracker.malware) {
            providerIntel.push(`    Botnet Family: ${raw.feodoTracker.malware}`);
          }
          if (raw.feodoTracker.first_seen) {
            providerIntel.push(`    First Seen: ${raw.feodoTracker.first_seen}`);
          }
          if (raw.feodoTracker.last_seen) {
            providerIntel.push(`    Last Seen: ${raw.feodoTracker.last_seen}`);
          }
        }

        if (raw.isBotnetC2 === true) {
          providerIntel.push(`  - 🚨 CRITICAL: Active botnet command & control infrastructure`);
        }

        if (raw.threatIndicators?.length > 0) {
          providerIntel.push(`  - Indicators: ${raw.threatIndicators.join(', ')}`);
        }

        if (providerIntel.length > 1) sections.push(providerIntel.join('\n'));
      }

      // AbuseIPDB data - Enhanced with category breakdown
      if (provider.provider === 'abuseipdb.com' && raw.totalReports > 0) {
        providerIntel.push(`**AbuseIPDB Intelligence:**`);
        providerIntel.push(`  - Abuse Reports: ${raw.totalReports} reports submitted`);
        providerIntel.push(`  - Confidence Score: ${raw.abuseConfidenceScore}%`);

        if (raw.lastReportedAt) {
          providerIntel.push(`  - Last Reported: ${new Date(raw.lastReportedAt).toLocaleDateString()}`);
        }

        if (raw.usageType) {
          providerIntel.push(`  - Usage Type: ${raw.usageType}`);
        }

        sections.push(providerIntel.join('\n'));
      }

      // VirusTotal data - Enhanced with detection breakdown
      if (provider.provider === 'virustotal.com') {
        if (raw.malicious > 0 || raw.suspicious > 0 || raw.harmless > 0) {
          providerIntel.push(`**VirusTotal Intelligence:**`);
          providerIntel.push(`  - Security Vendor Detections:`);
          providerIntel.push(`    Malicious: ${raw.malicious || 0}, Suspicious: ${raw.suspicious || 0}, Harmless: ${raw.harmless || 0}`);

          if (raw.last_analysis_stats) {
            const total = Object.values(raw.last_analysis_stats as any).reduce((a: any, b: any) => a + b, 0);
            providerIntel.push(`    Total Engines: ${total}`);
          }

          sections.push(providerIntel.join('\n'));
        }
      }

      // Shodan data - Enhanced with service fingerprinting
      if (provider.provider === 'shodan.io') {
        if (raw.ports?.length > 0 || raw.vulns?.length > 0) {
          providerIntel.push(`**Shodan Intelligence:**`);

          if (raw.ports?.length > 0) {
            providerIntel.push(`  - Exposed Services: ${raw.ports.length} open ports`);
            providerIntel.push(`    Ports: ${raw.ports.slice(0, 15).join(', ')}`);
          }

          if (raw.vulns?.length > 0) {
            providerIntel.push(`  - Vulnerabilities: ${raw.vulns.length} CVEs detected`);
            providerIntel.push(`    CVEs: ${raw.vulns.slice(0, 5).join(', ')}`);
          }

          if (raw.hostnames?.length > 0) {
            providerIntel.push(`  - Hostnames: ${raw.hostnames.slice(0, 3).join(', ')}`);
          }

          sections.push(providerIntel.join('\n'));
        }
      }

      // BGPView data
      if (provider.provider === 'bgpview.io') {
        if (raw.relatedPrefixCount > 2 || raw.ptrRecord) {
          providerIntel.push(`**BGPView Intelligence:**`);

          if (raw.relatedPrefixCount > 2) {
            providerIntel.push(`  - BGP Announcements: Advertised in ${raw.relatedPrefixCount} prefixes`);
          }

          if (raw.ptrRecord) {
            providerIntel.push(`  - PTR Record: ${raw.ptrRecord}`);
          }

          if (raw.threatIndicators?.length > 0) {
            providerIntel.push(`  - Indicators: ${raw.threatIndicators.join(', ')}`);
          }

          sections.push(providerIntel.join('\n'));
        }
      }
    }

    return sections.length > 0
      ? sections.join('\n\n')
      : 'No detailed threat intelligence available from providers.';
  }

  /**
   * Call Ollama API with the prompt
   * Uses optimized parameters for fast, high-quality analysis
   */
  private async callOllama(prompt: string): Promise<string | null> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          format: 'json',
          options: {
            temperature: 0.3,        // Lower for faster, more focused responses
            top_p: 0.85,             // Slightly narrower for consistency
            top_k: 40,               // Reduced for faster token selection
            num_predict: 800,        // Reduced from 1024 - most responses fit in 500-700 tokens
            repeat_penalty: 1.15,    // Lower penalty for faster generation
            stop: [],                // No stop sequences - let it complete the full JSON
            num_ctx: 4096,           // Context window size (explicit setting)
            num_batch: 512,          // Batch size for prompt processing (faster)
            num_gpu: 1,              // Use GPU if available
            num_thread: 4,           // CPU threads if no GPU
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        logger.error({ status: response.status, statusText: response.statusText }, 'Ollama API error');
        return null;
      }

      const data = (await response.json()) as OllamaResponse;
      const duration = Date.now() - startTime;

      logger.debug({
        duration,
        tokens: data.eval_count,
        tokensPerSecond: data.eval_count && data.eval_duration ? (data.eval_count / (data.eval_duration / 1e9)).toFixed(1) : undefined
      }, 'LLM analysis completed');

      return data.response;
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn({ duration, timeout: this.timeoutMs }, 'Ollama request timed out');
      } else {
        logger.error({ error, duration }, 'Ollama request failed');
      }
      return null;
    }
  }

  /**
   * Parse the LLM response into structured analysis
   */
  private parseAnalysisResponse(
    response: string,
    record: CorrelatedIpRecord
  ): LLMAnalysisResult {
    const preAnalysis = this.performPreAnalysis(record);

    // Extract enriched threat intelligence
    const providers = record.metadata?.providers || [];
    const enrichedIntel = this.threatIntelExtractor.extractAll(providers);

    // Enhance MITRE mapping with extracted indicators
    const mitreMapping = this.threatIntelExtractor.enhanceMitreMapping(
      preAnalysis.indicators,
      preAnalysis.concerns,
      []
    );

    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || this.generateFallbackSummary(record),
          riskAssessment: parsed.riskAssessment || 'Unable to generate detailed assessment',
          recommendations: Array.isArray(parsed.recommendations)
            ? parsed.recommendations
            : preAnalysis.recommendations,
          threatIndicators: Array.isArray(parsed.threatIndicators)
            ? parsed.threatIndicators
            : preAnalysis.indicators,
          confidence: typeof parsed.confidence === 'number'
            ? Math.min(100, Math.max(0, parsed.confidence))
            : preAnalysis.confidence,
          analysisTimestamp: new Date().toISOString(),
          modelUsed: this.model,
          // Enhanced fields
          verdict: parsed.verdict || preAnalysis.actionVerdict,
          severityLevel: parsed.severityLevel || preAnalysis.severity,
          executiveSummary: parsed.executiveSummary || this.generateExecutiveSummary(record, preAnalysis),
          technicalDetails: parsed.technicalDetails || this.generateTechnicalDetails(record, preAnalysis),
          mitreAttackTechniques: Array.isArray(parsed.mitreAttackTechniques)
            ? parsed.mitreAttackTechniques
            : preAnalysis.mitreTechniques,
          indicatorDetails: this.buildIndicatorDetails(
            Array.isArray(parsed.threatIndicators) ? parsed.threatIndicators : preAnalysis.indicators,
            preAnalysis
          ),
          // New enriched threat intelligence fields
          reasoning: parsed.reasoning || undefined,
          vulnerabilities: enrichedIntel.vulnerabilities.length > 0 ? enrichedIntel.vulnerabilities : undefined,
          temporalTrends: enrichedIntel.temporalTrends.length > 0 ? enrichedIntel.temporalTrends : undefined,
          malwareFamilies: enrichedIntel.malwareFamilies.length > 0 ? enrichedIntel.malwareFamilies : undefined,
          threatCampaigns: enrichedIntel.threatCampaigns.length > 0 ? enrichedIntel.threatCampaigns : undefined,
          infrastructure: Object.keys(enrichedIntel.infrastructure).length > 0 ? enrichedIntel.infrastructure : undefined,
          abusePatterns: enrichedIntel.abusePatterns || undefined,
          mitreMapping: mitreMapping.length > 0 ? mitreMapping : undefined,
        };
      }
    } catch (parseError) {
      logger.warn('Failed to parse LLM JSON response, using fallback');
    }

    // Fallback if JSON parsing fails
    return {
      summary: this.generateFallbackSummary(record),
      riskAssessment: response.substring(0, 500) || 'Analysis unavailable',
      recommendations: preAnalysis.recommendations,
      threatIndicators: preAnalysis.indicators,
      confidence: preAnalysis.confidence,
      analysisTimestamp: new Date().toISOString(),
      modelUsed: this.model,
      verdict: preAnalysis.actionVerdict,
      severityLevel: preAnalysis.severity,
      executiveSummary: this.generateExecutiveSummary(record, preAnalysis),
      technicalDetails: this.generateTechnicalDetails(record, preAnalysis),
      mitreAttackTechniques: preAnalysis.mitreTechniques,
      indicatorDetails: this.buildIndicatorDetails(preAnalysis.indicators, preAnalysis),
      // Enriched threat intelligence even in fallback
      vulnerabilities: enrichedIntel.vulnerabilities.length > 0 ? enrichedIntel.vulnerabilities : undefined,
      temporalTrends: enrichedIntel.temporalTrends.length > 0 ? enrichedIntel.temporalTrends : undefined,
      malwareFamilies: enrichedIntel.malwareFamilies.length > 0 ? enrichedIntel.malwareFamilies : undefined,
      threatCampaigns: enrichedIntel.threatCampaigns.length > 0 ? enrichedIntel.threatCampaigns : undefined,
      infrastructure: Object.keys(enrichedIntel.infrastructure).length > 0 ? enrichedIntel.infrastructure : undefined,
      abusePatterns: enrichedIntel.abusePatterns || undefined,
      mitreMapping: mitreMapping.length > 0 ? mitreMapping : undefined,
    };
  }

  /**
   * Generate executive summary for quick decision making
   */
  private generateExecutiveSummary(
    record: CorrelatedIpRecord,
    preAnalysis: ReturnType<typeof this.performPreAnalysis>
  ): string {
    const actionMap = {
      BLOCK: 'Immediate blocking recommended',
      INVESTIGATE: 'Further investigation required',
      MONITOR: 'Standard monitoring sufficient',
      ALLOW: 'Safe to allow',
    };
    const org = record.org || 'Unknown source';
    return `${preAnalysis.severity.toUpperCase()} THREAT: ${org} - ${actionMap[preAnalysis.actionVerdict]}.`;
  }

  /**
   * Generate technical details summary
   */
  private generateTechnicalDetails(
    record: CorrelatedIpRecord,
    preAnalysis: ReturnType<typeof this.performPreAnalysis>
  ): string {
    const details: string[] = [];
    const providersSucceeded = record.metadata?.providersSucceeded ?? 0;
    const providersQueried = record.metadata?.providersQueried ?? 0;

    details.push(`Data from ${providersSucceeded}/${providersQueried} threat intelligence sources.`);

    if (preAnalysis.concerns.length > 0) {
      details.push(`Key concerns: ${preAnalysis.concerns.slice(0, 3).join(', ')}.`);
    }
    if (preAnalysis.benignIndicators.length > 0) {
      details.push(`Benign indicators: ${preAnalysis.benignIndicators.slice(0, 2).join(', ')}.`);
    }
    if (record.threat?.abuseScore !== undefined) {
      details.push(`Abuse confidence score: ${record.threat.abuseScore}%.`);
    }

    return details.join(' ');
  }

  /**
   * Build detailed indicator information with severity
   */
  private buildIndicatorDetails(
    indicators: string[],
    preAnalysis: ReturnType<typeof this.performPreAnalysis>
  ): ThreatIndicatorDetail[] {
    return indicators.map(indicator => {
      const lowerIndicator = indicator.toLowerCase();
      let severity: ThreatIndicatorDetail['severity'] = 'info';
      let category = 'General';

      // Determine severity based on indicator content
      if (lowerIndicator.includes('botnet') || lowerIndicator.includes('c2') || lowerIndicator.includes('malware')) {
        severity = 'critical';
        category = 'Malware';
      } else if (lowerIndicator.includes('virustotal') || lowerIndicator.includes('malicious')) {
        severity = 'high';
        category = 'Detection';
      } else if (lowerIndicator.includes('abuse') || lowerIndicator.includes('report')) {
        severity = preAnalysis.severity === 'critical' ? 'high' : 'medium';
        category = 'Abuse Reports';
      } else if (lowerIndicator.includes('tor') || lowerIndicator.includes('proxy') || lowerIndicator.includes('vpn')) {
        severity = 'medium';
        category = 'Anonymization';
      } else if (lowerIndicator.includes('port') || lowerIndicator.includes('cve') || lowerIndicator.includes('vuln')) {
        severity = 'medium';
        category = 'Infrastructure';
      } else if (lowerIndicator.includes('hosting') || lowerIndicator.includes('datacenter')) {
        severity = 'low';
        category = 'Network Type';
      }

      return { indicator, severity, category };
    });
  }

  /**
   * Generate fallback summary based on available data
   */
  private generateFallbackSummary(record: CorrelatedIpRecord): string {
    const riskLevel = record.threat?.riskLevel || 'unknown';
    const location = record.location?.country || 'unknown location';
    const org = record.org || 'unknown organization';

    return `IP ${record.ip} from ${location} (${org}) has been assessed as ${riskLevel} risk based on available threat intelligence data.`;
  }

  /**
   * Generate a quick threat summary without full analysis
   */
  async generateQuickSummary(record: CorrelatedIpRecord): Promise<string | null> {
    if (!this.enabled) {
      return this.generateFallbackSummary(record);
    }

    try {
      const flags = [
        record.flags?.isProxy && 'proxy',
        record.flags?.isVpn && 'VPN',
        record.flags?.isTor && 'Tor exit node',
        record.flags?.isHosting && 'hosting provider',
        record.flags?.isMobile && 'mobile network',
      ].filter(Boolean);

      const threatLevel = record.threat?.riskLevel || 'undetermined';
      const abuseScore = record.threat?.abuseScore;

      const quickPrompt = `<task>Generate a single-sentence threat assessment for network security analysts.</task>

<data>
IP: ${record.ip}
Organization: ${record.org || 'Unknown'}
Location: ${record.location?.country || 'Unknown'}
Risk Level: ${threatLevel}
${abuseScore !== undefined ? `Abuse Score: ${abuseScore}/100` : ''}
Network Type: ${flags.length > 0 ? flags.join(', ') : 'standard'}
</data>

<format>
Write exactly ONE sentence (15-30 words) that:
1. States the threat level (safe/low-risk/moderate/elevated/high-risk/critical)
2. Mentions the primary concern OR confirms legitimacy
3. Ends with a brief action hint (monitor/investigate/block/allow)

Example outputs:
- "Low-risk residential IP from Germany with no abuse history; standard monitoring recommended."
- "High-risk Tor exit node with 85% abuse score linked to scanning activity; consider blocking."
- "Moderate-risk VPN endpoint from a known provider; verify legitimate use case before allowing."
</format>

Output only the sentence, nothing else:`;

      const response = await this.callOllama(quickPrompt);
      return response?.trim().replace(/^["']|["']$/g, '') || this.generateFallbackSummary(record);
    } catch {
      return this.generateFallbackSummary(record);
    }
  }

  /**
   * Batch analyze multiple IPs (useful for bulk lookups)
   * Optimized with cache checking and parallel processing
   */
  async batchAnalyze(
    records: CorrelatedIpRecord[],
    concurrency = 3 // Increased from 2 for better throughput
  ): Promise<Map<string, LLMAnalysisResult | null>> {
    const results = new Map<string, LLMAnalysisResult | null>();

    // First pass: check cache for all records
    const uncachedRecords: CorrelatedIpRecord[] = [];

    for (const record of records) {
      const cacheKey = this.getCacheKey(record);
      const cached = this.getCachedResponse(cacheKey);

      if (cached) {
        results.set(record.ip, cached);
      } else {
        uncachedRecords.push(record);
      }
    }

    if (uncachedRecords.length === 0) {
      logger.debug({ total: records.length, cached: records.length }, 'All batch records served from cache');
      return results;
    }

    logger.debug({
      total: records.length,
      cached: records.length - uncachedRecords.length,
      toAnalyze: uncachedRecords.length
    }, 'Batch analysis cache stats');

    // Second pass: analyze uncached records in parallel batches
    for (let i = 0; i < uncachedRecords.length; i += concurrency) {
      const batch = uncachedRecords.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(record => this.analyzeIP(record))
      );

      batch.forEach((record, index) => {
        results.set(record.ip, batchResults[index]);
      });
    }

    return results;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    ttlMs: number;
    hitRate?: number;
  } {
    return {
      size: this.responseCache.size,
      maxSize: 1000,
      ttlMs: this.cacheTTL,
    };
  }

  /**
   * Clear the response cache (useful for testing or manual cache invalidation)
   */
  clearCache(): void {
    const size = this.responseCache.size;
    this.responseCache.clear();
    logger.info({ clearedEntries: size }, 'LLM response cache cleared');
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    available: boolean;
    model: string;
    latencyMs?: number;
    cache?: {
      size: number;
      maxSize: number;
      ttlMs: number;
    };
  }> {
    const start = Date.now();
    const available = await this.isAvailable();
    const latencyMs = Date.now() - start;

    return {
      available,
      model: this.model,
      latencyMs: available ? latencyMs : undefined,
      cache: this.getCacheStats(),
    };
  }
}
