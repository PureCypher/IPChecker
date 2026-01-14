import type { Provider } from '../types/provider.js';
import type { ProviderConfig, ProviderResult } from '@ipintel/shared';
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
import { getEnvNumber, getEnvString } from '../utils/helpers.js';
import { logger } from '../config/logger.js';
import pLimit from 'p-limit';

/**
 * Provider Manager - coordinates all IP lookup providers
 */
export class ProviderManager {
  private providers: Provider[] = [];
  private limiter: ReturnType<typeof pLimit>;

  constructor() {
    this.initializeProviders();
    // Global concurrency limit across all providers
    const concurrency = getEnvNumber('PROVIDER_CONCURRENCY', 4);
    this.limiter = pLimit(concurrency);
  }

  /**
   * Initialize all configured providers
   */
  private initializeProviders(): void {
    const providerConfigs = this.getProviderConfigs();

    for (const config of providerConfigs) {
      let provider: Provider | null = null;

      switch (config.name) {
        case 'ip-api.com':
          provider = new IpApiProvider(config);
          break;
        case 'ipinfo.io':
          provider = new IpInfoProvider(config);
          break;
        case 'ipdata.co':
          provider = new IpDataProvider(config);
          break;
        case 'abuseipdb.com':
          provider = new AbuseIPDBProvider(config);
          break;
        case 'ipgeolocation.io':
          provider = new IPGeolocationProvider(config);
          break;
        case 'shodan.io':
          provider = new ShodanProvider(config);
          break;
        case 'virustotal.com':
          provider = new VirusTotalProvider(config);
          break;
        case 'threatminer.org':
          provider = new ThreatMinerProvider(config);
          break;
        case 'otx.alienvault.com':
          provider = new AlienVaultOTXProvider(config);
          break;
        case 'greynoise.io':
          provider = new GreyNoiseProvider(config);
          break;
        case 'bgpview.io':
          provider = new BGPViewProvider(config);
          break;
        case 'crowdsec.net':
          provider = new CrowdSecProvider(config);
          break;
        case 'ipqualityscore.com':
          provider = new IPQualityScoreProvider(config);
          break;
        case 'pulsedive.com':
          provider = new PulsediveProvider(config);
          break;
        case 'abuse.ch':
          provider = new AbuseChProvider(config);
          break;
        case 'torproject.org':
          provider = new TorProjectProvider(config);
          break;
        case 'blocklist.de':
          provider = new BlocklistDeProvider(config);
          break;
        case 'cisco-talos.com':
          provider = new CiscoTalosProvider(config);
          break;
        case 'cins-army.com':
          provider = new CinsArmyProvider(config);
          break;
        case 'spamhaus.org':
          provider = new SpamhausProvider(config);
          break;
        case 'malwarebazaar.abuse.ch':
          provider = new MalwareBazaarProvider(config);
          break;
        case 'ibm-xforce.com':
          provider = new IBMXForceProvider(config);
          break;
        case 'sans-isc.org':
          provider = new SANSISCProvider(config);
          break;
        case 'vpnapi.io':
          provider = new VPNapiProvider(config);
          break;
        case 'proxycheck.io':
          provider = new ProxyCheckProvider(config);
          break;
        case 'iphub.info':
          provider = new IPHubProvider(config);
          break;
        default:
          logger.warn({ provider: config.name }, 'Unknown provider');
      }

      if (provider && provider.isEnabled()) {
        this.providers.push(provider);
      }
    }

    logger.info(
      { count: this.providers.length, providers: this.providers.map((p) => p.config.name) },
      'Initialized providers'
    );
  }

