import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * ProxyCheck.io Provider
 * Advanced VPN/proxy detection with provider identification
 * API: https://proxycheck.io/
 * Cost: Free tier - 1,000 queries/day (100 with provider detection)
 */
export class ProxyCheckProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    // Build URL with optional API key
    const baseUrl = 'https://proxycheck.io/v2';
    const params = new URLSearchParams({
      vpn: '1',
      asn: '1',
      node: '1',
      time: '1',
      inf: '0',
      risk: '1',
      port: '1',
      seen: '1',
      days: '7',
      tag: 'ipintel',
    });

    if (this.config.apiKey) {
      params.set('key', this.config.apiKey);
    }

    const response = await this.fetchWithTimeout(
      `${baseUrl}/${ip}?${params}`,
      { signal },
      this.config.timeoutMs
    );

    if (!response.ok) {
      throw new Error(`ProxyCheck returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const ipData = data[ip];

    if (!ipData || data.status === 'error') {
      throw new Error(data.message || 'ProxyCheck returned invalid response');
    }

    const isProxy = ipData.proxy === 'yes';
    const proxyType = ipData.type || null; // VPN, SOCKS, HTTP, etc.
    // Prioritize operator.name (actual VPN provider) over provider (ISP)
    const provider = ipData.operator?.name || ipData.provider || null;
    const riskScore = ipData.risk || 0;

    // Calculate abuse score based on proxy type and risk
    let abuseScore = 0;
    if (isProxy) {
      if (proxyType === 'VPN') {
        abuseScore = Math.max(40, riskScore);
      } else if (proxyType === 'TOR') {
        abuseScore = Math.max(60, riskScore);
      } else {
        abuseScore = Math.max(50, riskScore);
      }
    }

    return {
      isVpn: proxyType === 'VPN',
      isProxy: isProxy && proxyType !== 'VPN' && proxyType !== 'TOR',
      isTor: proxyType === 'TOR',
      vpnProvider: proxyType === 'VPN' ? provider : null,
      country: ipData.isocode || ipData.country || null,
      city: ipData.city || null,
      region: ipData.region || null,
      latitude: ipData.latitude || null,
      longitude: ipData.longitude || null,
      abuseScore,
      raw: {
        proxy: isProxy,
        proxyType,
        provider: ipData.provider || null, // Keep original ISP provider
        vpnOperator: ipData.operator?.name || null, // Actual VPN provider
        riskScore,
        port: ipData.port,
        lastSeen: ipData.seen ? new Date(ipData.seen * 1000).toISOString() : null,
        attackHistory: ipData.attackhistory || false,
        operator: ipData.operator || null,
        note: isProxy
          ? `${proxyType || 'Proxy'} detected${provider ? ` - Provider: ${provider}` : ''} (Risk: ${riskScore}%)`
          : 'No proxy/VPN detected',
      },
    };
  }
}
