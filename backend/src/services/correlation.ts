import type {
  ProviderResult,
  CorrelatedIpRecord,
  ConflictReport,
  Location,
  Flags,
  Threat,
} from '@ipintel/shared';
import { identifyVPNProvider } from './vpn-provider-mapping.js';

/**
 * Build the trust rank map once at module load time.
 * Avoids 25 parseInt(process.env.X) calls on every getTrustRank() invocation.
 */
function buildTrustRankMap(): ReadonlyMap<string, number> {
  const parse = (envVar: string, fallback: number): number =>
    parseInt(process.env[envVar] || String(fallback));

  return new Map<string, number>([
    ['ip-api.com', parse('IPAPI_TRUST_RANK', 6)],
    ['ipinfo.io', parse('IPINFO_TRUST_RANK', 8)],
    ['ipdata.co', parse('IPDATA_TRUST_RANK', 7)],
    ['abuseipdb.com', parse('ABUSEIPDB_TRUST_RANK', 9)],
    ['shodan.io', parse('SHODAN_TRUST_RANK', 8)],
    ['ipgeolocation.io', parse('IPGEOLOCATION_TRUST_RANK', 7)],
    ['virustotal.com', parse('VIRUSTOTAL_TRUST_RANK', 9)],
    ['threatminer.org', parse('THREATMINER_TRUST_RANK', 7)],
    ['otx.alienvault.com', parse('ALIENVAULT_TRUST_RANK', 8)],
    ['greynoise.io', parse('GREYNOISE_TRUST_RANK', 8)],
    ['bgpview.io', parse('BGPVIEW_TRUST_RANK', 6)],
    ['crowdsec.net', parse('CROWDSEC_TRUST_RANK', 9)],
    ['ipqualityscore.com', parse('IPQUALITYSCORE_TRUST_RANK', 9)],
    ['pulsedive.com', parse('PULSEDIVE_TRUST_RANK', 8)],
    ['abuse.ch', parse('ABUSECH_TRUST_RANK', 9)],
    ['torproject.org', parse('TORPROJECT_TRUST_RANK', 7)],
    ['blocklist.de', parse('BLOCKLISTDE_TRUST_RANK', 8)],
    ['cisco-talos.com', parse('CISCOTALOS_TRUST_RANK', 8)],
    ['cins-army.com', parse('CINSARMY_TRUST_RANK', 8)],
    ['spamhaus.org', parse('SPAMHAUS_TRUST_RANK', 9)],
    ['malwarebazaar.abuse.ch', parse('MALWAREBAZAAR_TRUST_RANK', 9)],
    ['ibm-xforce.com', parse('IBM_XFORCE_TRUST_RANK', 9)],
    ['sans-isc.org', parse('SANSISC_TRUST_RANK', 8)],
    ['vpnapi.io', parse('VPNAPI_TRUST_RANK', 8)],
    ['proxycheck.io', parse('PROXYCHECK_TRUST_RANK', 8)],
    ['iphub.info', parse('IPHUB_TRUST_RANK', 8)],
  ]);
}

/** Module-level cached trust rank map, built once at import time */
const TRUST_RANKS = buildTrustRankMap();

/**
 * Correlates data from multiple provider results into a single unified record
 */