  /**
   * Get provider configurations from environment
   */
  private getProviderConfigs(): ProviderConfig[] {
    const timeoutMs = getEnvNumber('PROVIDER_TIMEOUT_MS', 3000);
    const retries = getEnvNumber('PROVIDER_RETRIES', 2);
    const retryDelayMs = getEnvNumber('PROVIDER_RETRY_DELAY_MS', 500);

    return [
      {
        name: 'ip-api.com',
        enabled: true, // Always enabled (no API key needed)
        baseUrl: 'http://ip-api.com/json',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('IPAPI_TRUST_RANK', 6),
      },
      {
        name: 'ipinfo.io',
        enabled: !!process.env.IPINFO_TOKEN,
        apiKey: process.env.IPINFO_TOKEN,
        baseUrl: 'https://ipinfo.io',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('IPINFO_TRUST_RANK', 8),
      },
      {
        name: 'ipdata.co',
        enabled: !!process.env.IPDATA_KEY,
        apiKey: process.env.IPDATA_KEY,
        baseUrl: 'https://api.ipdata.co',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('IPDATA_TRUST_RANK', 7),
      },
      {
        name: 'abuseipdb.com',
        enabled: !!process.env.ABUSEIPDB_KEY,
        apiKey: process.env.ABUSEIPDB_KEY,
        baseUrl: 'https://api.abuseipdb.com/api/v2',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('ABUSEIPDB_TRUST_RANK', 9),
      },
      {
        name: 'ipgeolocation.io',
        enabled: !!process.env.IPGEOLOCATION_KEY,
        apiKey: process.env.IPGEOLOCATION_KEY,
        baseUrl: 'https://api.ipgeolocation.io/ipgeo',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('IPGEOLOCATION_TRUST_RANK', 7),
      },
      {
        name: 'shodan.io',
        enabled: !!process.env.SHODAN_KEY,
        apiKey: process.env.SHODAN_KEY,
        baseUrl: 'https://api.shodan.io',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('SHODAN_TRUST_RANK', 8),
      },
      {
        name: 'virustotal.com',
        enabled: !!process.env.VIRUSTOTAL_KEY,
        apiKey: process.env.VIRUSTOTAL_KEY,
        baseUrl: 'https://www.virustotal.com/api/v3',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('VIRUSTOTAL_TRUST_RANK', 9),
      },
      // Threat Intelligence Providers (Free)
      {
        name: 'threatminer.org',
        enabled: true, // Always enabled (no API key needed)
        baseUrl: 'https://api.threatminer.org/v2/host.php',
        timeoutMs: timeoutMs + 2000, // ThreatMiner can be slow
        retries: 1, // Lower retries due to rate limit
        retryDelayMs: 6000, // 10 req/min rate limit
        trustRank: getEnvNumber('THREATMINER_TRUST_RANK', 7),
      },
      {
        name: 'otx.alienvault.com',
        enabled: !!process.env.ALIENVAULT_OTX_KEY,
        apiKey: process.env.ALIENVAULT_OTX_KEY,
        baseUrl: 'https://otx.alienvault.com/api/v1',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('ALIENVAULT_TRUST_RANK', 8),
      },
      {
        name: 'greynoise.io',
        enabled: true, // Community API works without key
        apiKey: process.env.GREYNOISE_KEY, // Optional for enhanced data
        baseUrl: 'https://api.greynoise.io/v3/community',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('GREYNOISE_TRUST_RANK', 8),
      },
      {
        name: 'bgpview.io',
        enabled: true, // Always enabled (no API key needed)
        baseUrl: 'https://api.bgpview.io',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('BGPVIEW_TRUST_RANK', 6),
      },
      // CTI Platforms
      {
        name: 'crowdsec.net',
        enabled: !!process.env.CROWDSEC_KEY,
        apiKey: process.env.CROWDSEC_KEY,
        baseUrl: 'https://cti.api.crowdsec.net/v2',
        timeoutMs,
        retries: 1, // 50 req/day limit
        retryDelayMs,
        trustRank: getEnvNumber('CROWDSEC_TRUST_RANK', 9),
      },
      {
        name: 'ipqualityscore.com',
        enabled: !!process.env.IPQUALITYSCORE_KEY,
        apiKey: process.env.IPQUALITYSCORE_KEY,
        baseUrl: 'https://ipqualityscore.com/api/json/ip',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('IPQUALITYSCORE_TRUST_RANK', 9),
      },
      {
        name: 'pulsedive.com',
        enabled: !!process.env.PULSEDIVE_KEY,
        apiKey: process.env.PULSEDIVE_KEY,
        baseUrl: 'https://pulsedive.com/api',
        timeoutMs,
        retries: 1, // 30 req/day limit
        retryDelayMs,
        trustRank: getEnvNumber('PULSEDIVE_TRUST_RANK', 8),
      },
      {
        name: 'abuse.ch',
        enabled: true, // Always enabled (no API key needed)
        baseUrl: 'https://urlhaus-api.abuse.ch/v1',
        timeoutMs: timeoutMs + 2000, // Multiple API calls
        retries: 1,
        retryDelayMs,
        trustRank: getEnvNumber('ABUSECH_TRUST_RANK', 9),
      },
      // Additional Threat Intelligence Sources
      {
        name: 'torproject.org',
        enabled: true, // Always enabled (no API key needed)
        baseUrl: 'https://check.torproject.org',
        timeoutMs: timeoutMs + 1000,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('TORPROJECT_TRUST_RANK', 7),
      },
      {
        name: 'blocklist.de',
        enabled: true, // Always enabled (no API key needed)
        baseUrl: 'https://lists.blocklist.de',
        timeoutMs: timeoutMs + 2000, // Multiple list checks
        retries: 1,
        retryDelayMs,
        trustRank: getEnvNumber('BLOCKLISTDE_TRUST_RANK', 8),
      },
      {
        name: 'cisco-talos.com',
        enabled: process.env.ENABLE_CISCO_TALOS === 'true', // Disabled by default (blocks automated access)
        baseUrl: 'https://talosintelligence.com',
        timeoutMs: timeoutMs + 1000,
        retries: 1,
        retryDelayMs,
        trustRank: getEnvNumber('CISCOTALOS_TRUST_RANK', 8),
      },
      {
        name: 'cins-army.com',
        enabled: true, // Always enabled (no API key needed)
        baseUrl: 'http://cinsscore.com',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('CINSARMY_TRUST_RANK', 8),
      },
      {
        name: 'spamhaus.org',
        enabled: true, // Always enabled (DNS lookup)
        baseUrl: 'zen.spamhaus.org', // DNS-based
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('SPAMHAUS_TRUST_RANK', 9),
      },
      {
        name: 'malwarebazaar.abuse.ch',
        enabled: process.env.ENABLE_MALWAREBAZAAR === 'true', // Disabled by default (limited IP lookup support)
        baseUrl: 'https://mb-api.abuse.ch/api/v1',
        timeoutMs: timeoutMs + 2000,
        retries: 1,
        retryDelayMs,
        trustRank: getEnvNumber('MALWAREBAZAAR_TRUST_RANK', 9),
      },
      {
        name: 'ibm-xforce.com',
        enabled: !!process.env.IBM_XFORCE_KEY,
        apiKey: process.env.IBM_XFORCE_KEY, // Format: apikey:password
        baseUrl: 'https://api.xforce.ibmcloud.com',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('IBM_XFORCE_TRUST_RANK', 9),
      },
      {
        name: 'sans-isc.org',
        enabled: true, // Always enabled (no API key needed)
        baseUrl: 'https://isc.sans.edu/api',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('SANSISC_TRUST_RANK', 8),
      },
      // VPN/Proxy Detection Providers
      {
        name: 'vpnapi.io',
        enabled: !!process.env.VPNAPI_KEY, // Requires API key (free tier: 1,000 requests/day)
        apiKey: process.env.VPNAPI_KEY,
        baseUrl: 'https://vpnapi.io/api',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('VPNAPI_TRUST_RANK', 8),
      },
      {
        name: 'proxycheck.io',
        enabled: true, // Works without key (limited features)
        apiKey: process.env.PROXYCHECK_KEY, // Optional for enhanced features
        baseUrl: 'https://proxycheck.io/v2',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('PROXYCHECK_TRUST_RANK', 8),
      },
      {
        name: 'iphub.info',
        enabled: !!process.env.IPHUB_KEY,
        apiKey: process.env.IPHUB_KEY,
        baseUrl: 'https://v2.api.iphub.info',
        timeoutMs,
        retries,
        retryDelayMs,
        trustRank: getEnvNumber('IPHUB_TRUST_RANK', 8),
      },
    ];
  }

