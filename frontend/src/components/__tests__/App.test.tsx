import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Mocks must be defined before imports that use them ────────────

// Mock the useIpLookup hook
vi.mock('@/hooks/useIpLookup', () => ({
  useIpLookup: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    data: null,
    reset: vi.fn(),
  })),
  useSystemHealth: vi.fn(() => ({
    data: null,
    isLoading: false,
    isError: false,
  })),
  useProvidersHealth: vi.fn(() => ({
    data: null,
    isLoading: false,
    isError: false,
  })),
}));

// Mock the useSearchHistory hook
vi.mock('@/hooks/useSearchHistory', () => ({
  useSearchHistory: vi.fn(() => ({
    history: [],
    addToHistory: vi.fn(),
    clearHistory: vi.fn(),
    removeFromHistory: vi.fn(),
  })),
}));

// Mock heavy child components that are not under test
vi.mock('../BulkLookup', () => ({
  BulkLookup: () => <div data-testid="bulk-lookup">Bulk Lookup Component</div>,
}));

vi.mock('../Dashboard', () => ({
  Dashboard: () => <div data-testid="dashboard">Dashboard Component</div>,
}));

vi.mock('../LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid="loading-skeleton">Loading...</div>,
}));

vi.mock('../MapView', () => ({
  MapView: () => <div data-testid="map-view">Map</div>,
}));

// Now import the component under test
import { App } from '../../App';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Smoke Test ───────────────────────────────────────────────

  it('renders without crashing', () => {
    render(<App />);

    // The app should at minimum render the header text
    expect(screen.getByText('IP Intelligence')).toBeInTheDocument();
  });

  // ─── Default Layout ───────────────────────────────────────────

  it('shows the search section by default on the lookup tab', () => {
    render(<App />);

    // SearchSection heading
    expect(screen.getByText('Lookup IP Address')).toBeInTheDocument();

    // The IP input field
    expect(screen.getByLabelText('IP address input')).toBeInTheDocument();

    // The submit button
    expect(screen.getByRole('button', { name: /lookup ip/i })).toBeInTheDocument();
  });

  it('displays all three navigation tabs', () => {
    render(<App />);

    expect(screen.getByText('IP Lookup')).toBeInTheDocument();
    expect(screen.getByText('Bulk Lookup')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  // ─── Tab Navigation ───────────────────────────────────────────

  it('switches to Bulk Lookup tab when clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Bulk Lookup'));

    expect(screen.getByTestId('bulk-lookup')).toBeInTheDocument();
    // Search section should not be visible
    expect(screen.queryByText('Lookup IP Address')).not.toBeInTheDocument();
  });

  it('switches to Dashboard tab when clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Dashboard'));

    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Lookup IP Address')).not.toBeInTheDocument();
  });

  it('switches back to IP Lookup tab from another tab', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Navigate away
    await user.click(screen.getByText('Dashboard'));
    expect(screen.queryByText('Lookup IP Address')).not.toBeInTheDocument();

    // Navigate back
    await user.click(screen.getByText('IP Lookup'));
    expect(screen.getByText('Lookup IP Address')).toBeInTheDocument();
  });

  // ─── Footer ───────────────────────────────────────────────────

  it('renders the footer with version info', () => {
    render(<App />);

    expect(screen.getByText(/Build: v2\.0\.0/)).toBeInTheDocument();
    expect(screen.getByText('API Documentation')).toBeInTheDocument();
  });

  it('renders the AI-Powered badge in the footer', () => {
    render(<App />);

    expect(screen.getByText('AI-Powered')).toBeInTheDocument();
  });
});
