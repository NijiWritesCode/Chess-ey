import React, { useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Header } from './components/layout/Header';
import { SettingsModal } from './components/modals/SettingsModal';
import { LandingPage } from './pages/LandingPage';
import { ComputerGamePage } from './pages/ComputerGamePage';
import { MultiplayerPage } from './pages/MultiplayerPage';
import { MultiplayerRoomPage } from './pages/MultiplayerRoomPage';
import { GameReviewPage } from './pages/GameReviewPage';
import { AnalysisBoardPage } from './pages/AnalysisBoardPage';
import { RecentGamesPage } from './pages/RecentGamesPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const location = useLocation();

  // Hide global footer on active gameplay and analysis boards to guarantee 100% viewport fit with zero scrolling
  const isGameRoute =
    location.pathname === '/computer' ||
    location.pathname === '/analysis' ||
    location.pathname.startsWith('/play/');

  return (
    <div className="min-h-screen bg-canvas text-ivory flex flex-col font-sans">
      <Header onOpenSettings={() => setIsSettingsOpen(true)} />

      <main className="flex-1 flex flex-col">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/computer" element={<ComputerGamePage />} />
          <Route path="/multiplayer" element={<MultiplayerPage />} />
          <Route path="/play/:roomId" element={<MultiplayerRoomPage />} />
          <Route path="/review" element={<GameReviewPage />} />
          <Route path="/review/:gameId" element={<GameReviewPage />} />
          <Route path="/analysis" element={<AnalysisBoardPage />} />
          <Route path="/history" element={<RecentGamesPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      {/* Global Footer: Render only on landing, history, and review pages */}
      {!isGameRoute && (
        <footer className="border-t border-canvas-border/80 bg-canvas-subtle/80 py-6 px-4 text-center text-xs text-ivory-muted shrink-0">
          <div className="max-w-7xl mx-auto space-y-2">
            <p className="font-medium text-ivory">
              Chess-ey &mdash; Instant Online Chess with Real-Time Stockfish Analysis & Game Intelligence.
            </p>
            <p className="text-[11px] text-ivory-faint max-w-2xl mx-auto leading-relaxed">
              Chess engine calculations powered by <a href="https://stockfishchess.org" target="_blank" rel="noreferrer" className="underline hover:text-ivory">Stockfish</a> WebAssembly under the GNU General Public License v3.0. Opening book data curated from the Lichess public chess openings dataset (CC0).
            </p>
          </div>
        </footer>
      )}

      {/* Global Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default App;

