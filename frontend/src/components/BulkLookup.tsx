import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import type { BulkLookupResponse } from '@ipintel/shared';

interface BulkLookupProps {
  onResultSelect: (ip: string) => void;
}

export function BulkLookup({ onResultSelect }: BulkLookupProps) {
  const [ipText, setIpText] = useState('');
  const [results, setResults] = useState<BulkLookupResponse | null>(null);
  const [includeAI, setIncludeAI] = useState(false);

  const bulkLookupMutation = useMutation({
    mutationFn: async (ips: string[]) => {
      const response = await fetch('/api/v1/lookup/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ips,
          forceRefresh: false,
          includeLLMAnalysis: includeAI,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Bulk lookup failed');
      }

      return response.json() as Promise<BulkLookupResponse>;
    },
    onSuccess: (data) => {
      setResults(data);
      toast.success(`Processed ${data.summary.total} IPs in ${data.summary.processingTimeMs}ms`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Parse IPs from text (one per line, comma-separated, or space-separated)
    const ips = ipText
      .split(/[\n,\s]+/)
      .map((ip) => ip.trim())
      .filter((ip) => ip.length > 0);

    if (ips.length === 0) {
      toast.error('Please enter at least one IP address');
      return;
    }

    if (ips.length > 100) {
      toast.error('Maximum 100 IPs per request');
      return;
    }

    bulkLookupMutation.mutate(ips);
  };

  const getRiskColor = (riskLevel?: string) => {
    switch (riskLevel) {
      case 'high':
        return 'text-dark-accent-red';
      case 'medium':
        return 'text-dark-accent-yellow';
      case 'low':
        return 'text-dark-accent-green';
      default:
        return 'text-dark-text-muted';
    }
  };

  const exportResults = (format: 'json' | 'csv') => {
    if (!results) return;

    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'json') {
      content = JSON.stringify(results, null, 2);
      filename = `bulk-lookup-${Date.now()}.json`;
      mimeType = 'application/json';
    } else {
      // CSV format
      const headers = ['IP', 'Status', 'Country', 'City', 'ASN', 'Org', 'Risk Level', 'Abuse Score', 'Error'];
      const rows = results.results.map((r) => {
        if (r.success && r.data) {
          return [
            r.ip,
            'Success',
            r.data.location?.country || '',
            r.data.location?.city || '',
            r.data.asn || '',
            r.data.org || '',
            r.data.threat?.riskLevel || '',
            r.data.threat?.abuseScore?.toString() || '',
            '',
          ];
        }
        return [r.ip, 'Failed', '', '', '', '', '', '', r.error || ''];
      });

      content = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
      filename = `bulk-lookup-${Date.now()}.csv`;
      mimeType = 'text/csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${results.results.length} results as ${format.toUpperCase()}`);
  };

  return (
    <div className="card fade-in">
      <h3 className="text-xl font-semibold mb-4 text-dark-text-primary flex items-center space-x-2">
        <svg className="w-6 h-6 text-dark-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        <span>Bulk IP Lookup</span>
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-dark-text-secondary mb-2">
            Enter IP addresses (one per line, comma or space separated)
          </label>
          <textarea
            value={ipText}
            onChange={(e) => setIpText(e.target.value)}
            className="input min-h-[120px] font-mono text-sm"
            placeholder="8.8.8.8&#10;1.1.1.1&#10;208.67.222.222"
            disabled={bulkLookupMutation.isPending}
          />
        </div>

        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeAI}
              onChange={(e) => setIncludeAI(e.target.checked)}
              className="w-4 h-4 rounded border-dark-border bg-dark-surface text-dark-accent-blue focus:ring-dark-accent-blue"
              disabled={bulkLookupMutation.isPending}
            />
            <span className="text-sm text-dark-text-secondary">Include AI analysis (slower)</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={bulkLookupMutation.isPending || !ipText.trim()}
          className="btn btn-primary w-full"
        >
          {bulkLookupMutation.isPending ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing...
            </span>
          ) : (
            'Lookup IPs'
          )}
        </button>
      </form>

      {/* Results */}
      {results && (
        <div className="mt-6 pt-6 border-t border-dark-border">
          {/* Summary */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4 text-sm">
              <span className="text-dark-text-secondary">
                Total: <span className="font-bold text-dark-text-primary">{results.summary.total}</span>
              </span>
              <span className="text-dark-accent-green">
                Success: {results.summary.successful}
              </span>
              <span className="text-dark-accent-red">
                Failed: {results.summary.failed}
              </span>
              <span className="text-dark-text-muted">
                {results.summary.processingTimeMs}ms
              </span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => exportResults('json')}
                className="btn btn-secondary text-xs"
              >
                Export JSON
              </button>
              <button
                onClick={() => exportResults('csv')}
                className="btn btn-secondary text-xs"
              >
                Export CSV
              </button>
            </div>
          </div>

          {/* Results table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-dark-text-muted border-b border-dark-border">
                  <th className="text-left py-2 pr-4">IP</th>
                  <th className="text-left py-2 pr-4">Location</th>
                  <th className="text-left py-2 pr-4">Organization</th>
                  <th className="text-left py-2 pr-4">Risk</th>
                  <th className="text-left py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {results.results.map((result, index) => (
                  <tr
                    key={`${result.ip}-${index}`}
                    className="border-b border-dark-border/50 hover:bg-dark-hover transition-colors"
                  >
                    <td className="py-3 pr-4 font-mono">
                      {result.success ? (
                        <span className="text-dark-text-primary">{result.ip}</span>
                      ) : (
                        <span className="text-dark-accent-red">{result.ip}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {result.success && result.data?.location ? (
                        <span className="text-dark-text-secondary">
                          {[result.data.location.city, result.data.location.country]
                            .filter(Boolean)
                            .join(', ') || 'Unknown'}
                        </span>
                      ) : (
                        <span className="text-dark-text-muted">-</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-dark-text-secondary truncate max-w-[200px] block">
                        {result.success && result.data?.org ? result.data.org : '-'}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {result.success && result.data?.threat?.riskLevel ? (
                        <span className={`font-medium ${getRiskColor(result.data.threat.riskLevel)}`}>
                          {result.data.threat.riskLevel.toUpperCase()}
                        </span>
                      ) : result.error ? (
                        <span className="text-dark-accent-red text-xs">{result.error}</span>
                      ) : (
                        <span className="text-dark-text-muted">-</span>
                      )}
                    </td>
                    <td className="py-3">
                      {result.success && (
                        <button
                          onClick={() => onResultSelect(result.ip)}
                          className="text-dark-accent-blue hover:underline text-xs"
                        >
                          View Details
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
