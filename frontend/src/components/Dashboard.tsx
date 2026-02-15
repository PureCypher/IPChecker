import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { apiClient } from '@/lib/api';

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

interface ActivityDataPoint {
  hour: string;
  lookups: number;
  cached: number;
}

interface ThreatDistribution {
  high: number;
  medium: number;
  low: number;
  unknown: number;
}

interface ProviderStat {
  provider: string;
  successRate: number;
  avgLatencyMs: number;
  totalRequests: number;
  successCount: number;
  failureCount: number;
}

const COLORS = {
  healthy: '#00ff88',
  degraded: '#ffb400',
  unhealthy: '#ff4444',
  blue: '#00d4ff',
  purple: '#8b5cf6',
};

const THREAT_COLORS: Record<string, string> = {
  high: '#ff4444',
  medium: '#ffb400',
  low: '#00ff88',
  unknown: '#6b7280',
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

  const { data: activityData, isLoading: activityLoading } = useQuery<ActivityDataPoint[]>({
    queryKey: ['stats', 'activity'],
    queryFn: () => apiClient.getActivityStats(),
    refetchInterval: 60000,
  });

  const { data: threatData, isLoading: threatLoading } = useQuery<ThreatDistribution>({
    queryKey: ['stats', 'threats'],
    queryFn: () => apiClient.getThreatDistribution(),
    refetchInterval: 60000,
  });

  const { data: providerStats, isLoading: providerStatsLoading } = useQuery<ProviderStat[]>({
    queryKey: ['stats', 'providers'],
    queryFn: () => apiClient.getProviderStats(),
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

  // Check if activity data has any actual lookups
  const hasActivityData = activityData && activityData.some((d) => d.lookups > 0);

  // Check if threat data has any records
  const hasThreatData =
    threatData &&
    (threatData.high > 0 ||
      threatData.medium > 0 ||
      threatData.low > 0 ||
      threatData.unknown > 0);

  // Prepare threat chart data
  const threatChartData = threatData
    ? [
        { name: 'High', count: threatData.high, color: THREAT_COLORS.high },
        { name: 'Medium', count: threatData.medium, color: THREAT_COLORS.medium },
        { name: 'Low', count: threatData.low, color: THREAT_COLORS.low },
        { name: 'Unknown', count: threatData.unknown, color: THREAT_COLORS.unknown },
      ]
    : [];

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
          {activityLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-pulse flex flex-col items-center space-y-2">
                <div className="w-8 h-8 border-2 border-dark-accent-blue border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-dark-text-muted">Loading activity data...</span>
              </div>
            </div>
          ) : !hasActivityData ? (
            <div className="h-64 flex items-center justify-center">
              <div className="text-center">
                <svg
                  className="w-12 h-12 text-dark-text-muted mx-auto mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <p className="text-dark-text-muted text-sm">No lookup data yet</p>
                <p className="text-dark-text-muted text-xs mt-1">
                  Perform an IP lookup to see activity here
                </p>
              </div>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityData}>
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
                  <XAxis dataKey="hour" stroke="#8b919a" fontSize={10} tickLine={false} />
                  <YAxis stroke="#8b919a" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#12121a',
                      border: '1px solid #1e1e2e',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#a0a8b4' }}
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
          )}
        </div>

        {/* Threat Distribution */}
        <div className="card">
          <h3 className="text-lg font-semibold text-dark-text-primary mb-4">
            Threat Distribution
          </h3>
          {threatLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-pulse flex flex-col items-center space-y-2">
                <div className="w-8 h-8 border-2 border-dark-accent-blue border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-dark-text-muted">Loading threat data...</span>
              </div>
            </div>
          ) : !hasThreatData ? (
            <div className="h-64 flex items-center justify-center">
              <div className="text-center">
                <svg
                  className="w-12 h-12 text-dark-text-muted mx-auto mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                <p className="text-dark-text-muted text-sm">No threat data yet</p>
                <p className="text-dark-text-muted text-xs mt-1">
                  Threat distribution appears after lookups
                </p>
              </div>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={threatChartData} layout="vertical">
                  <XAxis type="number" stroke="#8b919a" fontSize={10} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#8b919a"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    width={70}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#12121a',
                      border: '1px solid #1e1e2e',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#a0a8b4' }}
                  />
                  <Bar dataKey="count" name="IP Records" radius={[0, 4, 4, 0]}>
                    {threatChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Provider Stats */}
      {providerStatsLoading ? (
        <div className="card">
          <h3 className="text-lg font-semibold text-dark-text-primary mb-4">
            Provider Performance (7d)
          </h3>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-dark-surface rounded" />
            ))}
          </div>
        </div>
      ) : providerStats && providerStats.length > 0 ? (
        <div className="card">
          <h3 className="text-lg font-semibold text-dark-text-primary mb-4">
            Provider Performance (7d)
          </h3>
          <div className="space-y-3">
            {providerStats.map((stat) => {
              const successPct = Math.round(stat.successRate * 100);
              return (
                <div
                  key={stat.provider}
                  className="flex items-center justify-between p-3 bg-dark-bg rounded-lg border border-dark-border"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        successPct >= 90
                          ? 'bg-dark-accent-green'
                          : successPct >= 50
                            ? 'bg-dark-accent-yellow'
                            : 'bg-dark-accent-red'
                      }`}
                    />
                    <span className="text-dark-text-primary font-medium truncate">
                      {stat.provider}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-sm text-dark-text-primary">
                        {successPct}% success
                      </div>
                      <div className="text-xs text-dark-text-muted">
                        {stat.totalRequests} requests
                      </div>
                    </div>
                    <div className="text-right w-16">
                      <div className="text-sm text-dark-text-primary">
                        {stat.avgLatencyMs}ms
                      </div>
                      <div className="text-xs text-dark-text-muted">avg</div>
                    </div>
                    {/* Success rate bar */}
                    <div className="w-20 h-2 bg-dark-border rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          successPct >= 90
                            ? 'bg-dark-accent-green'
                            : successPct >= 50
                              ? 'bg-dark-accent-yellow'
                              : 'bg-dark-accent-red'
                        }`}
                        style={{ width: `${successPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

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
