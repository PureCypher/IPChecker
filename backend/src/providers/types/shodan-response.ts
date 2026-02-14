/**
 * Shodan API response types
 * https://developer.shodan.io/api
 *
 * Describes the raw JSON shape returned by `GET /shodan/host/{ip}`.
 */

/** An individual service/banner entry on a host. */
export interface ShodanBanner {
  port: number;
  transport: string;
  protocol?: string;
  product?: string;
  version?: string;
  banner?: string;
  /** CPE identifiers for the detected software. */
  cpe?: string[];
  /** Timestamp of when the banner was collected. */
  timestamp?: string;
}

/** Top-level response from `GET /shodan/host/{ip}`. */
export interface ShodanResponse {
  /** Numeric IP address representation. */
  ip?: number;
  /** String IP address. */
  ip_str?: string;
  /** Autonomous System Number (e.g. "15169"). */
  asn?: string;
  /** Organization that owns the IP. */
  org?: string;
  /** Internet Service Provider. */
  isp?: string;
  /** Two-letter country code (ISO 3166-1 alpha-2). */
  country_code?: string;
  /** Full country name. */
  country_name?: string;
  /** Region/state code. */
  region_code?: string;
  /** City name. */
  city?: string;
  /** Latitude of the IP geolocation. */
  latitude?: number;
  /** Longitude of the IP geolocation. */
  longitude?: number;
  /** Postal/ZIP code. */
  postal_code?: string;
  /** Area code. */
  area_code?: number;
  /** Reverse DNS hostnames. */
  hostnames?: string[];
  /** Associated domains. */
  domains?: string[];
  /** Open ports detected. */
  ports?: number[];
  /** Shodan tags (e.g. "cloud", "vpn", "tor"). */
  tags?: string[];
  /** CVE identifiers for known vulnerabilities. */
  vulns?: string[];
  /** Operating system detected. */
  os?: string;
  /** Timestamp of last data update. */
  last_update?: string;
  /** Array of service banners. */
  data?: ShodanBanner[];
}