  /**
   * Query all enabled providers for an IP address
   * @param ip - Validated and normalized IP address
   * @param globalTimeoutMs - Global timeout for all providers
   */
  async queryAll(
    ip: string,
    globalTimeoutMs = 5000
  ): Promise<ProviderResult[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), globalTimeoutMs);

    try {
      // Query all providers with concurrency control
      const promises = this.providers.map((provider) =>
        this.limiter(() => provider.lookup(ip, controller.signal))
      );

      // Wait for all providers (don't fail if some fail)
      const results = await Promise.allSettled(promises);

      return results.map((result, index) => {
        const provider = this.providers[index];

        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          // Return error result
          return {
            provider: provider?.config.name || 'unknown',
            success: false,
            latencyMs: 0,
            error: result.reason?.message || 'Unknown error',
          };
        }
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get health status of all providers
   */
  getProvidersHealth(): Array<{
    name: string;
    enabled: boolean;
    healthy: boolean;
    trustRank: number;
  }> {
    return this.providers.map((provider) => {
      const health = provider.getHealthStatus();
      return {
        name: provider.config.name,
        enabled: provider.isEnabled(),
        healthy: health.healthy,
        trustRank: provider.config.trustRank,
      };
    });
  }

  /**
   * Get a specific provider by name
   */
  getProvider(name: string): Provider | undefined {
    return this.providers.find((p) => p.config.name === name);
  }

  /**
   * Get all providers
   */
  getAllProviders(): Provider[] {
    return [...this.providers];
  }

  /**
   * Reset all circuit breakers (for testing/admin)
   */
  resetAllCircuitBreakers(): void {
    for (const provider of this.providers) {
      provider.resetCircuitBreaker();
    }
  }
}