export class CorrelationService {
  /**
   * Correlate multiple provider results into a single IP record
   */
  correlate(
    ip: string,
    providerResults: ProviderResult[],
    source: 'cache' | 'db' | 'live' | 'stale',
    cacheTtlSeconds: number
  ): CorrelatedIpRecord {
    const successfulResults = providerResults.filter((r) => r.success);
    const conflicts: ConflictReport[] = [];

    // Extract and correlate each field
    const asn = this.correlateSingleValue(successfulResults, 'asn', conflicts);
    const org = this.correlateSingleValue(successfulResults, 'org', conflicts);

    // Location data
    const country = this.correlateSingleValue(
      successfulResults,
      'country',
      conflicts
    );
    const region = this.correlateSingleValue(
      successfulResults,
      'region',
      conflicts
    );
    const city = this.correlateSingleValue(
      successfulResults,
      'city',
      conflicts
    );
    const timezone = this.correlateSingleValue(
      successfulResults,
      'timezone',
      conflicts
    );

    // Coordinates (average if multiple)
    const { latitude, longitude } = this.correlateCoordinates(
      successfulResults,
      conflicts
    );

    // Determine location accuracy
    const accuracy = city ? 'city' : region ? 'region' : country ? 'country' : undefined;

    const location: Location = {
      country,
      region,
      city,
      coordinates:
        latitude !== undefined && longitude !== undefined
          ? { lat: latitude, lon: longitude }
          : undefined,
      timezone,
      accuracy,
    };

    // Boolean flags
    const isProxy = this.correlateBoolean(successfulResults, 'isProxy');
    const isVpn = this.correlateBoolean(successfulResults, 'isVpn');
    const isTor = this.correlateBoolean(successfulResults, 'isTor');
    const isHosting = this.correlateBoolean(successfulResults, 'isHosting');
    const isMobile = this.correlateBoolean(successfulResults, 'isMobile');

    // VPN provider identification
    let vpnProvider = this.correlateVpnProvider(successfulResults, conflicts);

    // Fallback: Check ASN/Org against known VPN provider mappings
    // Only if we didn't get a provider name from the VPN detection APIs
    if ((!vpnProvider || vpnProvider === null) && isVpn) {
      const mappedProvider = identifyVPNProvider(asn, org);
      if (mappedProvider) {
        vpnProvider = mappedProvider;
      }
    }

    // Calculate confidence based on provider consensus
    const confidence = this.calculateConfidence(successfulResults);

    const flags: Flags = {
      isProxy,
      isVpn,
      isTor,
      isHosting,
      isMobile,
      vpnProvider,
      confidence,
    };

    // Threat data
    const abuseScore = this.correlateAbuseScore(successfulResults);
    const riskLevel = this.calculateRiskLevel(abuseScore, flags);

    const threat: Threat = {
      abuseScore,
      riskLevel,
    };

    // Generate warnings if any providers failed
    const warnings: string[] = [];
    const failedProviders = providerResults.filter((r) => !r.success);
    if (failedProviders.length > 0) {
      for (const failed of failedProviders) {
        warnings.push(`Provider '${failed.provider}' failed: ${failed.error}`);
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + cacheTtlSeconds * 1000);

    return {
      ip,
      asn,
      org,
      location,
      flags,
      threat,
      metadata: {
        providers: providerResults,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
        source,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        ttlSeconds: cacheTtlSeconds,
        warnings: warnings.length > 0 ? warnings : undefined,
        partialData: failedProviders.length > 0,
        providersQueried: providerResults.length,
        providersSucceeded: successfulResults.length,
      },
    };
  }

  /**
   * Correlate a single value field using majority vote and trust rank
   */
  private correlateSingleValue<K extends keyof ProviderResult>(
    results: ProviderResult[],
    field: K,
    conflicts: ConflictReport[]
  ): string | undefined {
    const values = results
      .filter((r) => r[field] !== null && r[field] !== undefined)
      .map((r) => ({
        value: r[field] as string,
        provider: r.provider,
        trustRank: this.getTrustRank(r.provider),
      }));

    if (values.length === 0) return undefined;
    if (values.length === 1) return values[0]!.value;

    // Group by value
    const grouped = new Map<string, typeof values>();
    for (const item of values) {
      const key = item.value;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    }

    // If all agree, return the value
    if (grouped.size === 1) {
      return values[0]!.value;
    }

    // Conflict detected - resolve using strategy
    const conflictValues = Array.from(grouped.entries()).map(
      ([value, providers]) => ({
        value,
        providers: providers.map((p) => p.provider),
        trustScore:
          providers.reduce((sum, p) => sum + p.trustRank, 0) / providers.length,
        count: providers.length,
      })
    );

    // Sort by count (majority), then by trust score
    conflictValues.sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return b.trustScore - a.trustScore;
    });

    const resolved = conflictValues[0]!.value;

    conflicts.push({
      field: String(field),
      values: conflictValues,
      resolved,
      reason:
        conflictValues[0]!.count > conflictValues[1]!.count
          ? 'majority vote'
          : 'highest trust',
    });

