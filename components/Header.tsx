'use client';

/**
 * Header — top navigation bar.
 *
 * Contains:
 *   - App logo/name
 *   - DriveStatus badge
 *   - Theme toggle (dark ↔ light, persisted to localStorage)
 *   - Settings button (opens SettingsPanel)
 */

import { useEffect, useState } from 'react';
import { Sun, Moon, Settings2 } from 'lucide-react';
import { DriveStatus } from './DriveStatus';

interface HeaderProps {
  onSettingsOpen: () => void;
}

export function Header({ onSettingsOpen }: HeaderProps) {
  const [isLight, setIsLight] = useState(false);

  // Initialize theme from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
      document.documentElement.classList.add('light');
      setIsLight(true);
    }
  }, []);

  function toggleTheme() {
    const nextLight = !isLight;
    setIsLight(nextLight);

    if (nextLight) {
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    }
  }

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-6 py-3"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3">
        <img
          src="/indaer-logo.png"
          alt="Indaer Aviation Technical Services"
          style={{ height: '32px', objectFit: 'contain', backgroundColor: 'white', padding: '2px', borderRadius: '4px' }}
        />
        <span
          className="font-semibold text-sm tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Document Intelligence by YOSEF GIRALDO
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        <DriveStatus />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="btn-ghost p-2"
          style={{ padding: '6px', borderRadius: '6px' }}
          aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
          title={isLight ? 'Dark mode' : 'Light mode'}
        >
          {isLight ? (
            <Moon size={16} aria-hidden="true" />
          ) : (
            <Sun size={16} aria-hidden="true" />
          )}
        </button>

        {/* Settings */}
        <button
          id="settings-button"
          onClick={onSettingsOpen}
          className="btn-ghost p-2"
          style={{ padding: '6px', borderRadius: '6px' }}
          aria-label="Open settings"
          title="Settings"
        >
          <Settings2 size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
