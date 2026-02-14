import type { LLMAnalysis, ThreatIndicatorDetail } from '@ipintel/shared';

interface AIAnalysisProps {
  analysis: LLMAnalysis;
}

export function AIAnalysis({ analysis }: AIAnalysisProps) {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-dark-accent-green';
    if (confidence >= 60) return 'text-dark-accent-yellow';
    return 'text-dark-accent-red';
  };

  const getConfidenceBg = (confidence: number) => {
    if (confidence >= 80) return 'bg-dark-accent-green/20';
    if (confidence >= 60) return 'bg-dark-accent-yellow/20';
    return 'bg-dark-accent-red/20';
  };

  const getVerdictStyle = (verdict?: string) => {
    switch (verdict) {
      case 'BLOCK':
        return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'INVESTIGATE':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'MONITOR':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'ALLOW':
        return 'bg-green-500/20 text-green-400 border-green-500/50';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
    }
  };

  const getSeverityStyle = (severity?: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-600/30 text-red-300 border-red-500';
      case 'high':
        return 'bg-orange-500/30 text-orange-300 border-orange-500';
      case 'medium':
        return 'bg-yellow-500/30 text-yellow-300 border-yellow-500';
      case 'low':
        return 'bg-blue-500/30 text-blue-300 border-blue-500';
      case 'safe':
        return 'bg-green-500/30 text-green-300 border-green-500';
      default:
        return 'bg-gray-500/30 text-gray-300 border-gray-500';
    }
  };

  const getIndicatorSeverityStyle = (severity: ThreatIndicatorDetail['severity']) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      case 'high':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/40';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
      case 'low':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
      case 'info':
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/40';
    }
  };

  const getIndicatorIcon = (severity: ThreatIndicatorDetail['severity']) => {
    if (severity === 'critical' || severity === 'high') {
      return (
        <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      );
    }
    if (severity === 'medium') {
      return (
        <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      );
    }
    return (
      <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    );
  };

  return (
    <div className="card card-hover slide-up">
      {/* Header with verdict badge */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h4 className="text-lg font-semibold text-dark-text-primary">
              AI Threat Analysis
            </h4>
            <p className="text-xs text-dark-text-muted">
              Powered by {analysis.modelUsed}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {analysis.verdict && (
            <span className={`px-3 py-1 rounded-full text-sm font-bold border ${getVerdictStyle(analysis.verdict)}`}>
              {analysis.verdict}
            </span>
          )}
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getConfidenceBg(analysis.confidence)} ${getConfidenceColor(analysis.confidence)}`}>
            {analysis.confidence}% confidence
          </div>
        </div>
      </div>

      {/* Executive Summary - prominent display */}
      {analysis.executiveSummary && (
        <div className={`mb-6 p-4 rounded-lg border-l-4 ${getSeverityStyle(analysis.severityLevel)}`}>
          <div className="flex items-center mb-2">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-semibold text-sm uppercase tracking-wide">Executive Summary</span>
            {analysis.severityLevel && (
              <span className={`ml-2 px-2 py-0.5 rounded text-xs font-bold uppercase ${getSeverityStyle(analysis.severityLevel)}`}>
                {analysis.severityLevel}
              </span>
            )}
          </div>
          <p className="text-base font-medium">{analysis.executiveSummary}</p>
        </div>
      )}

      {/* Summary */}
      <div className="mb-6">
        <h5 className="text-sm font-medium text-dark-text-secondary mb-2">Summary</h5>
        <p className="text-dark-text-primary leading-relaxed bg-dark-bg p-4 rounded-lg border border-dark-border">
          {analysis.summary}
        </p>
      </div>

      {/* Technical Details */}
      {analysis.technicalDetails && (
        <div className="mb-6">
          <h5 className="text-sm font-medium text-dark-text-secondary mb-2">Technical Details</h5>
          <div className="bg-dark-bg p-4 rounded-lg border border-dark-border font-mono text-sm">
            <p className="text-dark-text-primary leading-relaxed">
              {analysis.technicalDetails}
            </p>
          </div>
        </div>
      )}

      {/* Risk Assessment */}
      <div className="mb-6">
        <h5 className="text-sm font-medium text-dark-text-secondary mb-2">Risk Assessment</h5>
        <div className="bg-dark-bg p-4 rounded-lg border border-dark-border">
          <p className="text-dark-text-primary leading-relaxed text-sm">
            {analysis.riskAssessment}
          </p>
        </div>
      </div>

      {/* AI Reasoning - Show LLM's chain-of-thought */}
      {analysis.reasoning && (
        <div className="mb-6">
          <h5 className="text-sm font-medium text-dark-text-secondary mb-2 flex items-center">
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI Reasoning
          </h5>
          <div className="bg-dark-bg p-4 rounded-lg border border-dark-border">
            <p className="text-dark-text-primary leading-relaxed text-sm whitespace-pre-wrap">
              {analysis.reasoning}
            </p>
          </div>
        </div>
      )}

      {/* Vulnerabilities Section - Shodan CVEs */}
      {analysis.vulnerabilities && analysis.vulnerabilities.length > 0 && (
        <div className="mb-6">
          <h5 className="text-sm font-medium text-dark-text-secondary mb-2 flex items-center">
            <svg className="w-4 h-4 mr-1.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Known Vulnerabilities ({analysis.vulnerabilities.length})
          </h5>
          <div className="space-y-2">
            {analysis.vulnerabilities.map((vuln, idx) => vuln.cve && (
              <div
                key={idx}
                className={`p-3 rounded-lg border ${
                  vuln.severity === 'critical'
                    ? 'bg-red-500/10 border-red-500/30'
                    : vuln.severity === 'high'
                    ? 'bg-orange-500/10 border-orange-500/30'
                    : vuln.severity === 'medium'
                    ? 'bg-yellow-500/10 border-yellow-500/30'
                    : 'bg-blue-500/10 border-blue-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <a
                    href={`https://nvd.nist.gov/vuln/detail/${vuln.cve}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm font-bold hover:underline"
                  >
                    {vuln.cve}
                  </a>
                  {vuln.severity && (
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                        vuln.severity === 'critical'
                          ? 'bg-red-500/30 text-red-300'
                          : vuln.severity === 'high'
                          ? 'bg-orange-500/30 text-orange-300'
                          : vuln.severity === 'medium'
                          ? 'bg-yellow-500/30 text-yellow-300'
                          : 'bg-blue-500/30 text-blue-300'
                      }`}
                    >
                      {vuln.severity}
                    </span>
                  )}
                </div>
                {vuln.description && (
                  <p className="text-xs text-dark-text-muted mt-1">{vuln.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Temporal Trends Section */}
      {analysis.temporalTrends && analysis.temporalTrends.length > 0 && (
        <div className="mb-6">
          <h5 className="text-sm font-medium text-dark-text-secondary mb-2">Threat Activity Trends</h5>
          <div className="space-y-2">
            {analysis.temporalTrends.map((trend, idx) => trend.period && (
              <div key={idx} className="flex items-center justify-between p-3 bg-dark-bg rounded-lg border border-dark-border">
                <div>
                  <span className="text-xs text-dark-text-muted uppercase">
                    {trend.period.replace('_', ' ')}
                  </span>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-sm font-medium">Threat: {trend.threat ?? 0}/5</span>
                    <span className="text-sm font-medium">Aggressiveness: {trend.aggressiveness ?? 0}/5</span>
                  </div>
                </div>
                <div
                  className={`flex items-center space-x-1 px-2 py-1 rounded ${
                    trend.trend === 'increasing'
                      ? 'bg-red-500/20 text-red-400'
                      : trend.trend === 'decreasing'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {trend.trend === 'increasing' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  )}
                  {trend.trend === 'decreasing' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                    </svg>
                  )}
                  <span className="text-xs font-medium capitalize">{trend.trend ?? 'stable'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Malware Families Section */}
      {analysis.malwareFamilies && analysis.malwareFamilies.length > 0 && (
        <div className="mb-6">
          <h5 className="text-sm font-medium text-dark-text-secondary mb-2 flex items-center">
            <svg className="w-4 h-4 mr-1.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Malware Families ({analysis.malwareFamilies.length})
          </h5>
          <div className="flex flex-wrap gap-2">
            {analysis.malwareFamilies.map((malware, idx) => malware.name && (
              <div
                key={idx}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/40"
              >
                <span className="font-bold">{malware.name}</span>
                {malware.source && <span className="ml-2 text-purple-400 opacity-75">({malware.source})</span>}
                {malware.confidence === 'confirmed' && (
                  <svg className="w-3 h-3 ml-1.5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Threat Campaigns Section */}
      {analysis.threatCampaigns && analysis.threatCampaigns.length > 0 && (
        <div className="mb-6">
          <h5 className="text-sm font-medium text-dark-text-secondary mb-2">Associated Threat Campaigns</h5>
          <div className="space-y-2">
            {analysis.threatCampaigns.map((campaign, idx) => campaign.pulseName && (
              <div key={idx} className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/30">
                <div className="font-medium text-sm text-orange-300">{campaign.pulseName}</div>
                {campaign.description && <p className="text-xs text-dark-text-muted mt-1">{campaign.description}</p>}
                {campaign.tags && campaign.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {campaign.tags.map((tag, tagIdx) => (
                      <span key={tagIdx} className="px-2 py-0.5 rounded text-xs bg-orange-500/20 text-orange-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Infrastructure Fingerprint Section */}
      {analysis.infrastructure && (Object.keys(analysis.infrastructure).length > 0) && (
        <div className="mb-6">
          <h5 className="text-sm font-medium text-dark-text-secondary mb-2">Infrastructure Fingerprint</h5>
          <div className="space-y-2">
            {analysis.infrastructure.sslFingerprint && (
              <div className="p-3 bg-dark-bg rounded-lg border border-dark-border">
                <div className="text-xs font-medium text-dark-text-secondary mb-1">SSL Certificate</div>
                <div className="font-mono text-xs space-y-1">
                  {analysis.infrastructure.sslFingerprint.issuer && <div>Issuer: {analysis.infrastructure.sslFingerprint.issuer}</div>}
                  {analysis.infrastructure.sslFingerprint.subject && <div>Subject: {analysis.infrastructure.sslFingerprint.subject}</div>}
                  {analysis.infrastructure.sslFingerprint.validity && <div>Validity: {analysis.infrastructure.sslFingerprint.validity}</div>}
                </div>
              </div>
            )}
            {analysis.infrastructure.httpFingerprint && (
              <div className="p-3 bg-dark-bg rounded-lg border border-dark-border">
                <div className="text-xs font-medium text-dark-text-secondary mb-1">HTTP Service</div>
                <div className="font-mono text-xs space-y-1">
                  {analysis.infrastructure.httpFingerprint.server && <div>Server: {analysis.infrastructure.httpFingerprint.server}</div>}
                  {analysis.infrastructure.httpFingerprint.title && <div>Title: {analysis.infrastructure.httpFingerprint.title}</div>}
                  {analysis.infrastructure.httpFingerprint.statusCode !== undefined && <div>Status: {analysis.infrastructure.httpFingerprint.statusCode}</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Abuse Patterns Section */}
      {analysis.abusePatterns && (analysis.abusePatterns.velocity || analysis.abusePatterns.connectionType) && (
        <div className="mb-6">
          <h5 className="text-sm font-medium text-dark-text-secondary mb-2">Abuse Activity Patterns</h5>
          <div className="p-3 bg-dark-bg rounded-lg border border-dark-border">
            <div className="grid grid-cols-2 gap-3">
              {analysis.abusePatterns.velocity && (
                <div>
                  <div className="text-xs text-dark-text-muted">Abuse Velocity</div>
                  <div
                    className={`text-sm font-bold ${
                      analysis.abusePatterns.velocity === 'high'
                        ? 'text-red-400'
                        : analysis.abusePatterns.velocity === 'medium'
                        ? 'text-yellow-400'
                        : 'text-green-400'
                    }`}
                  >
                    {analysis.abusePatterns.velocity.toUpperCase()}
                  </div>
                </div>
              )}
              {analysis.abusePatterns.abuseTrend && (
                <div>
                  <div className="text-xs text-dark-text-muted">Trend</div>
                  <div
                    className={`text-sm font-bold ${
                      analysis.abusePatterns.abuseTrend === 'escalating'
                        ? 'text-red-400'
                        : analysis.abusePatterns.abuseTrend === 'declining'
                        ? 'text-green-400'
                        : 'text-gray-400'
                    }`}
                  >
                    {analysis.abusePatterns.abuseTrend.toUpperCase()}
                  </div>
                </div>
              )}
              {analysis.abusePatterns.connectionType && (
                <div className="col-span-2">
                  <div className="text-xs text-dark-text-muted">Connection Type</div>
                  <div className="text-sm font-medium text-dark-text-primary">{analysis.abusePatterns.connectionType}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Enhanced MITRE ATT&CK with confidence scores */}
      {analysis.mitreMapping && analysis.mitreMapping.length > 0 && (
        <div className="mb-6">
          <h5 className="text-sm font-medium text-dark-text-secondary mb-2 flex items-center">
            <svg className="w-4 h-4 mr-1.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            MITRE ATT&CK Mapping ({analysis.mitreMapping.length})
          </h5>
          <div className="space-y-2">
            {analysis.mitreMapping.map((mapping, idx) => mapping.technique && (
              <div key={idx} className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/30">
                <div className="flex items-center justify-between mb-1">
                  <a
                    href={`https://attack.mitre.org/techniques/${mapping.technique.split(' ')[0]}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-sm text-purple-300 hover:underline"
                  >
                    {mapping.technique}
                  </a>
                  {mapping.confidence !== undefined && (
                    <span className="text-xs text-purple-400">{mapping.confidence}% confidence</span>
                  )}
                </div>
                {mapping.tactic && <div className="text-xs text-dark-text-muted">Tactic: {mapping.tactic}</div>}
                {mapping.evidence && mapping.evidence.length > 0 && (
                  <div className="text-xs text-dark-text-muted mt-1">Evidence: {mapping.evidence.join(', ')}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MITRE ATT&CK Techniques */}
      {analysis.mitreAttackTechniques && analysis.mitreAttackTechniques.length > 0 && (
        <div className="mb-6">
          <h5 className="text-sm font-medium text-dark-text-secondary mb-2 flex items-center">
            <svg className="w-4 h-4 mr-1.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            MITRE ATT&CK Techniques ({analysis.mitreAttackTechniques.length})
          </h5>
          <div className="flex flex-wrap gap-2">
            {analysis.mitreAttackTechniques.map((technique, index) => (
              <a
                key={index}
                href={`https://attack.mitre.org/techniques/${technique.split(' ')[0]}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 hover:border-purple-400/50 transition-colors"
              >
                <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                {technique}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Threat Indicators - Enhanced with severity coloring */}
      {((analysis.indicatorDetails && analysis.indicatorDetails.length > 0) || analysis.threatIndicators.length > 0) && (
        <div className="mb-6">
          <h5 className="text-sm font-medium text-dark-text-secondary mb-2">
            Threat Indicators ({analysis.indicatorDetails?.length || analysis.threatIndicators.length})
          </h5>
          <div className="flex flex-wrap gap-2">
            {analysis.indicatorDetails ? (
              // Use detailed indicators if available
              analysis.indicatorDetails.map((detail, index) => (
                <span
                  key={index}
                  className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border ${getIndicatorSeverityStyle(detail.severity)}`}
                  title={`Category: ${detail.category} | Severity: ${detail.severity}`}
                >
                  {getIndicatorIcon(detail.severity)}
                  {detail.indicator}
                </span>
              ))
            ) : (
              // Fallback to simple indicators
              analysis.threatIndicators.map((indicator, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-dark-accent-red/10 text-dark-accent-red border border-dark-accent-red/30"
                >
                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {indicator}
                </span>
              ))
            )}
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div>
        <h5 className="text-sm font-medium text-dark-text-secondary mb-2">
          Security Recommendations
        </h5>
        <div className="space-y-2">
          {analysis.recommendations.map((rec, index) => (
            <div
              key={index}
              className="flex items-start space-x-3 p-3 bg-dark-bg rounded-lg border border-dark-border"
            >
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                index === 0 && analysis.verdict === 'BLOCK'
                  ? 'bg-red-500/30 text-red-300'
                  : 'bg-dark-accent-blue/20 text-dark-accent-blue'
              }`}>
                {index + 1}
              </div>
              <p className="text-sm text-dark-text-primary">{rec}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Analysis Timestamp */}
      <div className="mt-4 pt-4 border-t border-dark-border text-xs text-dark-text-muted flex items-center justify-between">
        <span>Analysis generated: {new Date(analysis.analysisTimestamp).toLocaleString()}</span>
        {analysis.severityLevel && (
          <span className={`px-2 py-0.5 rounded text-xs ${getSeverityStyle(analysis.severityLevel)}`}>
            Severity: {analysis.severityLevel.toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}
