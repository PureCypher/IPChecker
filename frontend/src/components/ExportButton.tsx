import { useState, useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import type { CorrelatedIpRecord } from '@ipintel/shared';

interface ExportButtonProps {
  result: CorrelatedIpRecord;
}

type ExportFormat = 'json' | 'csv' | 'text';

export function ExportButton({ result }: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const exportData = (format: ExportFormat) => {
    let content: string;
    let filename: string;
    let mimeType: string;

    switch (format) {
      case 'json':
        content = JSON.stringify(result, null, 2);
        filename = `ip-report-${result.ip}-${Date.now()}.json`;
        mimeType = 'application/json';
        break;

      case 'csv':
        const headers = [
          'IP', 'ASN', 'Organization', 'Country', 'Region', 'City',
          'Latitude', 'Longitude', 'Timezone', 'Is Proxy', 'Is VPN',
          'Is Tor', 'Is Hosting', 'Abuse Score', 'Risk Level'
        ];
        const values = [
          result.ip,
          result.asn || '',
          result.org || '',
          result.location?.country || '',
          result.location?.region || '',
          result.location?.city || '',
          result.location?.coordinates?.lat?.toString() || '',
          result.location?.coordinates?.lon?.toString() || '',
          result.location?.timezone || '',
          result.flags?.isProxy ? 'Yes' : 'No',
          result.flags?.isVpn ? 'Yes' : 'No',
          result.flags?.isTor ? 'Yes' : 'No',
          result.flags?.isHosting ? 'Yes' : 'No',
          result.threat?.abuseScore?.toString() || '',
          result.threat?.riskLevel || ''
        ];
        content = [
          headers.join(','),
          values.map(v => `"${v}"`).join(',')
        ].join('\n');
        filename = `ip-report-${result.ip}-${Date.now()}.csv`;
        mimeType = 'text/csv';
        break;

      case 'text':
        const lines = [
          '═══════════════════════════════════════════════════════════',
          '                   IP INTELLIGENCE REPORT                   ',
          '═══════════════════════════════════════════════════════════',
          '',
          `IP Address:     ${result.ip}`,
          `ASN:            ${result.asn || 'Unknown'}`,
          `Organization:   ${result.org || 'Unknown'}`,
          '',
          '─── Location ───────────────────────────────────────────────',
          `Country:        ${result.location?.country || 'Unknown'}`,
          `Region:         ${result.location?.region || 'Unknown'}`,
          `City:           ${result.location?.city || 'Unknown'}`,
          `Coordinates:    ${result.location?.coordinates ? `${result.location.coordinates.lat}, ${result.location.coordinates.lon}` : 'Unknown'}`,
          `Timezone:       ${result.location?.timezone || 'Unknown'}`,
          '',
          '─── Threat Intelligence ────────────────────────────────────',
          `Risk Level:     ${result.threat?.riskLevel?.toUpperCase() || 'Unknown'}`,
          `Abuse Score:    ${result.threat?.abuseScore !== undefined ? `${result.threat.abuseScore}/100` : 'N/A'}`,
          '',
          '─── Security Flags ─────────────────────────────────────────',
          `Proxy:          ${result.flags?.isProxy ? 'Yes' : 'No'}`,
          `VPN:            ${result.flags?.isVpn ? 'Yes' : 'No'}`,
          `Tor Exit Node:  ${result.flags?.isTor ? 'Yes' : 'No'}`,
          `Hosting/DC:     ${result.flags?.isHosting ? 'Yes' : 'No'}`,
          '',
        ];

        // Add AI analysis if available
        if (result.metadata?.llmAnalysis) {
          const ai = result.metadata.llmAnalysis;
          lines.push(
            '─── AI Threat Analysis ─────────────────────────────────────',
            '',
            'Summary:',
            ai.summary,
            '',
            'Risk Assessment:',
            ai.riskAssessment,
            '',
            'Threat Indicators:',
            ...ai.threatIndicators.map(t => `  • ${t}`),
            '',
            'Recommendations:',
            ...ai.recommendations.map((r, i) => `  ${i + 1}. ${r}`),
            '',
            `Analysis Confidence: ${ai.confidence}%`,
            `Model: ${ai.modelUsed}`,
            ''
          );
        }

        lines.push(
          '─── Metadata ───────────────────────────────────────────────',
          `Source:         ${result.metadata?.source || 'Unknown'}`,
          `Providers:      ${result.metadata?.providersSucceeded || 0}/${result.metadata?.providersQueried || 0} successful`,
          `Generated:      ${new Date().toISOString()}`,
          '',
          '═══════════════════════════════════════════════════════════',
          '              Generated by IP Intelligence Platform          ',
          '═══════════════════════════════════════════════════════════',
        );

        content = lines.join('\n');
        filename = `ip-report-${result.ip}-${Date.now()}.txt`;
        mimeType = 'text/plain';
        break;
    }

    // Create and trigger download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Exported as ${format.toUpperCase()}`);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-secondary flex items-center space-x-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>Export</span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-dark-surface border border-dark-border rounded-lg shadow-xl z-50 overflow-hidden">
          <button
            onClick={() => exportData('json')}
            className="w-full px-4 py-3 text-left text-sm text-dark-text-primary hover:bg-dark-hover flex items-center space-x-3 transition-colors"
          >
            <svg className="w-5 h-5 text-dark-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div>
              <div className="font-medium">JSON</div>
              <div className="text-xs text-dark-text-muted">Full data export</div>
            </div>
          </button>
          <button
            onClick={() => exportData('csv')}
            className="w-full px-4 py-3 text-left text-sm text-dark-text-primary hover:bg-dark-hover flex items-center space-x-3 transition-colors border-t border-dark-border"
          >
            <svg className="w-5 h-5 text-dark-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <div>
              <div className="font-medium">CSV</div>
              <div className="text-xs text-dark-text-muted">Spreadsheet format</div>
            </div>
          </button>
          <button
            onClick={() => exportData('text')}
            className="w-full px-4 py-3 text-left text-sm text-dark-text-primary hover:bg-dark-hover flex items-center space-x-3 transition-colors border-t border-dark-border"
          >
            <svg className="w-5 h-5 text-dark-accent-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div>
              <div className="font-medium">Text Report</div>
              <div className="text-xs text-dark-text-muted">Readable format</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
