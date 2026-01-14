import { useSystemHealth } from '@/hooks/useIpLookup';

export function Header() {
  const { data: health } = useSystemHealth();

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'healthy':
        return 'text-dark-accent-green';
      case 'degraded':
        return 'text-dark-accent-yellow';
      case 'unhealthy':
        return 'text-dark-accent-red';
      default:
        return 'text-dark-text-muted';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'healthy':
        return '●';
      case 'degraded':
        return '◐';
      case 'unhealthy':
        return '○';
      default:
        return '○';
    }
  };

  return (
    <header className="border-b border-dark-border bg-dark-surface/50 backdrop-blur">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              </div>
              <div className="text-2xl font-bold text-gradient">
                IP Intelligence
              </div>
            </div>
            <div className="hidden sm:flex items-center space-x-2 text-dark-text-secondary text-sm">
              <span className="text-dark-border">|</span>
              <span>AI-Powered Analysis</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {health && (
              <>
                <div className="hidden md:flex items-center space-x-3 text-sm">
                  {/* AI Status */}
                  {(health.services as any)?.llm && (
                    <div className="flex items-center space-x-1.5 px-2 py-1 rounded-full bg-dark-surface border border-dark-border">
                      <span className={`w-2 h-2 rounded-full ${(health.services as any).llm.status === 'up' ? 'bg-purple-500 animate-pulse' : 'bg-dark-text-muted'}`} />
                      <span className="text-dark-text-secondary">AI</span>
                    </div>
                  )}
                  {/* Providers Status */}
                  {health.services?.providers && (
                    <div className="flex items-center space-x-1.5 px-2 py-1 rounded-full bg-dark-surface border border-dark-border">
                      <span className={`w-2 h-2 rounded-full ${health.services.providers.healthy > 0 ? 'bg-dark-accent-green' : 'bg-dark-accent-red'}`} />
                      <span className="text-dark-text-secondary">
                        {health.services.providers.healthy}/{health.services.providers.available}
                      </span>
                    </div>
                  )}
                </div>
                {/* System Status */}
                <div className="flex items-center space-x-2 text-sm">
                  <span
                    className={`text-xl ${getStatusColor(health.status)}`}
                    title={`System Status: ${health.status}`}
                  >
                    {getStatusIcon(health.status)}
                  </span>
                </div>
                <a
                  href="/api/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary text-xs"
                >
                  API Docs
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
