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

export interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type LLMProvider = 'ollama' | 'openai';

/**
 * LLM Analysis Service - Uses Ollama (local/cloud) or OpenAI-compatible cloud APIs for intelligent IP threat analysis
 */
export class LLMAnalysisService {
  private provider: LLMProvider;
  private ollamaUrl: string;
  private ollamaApiKey: string;
  private openaiApiUrl: string;
  private openaiApiKey: string;
  private model: string;
  private enabled: boolean;
  private timeoutMs: number;
  private threatIntelExtractor: ThreatIntelExtractor;

  constructor() {
    const providerRaw = getEnvString('LLM_PROVIDER', 'ollama').toLowerCase();
    this.provider = providerRaw === 'openai' ? 'openai' : 'ollama';
    this.ollamaUrl = getEnvString('OLLAMA_URL', 'http://ollama:11434');
    this.ollamaApiKey = getEnvString('OLLAMA_API_KEY', '');
    this.openaiApiUrl = getEnvString('LLM_API_URL', 'https://api.groq.com/openai/v1');
    this.openaiApiKey = getEnvString('LLM_API_KEY', '');
    this.model = this.provider === 'openai'
      ? getEnvString('LLM_MODEL', getEnvString('OLLAMA_MODEL', 'minimax-m2.5'))
      : getEnvString('OLLAMA_MODEL', 'mistral:latest');
    this.enabled = getEnvBool('LLM_ENABLED', true);
    this.timeoutMs = getEnvNumber('LLM_TIMEOUT_MS', 30000);
    this.threatIntelExtractor = new ThreatIntelExtractor();

    if (this.provider === 'openai' && !this.openaiApiKey) {
      logger.warn('LLM_PROVIDER is set to "openai" but LLM_API_KEY is missing — LLM analysis will be disabled');
      this.enabled = false;
    }

    logger.info({ provider: this.provider, model: this.model, url: this.provider === 'ollama' ? this.ollamaUrl : this.openaiApiUrl }, 'LLM Analysis Service initialized');
  }

