import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { apiClient } from '@/lib/api';
import type { CorrelatedIpRecord } from '@ipintel/shared';

interface ComparisonEntry {
  ip: string;
  loading: boolean;
  result: CorrelatedIpRecord | null;
  error: string | null;
}

type FlagKey = 'isProxy' | 'isVpn' | 'isTor' | 'isHosting';

/**
 * Returns true if all non-null values in the array are the same.
 */
function valuesMatch(values: (string | number | boolean | null | undefined)[]): boolean {
  const defined = values.filter((v) => v !== null && v !== undefined);
  if (defined.length <= 1) return true;
  return defined.every((v) => String(v) === String(defined[0]));
}

/**
 * Cell background class based on whether values match across IPs.
 */
function diffBg(allValues: (string | number | boolean | null | undefined)[]): string {
  if (allValues.every((v) => v === null || v === undefined)) return '';
  return valuesMatch(allValues) ? 'bg-dark-accent-green/5' : 'bg-dark-accent-red/10';
}

/**
 * Returns a risk-level color class.
 */
function riskColor(level?: 'low' | 'medium' | 'high'): string {
  switch (level) {
    case 'high':
      return 'text-dark-accent-red font-semibold';
    case 'medium':
      return 'text-dark-accent-yellow font-semibold';
    case 'low':
      return 'text-dark-accent-green';
    default:
      return 'text-dark-text-muted';
  }
}

/**
 * Returns a colored class for abuse score (0-100 scale).
 */
function abuseScoreColor(score?: number): string {
  if (score === undefined || score === null) return 'text-dark-text-muted';
  if (score >= 75) return 'text-dark-accent-red font-semibold';
  if (score >= 40) return 'text-dark-accent-yellow font-semibold';
  return 'text-dark-accent-green';
}

/**
 * Flag cell: green for false (safe), red for true (flagged).
 */
function flagColor(value?: boolean): string {
  if (value === undefined || value === null) return 'text-dark-text-muted';
  return value ? 'text-dark-accent-red font-semibold' : 'text-dark-accent-green';
}

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

