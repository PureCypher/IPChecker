/**
 * GreyNoise Community API response types
 * https://docs.greynoise.io/reference/get_v3-community-ip
 *
 * Describes the raw JSON shape returned by `GET /v3/community/{ip}`.
 */

/** Top-level response from the GreyNoise Community API. */
export interface GreyNoiseResponse {
  /** The queried IP address. */
  ip?: string;
  /** Whether the IP has been observed scanning the internet. */
  noise?: boolean;
  /** Whether the IP is in the RIOT (Rule It Out) dataset of known benign services. */
  riot?: boolean;
  /** Classification: "benign", "malicious", or "unknown". */
  classification?: string;
  /** Name of the actor/scanner if identified (e.g. "Shodan.io", "Censys"). */
  name?: string;
  /** Link to the GreyNoise visualizer page for this IP. */
  link?: string;
  /** ISO 8601 date when the IP was last observed. */
  last_seen?: string;
  /** Human-readable message from the API. */
  message?: string;
}
