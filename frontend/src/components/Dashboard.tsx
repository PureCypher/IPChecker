import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  services: {
    redis: { status: 'up' | 'down'; latencyMs?: number };
    postgres: { status: 'up' | 'down'; latencyMs?: number };
    providers: { available: number; healthy: number };
    llm?: { status: 'up' | 'down'; model: string; latencyMs?: number };
  };
}

interface ProviderHealth {
  name: string;
  enabled: boolean;
  healthy: boolean;
  trustRank: number;
}

const COLORS = {
  healthy: '#10b981',
  degraded: '#f59e0b',
  unhealthy: '#ef4444',
  blue: '#3b82f6',
  purple: '#8b5cf6',
};

export function Dashboard() {
  const { data: health, isLoading: healthLoading } = useQuery<SystemHealth>({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('Failed to fetch health');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: providers, isLoading: providersLoading } = useQuery<ProviderHealth[]>({
    queryKey: ['providers'],
    queryFn: async () => {
      const res = await fetch('/api/v1/providers');
      if (!res.ok) throw new Error('Failed to fetch providers');
      return res.json();
    },
    refetchInterval: 60000,
  });

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'up':
        return 'text-dark-accent-green';
      case 'degraded':
        return 'text-dark-accent-yellow';
      case 'unhealthy':
      case 'down':
        return 'text-dark-accent-red';
      default:
        return 'text-dark-text-muted';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'up':
        return 'bg-dark-accent-green/20';
      case 'degraded':
        return 'bg-dark-accent-yellow/20';
      case 'unhealthy':
      case 'down':
        return 'bg-dark-accent-red/20';
      default:
        return 'bg-dark-surface';
    }
  };

  // Mock data for charts (replace with real data from API)
  const lookupTrend = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    lookups: Math.floor(Math.random() * 100) + 20,
    cached: Math.floor(Math.random() * 50) + 10,
  }));

  if (healthLoading || providersLoading) {
    return (
      <div className="card animate-pulse">
        <div className="h-64 bg-dark-surface rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* System Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Overall Status */}
        <div className="card">
          <div className="flex items-center justify-between">
            <span className="text-dark-text-muted text-sm">System Status</span>
            <span className={`w-3 h-3 rounded-full ${health?.status === 'healthy' ? 'bg-dark-accent-green' : health?.status === 'degraded' ? 'bg-dark-accent-yellow' : 'bg-dark-accent-red'} animate-pulse`} />
          </div>
          <div className={`text-2xl font-bold mt-2 ${getStatusColor(health?.status || 'unknown')}`}>
            {health?.status?.toUpperCase() || 'UNKNOWN'}
          </div>
          <div className="text-xs text-dark-text-muted mt-1">
            Uptime: {health?.uptime ? formatUptime(health.uptime) : 'N/A'}
          </div>
        </div>

        {/* Redis Status */}
        <div className="card">
          <div className="flex items-center justify-between">
            <span className="text-dark-text-muted text-sm">Redis Cache</span>
            <span className={`px-2 py-0.5 rounded text-xs ${getStatusBg(health?.services?.redis?.status || 'down')} ${getStatusColor(health?.services?.redis?.status || 'down')}`}>
              {health?.services?.redis?.status?.toUpperCase() || 'DOWN'}
            </span>
          </div>
          <div className="text-2xl font-bold text-dark-text-primary mt-2">
            {health?.services?.redis?.latencyMs ? `${health.services.redis.latencyMs}ms` : 'N/A'}
          </div>
          <div className="text-xs text-dark-text-muted mt-1">Latency</div>
        </div>

        {/* PostgreSQL Status */}
        <div className="card">
          <div className="flex items-center justify-between">
            <span className="text-dark-text-muted text-sm">PostgreSQL</span>
            <span className={`px-2 py-0.5 rounded text-xs ${getStatusBg(health?.services?.postgres?.status || 'down')} ${getStatusColor(health?.services?.postgres?.status || 'down')}`}>
              {health?.services?.postgres?.status?.toUpperCase() || 'DOWN'}
            </span>
          </div>
          <div className="text-2xl font-bold text-dark-text-primary mt-2">
            {health?.services?.postgres?.latencyMs ? `${health.services.postgres.latencyMs}ms` : 'N/A'}
          </div>
          <div className="text-xs text-dark-text-muted mt-1">Latency</div>
        </div>

        {/* LLM Status */}
        <div className="card">
          <div className="flex items-center justify-between">
            <span className="text-dark-text-muted text-sm">AI Model</span>
            <span className={`px-2 py-0.5 rounded text-xs ${getStatusBg(health?.services?.llm?.status || 'down')} ${getStatusColor(health?.services?.llm?.status || 'down')}`}>
              {health?.services?.llm?.status?.toUpperCase() || 'N/A'}
            </span>
          </div>
          <div className="text-lg font-bold text-dark-text-primary mt-2 truncate">
            {health?.services?.llm?.model || 'Not configured'}
          </div>
          <div className="text-xs text-dark-text-muted mt-1">
            {health?.services?.llm?.latencyMs ? `${health.services.llm.latencyMs}ms latency` : 'Ollama'}
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lookup Trend */}
        <div className="card">
          <h3 className="text-lg font-semibold text-dark-text-primary mb-4">
            Lookup Activity (24h)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={lookupTrend}>
                <defs>
                  <linearGradient id="colorLookups" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.blue} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={COLORS.blue} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorCached" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.healthy} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={COLORS.healthy} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="hour" stroke="#525252" fontSize={10} tickLine={false} />
                <YAxis stroke="#525252" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#a3a3a3' }}
                />
                <Area
                  type="monotone"
                  dataKey="lookups"
                  stroke={COLORS.blue}
                  fillOpacity={1}
                  fill="url(#colorLookups)"
                  name="Total Lookups"
                />
                <Area
                  type="monotone"
                  dataKey="cached"
                  stroke={COLORS.healthy}
                  fillOpacity={1}
                  fill="url(#colorCached)"
                  name="Cache Hits"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Provider Health */}
        <div className="card">
          <h3 className="text-lg font-semibold text-dark-text-primary mb-4">
            Provider Status ({health?.services?.providers?.healthy || 0}/{health?.services?.providers?.available || 0})
          </h3>
          <div className="space-y-3">
            {providers?.map((provider) => (
              <div
                key={provider.name}
                className="flex items-center justify-between p-3 bg-dark-bg rounded-lg border border-dark-border"
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${provider.healthy ? 'bg-dark-accent-green' : 'bg-dark-accent-red'}`} />
                  <span className="text-dark-text-primary font-medium">
                    {provider.name}
                  </span>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: 10 }, (_, i) => (
                      <div
                        key={i}
                        className={`w-1.5 h-3 rounded-sm ${i < provider.trustRank ? 'bg-dark-accent-blue' : 'bg-dark-border'}`}
                      />
                    ))}
                    <span className="ml-2 text-xs text-dark-text-muted">
                      Trust: {provider.trustRank}/10
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${provider.enabled ? 'bg-dark-accent-green/20 text-dark-accent-green' : 'bg-dark-surface text-dark-text-muted'}`}>
                    {provider.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="card">
        <h3 className="text-lg font-semibold text-dark-text-primary mb-4">
          System Information
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-dark-bg rounded-lg">
            <div className="text-2xl font-bold text-dark-accent-blue">
              {health?.services?.providers?.available || 0}
            </div>
            <div className="text-xs text-dark-text-muted mt-1">Total Providers</div>
          </div>
          <div className="text-center p-4 bg-dark-bg rounded-lg">
            <div className="text-2xl font-bold text-dark-accent-green">
              {health?.services?.providers?.healthy || 0}
            </div>
            <div className="text-xs text-dark-text-muted mt-1">Healthy Providers</div>
          </div>
          <div className="text-center p-4 bg-dark-bg rounded-lg">
            <div className="text-2xl font-bold text-dark-accent-yellow">
              v{health?.version || '2.0.0'}
            </div>
            <div className="text-xs text-dark-text-muted mt-1">Version</div>
          </div>
          <div className="text-center p-4 bg-dark-bg rounded-lg">
            <div className="text-2xl font-bold text-dark-accent-purple">
              {health?.services?.llm?.status === 'up' ? 'Active' : 'Inactive'}
            </div>
            <div className="text-xs text-dark-text-muted mt-1">AI Analysis</div>
          </div>
        </div>
      </div>
    </div>
  );
}
