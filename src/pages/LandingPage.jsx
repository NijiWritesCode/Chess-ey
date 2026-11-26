import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Users, Search, ArrowRight, Play, Swords } from 'lucide-react';
import { ChessboardWrapper } from '../components/board/ChessboardWrapper';
import { Chess } from 'chess.js';
import { BOT_PERSONAS } from '../data/botPersonas';
import { PersonaAvatar } from '../components/board/PersonaAvatar';

export function LandingPage() {
  const navigate = useNavigate();

  // Demonstration interactive board on landing page
  const [demoChess] = useState(() => {
    const c = new Chess();
    c.move('e4');
    c.move('e5');
    c.move('Nf3');
    c.move('Nc6');
    c.move('Bc4');
    c.move('Bc5');
    return c;
  });
  const [demoFen, setDemoFen] = useState(demoChess.fen());

  const handleDemoMove = (move) => {
    try {
      const res = demoChess.move(move);
      if (res) {
        setDemoFen(demoChess.fen());
        return true;
      }
    } catch (e) {}
    return false;
  };

  const handleSelectBot = (level) => {
    navigate('/computer', { state: { botLevel: level } });
  };

  // Curated showcase of personas for the minimalist strip
  const featuredBots = BOT_PERSONAS.slice(0, 8);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
      {/* Minimalist Hero: Clean Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left Column: Direct Action & Content */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-5xl font-black text-ivory tracking-tight leading-[1.15]">
              Play chess with <span className="text-accent-400">live intel</span>.
            </h1>
            <p className="text-sm sm:text-base text-ivory-muted max-w-lg leading-relaxed">
              No account required. Play distinct bot personalities, challenge friends via share link, and evaluate every move with real-time engine analysis.
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              onClick={() => navigate('/computer')}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-accent-500 hover:bg-accent-400 text-canvas font-bold text-sm transition-all shadow-md active:scale-95"
            >
              <Bot className="w-4 h-4 fill-canvas" />
              <span>Play Bots</span>
            </button>

            <button
              onClick={() => navigate('/multiplayer')}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-canvas-card hover:bg-canvas-hover border border-canvas-border text-ivory text-sm font-semibold transition-all active:scale-95"
            >
              <Users className="w-4 h-4 text-ivory-muted" />
              <span>Play a Friend</span>
            </button>

            <button
              onClick={() => navigate('/analysis')}
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-ivory-muted hover:text-ivory text-sm font-medium transition-colors"
            >
              <Search className="w-4 h-4" />
              <span>Analysis</span>
            </button>
          </div>

          {/* Minimalist Bot Opponents Strip */}
          <div className="pt-4 border-t border-canvas-border/50 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-ivory">Quick Bot Match:</span>
              <button
                onClick={() => navigate('/computer')}
                className="text-accent-400 hover:text-accent-300 font-medium flex items-center gap-1"
              >
                <span>All {BOT_PERSONAS.length} bots</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {featuredBots.map((bot) => (
                <button
                  key={bot.level}
                  onClick={() => handleSelectBot(bot.level)}
                  className="group flex flex-col items-center p-1.5 rounded-xl bg-canvas-card hover:bg-canvas-hover border border-canvas-border hover:border-accent-400/60 transition-all shrink-0 text-center active:scale-95"
                  style={{ width: '64px' }}
                  title={`Play ${bot.name} (${bot.gender}, ${bot.elo} ELO)`}
                >
                  <div className="rounded-lg overflow-hidden mb-1 shadow-sm transition-transform group-hover:scale-105">
                    <PersonaAvatar persona={bot} size={48} />
                  </div>
                  <span className="text-[11px] font-bold text-ivory group-hover:text-accent-300 leading-tight truncate w-full">
                    {bot.name.split(' ')[0]}
                  </span>
                  <span className="text-[9px] font-mono text-accent-400/90 leading-tight">
                    {bot.elo}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Minimal Live Classification Badges */}
          <div className="flex items-center gap-2 pt-2 text-[11px] text-ivory-muted">
            <span className="font-medium">Classifications:</span>
            <div className="flex items-center gap-1.5 font-mono font-bold">
              <span className="px-1.5 py-0.5 rounded bg-[#1baaa7]/20 text-[#1baaa7] border border-[#1baaa7]/30" title="Brilliant">!! Brilliant</span>
              <span className="px-1.5 py-0.5 rounded bg-[#81b64c]/20 text-[#81b64c] border border-[#81b64c]/30" title="Best">★ Best</span>
              <span className="px-1.5 py-0.5 rounded bg-[#d5a47e]/20 text-[#d5a47e] border border-[#d5a47e]/30" title="Book">📖 Book</span>
              <span className="px-1.5 py-0.5 rounded bg-[#fa412d]/20 text-[#fa412d] border border-[#fa412d]/30" title="Blunder">?? Blunder</span>
            </div>
          </div>
        </div>

        {/* Right Column: Clean Interactive Chessboard */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center">
          <div className="w-full max-w-[420px] bg-canvas-card border border-canvas-border rounded-2xl p-3 sm:p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2 px-1 text-xs">
              <span className="font-medium text-ivory flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Interactive Board</span>
              </span>
              <span className="text-accent-400 font-mono text-[11px]">Italian Game</span>
            </div>

            <div className="aspect-square w-full">
              <ChessboardWrapper
                chess={demoChess}
                fen={demoFen}
                onMove={handleDemoMove}
                isInteractive={true}
                bestMoveArrow={{ from: 'c2', to: 'c3' }}
              />
            </div>

            <p className="text-[11px] text-ivory-muted text-center mt-2.5">
              Drag or tap pieces to test moves immediately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