  /**
   * Check if LLM analysis is enabled and available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      if (this.provider === 'openai') {
        // For OpenAI-compatible APIs, check the models endpoint
        const response = await fetch(`${this.openaiApiUrl}/models`, {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        return response.ok;
      }

      const headers: Record<string, string> = {};
      if (this.ollamaApiKey) {
        headers['Authorization'] = `Bearer ${this.ollamaApiKey}`;
      }

      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        headers,
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
      const prompt = this.buildAnalysisPrompt(record);
      const response = await this.callLLM(prompt);

      if (!response) {
        return null;
      }

      return this.parseAnalysisResponse(response, record);
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

    return `You are a senior SOC analyst analyzing IP threat intelligence.

## IP DATA
IP: ${record.ip}
Organization: ${dataPoints.org}
Location: ${dataPoints.location}
ASN: ${record.asn || 'Unknown'}
Network Type: ${dataPoints.networkType}
Abuse Score: ${dataPoints.abuseScore}
Risk Level: ${record.threat?.riskLevel || 'unknown'}

## THREAT INTELLIGENCE SOURCES
${threatIntel || 'No additional threat intelligence available.'}

## ATTACK CONTEXT
${attackContext || 'No specific attack patterns identified.'}

## OBSERVED FACTS
Key Concerns: ${preAnalysis.concerns.join(', ') || 'None'}
Benign Indicators: ${preAnalysis.benignIndicators.join(', ') || 'None'}
Potential MITRE Techniques: ${preAnalysis.mitreTechniques.join(', ') || 'None'}

## ANALYSIS TASK
Think through this analysis step-by-step:

1. What are the most concerning findings from the threat intelligence?
2. How do different data sources corroborate or contradict each other?
3. Are there benign explanations for any suspicious flags?
4. What is the overall threat level and recommended action?

Respond with ONLY a single JSON object (no markdown, no commentary):
{
  "verdict": "ALLOW",
  "severityLevel": "safe",
  "summary": "One paragraph describing what this IP is and the recommended action.",
  "riskAssessment": "One paragraph with the technical risk analysis.",
  "recommendations": ["First recommendation", "Second recommendation", "Third recommendation"],
  "threatIndicators": ["First indicator", "Second indicator"],
  "confidence": 85
}

Rules:
- verdict must be exactly one of: BLOCK, INVESTIGATE, MONITOR, ALLOW
- severityLevel must be exactly one of: critical, high, medium, low, safe
- confidence must be a number between 0 and 100
- Output ONLY the JSON object, nothing else`;
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
   * Extract threat intelligence from provider raw data
   */
  private extractThreatIntelligence(record: CorrelatedIpRecord): string {
    const intel: string[] = [];
    const providers = record.metadata?.providers || [];

    for (const provider of providers) {
      if (!provider.success || !provider.raw) continue;

      const raw = provider.raw as any;

      // ThreatMiner data
      if (provider.provider === 'threatminer.org') {
        if (raw.malwareSamples?.length > 0) {
          intel.push(`ThreatMiner: ${raw.malwareSamples.length} malware samples associated`);
        }
        if (raw.reportTags?.length > 0) {
          intel.push(`ThreatMiner: ${raw.reportTags.length} threat reports reference this IP`);
        }
        if (raw.passiveDns?.length > 0) {
          intel.push(`ThreatMiner: ${raw.passiveDns.length} passive DNS records`);
        }
        if (raw.threatIndicators?.length > 0) {
          intel.push(`ThreatMiner Indicators: ${raw.threatIndicators.join(', ')}`);
        }
      }

      // AlienVault OTX data
      if (provider.provider === 'otx.alienvault.com') {
        if (raw.general?.pulse_info?.count > 0) {
          intel.push(`AlienVault OTX: Referenced in ${raw.general.pulse_info.count} threat pulses`);
        }
        if (raw.malwareSampleCount > 0) {
          intel.push(`AlienVault OTX: ${raw.malwareSampleCount} malware samples linked`);
        }
        if (raw.threatIndicators?.length > 0) {
          intel.push(`OTX Indicators: ${raw.threatIndicators.join(', ')}`);
        }
        if (raw.pulses?.length > 0) {
          const pulseNames = raw.pulses.slice(0, 3).map((p: any) => p.name || 'Unnamed').join(', ');
          intel.push(`OTX Pulses: ${pulseNames}`);
        }
      }

      // GreyNoise data
      if (provider.provider === 'greynoise.io') {
        if (raw.noise === true) {
          intel.push('GreyNoise: Detected as internet background noise/scanner');
        }
        if (raw.riot === true) {
          intel.push('GreyNoise: Part of known benign service (RIOT dataset)');
        }
        if (raw.classification) {
          intel.push(`GreyNoise Classification: ${raw.classification}`);
        }
        if (raw.name) {
          intel.push(`GreyNoise Identified: ${raw.name}`);
        }
        if (raw.threatIndicators?.length > 0) {
          intel.push(`GreyNoise Indicators: ${raw.threatIndicators.join(', ')}`);
        }
      }

      // BGPView data
      if (provider.provider === 'bgpview.io') {
        if (raw.relatedPrefixCount > 2) {
          intel.push(`BGPView: Announced in ${raw.relatedPrefixCount} BGP prefixes`);
        }
        if (raw.ptrRecord) {
          intel.push(`PTR Record: ${raw.ptrRecord}`);
        }
        if (raw.threatIndicators?.length > 0) {
          intel.push(`BGP Indicators: ${raw.threatIndicators.join(', ')}`);
        }
      }

      // AbuseIPDB data
      if (provider.provider === 'abuseipdb.com' && raw.totalReports > 0) {
        intel.push(`AbuseIPDB: ${raw.totalReports} abuse reports, confidence ${raw.abuseConfidenceScore}%`);
      }

      // VirusTotal data
      if (provider.provider === 'virustotal.com') {
        if (raw.malicious > 0 || raw.suspicious > 0) {
          intel.push(`VirusTotal: ${raw.malicious} malicious, ${raw.suspicious} suspicious detections`);
        }
      }

      // Shodan data
      if (provider.provider === 'shodan.io') {
        if (raw.ports?.length > 0) {
          intel.push(`Shodan: Open ports - ${raw.ports.slice(0, 10).join(', ')}`);
        }
        if (raw.vulns?.length > 0) {
          intel.push(`Shodan Vulnerabilities: ${raw.vulns.length} CVEs detected`);
        }
      }

      // CrowdSec CTI data
      if (provider.provider === 'crowdsec.net') {
        if (raw.reputation) {
          intel.push(`CrowdSec Reputation: ${raw.reputation}`);
        }
        if (raw.behaviors?.length > 0) {
          const behaviors = raw.behaviors.slice(0, 5).map((b: any) => b.label || b.name || b).join(', ');
          intel.push(`CrowdSec Behaviors: ${behaviors}`);
        }
        if (raw.attackDetails?.length > 0) {
          const attacks = raw.attackDetails.slice(0, 3).map((a: any) => a.name || a.label || a).join(', ');
          intel.push(`CrowdSec Attack Details: ${attacks}`);
        }
        if (raw.targetCountries?.length > 0) {
          intel.push(`CrowdSec Target Countries: ${raw.targetCountries.slice(0, 5).join(', ')}`);
        }
        if (raw.scores) {
          const scores = Object.entries(raw.scores)
            .filter(([_, v]) => typeof v === 'number' && (v as number) > 0)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          if (scores) intel.push(`CrowdSec Scores: ${scores}`);
        }
        if (raw.threatIndicators?.length > 0) {
          intel.push(`CrowdSec Indicators: ${raw.threatIndicators.join(', ')}`);
        }
      }

      // IPQualityScore data
      if (provider.provider === 'ipqualityscore.com') {
        if (raw.fraud_score !== undefined && raw.fraud_score > 0) {
          intel.push(`IPQualityScore Fraud Score: ${raw.fraud_score}/100`);
        }
        if (raw.bot_status === true) {
          intel.push('IPQualityScore: Detected as bot traffic');
        }
        if (raw.recent_abuse === true) {
          intel.push('IPQualityScore: Recent abuse detected');
        }
        if (raw.is_crawler === true) {
          intel.push('IPQualityScore: Detected as crawler');
        }
        if (raw.connection_type) {
          intel.push(`IPQualityScore Connection: ${raw.connection_type}`);
        }
        if (raw.abuse_velocity) {
          intel.push(`IPQualityScore Abuse Velocity: ${raw.abuse_velocity}`);
        }
        if (raw.threatIndicators?.length > 0) {
          intel.push(`IPQS Indicators: ${raw.threatIndicators.join(', ')}`);
        }
      }

      // Pulsedive data
      if (provider.provider === 'pulsedive.com') {
        if (raw.risk) {
          intel.push(`Pulsedive Risk: ${raw.risk}`);
        }
        if (raw.riskScore !== undefined) {
          intel.push(`Pulsedive Risk Score: ${raw.riskScore}`);
        }
        if (raw.threats?.length > 0) {
          const threats = raw.threats.slice(0, 5).map((t: any) => t.name || t).join(', ');
          intel.push(`Pulsedive Threats: ${threats}`);
        }
        if (raw.feeds?.length > 0) {
          const feeds = raw.feeds.slice(0, 5).map((f: any) => f.name || f).join(', ');
          intel.push(`Pulsedive Feeds: ${feeds}`);
        }
        if (raw.linkedIndicators > 0) {
          intel.push(`Pulsedive: ${raw.linkedIndicators} linked indicators`);
        }
        if (raw.threatIndicators?.length > 0) {
          intel.push(`Pulsedive Indicators: ${raw.threatIndicators.join(', ')}`);
        }
      }

      // abuse.ch data (URLhaus, ThreatFox, Feodo Tracker)
      if (provider.provider === 'abuse.ch') {
        if (raw.urlhaus?.query_status === 'ok' && raw.urlhaus?.urls?.length > 0) {
          intel.push(`URLhaus: ${raw.urlhaus.urls.length} malware distribution URLs`);
          const malwareTypes = new Set<string>();
          for (const url of raw.urlhaus.urls) {
            if (url.threat) malwareTypes.add(url.threat);
          }
          if (malwareTypes.size > 0) {
            intel.push(`URLhaus Malware Types: ${Array.from(malwareTypes).slice(0, 5).join(', ')}`);
          }
        }
        if (raw.threatfox?.query_status === 'ok' && raw.threatfox?.data?.length > 0) {
          intel.push(`ThreatFox: ${raw.threatfox.data.length} IOC entries`);
          const families = new Set<string>();
          for (const ioc of raw.threatfox.data) {
            if (ioc.malware_printable) families.add(ioc.malware_printable);
            else if (ioc.malware) families.add(ioc.malware);
          }
          if (families.size > 0) {
            intel.push(`ThreatFox Malware Families: ${Array.from(families).slice(0, 5).join(', ')}`);
          }
        }
        if (raw.feodoTracker?.query_status === 'ok') {
          intel.push('Feodo Tracker: CONFIRMED BOTNET C2 SERVER');
          if (raw.feodoTracker.malware) {
            intel.push(`Botnet Family: ${raw.feodoTracker.malware}`);
          }
          if (raw.feodoTracker.first_seen) {
            intel.push(`Botnet First Seen: ${raw.feodoTracker.first_seen}`);
          }
        }
        if (raw.isBotnetC2 === true) {
          intel.push('CRITICAL: Active botnet command & control server');
        }
        if (raw.threatIndicators?.length > 0) {
          intel.push(`abuse.ch Indicators: ${raw.threatIndicators.join(', ')}`);
        }
      }
    }

    return intel.length > 0 ? intel.join('\n') : 'No additional threat intelligence available';
  }

