import { useState, useCallback, useRef } from 'react';
import type { CorrelatedIpRecord } from '@ipintel/shared';

export interface StreamingLookupState {
  /** Number of providers that have completed */
  progress: number;
  /** Total number of providers being queried */
  total: number;
  /** The final correlated result (null until lookup_complete) */
  result: CorrelatedIpRecord | null;
  /** Whether the SSE stream is currently open */
  isStreaming: boolean;
  /** Error message if the lookup failed */
  error: string | null;
  /** Whether the result came from cache (instant) */
  fromCache: boolean;
  /** Names of completed providers */
  completedProviders: Array<{ name: string; success: boolean }>;
}

interface UseStreamingLookupReturn extends StreamingLookupState {
  /** Start a streaming lookup for the given IP */
  startLookup: (ip: string, options?: { forceRefresh?: boolean; includeLLMAnalysis?: boolean }) => void;
  /** Cancel an in-progress streaming lookup */
  cancel: () => void;
}

/**
 * Hook for real-time streaming IP lookups via Server-Sent Events.
 *
 * Connects to GET /api/v1/lookup/stream?ip=X.X.X.X and tracks
 * provider completion progress in real time.
 *
 * Falls back to the standard non-streaming lookup if SSE fails.
 */
export function useStreamingLookup(): UseStreamingLookupReturn {
  const [state, setState] = useState<StreamingLookupState>({
    progress: 0,
    total: 0,
    result: null,
    isStreaming: false,
    error: null,
    fromCache: false,
    completedProviders: [],
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const fallbackAbortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (fallbackAbortRef.current) {
      fallbackAbortRef.current.abort();
      fallbackAbortRef.current = null;
    }
    setState((prev) => ({ ...prev, isStreaming: false }));
  }, []);

  const fallbackLookup = useCallback(async (ip: string, options?: { forceRefresh?: boolean; includeLLMAnalysis?: boolean }) => {
    const controller = new AbortController();
    fallbackAbortRef.current = controller;

    try {
      const response = await fetch('/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip,
          forceRefresh: options?.forceRefresh ?? false,
          includeLLMAnalysis: options?.includeLLMAnalysis ?? true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Lookup failed' }));
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          error: errorData.suggestion || errorData.error || 'Lookup failed',
        }));
        return;
      }

      const data: CorrelatedIpRecord = await response.json();
      setState((prev) => ({
        ...prev,
        isStreaming: false,
        result: data,
        progress: prev.total || (data.metadata?.providersQueried ?? 0),
        total: prev.total || (data.metadata?.providersQueried ?? 0),
      }));
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setState((prev) => ({
        ...prev,
        isStreaming: false,
        error: err instanceof Error ? err.message : 'Lookup failed',
      }));
    } finally {
      fallbackAbortRef.current = null;
    }
  }, []);

  const startLookup = useCallback(
    (ip: string, options?: { forceRefresh?: boolean; includeLLMAnalysis?: boolean }) => {
      // Cancel any existing lookup
      cancel();

      // Reset state
      setState({
        progress: 0,
        total: 0,
        result: null,
        isStreaming: true,
        error: null,
        fromCache: false,
        completedProviders: [],
      });

      // Build SSE URL
      const params = new URLSearchParams({ ip });
      if (options?.forceRefresh) params.set('forceRefresh', 'true');
      if (options?.includeLLMAnalysis === false) params.set('includeLLMAnalysis', 'false');

      const url = `/api/v1/lookup/stream?${params.toString()}`;

      try {
        const eventSource = new EventSource(url);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            switch (data.event) {
              case 'lookup_start':
                setState((prev) => ({
                  ...prev,
                  total: data.total,
                }));
                break;

              case 'provider_complete':
                setState((prev) => ({
                  ...prev,
                  progress: data.index,
                  total: data.total,
                  completedProviders: [
                    ...prev.completedProviders,
                    { name: data.provider, success: data.success },
                  ],
                }));
                break;

              case 'correlation_complete':
                // Intermediate result (before LLM)
                setState((prev) => ({
                  ...prev,
                  result: data.data,
                }));
                break;

              case 'llm_start':
                // LLM analysis is starting — no state change needed
                break;

              case 'lookup_complete':
                setState((prev) => ({
                  ...prev,
                  isStreaming: false,
                  result: data.data,
                  fromCache: !!data.cached,
                  progress: prev.total || prev.progress,
                }));
                eventSource.close();
                eventSourceRef.current = null;
                break;

              case 'lookup_error':
                setState((prev) => ({
                  ...prev,
                  isStreaming: false,
                  error: data.error,
                }));
                eventSource.close();
                eventSourceRef.current = null;
                break;
            }
          } catch {
            // Ignore JSON parse errors on individual messages
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
          eventSourceRef.current = null;

          // If we haven't received any result yet, fall back to non-streaming
          setState((prev) => {
            if (!prev.result && !prev.error) {
              // Fall back to non-streaming lookup
              fallbackLookup(ip, options);
              return prev; // Keep isStreaming true, fallback will set it false
            }
            return { ...prev, isStreaming: false };
          });
        };
      } catch {
        // EventSource constructor failed (e.g., SSE not supported)
        fallbackLookup(ip, options);
      }
    },
    [cancel, fallbackLookup]
  );

  return {
    ...state,
    startLookup,
    cancel,
  };
}
