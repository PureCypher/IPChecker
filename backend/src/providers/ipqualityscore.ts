import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * IPQualityScore provider - Fraud prevention and IP reputation
 * https://www.ipqualityscore.com/
 * Free tier: 5,000 lookups/month
 * Provides: Fraud scores, proxy/VPN detection, bot detection, abuse velocity
 */
export class IPQualityScoreProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    if (!this.config.apiKey) {
      throw new Error('IPQualityScore API key is required');
    }

    const params = new URLSearchParams({
      strictness: '1', // Medium strictness (0=low, 1=medium, 2=high)
      allow_public_access_points: 'true',
      fast: 'false', // Full lookup
      lighter_penalties: 'false',
      mobile: 'true', // Include mobile detection
    });

    const url = `${this.config.baseUrl}/${this.config.apiKey}/${ip}?${params}`;

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
        throw new Error('IPQualityScore rate limit exceeded');
      }
      throw new Error(`IPQualityScore returned ${response.status}`);
    }

    interface IPQSResponse {
      success: boolean;
      message?: string;
      fraud_score: number;
      country_code?: string;
      region?: string;
      city?: string;
      ISP?: string;
      ASN?: number;
      organization?: string;
      is_crawler?: boolean;
      timezone?: string;
      mobile?: boolean;
      host?: string;
      proxy?: boolean;
      vpn?: boolean;
      tor?: boolean;
      active_vpn?: boolean;
      active_tor?: boolean;
      recent_abuse?: boolean;
      bot_status?: boolean;
      connection_type?: string;
      abuse_velocity?: string;
      zip_code?: string;
      latitude?: number;
      longitude?: number;
      request_id?: string;
      operating_system?: string;
      browser?: string;
      device_brand?: string;
      device_model?: string;
      is_public_access_point?: boolean;
      shared_connection?: boolean;
      frequent_abuser?: boolean;
      security_scanner?: boolean;
      cloud_provider?: boolean;
    }

    const data = await response.json() as IPQSResponse;

    if (!data.success) {
      throw new Error(data.message || 'IPQualityScore lookup failed');
    }

    const threatIndicators: string[] = [];

    // Analyze fraud score
    if (data.fraud_score >= 85) {
      threatIndicators.push(`Critical fraud score (${data.fraud_score}/100)`);
    } else if (data.fraud_score >= 75) {
      threatIndicators.push(`High fraud score (${data.fraud_score}/100)`);
    } else if (data.fraud_score >= 50) {
      threatIndicators.push(`Elevated fraud score (${data.fraud_score}/100)`);
    }

    // Check proxy/anonymizer flags
    if (data.proxy) threatIndicators.push('Proxy detected');
    if (data.vpn) threatIndicators.push('VPN detected');
    if (data.tor) threatIndicators.push('Tor exit node');
    if (data.active_vpn) threatIndicators.push('Active VPN connection');
    if (data.active_tor) threatIndicators.push('Active Tor connection');

    // Check abuse indicators
    if (data.recent_abuse) threatIndicators.push('Recent abuse detected');
    if (data.frequent_abuser) threatIndicators.push('Frequent abuser');
    if (data.bot_status) threatIndicators.push('Bot activity detected');
    if (data.security_scanner) threatIndicators.push('Security scanner');
    if (data.is_crawler) threatIndicators.push('Web crawler');

    // Check abuse velocity
    if (data.abuse_velocity === 'high') {
      threatIndicators.push('High abuse velocity');
    } else if (data.abuse_velocity === 'medium') {
      threatIndicators.push('Medium abuse velocity');
    }

    // Check connection type
    if (data.cloud_provider) threatIndicators.push('Cloud provider IP');
    if (data.is_public_access_point) threatIndicators.push('Public access point');
    if (data.shared_connection) threatIndicators.push('Shared/NAT connection');

    return {
      asn: data.ASN ? `AS${data.ASN}` : null,
      org: data.organization || data.ISP || null,
      country: data.country_code || null,
      region: data.region || null,
      city: data.city || null,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      timezone: data.timezone || null,
      isProxy: data.proxy || false,
      isVpn: data.vpn || data.active_vpn || false,
      isTor: data.tor || data.active_tor || false,
      isHosting: data.cloud_provider || false,
      isMobile: data.mobile || false,
      abuseScore: data.fraud_score,
      raw: {
        fraudScore: data.fraud_score,
        recentAbuse: data.recent_abuse,
        botStatus: data.bot_status,
        abuseVelocity: data.abuse_velocity,
        connectionType: data.connection_type,
        isCrawler: data.is_crawler,
        securityScanner: data.security_scanner,
        frequentAbuser: data.frequent_abuser,
        cloudProvider: data.cloud_provider,
        publicAccessPoint: data.is_public_access_point,
        sharedConnection: data.shared_connection,
        host: data.host,
        threatIndicators,
      },
    };
  }
}
