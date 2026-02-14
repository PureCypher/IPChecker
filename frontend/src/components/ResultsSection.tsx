import { useState, lazy, Suspense } from 'react';
import type { CorrelatedIpRecord } from '@ipintel/shared';
import { ThreatGauge } from './ThreatGauge';
import { CopyButton } from './CopyButton';
import { ExportButton } from './ExportButton';
import { AIAnalysis } from './AIAnalysis';

// Lazy load map component (heavy dependency)
const MapView = lazy(() => import('./MapView').then(m => ({ default: m.MapView })));

interface ResultsSectionProps {
  result: CorrelatedIpRecord | null;
  error: string | null;
}

export function ResultsSection({ result, error }: ResultsSectionProps) {
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set()
  );
  const [showConflicts, setShowConflicts] = useState(false);

  if (error) {
    return (
      <section className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="card border-dark-accent-red/50 fade-in">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-dark-accent-red/20 rounded-full flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-dark-accent-red"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-dark-accent-red mb-2">
                  Lookup Failed
                </h3>
                <p className="text-dark-text-secondary leading-relaxed">{error}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!result) return null;

  const toggleProvider = (provider: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  };

  const getRiskBadge = (
    level?: 'low' | 'medium' | 'high'
  ): { label: string; className: string } => {
    switch (level) {
      case 'high':
        return { label: 'High Risk', className: 'badge badge-danger' };
      case 'medium':
        return { label: 'Medium Risk', className: 'badge badge-warning' };
      case 'low':
        return { label: 'Low Risk', className: 'badge badge-success' };
      default:
        return { label: 'Unknown', className: 'badge badge-info' };
    }
  };

  const getSourceBadge = (source: string): { className: string } => {
    switch (source) {
      case 'cache':
        return { className: 'badge badge-success' };
      case 'db':
        return { className: 'badge badge-info' };
      case 'live':
        return { className: 'badge badge-warning' };
      case 'stale':
        return { className: 'badge badge-danger' };
      default:
        return { className: 'badge badge-info' };
    }
  };

  const formatTtl = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h`;
    return `${Math.floor(seconds / 60)}m`;
  };

  const riskBadge = getRiskBadge(result.threat?.riskLevel);
  const sourceBadge = getSourceBadge(result.metadata?.source || 'live');

  return (
    <section className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Summary Card */}
        <div className="card card-hover fade-in">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <h3 className="text-2xl font-bold text-dark-text-primary">
                  {result.ip}
                </h3>
                <CopyButton text={result.ip} label="IP Address" />
              </div>
              {result.asn && result.org && (
                <p className="text-dark-text-secondary">
                  {result.asn} · {result.org}
                </p>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <ExportButton result={result} />
              <div className="flex flex-col items-end space-y-2">
                <span className={sourceBadge.className}>
                  {(result.metadata?.source || 'live').toUpperCase()}
                </span>
                {result.metadata?.ttlSeconds !== undefined && (
                  <span className="text-sm text-dark-text-muted">
                    TTL: {formatTtl(result.metadata.ttlSeconds)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {result.location?.city && (
            <div className="flex items-center space-x-2 text-dark-text-secondary mb-2">
              <span>📍</span>
              <span>
                {result.location.city}
                {result.location.region && `, ${result.location.region}`}
                {result.location.country && `, ${result.location.country}`}
              </span>
            </div>
          )}

          {result.location?.timezone && (
            <div className="flex items-center space-x-2 text-dark-text-secondary">
              <span>⏰</span>
              <span>{result.location.timezone}</span>
            </div>
          )}
        </div>

        {/* Map View */}
        {result.location?.coordinates && (
          <div className="card card-hover slide-up">
            <h4 className="text-lg font-semibold mb-4 text-dark-text-primary flex items-center space-x-2">
              <svg className="w-5 h-5 text-dark-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Location</span>
            </h4>
            <Suspense fallback={<div className="h-64 bg-dark-surface rounded-lg animate-pulse" />}>
              <MapView
                latitude={result.location.coordinates.lat}
                longitude={result.location.coordinates.lon}
                city={result.location.city}
                country={result.location.country}
                ip={result.ip}
              />
            </Suspense>
          </div>
        )}

        {/* Threat Intelligence Card */}
        {(result.threat?.riskLevel || result.threat?.abuseScore !== undefined) && (
          <div className="card card-hover slide-up">
            <h4 className="text-lg font-semibold mb-4 text-dark-text-primary">
              Threat Intelligence
            </h4>

            <div className="flex flex-col md:flex-row items-center md:items-start gap-6 mb-6">
              {result.threat?.abuseScore !== undefined && (
                <div className="flex-shrink-0">
                  <ThreatGauge
                    score={result.threat.abuseScore}
                    riskLevel={result.threat.riskLevel}
                  />
                </div>
              )}

              <div className="flex-1 space-y-3 w-full">
                {result.threat?.riskLevel && (
                  <div className="flex items-center justify-between">
                    <span className="text-dark-text-secondary">Risk Level:</span>
                    <span className={riskBadge.className}>{riskBadge.label}</span>
                  </div>
                )}

                {result.threat?.abuseScore !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-dark-text-secondary">Abuse Score:</span>
                    <span className="font-mono text-dark-text-primary">
                      {result.threat.abuseScore}/100
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-dark-border">
                {[
                  { label: 'Proxy', value: result.flags?.isProxy },
                  { label: 'VPN', value: result.flags?.isVpn },
                  { label: 'Tor', value: result.flags?.isTor },
                  { label: 'Hosting', value: result.flags?.isHosting },
                ].map((flag) => (
                  <div
                    key={flag.label}
                    className="flex items-center space-x-2"
                  >
                    <span className="text-lg">
                      {flag.value ? '✅' : '❌'}
                    </span>
                    <span className="text-sm text-dark-text-secondary">
                      {flag.label}
                    </span>
                  </div>
                ))}
            </div>

            {/* VPN Provider Information */}
            {result.flags?.isVpn && result.flags?.vpnProvider && (
              <div className="mt-4 pt-4 border-t border-dark-border">
                <div className="flex items-center space-x-2">
                  <span className="text-dark-text-secondary">VPN Provider:</span>
                  <span className="font-semibold text-dark-accent-blue">
                    {result.flags.vpnProvider}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Provider Details Card */}
        <div className="card card-hover scale-in">
          <h4 className="text-lg font-semibold mb-4 text-dark-text-primary">
            Provider Details
          </h4>

          <div className="space-y-2">
            {result.metadata?.providers?.map((provider) => (
              <div key={provider.provider} className="border border-dark-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleProvider(provider.provider)}
                  className="w-full px-4 py-3 flex items-center justify-between bg-dark-surface hover:bg-dark-hover transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">
                      {provider.success ? '✓' : '✗'}
                    </span>
                    <span className="font-medium text-dark-text-primary">
                      {provider.provider}
                    </span>
                    <span className="text-sm text-dark-text-muted">
                      ({provider.latencyMs}ms)
                    </span>
                  </div>
                  <span className="text-dark-text-muted">
                    {expandedProviders.has(provider.provider) ? '▼' : '▶'}
                  </span>
                </button>

                {expandedProviders.has(provider.provider) && (
                  <div className="px-4 py-3 bg-dark-bg border-t border-dark-border">
                    {provider.error ? (
                      <p className="text-sm text-dark-accent-red">
                        Error: {provider.error}
                      </p>
                    ) : (
                      <pre className="text-xs text-dark-text-secondary overflow-x-auto scrollbar-thin">
                        {JSON.stringify(provider.raw, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {result.metadata?.conflicts && result.metadata.conflicts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-dark-border">
              <button
                onClick={() => setShowConflicts(!showConflicts)}
                className="flex items-center space-x-2 text-dark-accent-yellow hover:underline"
              >
                <span>⚠</span>
                <span>
                  {result.metadata.conflicts.length} Conflict
                  {result.metadata.conflicts.length > 1 ? 's' : ''} Detected
                </span>
                <span>{showConflicts ? '▼' : '▶'}</span>
              </button>

              {showConflicts && (
                <div className="mt-3 space-y-2">
                  {result.metadata.conflicts.map((conflict, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-dark-surface rounded border border-dark-accent-yellow/30"
                    >
                      <p className="text-sm font-medium text-dark-text-primary mb-2">
                        Field: {conflict.field}
                      </p>
                      <p className="text-xs text-dark-text-muted mb-2">
                        Resolved: {String(conflict.resolved)} ({conflict.reason})
                      </p>
                      <div className="text-xs text-dark-text-secondary space-y-1">
                        {conflict.values.map((val, i) => (
                          <div key={i}>
                            • {String(val.value)} (
                            {val.providers.join(', ')})
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI Analysis */}
        {result.metadata?.llmAnalysis && (
          <AIAnalysis analysis={result.metadata.llmAnalysis} />
        )}

        {/* Metadata */}
        {result.metadata && (
          <div className="text-center text-xs text-dark-text-muted">
            {result.metadata.createdAt && result.metadata.updatedAt && (
              <p>
                Created: {new Date(result.metadata.createdAt).toLocaleString()} |
                Updated: {new Date(result.metadata.updatedAt).toLocaleString()}
              </p>
            )}
            {result.metadata.providersSucceeded !== undefined && result.metadata.providersQueried !== undefined && (
              <p className="mt-1">
                {result.metadata.providersSucceeded}/{result.metadata.providersQueried} providers
                succeeded
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
