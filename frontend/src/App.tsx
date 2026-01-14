import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'react-hot-toast';
import { Header } from './components/Header';
import { SearchSection } from './components/SearchSection';
import { ResultsSection } from './components/ResultsSection';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { BulkLookup } from './components/BulkLookup';
import { Dashboard } from './components/Dashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useIpLookup } from './hooks/useIpLookup';
import { useSearchHistory } from './hooks/useSearchHistory';
import type { CorrelatedIpRecord } from '@ipintel/shared';
import { ApiError } from './lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

type TabType = 'lookup' | 'bulk' | 'dashboard';

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabType>('lookup');
  const [result, setResult] = useState<CorrelatedIpRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookupMutation = useIpLookup();
  const { history, addToHistory } = useSearchHistory();

  const handleSearch = (ip: string) => {
    setError(null);
    setResult(null);

    lookupMutation.mutate(
      { ip, forceRefresh: false, includeLLMAnalysis: true },
      {
        onSuccess: (data) => {
          setResult(data);
          addToHistory(ip);
          toast.success('IP lookup successful!');
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            const errorMsg = err.details?.suggestion || err.message;
            setError(errorMsg);
            toast.error(errorMsg);
          } else {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
            setError(errorMsg);
            toast.error(errorMsg);
          }
        },
      }
    );
  };

  const handleBulkResultSelect = (ip: string) => {
    setActiveTab('lookup');
    handleSearch(ip);
  };

  const tabs: { id: TabType; label: string; icon: JSX.Element }[] = [
    {
      id: 'lookup',
      label: 'IP Lookup',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
    },
    {
      id: 'bulk',
      label: 'Bulk Lookup',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      ),
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-dark-bg">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#171717',
            color: '#fafafa',
            border: '1px solid #262626',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#171717',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#171717',
            },
          },
        }}
      />
      <Header />

      {/* Tab Navigation */}
      <nav className="border-b border-dark-border bg-dark-surface/30">
        <div className="container mx-auto px-4">
          <div className="flex space-x-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'text-dark-accent-blue border-dark-accent-blue'
                    : 'text-dark-text-muted border-transparent hover:text-dark-text-secondary hover:border-dark-border'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="pb-12">
        {activeTab === 'lookup' && (
          <>
            <SearchSection
              onSearch={handleSearch}
              isLoading={lookupMutation.isPending}
              searchHistory={history.map(item => item.ip)}
            />
            {lookupMutation.isPending ? (
              <LoadingSkeleton />
            ) : (
              <ResultsSection result={result} error={error} />
            )}
          </>
        )}

        {activeTab === 'bulk' && (
          <div className="container mx-auto px-4 py-8">
            <div className="max-w-4xl mx-auto">
              <BulkLookup onResultSelect={handleBulkResultSelect} />
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="container mx-auto px-4 py-8">
            <Dashboard />
          </div>
        )}
      </main>

      <footer className="border-t border-dark-border">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between text-sm text-dark-text-muted">
            <div className="flex items-center space-x-4">
              <a
                href="/api/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-dark-accent-blue transition-colors"
              >
                API Documentation
              </a>
              <span className="text-dark-border">|</span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-dark-accent-green animate-pulse" />
                <span>AI-Powered</span>
              </span>
            </div>
            <div className="mt-2 md:mt-0">
              Build: v2.0.0 | Multi-Provider Intelligence + Ollama AI
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
