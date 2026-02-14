import { useState, useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import type { CorrelatedIpRecord } from '@ipintel/shared';

interface ExportButtonProps {
  result: CorrelatedIpRecord;
}

type ExportFormat = 'json' | 'csv' | 'text' | 'pdf';

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

  const exportPdf = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let y = 20;

    const addLine = (text: string, fontSize = 10, style: 'normal' | 'bold' = 'normal') => {
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', style);
      const splitLines = doc.splitTextToSize(text, contentWidth);
      for (const line of splitLines as string[]) {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.text(line, margin, y);
        y += fontSize * 0.5 + 2;
      }
    };

    const addSectionHeader = (title: string) => {
      y += 4;
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
      doc.setDrawColor(100, 100, 100);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;
      addLine(title, 12, 'bold');
      y += 2;
    };

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('IP Intelligence Report', margin, y);
    y += 10;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text(result.ip, margin, y);
    y += 8;

    if (result.asn && result.org) {
      addLine(`${result.asn} - ${result.org}`, 10, 'normal');
    }
    y += 4;

    // Location Section
    addSectionHeader('Location');
    addLine(`Country:       ${result.location?.country || 'Unknown'}`);
    addLine(`Region:        ${result.location?.region || 'Unknown'}`);
    addLine(`City:          ${result.location?.city || 'Unknown'}`);
    addLine(`Coordinates:   ${result.location?.coordinates ? `${result.location.coordinates.lat}, ${result.location.coordinates.lon}` : 'Unknown'}`);
    addLine(`Timezone:      ${result.location?.timezone || 'Unknown'}`);

    // Flags Section
    addSectionHeader('Security Flags');
    addLine(`Proxy:         ${result.flags?.isProxy ? 'Yes' : 'No'}`);
    addLine(`VPN:           ${result.flags?.isVpn ? 'Yes' : 'No'}`);
    addLine(`Tor Exit Node: ${result.flags?.isTor ? 'Yes' : 'No'}`);
    addLine(`Hosting/DC:    ${result.flags?.isHosting ? 'Yes' : 'No'}`);
    if (result.flags?.isVpn && result.flags?.vpnProvider) {
      addLine(`VPN Provider:  ${result.flags.vpnProvider}`);
    }

    // Threat Assessment Section
    addSectionHeader('Threat Assessment');
    addLine(`Risk Level:    ${result.threat?.riskLevel?.toUpperCase() || 'Unknown'}`);
    addLine(`Abuse Score:   ${result.threat?.abuseScore !== undefined ? `${result.threat.abuseScore}/100` : 'N/A'}`);

    // AI Analysis if available
    if (result.metadata?.llmAnalysis) {
      const ai = result.metadata.llmAnalysis;
      addSectionHeader('AI Threat Analysis');
      addLine('Summary:', 10, 'bold');
      addLine(ai.summary);
      y += 2;
      addLine('Risk Assessment:', 10, 'bold');
      addLine(ai.riskAssessment);
      y += 2;
      if (ai.threatIndicators.length > 0) {
        addLine('Threat Indicators:', 10, 'bold');
        for (const indicator of ai.threatIndicators) {
          addLine(`  - ${indicator}`);
        }
        y += 2;
      }
      if (ai.recommendations.length > 0) {
        addLine('Recommendations:', 10, 'bold');
        ai.recommendations.forEach((rec, i) => {
          addLine(`  ${i + 1}. ${rec}`);
        });
        y += 2;
      }
      addLine(`Confidence: ${ai.confidence}%`);
      addLine(`Model: ${ai.modelUsed}`);
    }

    // Provider Results Section
    if (result.metadata?.providers && result.metadata.providers.length > 0) {
      addSectionHeader('Provider Results');
      addLine(`Providers: ${result.metadata?.providersSucceeded || 0}/${result.metadata?.providersQueried || 0} successful`);
      y += 2;
      for (const provider of result.metadata.providers) {
        addLine(`${provider.success ? '[OK]' : '[FAIL]'} ${provider.provider} (${provider.latencyMs}ms)${provider.error ? ` - ${provider.error}` : ''}`);
      }
    }

    // Footer
    y += 6;
    doc.setDrawColor(100, 100, 100);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated: ${new Date().toISOString()}`, margin, y);
    y += 4;
    doc.text('Generated by IP Intelligence Platform', margin, y);

    doc.save(`ip-report-${result.ip}-${Date.now()}.pdf`);
    toast.success('Exported as PDF');
    setIsOpen(false);
  };

  const exportData = (format: Exclude<ExportFormat, 'pdf'>) => {
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
          <button
            onClick={() => exportPdf()}
            className="w-full px-4 py-3 text-left text-sm text-dark-text-primary hover:bg-dark-hover flex items-center space-x-3 transition-colors border-t border-dark-border"
          >
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <div>
              <div className="font-medium">PDF</div>
              <div className="text-xs text-dark-text-muted">Printable report</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
