import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface ThreatGaugeProps {
  score: number;
  riskLevel?: 'low' | 'medium' | 'high';
}

export function ThreatGauge({ score, riskLevel }: ThreatGaugeProps) {
  const getColor = (level?: string) => {
    switch (level) {
      case 'high':
        return '#ff4444';
      case 'medium':
        return '#ffb400';
      case 'low':
        return '#00ff88';
      default:
        return '#00d4ff';
    }
  };

  const color = getColor(riskLevel);
  const data = [
    { value: score, fill: color },
    { value: 100 - score, fill: '#1e1e2e' },
  ];

  return (
    <div className="relative w-32 h-32">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            startAngle={180}
            endAngle={0}
            innerRadius={40}
            outerRadius={60}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-3xl font-bold text-dark-text-primary">{score}</div>
        <div className="text-xs text-dark-text-muted">/ 100</div>
      </div>
    </div>
  );
}
