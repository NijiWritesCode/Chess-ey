import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bot, Users, Search, History, Settings, Crown, Swords, BarChart3 } from 'lucide-react';
import { isSupabaseConfigured } from '../../services/supabase/supabaseClient';
import { analysisEngine } from '../../services/engine/stockfishService';

export function Header({ onOpenSettings }) {
  const location = useLocation();
  const [engineStatus, setEngineStatus] = useState('uninitialized');

  useEffect(() => {
    return analysisEngine.subscribeStatus(setEngineStatus);
  }, []);

  const navLinks = [
    { to: '/computer', label: 'Play Bots', icon: Bot },
    { to: '/multiplayer', label: 'Play Friend', icon: Users },
    { to: '/analysis', label: 'Analysis', icon: Search },
    { to: '/review', label: 'Review', icon: BarChart3 },
    { to: '/history', label: 'History', icon: History }
  ];

  const isEngineReady = engineStatus === 'ready' || engineStatus === 'thinking';

  return (
    <header className="sticky top-0 z-40 bg-canvas/95 backdrop-blur-md border-b border-canvas-border px-3 sm:px-6 py-2.5 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand / Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-canvas shadow-md shadow-accent-500/20 group-hover:scale-105 transition-transform">
            <Crown className="w-5 h-5 fill-canvas" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-lg sm:text-xl tracking-tight text-ivory group-hover:text-accent-300 transition-colors">
                Chess<span className="text-accent-400">-ey</span>
              </span>
            </div>
          </div>
        </Link>

        {/* Main Navigation (Clean, simple, high-contrast) */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-accent-500/15 text-accent-300 border border-accent-500/30 shadow-sm'
                    : 'text-ivory-muted hover:text-ivory hover:bg-canvas-subtle'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-accent-400' : 'text-ivory-muted'}`} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Actions & Quick Status */}
        <div className="flex items-center gap-2.5">
          {/* Subtle Live Engine Indicator */}
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-canvas-subtle border border-canvas-border text-[11px] text-ivory-muted"
            title={isEngineReady ? 'Stockfish engine ready' : 'Stockfish engine initializing'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isEngineReady ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="font-mono text-[10px]">
              {engineStatus === 'thinking' ? 'Thinking' : 'Live Intel'}
            </span>
          </div>

          {/* Quick Play CTA */}
          <Link
            to="/computer"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-500 hover:bg-accent-400 text-canvas font-bold text-xs transition-all shadow-md active:scale-95"
          >
            <Swords className="w-3.5 h-3.5 fill-canvas" />
            <span>Play Now</span>
          </Link>

          {/* Settings button */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg bg-canvas-card hover:bg-canvas-hover border border-canvas-border text-ivory-muted hover:text-ivory transition-colors"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile Navigation Row */}
      <div className="flex md:hidden items-center justify-around gap-1 pt-2 mt-1.5 border-t border-canvas-border/50 text-[11px]">
        {navLinks.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-1 py-1 px-2 rounded-md transition-colors ${
                isActive ? 'text-accent-300 font-bold' : 'text-ivory-muted'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </header>
  );
}
