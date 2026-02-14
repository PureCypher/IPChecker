import { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { validateIPWithMessage, normalizeIP } from '@/utils/validation';

interface SearchSectionProps {
  onSearch: (ip: string) => void;
  isLoading: boolean;
  searchHistory?: string[];
}

export interface SearchSectionHandle {
  focus: () => void;
  clear: () => void;
  submit: () => void;
}

const EXAMPLE_IPS = [
  { label: '8.8.8.8', description: 'Google DNS' },
  { label: '1.1.1.1', description: 'Cloudflare DNS' },
  { label: '208.67.222.222', description: 'OpenDNS' },
];

export const SearchSection = forwardRef<SearchSectionHandle, SearchSectionProps>(
  function SearchSection({ onSearch, isLoading, searchHistory = [] }, ref) {
    const [ip, setIp] = useState('');
    const [error, setError] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      setError('');

      const normalized = normalizeIP(ip);

      if (!normalized) {
        setError('Please enter an IP address');
        return;
      }

      const validation = validateIPWithMessage(normalized);
      if (!validation.valid) {
        setError(validation.error || 'Invalid IP address');
        return;
      }

      onSearch(normalized);
    };

    useImperativeHandle(ref, () => ({
      focus: () => {
        inputRef.current?.focus();
      },
      clear: () => {
        setIp('');
        setError('');
        inputRef.current?.blur();
      },
      submit: () => {
        handleSubmit();
      },
    }));

    const handleExampleClick = (exampleIp: string) => {
      setIp(exampleIp);
      setError('');

      const normalized = normalizeIP(exampleIp);
      const validation = validateIPWithMessage(normalized);

      if (!validation.valid) {
        setError(validation.error || 'Invalid IP address');
        return;
      }

      onSearch(normalized);
    };

    return (
      <section className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="card fade-in">
            <h2 className="text-xl font-semibold mb-4 text-dark-text-primary">
              Lookup IP Address
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                    placeholder="Enter IPv4 or IPv6 address (e.g., 8.8.8.8)"
                    className={`input ${ip ? 'pr-10' : ''}`}
                    disabled={isLoading}
                    aria-label="IP address input"
                    autoComplete="off"
                    spellCheck="false"
                  />
                  {ip && (
                    <button
                      type="button"
                      onClick={() => setIp('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-text-muted hover:text-dark-text-primary transition-colors"
                      disabled={isLoading}
                      aria-label="Clear input"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
                {error && (
                  <div className="mt-2 flex items-center space-x-2 text-sm text-dark-accent-red">
                    <svg
                      className="w-4 h-4 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary w-full"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Searching...
                  </span>
                ) : (
                  'Lookup IP'
                )}
              </button>
            </form>

            <div className="mt-6">
              <p className="text-sm text-dark-text-muted mb-3">Quick Examples:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_IPS.map((example) => (
                  <button
                    key={example.label}
                    onClick={() => handleExampleClick(example.label)}
                    disabled={isLoading}
                    className="btn btn-secondary text-sm"
                    title={example.description}
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            </div>

            {searchHistory.length > 0 && (
              <div className="mt-6">
                <p className="text-sm text-dark-text-muted mb-3">Recent Searches:</p>
                <div className="flex flex-wrap gap-2">
                  {searchHistory.slice(0, 5).map((historyIp, index) => (
                    <button
                      key={`${historyIp}-${index}`}
                      onClick={() => handleExampleClick(historyIp)}
                      disabled={isLoading}
                      className="btn btn-secondary text-sm"
                    >
                      {historyIp}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }
);
