import { useEffect, useCallback } from 'react';

type TabType = 'lookup' | 'bulk' | 'compare' | 'dashboard';

interface KeyboardShortcutsOptions {
  onFocusSearch: () => void;
  onClearSearch: () => void;
  onSubmitSearch: () => void;
  onSwitchTab: (tab: TabType) => void;
}

const TAB_MAP: Record<string, TabType> = {
  '1': 'lookup',
  '2': 'bulk',
  '3': 'compare',
  '4': 'dashboard',
};

export function useKeyboardShortcuts({
  onFocusSearch,
  onClearSearch,
  onSubmitSearch,
  onSwitchTab,
}: KeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isInputFocused =
        tagName === 'input' || tagName === 'textarea' || tagName === 'select';

      // "/" — Focus the IP search input (unless already in an input)
      if (event.key === '/' && !isInputFocused) {
        event.preventDefault();
        onFocusSearch();
        return;
      }

      // "Escape" — Clear the search input and results
      if (event.key === 'Escape') {
        event.preventDefault();
        onClearSearch();
        return;
      }

      // "Ctrl+Enter" or "Cmd+Enter" — Submit the search
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onSubmitSearch();
        return;
      }

      // "1", "2", "3" — Switch between tabs (only when search input is not focused)
      if (!isInputFocused && event.key in TAB_MAP) {
        const tab = TAB_MAP[event.key];
        if (tab) {
          event.preventDefault();
          onSwitchTab(tab);
        }
        return;
      }
    },
    [onFocusSearch, onClearSearch, onSubmitSearch, onSwitchTab]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
