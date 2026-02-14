import type { ProviderResult } from '@ipintel/shared';
import { BaseProvider } from './base-provider.js';

/**
 * RDAP WHOIS provider - Registration data for IP addresses
 * https://rdap.org/
 * Free, no API key required
 * Provides registration date, registrant name, country, and abuse contact
 * via the Registration Data Access Protocol (RDAP)
 */
export class RDAPWhoisProvider extends BaseProvider {
  protected async performLookup(
    ip: string,
    signal: AbortSignal
  ): Promise<Partial<ProviderResult>> {
    const url = `${this.config.baseUrl}/ip/${ip}`;

    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        url,
        {
          headers: {
            Accept: 'application/rdap+json, application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; IPIntel/1.0)',
          },
          signal,
        },
        this.config.timeoutMs
      );
    } catch (fetchError: any) {
      if (fetchError.name === 'AbortError' || fetchError.code === 'ECONNREFUSED') {
        throw new Error('RDAP service unavailable');
      }
      throw new Error(`RDAP fetch failed: ${fetchError.message || 'Network error'}`);
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('RDAP rate limit exceeded');
      }
      if (response.status === 404) {
        return {
          raw: { message: 'IP not found in RDAP registry' },
        };
      }
      if (response.status >= 500) {
        throw new Error('RDAP service error');
      }
      throw new Error(`RDAP returned ${response.status}`);
    }

    interface RDAPEvent {
      eventAction?: string;
      eventDate?: string;
    }

    interface RDAPVCard {
      // vCard is represented as a JSON array: [type, params, valueType, value]
      [index: number]: unknown;
    }

    interface RDAPEntity {
      roles?: string[];
      vcardArray?: [string, RDAPVCard[]];
      entities?: RDAPEntity[];
    }

    interface RDAPResponse {
      handle?: string;
      name?: string;
      country?: string;
      startAddress?: string;
      endAddress?: string;
      events?: RDAPEvent[];
      entities?: RDAPEntity[];
      port43?: string;
      remarks?: Array<{
        title?: string;
        description?: string[];
      }>;
    }

    const data = await response.json() as RDAPResponse;

    if (!data) {
      return {
        raw: { message: 'No RDAP data available for this IP' },
      };
    }

    // Extract registration date from events
    let registrationDate: string | null = null;
    let lastChangedDate: string | null = null;
    if (data.events) {
      for (const event of data.events) {
        if (event.eventAction === 'registration' && event.eventDate) {
          registrationDate = event.eventDate;
        }
        if (event.eventAction === 'last changed' && event.eventDate) {
          lastChangedDate = event.eventDate;
        }
      }
    }

    // Extract registrant information and abuse contact from entities
    let registrantName: string | null = null;
    let country: string | null = null;
    let abuseEmail: string | null = null;
    let org: string | null = null;

    if (data.entities) {
      for (const entity of data.entities) {
        // Extract organization/registrant name from vCard
        const entityName = this.extractVCardField(entity, 'fn');
        const entityOrg = this.extractVCardField(entity, 'org');

        if (entity.roles?.includes('registrant')) {
          registrantName = entityName;
          org = entityOrg || entityName;
        }

        // Check for abuse contact role
        if (entity.roles?.includes('abuse')) {
          const email = this.extractVCardField(entity, 'email');
          if (email) {
            abuseEmail = email;
          }
          // If no org found yet, use the abuse entity name
          if (!org && entityName) {
            org = entityName;
          }
        }

        // Check for administrative role as fallback for org
        if (!org && entity.roles?.includes('administrative') && entityName) {
          org = entityOrg || entityName;
        }

        // Look in nested entities for abuse contact
        if (entity.entities) {
          for (const subEntity of entity.entities) {
            if (subEntity.roles?.includes('abuse')) {
              const email = this.extractVCardField(subEntity, 'email');
              if (email) {
                abuseEmail = email;
              }
            }
          }
        }

        // Fallback: if no registrant found, use first entity with a name
        if (!org && entityName) {
          org = entityOrg || entityName;
        }
      }
    }

    // Use top-level country if available
    if (data.country) {
      country = data.country;
    }

    return {
      org,
      country,
      lastSeen: lastChangedDate || registrationDate || undefined,
      raw: {
        handle: data.handle,
        name: data.name,
        startAddress: data.startAddress,
        endAddress: data.endAddress,
        registrationDate,
        lastChangedDate,
        registrantName,
        abuseContactEmail: abuseEmail,
        country,
        port43: data.port43,
      },
    };
  }

  /**
   * Extract a field value from a vCard array in an RDAP entity.
   * vCardArray format: ["vcard", [ [fieldName, params, type, value], ... ]]
   */
  private extractVCardField(entity: { vcardArray?: [string, unknown[]] }, fieldName: string): string | null {
    if (!entity.vcardArray || !Array.isArray(entity.vcardArray[1])) {
      return null;
    }

    const properties = entity.vcardArray[1];
    for (const prop of properties) {
      if (Array.isArray(prop) && prop[0] === fieldName) {
        const value = prop[3];
        if (typeof value === 'string') {
          return value;
        }
        // org field can be a nested array
        if (Array.isArray(value) && typeof value[0] === 'string') {
          return value[0];
        }
      }
    }

    return null;
  }
}
