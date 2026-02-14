/**
 * VPN Provider Mapping Service
 * Maps ASNs and organizations to known VPN providers
 */

interface VPNMapping {
  asns: string[];
  orgs: string[];
  provider: string;
}

const VPN_MAPPINGS: VPNMapping[] = [
  // ProtonVPN
  {
    asns: ['AS51167', 'AS212238', 'AS62371', 'AS206067'],
    orgs: ['Datacamp Limited', 'Proton AG', 'Proton Technologies AG'],
    provider: 'ProtonVPN',
  },
  // NordVPN
  {
    asns: ['AS202425', 'AS57878', 'AS210083'],
    orgs: ['Nord Security', 'NordVPN', 'Nordvpn S.A.'],
    provider: 'NordVPN',
  },
  // ExpressVPN
  {
    asns: ['AS396356', 'AS397444'],
    orgs: ['ExpressVPN', 'Express VPN'],
    provider: 'ExpressVPN',
  },
  // Surfshark
  {
    asns: ['AS202306', 'AS208323'],
    orgs: ['Surfshark', 'Surfshark Ltd'],
    provider: 'Surfshark',
  },
  // CyberGhost
  {
    asns: ['AS205157'],
    orgs: ['CyberGhost', 'SC CyberGhost SRL'],
    provider: 'CyberGhost',
  },
  // Private Internet Access (PIA)
  {
    asns: ['AS46562', 'AS54290'],
    orgs: ['Private Internet Access', 'PIA', 'London Trust Media'],
    provider: 'Private Internet Access',
  },
  // Mullvad
  {
    asns: ['AS208843'],
    orgs: ['Mullvad VPN', 'Amagicom AB'],
    provider: 'Mullvad',
  },
  // Windscribe
  {
    asns: ['AS59711', 'AS396998'],
    orgs: ['Windscribe', 'WINDSCRIBE-AS'],
    provider: 'Windscribe',
  },
  // IPVanish
  {
    asns: ['AS35470', 'AS49981'],
    orgs: ['IPVanish', 'Highwinds Network Group'],
    provider: 'IPVanish',
  },
  // Hide.me
  {
    asns: ['AS199883'],
    orgs: ['eVenture Limited', 'hide.me'],
    provider: 'Hide.me',
  },
  // TorGuard
  {
    asns: ['AS395324'],
    orgs: ['TorGuard', 'VPNetworks LLC'],
    provider: 'TorGuard',
  },
];

/**
 * Identify VPN provider from ASN or organization name
 */
export function identifyVPNProvider(asn?: string, org?: string): string | null {
  if (!asn && !org) return null;

  // Check ASN mapping
  if (asn) {
    // Normalize ASN to format "AS12345"
    let normalizedAsn = asn.toUpperCase().trim();

    // If ASN doesn't start with "AS", add it
    if (!normalizedAsn.startsWith('AS') && /^\d+$/.test(normalizedAsn)) {
      normalizedAsn = 'AS' + normalizedAsn;
    }

    for (const mapping of VPN_MAPPINGS) {
      if (mapping.asns.some(mappedAsn => normalizedAsn === mappedAsn || normalizedAsn.includes(mappedAsn))) {
        return mapping.provider;
      }
    }
  }

  // Check organization mapping
  if (org) {
    const orgLower = org.toLowerCase().trim();
    for (const mapping of VPN_MAPPINGS) {
      for (const mappedOrg of mapping.orgs) {
        const mappedOrgLower = mappedOrg.toLowerCase();
        // Check both directions: org contains mapped name, or mapped name contains org
        if (orgLower.includes(mappedOrgLower) || mappedOrgLower.includes(orgLower)) {
          return mapping.provider;
        }
      }
    }
  }

  return null;
}

/**
 * Get all known VPN provider ASNs
 */
export function getKnownVPNAsns(): string[] {
  return VPN_MAPPINGS.flatMap(m => m.asns);
}

/**
 * Check if an ASN belongs to a known VPN provider
 */
export function isKnownVPNAsn(asn: string): boolean {
  const normalizedAsn = asn.toUpperCase();
  return VPN_MAPPINGS.some(mapping =>
    mapping.asns.some(mappedAsn => normalizedAsn.includes(mappedAsn))
  );
}
