import type {
  CorrelatedIpRecord,
  LookupRequest,
  ErrorResponse,
  ProviderHealth,
  SystemHealth,
} from '@ipintel/shared';

const API_BASE = '/api';
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const LOOKUP_TIMEOUT_MS = 60000; // 60 seconds for lookups (may include LLM analysis)

/**
 * API client for IP Intelligence backend
 */
export class ApiClient {
  /**
   * Helper to create a fetch request with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError(
          'Request timed out. Please try again.',
          'TIMEOUT',
          408
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Lookup IP address
   */
  async lookupIp(request: LookupRequest): Promise<CorrelatedIpRecord> {
    const response = await this.fetchWithTimeout(
      `${API_BASE}/v1/lookup`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      },
      LOOKUP_TIMEOUT_MS
    );

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new ApiError(error.error, error.code, response.status, error);
    }

    return response.json();
  }

  /**
   * Get system health
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const response = await this.fetchWithTimeout(`${API_BASE}/health`);

    if (!response.ok) {
      throw new Error('Failed to fetch system health');
    }

    return response.json();
  }

  /**
   * Get provider health
   */
  async getProvidersHealth(): Promise<{ providers: ProviderHealth[] }> {
    const response = await this.fetchWithTimeout(`${API_BASE}/v1/providers`);

    if (!response.ok) {
      throw new Error('Failed to fetch provider health');
    }

    return response.json();
  }

  /**
   * Get lookup activity stats (last 24h, grouped by hour)
   */
  async getActivityStats(): Promise<
    Array<{ hour: string; lookups: number; cached: number }>
  > {
    const response = await this.fetchWithTimeout(`${API_BASE}/v1/stats/activity`);

    if (!response.ok) {
      throw new Error('Failed to fetch activity stats');
    }

    return response.json();
  }

  /**
   * Get threat level distribution
   */
  async getThreatDistribution(): Promise<{
    high: number;
    medium: number;
    low: number;
    unknown: number;
  }> {
    const response = await this.fetchWithTimeout(`${API_BASE}/v1/stats/threats`);

    if (!response.ok) {
      throw new Error('Failed to fetch threat distribution');
    }

    return response.json();
  }

  /**
   * Get provider stats (success rates and latencies)
   */
  async getProviderStats(): Promise<
    Array<{
      provider: string;
      successRate: number;
      avgLatencyMs: number;
      totalRequests: number;
      successCount: number;
      failureCount: number;
    }>
  > {
    const response = await this.fetchWithTimeout(`${API_BASE}/v1/stats/providers`);

    if (!response.ok) {
      throw new Error('Failed to fetch provider stats');
    }

    return response.json();
  }
}

/**
 * Custom API error class
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: ErrorResponse
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Singleton API client instance
 */
export const apiClient = new ApiClient();
