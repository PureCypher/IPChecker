import { useState, useEffect } from 'react';

const STORAGE_KEY = 'ip-search-history';
const MAX_HISTORY = 10;

export interface SearchHistoryItem {
  ip: string;
  timestamp: number;
}

export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch (err) {
        console.error('Failed to parse search history:', err);
      }
    }
  }, []);

  const addToHistory = (ip: string) => {
    const newHistory = [
      { ip, timestamp: Date.now() },
      ...history.filter((item) => item.ip !== ip),
    ].slice(0, MAX_HISTORY);

    setHistory(newHistory);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const removeFromHistory = (ip: string) => {
    const newHistory = history.filter((item) => item.ip !== ip);
    setHistory(newHistory);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
  };

  return { history, addToHistory, clearHistory, removeFromHistory };
}
