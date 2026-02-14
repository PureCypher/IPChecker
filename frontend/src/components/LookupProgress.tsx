interface LookupProgressProps {
  progress: number;
  total: number;
  completedProviders: Array<{ name: string; success: boolean }>;
  onCancel: () => void;
}

export function LookupProgress({
  progress,
  total,
  completedProviders,
  onCancel,
}: LookupProgressProps) {
  const percentage = total > 0 ? Math.round((progress / total) * 100) : 0;
  const successCount = completedProviders.filter((p) => p.success).length;
  const failCount = completedProviders.filter((p) => !p.success).length;

  return (
    <section className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="card fade-in">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-dark-text-primary">
              Querying Providers
            </h3>
            <button
              onClick={onCancel}
              className="text-sm text-dark-text-muted hover:text-dark-accent-red transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-dark-text-secondary">
                {total > 0 ? (
                  <>
                    {progress}/{total} providers complete
                  </>
                ) : (
                  'Connecting...'
                )}
              </span>
              <span className="text-sm font-mono text-dark-accent-blue">
                {percentage}%
              </span>
            </div>
            <div className="w-full h-3 bg-dark-border rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-dark-accent-blue to-dark-accent-purple rounded-full transition-all duration-300 ease-out"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          {completedProviders.length > 0 && (
            <div className="flex items-center space-x-4 mb-4 text-sm">
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-dark-accent-green" />
                <span className="text-dark-text-muted">{successCount} succeeded</span>
              </span>
              {failCount > 0 && (
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-dark-accent-red" />
                  <span className="text-dark-text-muted">{failCount} failed</span>
                </span>
              )}
            </div>
          )}

          {/* Provider List */}
          {completedProviders.length > 0 && (
            <div className="border-t border-dark-border pt-4">
              <div className="flex flex-wrap gap-2">
                {completedProviders.map((provider, index) => (
                  <span
                    key={`${provider.name}-${index}`}
                    className={`inline-flex items-center space-x-1 px-2 py-1 rounded text-xs ${
                      provider.success
                        ? 'bg-dark-accent-green/10 text-dark-accent-green border border-dark-accent-green/20'
                        : 'bg-dark-accent-red/10 text-dark-accent-red border border-dark-accent-red/20'
                    }`}
                  >
                    <span>{provider.success ? '\u2713' : '\u2717'}</span>
                    <span>{provider.name}</span>
                  </span>
                ))}

                {/* Placeholder for remaining providers */}
                {total > 0 &&
                  Array.from({ length: Math.max(0, total - completedProviders.length) }, (_, i) => (
                    <span
                      key={`pending-${i}`}
                      className="inline-flex items-center px-2 py-1 rounded text-xs bg-dark-surface text-dark-text-muted border border-dark-border animate-pulse"
                    >
                      ...
                    </span>
                  )).slice(0, 5) // Show max 5 pending placeholders
                }
                {total - completedProviders.length > 5 && (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs text-dark-text-muted">
                    +{total - completedProviders.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Spinner when waiting for initial connection */}
          {total === 0 && (
            <div className="flex items-center justify-center py-4">
              <svg
                className="animate-spin h-8 w-8 text-dark-accent-blue"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
