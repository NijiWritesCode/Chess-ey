import React from 'react';
import { Link } from 'react-router-dom';
import { Bot, HelpCircle, ArrowLeft, Search, Users } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-canvas-card border border-canvas-border rounded-2xl p-8 text-center space-y-6 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-accent-600/20 border border-accent-500/30 flex items-center justify-center text-accent-300 mx-auto">
          <HelpCircle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="text-4xl font-extrabold font-mono text-accent-400">404</span>
          <h1 className="text-xl font-bold text-ivory">Position Not Found</h1>
          <p className="text-xs text-ivory-muted leading-relaxed">
            The page or game link you are looking for does not exist on the board or may have expired.
          </p>
        </div>

        <div className="pt-2 flex flex-col gap-2 text-xs font-semibold">
          <Link
            to="/computer"
            className="w-full py-2.5 px-4 bg-accent-600 hover:bg-accent-500 text-white rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <Bot className="w-4 h-4" />
            <span>Play against Stockfish</span>
          </Link>

          <Link
            to="/multiplayer"
            className="w-full py-2.5 px-4 bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-ivory rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <Users className="w-4 h-4 text-blue-400" />
            <span>Multiplayer Room</span>
          </Link>

          <Link
            to="/analysis"
            className="w-full py-2.5 px-4 bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-ivory rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4 text-amber-400" />
            <span>Analysis Board</span>
          </Link>

          <Link
            to="/"
            className="pt-2 text-ivory-faint hover:text-ivory flex items-center justify-center gap-1.5 transition-colors text-[11px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

