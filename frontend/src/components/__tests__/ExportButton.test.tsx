import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExportButton } from '../ExportButton';
import type { CorrelatedIpRecord } from '@ipintel/shared';

// Track what gets passed to the download anchor
let lastDownloadHref = '';
let lastDownloadFilename = '';
let anchorClickSpy: ReturnType<typeof vi.fn>;

function createMockResult(
  overrides: Partial<CorrelatedIpRecord> = {}
): CorrelatedIpRecord {
  return {
    ip: '8.8.8.8',
    asn: 'AS15169',
    org: 'Google LLC',
    location: {
      country: 'US',
      region: 'California',
      city: 'Mountain View',
      coordinates: { lat: 37.386, lon: -122.0838 },
      timezone: 'America/Los_Angeles',
    },
    flags: {
      isProxy: false,
      isVpn: false,
      isTor: false,
      isHosting: true,
    },
    threat: {
      abuseScore: 0,
      riskLevel: 'low',
    },
    metadata: {
      providers: [
        {
          provider: 'ipapi',
          success: true,
          latencyMs: 150,
        },
      ],
      source: 'live',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      expiresAt: '2024-01-02T00:00:00Z',
      ttlSeconds: 86400,
      providersQueried: 1,
      providersSucceeded: 1,
    },
    ...overrides,
  };
}

/**
 * We capture the raw string content passed to the Blob constructor
 * because jsdom's Blob does not implement .text().
 */
let capturedBlobContent = '';
let capturedBlobType = '';

