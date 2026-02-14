/**
 * IPInfo.io API response types
 * https://ipinfo.io/developers
 *
 * Describes the raw JSON shape returned by `GET /{ip}`.
 */

/** Privacy/detection data (requires paid plan for full data). */
export interface IpInfoPrivacy {
  vpn?: boolean;
  proxy?: boolean;
  tor?: boolean;
  relay?: boolean;
  hosting?: boolean;
  /** Name of the VPN/proxy service, if identified. */
  service?: string;
}

/** Company information associated with the IP. */
export interface IpInfoCompany {
  name?: string;
  domain?: string;
  /** Company type (e.g. "isp", "hosting", "business", "education"). */
  type?: string;
}

/** Mobile carrier information. */
export interface IpInfoCarrier {
  name?: string;
  /** Mobile Country Code. */
  mcc?: string;
  /** Mobile Network Code. */
  mnc?: string;
}

/** Abuse contact information. */
export interface IpInfoAbuse {
  address?: string;
  country?: string;
  email?: string;
  name?: string;
  network?: string;
  phone?: string;
}

/** ASN details (available on some plan tiers). */
export interface IpInfoAsn {
  asn?: string;
  name?: string;
  domain?: string;
  route?: string;
  type?: string;
}

/** Top-level response from `GET /{ip}`. */
export interface IpInfoResponse {
  /** The queried IP address. */
  ip: string;
  /** Reverse DNS hostname. */
  hostname?: string;
  /** City name. */
  city?: string;
  /** Region/state name. */
  region?: string;
  /** Two-letter country code (ISO 3166-1 alpha-2). */
  country?: string;
  /** Latitude,Longitude as a string (e.g. "37.3860,-122.0840"). */
  loc?: string;
  /** Organization string, usually "AS{number} {name}". */
  org?: string;
  /** Postal/ZIP code. */
  postal?: string;
  /** IANA timezone identifier. */
  timezone?: string;
  /** Privacy detection data. */
  privacy?: IpInfoPrivacy;
  /** Company information. */
  company?: IpInfoCompany;
  /** Mobile carrier information. */
  carrier?: IpInfoCarrier;
  /** Abuse contact information. */
  abuse?: IpInfoAbuse;
  /** ASN details. */
  asn?: IpInfoAsn;
  /** Whether this is an anycast address. */
  anycast?: boolean;
  /** Whether this is a bogon address. */
  bogon?: boolean;
}
