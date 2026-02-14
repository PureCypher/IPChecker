import type { ProviderConfig } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';
import { IpApiProvider } from './ip-api.js';
import { IpInfoProvider } from './ipinfo.js';
import { IpDataProvider } from './ipdata.js';
import { AbuseIPDBProvider } from './abuseipdb.js';
import { IPGeolocationProvider } from './ipgeolocation.js';
import { ShodanProvider } from './shodan.js';
import { VirusTotalProvider } from './virustotal.js';
import { ThreatMinerProvider } from './threatminer.js';
import { AlienVaultOTXProvider } from './alienvault-otx.js';
import { GreyNoiseProvider } from './greynoise.js';
import { BGPViewProvider } from './bgpview.js';
import { CrowdSecProvider } from './crowdsec.js';
import { IPQualityScoreProvider } from './ipqualityscore.js';
import { PulsediveProvider } from './pulsedive.js';
import { AbuseChProvider } from './abusesch.js';
import { TorProjectProvider } from './tor-project.js';
import { BlocklistDeProvider } from './blocklistde.js';
import { CiscoTalosProvider } from './cisco-talos.js';
import { CinsArmyProvider } from './cins-army.js';
import { SpamhausProvider } from './spamhaus.js';
import { MalwareBazaarProvider } from './malwarebazaar.js';
import { IBMXForceProvider } from './ibm-xforce.js';
import { SANSISCProvider } from './sans-isc.js';
import { VPNapiProvider } from './vpnapi.js';
import { ProxyCheckProvider } from './proxycheck.js';
import { IPHubProvider } from './iphub.js';
import { RDAPWhoisProvider } from './whois.js';

/**
 * Provider registry mapping provider config names to their constructor classes.
 *
 * To add a new provider:
 * 1. Import the provider class above
 * 2. Add one entry to this registry: 'config-name': ProviderClass
 * 3. Add a config entry in ProviderManager.getProviderConfigs()
 */
export const providerRegistry: Record<string, new (config: ProviderConfig) => BaseProvider> = {
  'ip-api.com': IpApiProvider,
  'ipinfo.io': IpInfoProvider,
  'ipdata.co': IpDataProvider,
  'abuseipdb.com': AbuseIPDBProvider,
  'ipgeolocation.io': IPGeolocationProvider,
  'shodan.io': ShodanProvider,
  'virustotal.com': VirusTotalProvider,
  'threatminer.org': ThreatMinerProvider,
  'otx.alienvault.com': AlienVaultOTXProvider,
  'greynoise.io': GreyNoiseProvider,
  'bgpview.io': BGPViewProvider,
  'crowdsec.net': CrowdSecProvider,
  'ipqualityscore.com': IPQualityScoreProvider,
  'pulsedive.com': PulsediveProvider,
  'abuse.ch': AbuseChProvider,
  'torproject.org': TorProjectProvider,
  'blocklist.de': BlocklistDeProvider,
  'cisco-talos.com': CiscoTalosProvider,
  'cins-army.com': CinsArmyProvider,
  'spamhaus.org': SpamhausProvider,
  'malwarebazaar.abuse.ch': MalwareBazaarProvider,
  'ibm-xforce.com': IBMXForceProvider,
  'sans-isc.org': SANSISCProvider,
  'vpnapi.io': VPNapiProvider,
  'proxycheck.io': ProxyCheckProvider,
  'iphub.info': IPHubProvider,
  'rdap.whois': RDAPWhoisProvider,
};