describe('ExportButton', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let createElementSpy: ReturnType<typeof vi.spyOn>;

  const OriginalBlob = globalThis.Blob;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedBlobContent = '';
    capturedBlobType = '';
    lastDownloadHref = '';
    lastDownloadFilename = '';
    anchorClickSpy = vi.fn();

    // Intercept Blob constructor to capture the raw string content
    globalThis.Blob = class MockBlob extends OriginalBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        capturedBlobContent = parts ? parts.map(String).join('') : '';
        capturedBlobType = options?.type || '';
      }
    } as typeof Blob;

    // Intercept URL.createObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();

    // Spy on createElement to intercept only anchor elements used for download.
    // We use the real createElement for everything, but patch the anchor's click.
    const realCreateElement = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = realCreateElement(tagName, options);
        if (tagName === 'a') {
          // Override click to capture download info without triggering navigation
          Object.defineProperty(el, 'click', {
            value: () => {
              lastDownloadHref = (el as HTMLAnchorElement).href || el.getAttribute('href') || '';
              lastDownloadFilename = (el as HTMLAnchorElement).download || '';
              anchorClickSpy();
            },
            writable: true,
          });
        }
        return el;
      }
    );
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    createElementSpy.mockRestore();
    globalThis.Blob = OriginalBlob;
  });

  // ─── Rendering ────────────────────────────────────────────────

  it('renders the export button', () => {
    const result = createMockResult();
    render(<ExportButton result={result} />);

    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('shows the dropdown menu when the export button is clicked', async () => {
    const user = userEvent.setup();
    const result = createMockResult();
    render(<ExportButton result={result} />);

    await user.click(screen.getByText('Export'));

    expect(screen.getByText('JSON')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('Text Report')).toBeInTheDocument();
  });

  it('shows format descriptions in the dropdown', async () => {
    const user = userEvent.setup();
    const result = createMockResult();
    render(<ExportButton result={result} />);

    await user.click(screen.getByText('Export'));

    expect(screen.getByText('Full data export')).toBeInTheDocument();
    expect(screen.getByText('Spreadsheet format')).toBeInTheDocument();
    expect(screen.getByText('Readable format')).toBeInTheDocument();
  });

  it('hides the dropdown when clicking the export button again (toggle)', async () => {
    const user = userEvent.setup();
    const result = createMockResult();
    render(<ExportButton result={result} />);

    await user.click(screen.getByText('Export'));
    expect(screen.getByText('JSON')).toBeInTheDocument();

    await user.click(screen.getByText('Export'));
    expect(screen.queryByText('Full data export')).not.toBeInTheDocument();
  });

  // ─── JSON Export ──────────────────────────────────────────────

  it('generates valid JSON export with the full result', async () => {
    const user = userEvent.setup();
    const result = createMockResult();
    render(<ExportButton result={result} />);

    await user.click(screen.getByText('Export'));
    await user.click(screen.getByText('JSON'));

    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(capturedBlobContent).not.toBe('');
    expect(capturedBlobType).toBe('application/json');

    const parsed = JSON.parse(capturedBlobContent);
    expect(parsed.ip).toBe('8.8.8.8');
    expect(parsed.asn).toBe('AS15169');
    expect(parsed.org).toBe('Google LLC');
    expect(parsed.location.country).toBe('US');
    expect(parsed.flags.isHosting).toBe(true);
    expect(parsed.threat.riskLevel).toBe('low');
  });

  it('uses correct filename format for JSON export', async () => {
    const user = userEvent.setup();
    const result = createMockResult();
    render(<ExportButton result={result} />);

    await user.click(screen.getByText('Export'));
    await user.click(screen.getByText('JSON'));

    expect(lastDownloadFilename).toMatch(/^ip-report-8\.8\.8\.8-\d+\.json$/);
  });

  // ─── CSV Export ───────────────────────────────────────────────

  it('generates CSV export with correct headers and values', async () => {
    const user = userEvent.setup();
    const result = createMockResult();
    render(<ExportButton result={result} />);

    await user.click(screen.getByText('Export'));
    await user.click(screen.getByText('CSV'));

    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(capturedBlobType).toBe('text/csv');
    const lines = capturedBlobContent.split('\n');
    expect(lines).toHaveLength(2);

    // Check headers
    const headers = lines[0]!;
    expect(headers).toContain('IP');
    expect(headers).toContain('ASN');
    expect(headers).toContain('Organization');
    expect(headers).toContain('Country');
    expect(headers).toContain('Risk Level');
    expect(headers).toContain('Abuse Score');

    // Check values
    const values = lines[1]!;
    expect(values).toContain('"8.8.8.8"');
    expect(values).toContain('"AS15169"');
    expect(values).toContain('"Google LLC"');
    expect(values).toContain('"US"');
    expect(values).toContain('"low"');
    expect(values).toContain('"0"');
    expect(values).toContain('"Yes"'); // isHosting
  });

  it('handles missing optional fields in CSV export gracefully', async () => {
    const user = userEvent.setup();
    const result = createMockResult({
      asn: undefined,
      org: undefined,
      location: {},
      flags: {},
      threat: {},
    });
    render(<ExportButton result={result} />);

    await user.click(screen.getByText('Export'));
    await user.click(screen.getByText('CSV'));

    const lines = capturedBlobContent.split('\n');
    const values = lines[1]!;

    // Missing fields should produce empty quoted strings or "No" for booleans
    expect(values).toContain('"8.8.8.8"');
    expect(values).toContain('""'); // empty ASN, org, etc.
  });

  it('uses correct filename format for CSV export', async () => {
    const user = userEvent.setup();
    const result = createMockResult();
    render(<ExportButton result={result} />);

    await user.click(screen.getByText('Export'));
    await user.click(screen.getByText('CSV'));

    expect(lastDownloadFilename).toMatch(/^ip-report-8\.8\.8\.8-\d+\.csv$/);
  });

  // ─── Text Report Export ───────────────────────────────────────

  it('generates a text report with the expected sections', async () => {
    const user = userEvent.setup();
    const result = createMockResult();
    render(<ExportButton result={result} />);

    await user.click(screen.getByText('Export'));
    await user.click(screen.getByText('Text Report'));

    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(capturedBlobType).toBe('text/plain');
    expect(capturedBlobContent).toContain('IP INTELLIGENCE REPORT');
    expect(capturedBlobContent).toContain('8.8.8.8');
    expect(capturedBlobContent).toContain('AS15169');
    expect(capturedBlobContent).toContain('Google LLC');
    expect(capturedBlobContent).toContain('Location');
    expect(capturedBlobContent).toContain('Mountain View');
    expect(capturedBlobContent).toContain('Threat Intelligence');
    expect(capturedBlobContent).toContain('Security Flags');
    expect(capturedBlobContent).toContain('Metadata');
  });

  it('uses correct filename format for text export', async () => {
    const user = userEvent.setup();
    const result = createMockResult();
    render(<ExportButton result={result} />);

    await user.click(screen.getByText('Export'));
    await user.click(screen.getByText('Text Report'));

    expect(lastDownloadFilename).toMatch(/^ip-report-8\.8\.8\.8-\d+\.txt$/);
  });

  // ─── Dropdown Closes After Export ─────────────────────────────

  it('closes the dropdown after selecting an export format', async () => {
    const user = userEvent.setup();
    const result = createMockResult();
    render(<ExportButton result={result} />);

    await user.click(screen.getByText('Export'));
    expect(screen.getByText('JSON')).toBeInTheDocument();

    await user.click(screen.getByText('JSON'));

    // The dropdown items should be gone after export
    expect(screen.queryByText('Full data export')).not.toBeInTheDocument();
  });
});