  /**
   * Route LLM call to the configured provider
   */
  private async callLLM(prompt: string): Promise<string | null> {
    if (this.provider === 'openai') {
      return this.callOpenAI(prompt);
    }
    return this.callOllama(prompt);
  }

  /**
   * Call OpenAI-compatible cloud API (Groq, Together AI, OpenRouter, etc.)
   */
  private async callOpenAI(prompt: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(`${this.openaiApiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a senior SOC analyst. Respond only with valid JSON.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 512,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        logger.error(
          { status: response.status, statusText: response.statusText, body: errorBody },
          'OpenAI-compatible API error'
        );
        return null;
      }

      const data = (await response.json()) as OpenAIChatResponse;
      return data.choices?.[0]?.message?.content ?? null;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn('OpenAI-compatible API request timed out');
      } else {
        logger.error({ error }, 'OpenAI-compatible API request failed');
      }
      return null;
    }
  }

  /**
   * Call Ollama API (local or cloud) with the prompt using /api/chat
   */
  private async callOllama(prompt: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.ollamaApiKey) {
        headers['Authorization'] = `Bearer ${this.ollamaApiKey}`;
      }

      const response = await fetch(`${this.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a senior SOC analyst. Respond only with valid JSON.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          stream: false,
          format: 'json',
          options: {
            temperature: 0.3,
            top_p: 0.9,
            top_k: 50,
            num_predict: 512,
            repeat_penalty: 1.5,
            stop: ['```', '\n\n\n', '}\n\n'],
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        logger.error({ status: response.status, statusText: response.statusText, body: errorBody }, 'Ollama API error');
        return null;
      }

      const data = (await response.json()) as { message?: { content: string }; response?: string };
      // /api/chat returns message.content, /api/generate returns response
      return data.message?.content ?? data.response ?? null;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn('Ollama request timed out');
      } else {
        logger.error({ error }, 'Ollama request failed');
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
      // Strip markdown code block wrappers if present
      let cleaned = response.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

      // Try to extract JSON from the response
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Ensure riskAssessment is plain text, not JSON
        let riskAssessment = parsed.riskAssessment || 'Unable to generate detailed assessment';
        if (typeof riskAssessment === 'object') {
          riskAssessment = JSON.stringify(riskAssessment);
        }
        if (typeof riskAssessment === 'string' && riskAssessment.trimStart().startsWith('{')) {
          riskAssessment = this.generateRiskAssessment(record, preAnalysis);
        }

        return {
          summary: parsed.summary || this.generateFallbackSummary(record),
          riskAssessment,
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
      logger.warn({ parseError }, 'Failed to parse LLM JSON response, using fallback');
    }

    // Fallback if JSON parsing fails — use pre-analysis instead of raw response
    return {
      summary: this.generateFallbackSummary(record),
      riskAssessment: this.generateRiskAssessment(record, preAnalysis),
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
   * Generate a risk assessment based on pre-analysis data
   */
  private generateRiskAssessment(
    record: CorrelatedIpRecord,
    preAnalysis: ReturnType<typeof this.performPreAnalysis>
  ): string {
    const parts: string[] = [];
    const org = record.org || 'Unknown organization';
    const location = record.location?.country || 'unknown location';
    const abuseScore = record.threat?.abuseScore;

    // Opening assessment
    const verdictDesc: Record<string, string> = {
      BLOCK: 'poses a significant threat and should be blocked immediately',
      INVESTIGATE: 'shows suspicious indicators that warrant further investigation',
      MONITOR: 'presents low risk and can be monitored under standard procedures',
      ALLOW: 'appears legitimate with no indicators of malicious activity',
    };
    parts.push(`IP ${record.ip} (${org}, ${location}) ${verdictDesc[preAnalysis.actionVerdict] || 'requires assessment'}.`);

    // Abuse score context
    if (abuseScore !== undefined) {
      if (abuseScore === 0) {
        parts.push('No abuse reports have been filed against this IP.');
      } else if (abuseScore < 25) {
        parts.push(`Low abuse confidence (${abuseScore}%) with limited reports.`);
      } else if (abuseScore < 50) {
        parts.push(`Moderate abuse confidence (${abuseScore}%) indicating some suspicious activity.`);
      } else {
        parts.push(`High abuse confidence (${abuseScore}%) with significant malicious activity reported.`);
      }
    }

    // Concerns
    if (preAnalysis.concerns.length > 0) {
      parts.push(`Key risk factors: ${preAnalysis.concerns.join(', ')}.`);
    }

    // Benign indicators
    if (preAnalysis.benignIndicators.length > 0) {
      parts.push(`Mitigating factors: ${preAnalysis.benignIndicators.join(', ')}.`);
    }

    // Network type context
    const flags = this.collectDataPoints(record).flags;
    if (flags.length > 0) {
      parts.push(`Network classification: ${flags.join(', ')}.`);
    }

    return parts.join(' ');
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

      const response = await this.callLLM(quickPrompt);
      return response?.trim().replace(/^["']|["']$/g, '') || this.generateFallbackSummary(record);
    } catch {
      return this.generateFallbackSummary(record);
    }
  }

  /**
   * Batch analyze multiple IPs (useful for bulk lookups)
   */
  async batchAnalyze(
    records: CorrelatedIpRecord[],
    concurrency = 2
  ): Promise<Map<string, LLMAnalysisResult | null>> {
    const results = new Map<string, LLMAnalysisResult | null>();

    // Process in batches to avoid overwhelming the LLM
    for (let i = 0; i < records.length; i += concurrency) {
      const batch = records.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(record => this.analyzeIP(record))
      );

      batch.forEach((record, index) => {
        results.set(record.ip, batchResults[index] ?? null);
      });
    }

    return results;
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    available: boolean;
    model: string;
    latencyMs?: number;
  }> {
    const start = Date.now();
    const available = await this.isAvailable();
    const latencyMs = Date.now() - start;

    return {
      available,
      model: this.model,
      latencyMs: available ? latencyMs : undefined,
    };
  }
}