export function ComparisonView() {
  const [ipText, setIpText] = useState('');
  const [entries, setEntries] = useState<ComparisonEntry[]>([]);
  const [isComparing, setIsComparing] = useState(false);

  const handleCompare = useCallback(async () => {
    const ips = ipText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Deduplicate
    const uniqueIps = [...new Set(ips)];

    if (uniqueIps.length < 2) {
      toast.error('Enter at least 2 IP addresses to compare');
      return;
    }

    if (uniqueIps.length > 4) {
      toast.error('Maximum 4 IP addresses for comparison');
      return;
    }

    // Validate format
    const invalid = uniqueIps.filter((ip) => !IP_REGEX.test(ip));
    if (invalid.length > 0) {
      toast.error(`Invalid IP format: ${invalid.join(', ')}`);
      return;
    }

    setIsComparing(true);

    // Initialize entries with loading state
    const initial: ComparisonEntry[] = uniqueIps.map((ip) => ({
      ip,
      loading: true,
      result: null,
      error: null,
    }));
    setEntries(initial);

    // Fire all lookups in parallel
    const promises = uniqueIps.map(async (ip, idx) => {
      try {
        const result = await apiClient.lookupIp({
          ip,
          forceRefresh: false,
          includeLLMAnalysis: false,
        });
        setEntries((prev) => {
          const next = [...prev];
          const entry = next[idx];
          if (entry) {
            next[idx] = { ...entry, loading: false, result, error: null };
          }
          return next;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Lookup failed';
        setEntries((prev) => {
          const next = [...prev];
          const entry = next[idx];
          if (entry) {
            next[idx] = { ...entry, loading: false, result: null, error: message };
          }
          return next;
        });
      }
    });

    await Promise.allSettled(promises);
    setIsComparing(false);
    toast.success('Comparison complete');
  }, [ipText]);

  const handleClear = () => {
    setIpText('');
    setEntries([]);
  };

  const successEntries = entries.filter((e) => e.result !== null);
  const hasResults = entries.length > 0;
  const anyLoading = entries.some((e) => e.loading);

  // Prepare column-width class based on number of IPs
  const colClass =
    successEntries.length <= 2
      ? 'w-1/2'
      : successEntries.length === 3
        ? 'w-1/3'
        : 'w-1/4';

  // Helper to collect a field value from all success entries
  const collectValues = <T,>(fn: (r: CorrelatedIpRecord) => T): T[] =>
    successEntries.map((e) => fn(e.result!));

  // Comparison rows definition
  const FLAG_LABELS: { key: FlagKey; label: string }[] = [
    { key: 'isVpn', label: 'VPN' },
    { key: 'isProxy', label: 'Proxy' },
    { key: 'isTor', label: 'Tor' },
    { key: 'isHosting', label: 'Hosting' },
  ];

  return (
    <div className="space-y-6">
      {/* Input Card */}
      <div className="card fade-in">
        <h3 className="text-xl font-semibold mb-4 text-dark-text-primary flex items-center space-x-2">
          <svg className="w-6 h-6 text-dark-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>IP Comparison</span>
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-dark-text-secondary mb-2">
              Enter 2-4 IP addresses (one per line or comma-separated)
            </label>
            <textarea
              value={ipText}
              onChange={(e) => setIpText(e.target.value)}
              className="input min-h-[100px] font-mono text-sm"
              placeholder={"8.8.8.8\n1.1.1.1\n208.67.222.222"}
              disabled={isComparing}
            />
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleCompare}
              disabled={isComparing || !ipText.trim()}
              className="btn btn-primary flex-1"
            >
              {isComparing ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Comparing...
                </span>
              ) : (
                'Compare IPs'
              )}
            </button>
            {hasResults && (
              <button onClick={handleClear} className="btn btn-secondary" disabled={isComparing}>
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {anyLoading && (
        <div className="card fade-in">
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 border-2 border-dark-accent-blue border-t-transparent rounded-full animate-spin" />
            <div>
              <p className="text-dark-text-primary font-medium">Looking up IP addresses...</p>
              <p className="text-sm text-dark-text-muted">
                {entries.filter((e) => !e.loading).length}/{entries.length} complete
              </p>
            </div>
          </div>
          {/* Per-IP progress */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {entries.map((entry) => (
              <div key={entry.ip} className="flex items-center space-x-2 p-2 rounded bg-dark-surface">
                {entry.loading ? (
                  <div className="w-4 h-4 border-2 border-dark-accent-blue border-t-transparent rounded-full animate-spin flex-shrink-0" />
                ) : entry.error ? (
                  <span className="w-4 h-4 text-dark-accent-red flex-shrink-0">&#x2717;</span>
                ) : (
                  <span className="w-4 h-4 text-dark-accent-green flex-shrink-0">&#x2713;</span>
                )}
                <span className="font-mono text-sm text-dark-text-secondary truncate">{entry.ip}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error entries */}
      {entries.filter((e) => e.error).length > 0 && !anyLoading && (
        <div className="card border-dark-accent-red/50 fade-in">
          <h4 className="text-sm font-semibold text-dark-accent-red mb-2">Lookup Errors</h4>
          <div className="space-y-1">
            {entries
              .filter((e) => e.error)
              .map((e) => (
                <div key={e.ip} className="flex items-center space-x-2 text-sm">
                  <span className="font-mono text-dark-text-primary">{e.ip}</span>
                  <span className="text-dark-text-muted">-</span>
                  <span className="text-dark-accent-red">{e.error}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Comparison Table */}
      {successEntries.length >= 2 && !anyLoading && (
        <div className="card fade-in overflow-x-auto">
          <h4 className="text-lg font-semibold text-dark-text-primary mb-4">
            Side-by-Side Comparison
          </h4>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-dark-border">
                <th className="text-left py-3 pr-4 text-dark-text-muted font-medium w-36">Field</th>
                {successEntries.map((entry) => (
                  <th
                    key={entry.ip}
                    className={`text-left py-3 px-3 text-dark-text-primary font-mono font-semibold ${colClass}`}
                  >
                    {entry.ip}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-dark-border/50">
              {/* Location: Country */}
              {(() => {
                const values = collectValues((r) => r.location?.country);
                const bg = diffBg(values);
                return (
                  <tr className={bg}>
                    <td className="py-2.5 pr-4 text-dark-text-muted">Country</td>
                    {successEntries.map((e) => (
                      <td key={e.ip} className="py-2.5 px-3 text-dark-text-primary">
                        {e.result!.location?.country || '-'}
                      </td>
                    ))}
                  </tr>
                );
              })()}

              {/* Location: Region */}
              {(() => {
                const values = collectValues((r) => r.location?.region);
                const bg = diffBg(values);
                return (
                  <tr className={bg}>
                    <td className="py-2.5 pr-4 text-dark-text-muted">Region</td>
                    {successEntries.map((e) => (
                      <td key={e.ip} className="py-2.5 px-3 text-dark-text-primary">
                        {e.result!.location?.region || '-'}
                      </td>
                    ))}
                  </tr>
                );
              })()}

              {/* Location: City */}
              {(() => {
                const values = collectValues((r) => r.location?.city);
                const bg = diffBg(values);
                return (
                  <tr className={bg}>
                    <td className="py-2.5 pr-4 text-dark-text-muted">City</td>
                    {successEntries.map((e) => (
                      <td key={e.ip} className="py-2.5 px-3 text-dark-text-primary">
                        {e.result!.location?.city || '-'}
                      </td>
                    ))}
                  </tr>
                );
              })()}

              {/* ASN */}
              {(() => {
                const values = collectValues((r) => r.asn);
                const bg = diffBg(values);
                return (
                  <tr className={bg}>
                    <td className="py-2.5 pr-4 text-dark-text-muted">ASN</td>
                    {successEntries.map((e) => (
                      <td key={e.ip} className="py-2.5 px-3 font-mono text-dark-text-primary">
                        {e.result!.asn || '-'}
                      </td>
                    ))}
                  </tr>
                );
              })()}

              {/* Org */}
              {(() => {
                const values = collectValues((r) => r.org);
                const bg = diffBg(values);
                return (
                  <tr className={bg}>
                    <td className="py-2.5 pr-4 text-dark-text-muted">Organization</td>
                    {successEntries.map((e) => (
                      <td key={e.ip} className="py-2.5 px-3 text-dark-text-secondary">
                        {e.result!.org || '-'}
                      </td>
                    ))}
                  </tr>
                );
              })()}

              {/* Separator: Flags */}
              <tr>
                <td colSpan={successEntries.length + 1} className="pt-4 pb-2">
                  <span className="text-xs font-semibold text-dark-text-muted uppercase tracking-wider">
                    Flags
                  </span>
                </td>
              </tr>

              {/* Boolean Flags */}
              {FLAG_LABELS.map(({ key, label }) => {
                const values = collectValues((r) => r.flags?.[key]);
                const bg = diffBg(values);
                return (
                  <tr key={key} className={bg}>
                    <td className="py-2.5 pr-4 text-dark-text-muted">{label}</td>
                    {successEntries.map((e) => {
                      const val = e.result!.flags?.[key];
                      return (
                        <td key={e.ip} className={`py-2.5 px-3 ${flagColor(val)}`}>
                          {val === true ? 'Yes' : val === false ? 'No' : '-'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Separator: Threat */}
              <tr>
                <td colSpan={successEntries.length + 1} className="pt-4 pb-2">
                  <span className="text-xs font-semibold text-dark-text-muted uppercase tracking-wider">
                    Threat Intelligence
                  </span>
                </td>
              </tr>

              {/* Risk Level */}
              {(() => {
                const values = collectValues((r) => r.threat?.riskLevel);
                const bg = diffBg(values);
                return (
                  <tr className={bg}>
                    <td className="py-2.5 pr-4 text-dark-text-muted">Risk Level</td>
                    {successEntries.map((e) => {
                      const level = e.result!.threat?.riskLevel;
                      return (
                        <td key={e.ip} className={`py-2.5 px-3 ${riskColor(level)}`}>
                          {level ? level.toUpperCase() : '-'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })()}

              {/* Abuse Score */}
              {(() => {
                const values = collectValues((r) => r.threat?.abuseScore);
                const bg = diffBg(values);
                return (
                  <tr className={bg}>
                    <td className="py-2.5 pr-4 text-dark-text-muted">Abuse Score</td>
                    {successEntries.map((e) => {
                      const score = e.result!.threat?.abuseScore;
                      return (
                        <td key={e.ip} className={`py-2.5 px-3 font-mono ${abuseScoreColor(score)}`}>
                          {score !== undefined && score !== null ? `${score}/100` : '-'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })()}

              {/* Separator: Provider Consensus */}
              <tr>
                <td colSpan={successEntries.length + 1} className="pt-4 pb-2">
                  <span className="text-xs font-semibold text-dark-text-muted uppercase tracking-wider">
                    Provider Consensus
                  </span>
                </td>
              </tr>

              {/* Providers Succeeded */}
              <tr>
                <td className="py-2.5 pr-4 text-dark-text-muted">Providers Succeeded</td>
                {successEntries.map((e) => {
                  const succeeded = e.result!.metadata?.providersSucceeded;
                  const queried = e.result!.metadata?.providersQueried;
                  return (
                    <td key={e.ip} className="py-2.5 px-3 text-dark-text-primary">
                      {succeeded !== undefined && queried !== undefined
                        ? `${succeeded}/${queried}`
                        : '-'}
                    </td>
                  );
                })}
              </tr>

              {/* Conflicts */}
              <tr>
                <td className="py-2.5 pr-4 text-dark-text-muted">Conflicts</td>
                {successEntries.map((e) => {
                  const count = e.result!.metadata?.conflicts?.length ?? 0;
                  return (
                    <td
                      key={e.ip}
                      className={`py-2.5 px-3 ${count > 0 ? 'text-dark-accent-yellow font-semibold' : 'text-dark-text-muted'}`}
                    >
                      {count > 0 ? `${count} conflict${count > 1 ? 's' : ''}` : 'None'}
                    </td>
                  );
                })}
              </tr>

              {/* Data Source */}
              <tr>
                <td className="py-2.5 pr-4 text-dark-text-muted">Data Source</td>
                {successEntries.map((e) => (
                  <td key={e.ip} className="py-2.5 px-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-dark-surface text-dark-text-secondary">
                      {(e.result!.metadata?.source || 'live').toUpperCase()}
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Single result fallback message */}
      {!anyLoading && successEntries.length === 1 && entries.length > 1 && (
        <div className="card border-dark-accent-yellow/50 fade-in">
          <p className="text-dark-text-secondary text-sm">
            Only one IP returned results. At least 2 successful lookups are needed for comparison.
          </p>
        </div>
      )}
    </div>
  );
}
