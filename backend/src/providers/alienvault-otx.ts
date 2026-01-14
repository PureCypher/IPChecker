import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * AlienVault OTX provider - Open Threat Exchange
 * https://otx.alienvault.com/api
 * Free tier with API key registration
 */
export class AlienVaultOTXProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    if (!this.config.apiKey) {
      throw new Error('AlienVault OTX API key is required');
    }

    // Determine if IPv4 or IPv6
    const ipType = ip.includes(':') ? 'IPv6' : 'IPv4';

    // Query general and reputation endpoints
    const [general, reputation, malware, geo] = await Promise.allSettled([
      this.queryEndpoint(ip, ipType, 'general', signal),
      this.queryEndpoint(ip, ipType, 'reputation', signal),
      this.queryEndpoint(ip, ipType, 'malware', signal),
      this.queryEndpoint(ip, ipType, 'geo', signal),
    ]);

    const generalData = general.status === 'fulfilled' ? general.value : null;
    const reputationData = reputation.status === 'fulfilled' ? reputation.value : null;
    const malwareData = malware.status === 'fulfilled' ? malware.value : null;
    const geoData = geo.status === 'fulfilled' ? geo.value : null;

    // Calculate threat score
    let threatScore = 0;
    const threatIndicators: string[] = [];

    // Check pulse count (number of threat reports mentioning this IP)
    if (generalData?.pulse_info?.count > 0) {
      const pulseCount = generalData.pulse_info.count;
      threatScore += Math.min(40, pulseCount * 5);
      threatIndicators.push(`Referenced in ${pulseCount} threat pulses`);
    }

    // Check reputation
    if (reputationData?.reputation) {
      const rep = reputationData.reputation;
      if (rep.threat_score) {
        threatScore += rep.threat_score;
      }
      if (rep.activities && rep.activities.length > 0) {
        threatIndicators.push(...rep.activities.map((a: any) => a.name || a));
      }
    }

    // Check malware associations
    if (malwareData?.data && malwareData.data.length > 0) {
      threatScore += Math.min(30, malwareData.data.length * 10);
      threatIndicators.push(`${malwareData.data.length} malware samples linked`);
    }

    // Determine flags
    const isProxy = generalData?.type_title?.toLowerCase().includes('proxy');
    const isVpn = generalData?.type_title?.toLowerCase().includes('vpn');
    const isTor = generalData?.type_title?.toLowerCase().includes('tor');

    return {
      asn: generalData?.asn ? `AS${generalData.asn}` : null,
      org: generalData?.asn_name || null,
      country: geoData?.country_code || generalData?.country_code || null,
      region: geoData?.region || null,
      city: geoData?.city || null,
      latitude: geoData?.latitude || null,
      longitude: geoData?.longitude || null,
      isProxy,
      isVpn,
      isTor,
      abuseScore: Math.min(100, threatScore),
      raw: {
        general: generalData,
        reputation: reputationData,
        malwareSampleCount: malwareData?.data?.length || 0,
        threatIndicators,
        pulses: generalData?.pulse_info?.pulses?.slice(0, 5) || [],
      },
    };
  }

  private async queryEndpoint(
    ip: string,
    ipType: string,
    section: string,
    signal: AbortSignal
  ): Promise<any> {
    const url = `${this.config.baseUrl}/indicators/${ipType}/${ip}/${section}`;

    const response = await this.fetchWithTimeout(
      url,
      {
        headers: {
          'X-OTX-API-KEY': this.config.apiKey!,
          Accept: 'application/json',
        },
        signal,
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('AlienVault OTX rate limit exceeded');
      }
      if (response.status === 404) {
        return null;
      }
      throw new Error(`AlienVault OTX returned ${response.status}`);
    }

    return response.json();
  }
}
