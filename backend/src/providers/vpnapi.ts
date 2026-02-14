import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * VPNapi.io Provider
 * Detects VPNs, proxies, and Tor with provider identification
 * API: https://vpnapi.io/
 * Cost: Free tier - 1,000 requests/day
 */
export class VPNapiProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    // Check if API key is configured
    if (!this.config.apiKey) {
      throw new Error('VPNapi requires an API key - sign up at https://vpnapi.io for free tier (1,000 requests/day)');
    }

    const response = await this.fetchWithTimeout(
      `https://vpnapi.io/api/${ip}?key=${this.config.apiKey}`,
      { signal },
      this.config.timeoutMs
    );

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('VPNapi access denied - check API key or upgrade plan at https://vpnapi.io');
      }
      if (response.status === 401) {
        throw new Error('VPNapi invalid API key');
      }
      if (response.status === 429) {
        throw new Error('VPNapi rate limit exceeded');
      }
      throw new Error(`VPNapi returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as any;

    const isVpn = data.security?.vpn === true;
    const isProxy = data.security?.proxy === true;
    const isTor = data.security?.tor === true;
    const isRelay = data.security?.relay === true;

    // Extract network information
    const network = data.network || {};
    const vpnProvider = network.network || null; // Network name (often VPN provider)
    const autonomousSystemOrg = network.autonomous_system_organization || null;

    // Calculate abuse score
    let abuseScore = 0;
    if (isTor) abuseScore = 60;
    else if (isProxy) abuseScore = 50;
    else if (isVpn) abuseScore = 40;
    else if (isRelay) abuseScore = 30;

    return {
      isVpn,
      isProxy,
      isTor,
      vpnProvider,
      asn: network.autonomous_system_number || null,
      org: autonomousSystemOrg,
      country: data.location?.country_code || null,
      region: data.location?.region || null,
      city: data.location?.city || null,
      latitude: data.location?.latitude || null,
      longitude: data.location?.longitude || null,
      timezone: data.location?.timezone || null,
      abuseScore,
      raw: {
        vpn: isVpn,
        proxy: isProxy,
        tor: isTor,
        relay: isRelay,
        vpnProvider,
        network: network.network,
        autonomousSystemOrg,
        autonomousSystemNumber: network.autonomous_system_number,
        note: isVpn
          ? `VPN detected${vpnProvider ? ` - Provider: ${vpnProvider}` : ''}`
          : isProxy
          ? 'Proxy detected'
          : isTor
          ? 'Tor exit node detected'
          : isRelay
          ? 'Relay detected'
          : 'No VPN/Proxy detected',
      },
    };
  }
}