    return resolved;
  }

  /**
   * Correlate coordinates by averaging
   */
  private correlateCoordinates(
    results: ProviderResult[],
    _conflicts: ConflictReport[]
  ): { latitude?: number; longitude?: number } {
    const coords = results
      .filter(
        (r) =>
          r.latitude !== null &&
          r.latitude !== undefined &&
          r.longitude !== null &&
          r.longitude !== undefined
      )
      .map((r) => ({
        lat: r.latitude!,
        lon: r.longitude!,
        provider: r.provider,
      }));

    if (coords.length === 0) return {};
    if (coords.length === 1) return { latitude: coords[0]!.lat, longitude: coords[0]!.lon };

    // Average the coordinates
    const avgLat =
      coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
    const avgLon =
      coords.reduce((sum, c) => sum + c.lon, 0) / coords.length;

    return { latitude: avgLat, longitude: avgLon };
  }

  /**
   * Correlate boolean flags (true if any provider says true)
   */
  private correlateBoolean<K extends keyof ProviderResult>(
    results: ProviderResult[],
    field: K
  ): boolean | undefined {
    const values = results
      .filter((r) => r[field] !== undefined)
      .map((r) => r[field]);

    if (values.length === 0) return undefined;

    // If any provider says true, return true
    return values.some((v) => v === true) ? true : false;
  }

  /**
   * Correlate VPN provider names from multiple sources
   */
  private correlateVpnProvider(
    results: ProviderResult[],
    conflicts: ConflictReport[]
  ): string | null | undefined {
    // Collect VPN provider values from providers
    const vpnProviders = results
      .filter((r) => r.vpnProvider !== null && r.vpnProvider !== undefined)
      .map((r) => ({
        value: r.vpnProvider as string,
        provider: r.provider,
        trustRank: this.getTrustRank(r.provider),
      }));

    // Also extract from raw data for providers that include it
    for (const result of results) {
      if (!result.raw) continue;

      // Extract from various provider raw data formats
      let extractedProvider: string | null = null;

      // IPData
      const rawData = result.raw as any;
      if (result.provider === 'ipdata.co' && rawData.threat?.is_vpn && rawData.asn?.name) {
        extractedProvider = rawData.asn.name as string;
      }

      // IPQualityScore
      if (result.provider === 'ipqualityscore.com' && rawData.vpn && rawData.ISP) {
        extractedProvider = rawData.ISP as string;
      }

      // AbuseIPDB
      if (result.provider === 'abuseipdb.com' && rawData.isp) {
        const isp = rawData.isp as string;
        // Only use if it contains VPN-related keywords
        if (
          isp.toLowerCase().includes('vpn') ||
          isp.toLowerCase().includes('proxy') ||
          isp.toLowerCase().includes('private')
        ) {
          extractedProvider = isp;
        }
      }

      // ProxyCheck - prioritize operator.name (actual VPN provider)
      if (result.provider === 'proxycheck.io' && rawData.operator?.name) {
        extractedProvider = rawData.operator.name as string;
      }

      if (extractedProvider && !vpnProviders.some(v => v.value === extractedProvider)) {
        // ProxyCheck.io gets higher trust for VPN provider identification since it specializes in this
        const trustRank = result.provider === 'proxycheck.io' && rawData.operator?.name
          ? 10  // Highest trust for ProxyCheck when operator.name is present
          : this.getTrustRank(result.provider);

        vpnProviders.push({
          value: extractedProvider,
          provider: result.provider,
          trustRank,
        });
      }
    }

    if (vpnProviders.length === 0) return undefined;
    if (vpnProviders.length === 1) return vpnProviders[0]!.value;

    // Multiple providers report VPN providers - use highest trust rank
    vpnProviders.sort((a, b) => b.trustRank - a.trustRank);

    // Check if there's disagreement
    const uniqueValues = [...new Set(vpnProviders.map((v) => v.value))];
    if (uniqueValues.length > 1) {
      conflicts.push({
        field: 'vpnProvider',
        values: uniqueValues.map((value) => {
          const providers = vpnProviders
            .filter((v) => v.value === value)
            .map((v) => ({ provider: v.provider, trustRank: v.trustRank }));
          const maxTrust = Math.max(...providers.map((p) => p.trustRank));
          return {
            value,
            providers: providers.map((p) => p.provider),
            trustScore: maxTrust,
          };
        }),
        resolved: vpnProviders[0]!.value,
        reason: 'highest trust',
      });
    }

    return vpnProviders[0]!.value;
  }

  /**
   * Correlate abuse scores (use maximum)
   */
  private correlateAbuseScore(results: ProviderResult[]): number | undefined {
    const scores = results
      .filter((r) => r.abuseScore !== null && r.abuseScore !== undefined)
      .map((r) => r.abuseScore!);

    if (scores.length === 0) return undefined;

    // Return the maximum abuse score (most conservative)
    return Math.max(...scores);
  }

  /**
   * Calculate risk level based on abuse score and flags
   */
  private calculateRiskLevel(
    abuseScore: number | undefined,
    flags: Flags
  ): 'low' | 'medium' | 'high' | undefined {
    // High risk if Tor, known abuser, or high abuse score
    if (flags.isTor || (abuseScore !== undefined && abuseScore >= 70)) {
      return 'high';
    }

    // Medium risk if proxy/VPN or moderate abuse score
    if (
      flags.isProxy ||
      flags.isVpn ||
      (abuseScore !== undefined && abuseScore >= 30)
    ) {
      return 'medium';
    }

    // Low risk otherwise
    if (abuseScore !== undefined || Object.values(flags).some((v) => v !== undefined)) {
      return 'low';
    }

    return undefined;
  }

  /**
   * Calculate confidence score based on provider consensus
   */
  private calculateConfidence(results: ProviderResult[]): number {
    if (results.length === 0) return 0;

    // Calculate confidence based on successful provider count
    // Scale from 0-100 based on number of providers (diminishing returns after 10)
    const maxProviders = 10;
    const effectiveCount = Math.min(results.length, maxProviders);
    const baseConfidence = (effectiveCount / maxProviders) * 100;

    return Math.min(100, Math.round(baseConfidence));
  }

  /**
   * Get trust rank for a provider (fallback to 5 if not configured).
   * Uses the module-level cached TRUST_RANKS map instead of parsing
   * environment variables on every call.
   */
  private getTrustRank(provider: string): number {
    return TRUST_RANKS.get(provider) ?? 5;
  }
}
