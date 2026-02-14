import { useState } from 'react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

const SHORTCUTS = [
  { keys: ['/'], description: 'Focus search' },
  { keys: ['Esc'], description: 'Clear search' },
  { keys: [isMac ? 'Cmd' : 'Ctrl', 'Enter'], description: 'Submit search' },
  { keys: ['1'], description: 'IP Lookup tab' },
  { keys: ['2'], description: 'Bulk Lookup tab' },
  { keys: ['3'], description: 'Compare tab' },
  { keys: ['4'], description: 'Dashboard tab' },
];

export function KeyboardShortcutsHelp() {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative">
      <button
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={() => setIsVisible((prev) => !prev)}
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-dark-border text-dark-text-muted hover:text-dark-text-secondary hover:border-dark-text-muted transition-colors text-sm font-mono"
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts"
      >
        ?
      </button>

      {isVisible && (
        <div className="absolute bottom-full right-0 mb-2 w-64 bg-dark-surface border border-dark-border rounded-lg shadow-xl z-50 p-4">
          <h4 className="text-sm font-semibold text-dark-text-primary mb-3">
            Keyboard Shortcuts
          </h4>
          <div className="space-y-2">
            {SHORTCUTS.map((shortcut) => (
              <div
                key={shortcut.description}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-dark-text-secondary">
                  {shortcut.description}
                </span>
                <div className="flex items-center space-x-1">
                  {shortcut.keys.map((key, i) => (
                    <span key={i} className="flex items-center">
                      {i > 0 && (
                        <span className="text-dark-text-muted mx-0.5">+</span>
                      )}
                      <kbd className="px-1.5 py-0.5 bg-dark-bg border border-dark-border rounded text-xs font-mono text-dark-text-primary">
                        {key}
                      </kbd>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
