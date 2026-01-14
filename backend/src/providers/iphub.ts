import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * IPHub.info Provider
 * VPN/proxy/hosting detection with ISP identification
 * API: https://iphub.info/
 * Cost: Free tier - 1,000 requests/day
 */
export class IPHubProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    if (!this.config.apiKey) {
      throw new Error('IPHub API key required');
    }

    const response = await this.fetchWithTimeout(
      `https://v2.api.iphub.info/ip/${ip}`,
      {
        headers: {
          'X-Key': this.config.apiKey,
        },
        signal,
      },
      this.config.timeoutMs
    );

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('IPHub rate limit exceeded');
      }
      throw new Error(`IPHub returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as any;

    // Block type: 0 = Residential/Business, 1 = Non-residential (VPN/Proxy/Hosting), 2 = Non-residential & residential
    const blockType = data.block;
    const isp = data.isp || null;
    const hostname = data.hostname || null;
    const countryCode = data.countryCode || null;

    // Determine if it's VPN/Proxy/Hosting
    const isVpnOrProxy = blockType === 1 || blockType === 2;

    // Try to identify VPN provider from ISP name
    let vpnProvider = null;
    if (isVpnOrProxy && isp) {
      // Common VPN provider patterns
      const vpnPatterns = [
        'nordvpn', 'expressvpn', 'surfshark', 'cyberghost', 'private internet access',
        'protonvpn', 'proton vpn', 'mullvad', 'windscribe', 'tunnelbear', 'ipvanish',
        'vyprvpn', 'purevpn', 'hotspot shield', 'zenmate', 'avast secureline',
        'kaspersky', 'mcafee', 'norton', 'avg', 'bitdefender', 'f-secure', 'hide.me',
        'torguard', 'privateinternetaccess'
      ];

      const ispLower = isp.toLowerCase();
      for (const pattern of vpnPatterns) {
        if (ispLower.includes(pattern)) {
          vpnProvider = isp;
          break;
        }
      }

      // If no specific VPN pattern found, check for generic VPN/proxy keywords
      if (!vpnProvider && (
        ispLower.includes('vpn') ||
        ispLower.includes('proxy') ||
        ispLower.includes('hosting') ||
        ispLower.includes('datacenter')
      )) {
        vpnProvider = isp;
      }
    }

    // Calculate abuse score
    let abuseScore = 0;
    if (blockType === 1) abuseScore = 60; // Non-residential
    else if (blockType === 2) abuseScore = 40; // Mixed

    return {
      isVpn: isVpnOrProxy,
      isProxy: isVpnOrProxy,
      isHosting: isVpnOrProxy,
      vpnProvider,
      org: isp,
      country: countryCode,
      abuseScore,
      raw: {
        blockType,
        blockTypeDescription:
          blockType === 0 ? 'Residential/Business' :
          blockType === 1 ? 'Non-residential (VPN/Proxy/Hosting)' :
          blockType === 2 ? 'Non-residential & Residential' :
          'Unknown',
        isp,
        hostname,
        countryCode,
        asn: data.asn || null,
        note: isVpnOrProxy
          ? `Detected as ${blockType === 1 ? 'non-residential' : 'mixed'} IP${vpnProvider ? ` - ${vpnProvider}` : ''}`
          : 'Residential/Business IP',
      },
    };
  }
}
