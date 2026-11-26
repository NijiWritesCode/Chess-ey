// Recent Games History Page
// Displays all locally saved matches from IndexedDB / LocalStorage with filter, search, review navigation, and PGN export.

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { historyStorage } from '../services/historyStorage';
import GameCard from '../components/GameCard';
import { History, Search, Trash2, ArrowLeft, Swords, Bot, Download, RefreshCw } from 'lucide-react';

export default function RecentGamesPage() {
  const navigate = useNavigate();
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterMode, setFilterMode] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadGames = async () => {
    setIsLoading(true);
    try {
      const stored = await historyStorage.getRecentGames(50);
      setGames(stored || []);
    } catch (e) {
      console.error('Failed to load recent games:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGames();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this game record?')) return;
    await historyStorage.deleteGame(id);
    setGames((prev) => prev.filter((g) => g.id !== id));
  };

  const handleClearAll = async () => {
    if (!window.confirm('Delete all saved games from your history? This cannot be undone.')) return;
    await historyStorage.clearGames();
    setGames([]);
  };

  const filteredGames = useMemo(() => {
    return games.filter((game) => {
      // Mode filter
      if (filterMode !== 'all' && game.gameMode !== filterMode) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const white = (game.players?.white?.name || '').toLowerCase();
        const black = (game.players?.black?.name || '').toLowerCase();
        const opening = (game.review?.openingName || '').toLowerCase();
        return white.includes(query) || black.includes(query) || opening.includes(query);
      }
      return true;
    });
  }, [games, filterMode, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Back to Home"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <History className="w-6 h-6 text-cyan-400" />
                Game History
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Locally saved matches, move notation, and game analysis reviews
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadGames}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {games.length > 0 && (
              <button
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Mode Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 w-full sm:w-auto">
            {[
              { id: 'all', label: 'All' },
              { id: 'computer', label: 'vs Computer' },
              { id: 'multiplayer', label: 'Multiplayer' },
              { id: 'offline', label: 'Pass & Play' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterMode(tab.id)}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filterMode === tab.id
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search opponent or opening..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
        </div>

        {/* Games List / Empty State */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <span className="text-sm">Loading your games...</span>
          </div>
        ) : filteredGames.length === 0 ? (
          <div className="py-16 px-4 bg-slate-900/50 rounded-2xl border border-slate-800 text-center flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400 mb-4 shadow-inner">
              <History className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-slate-200">No games found</h2>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              {games.length === 0
                ? "You haven't completed any games yet. Start playing offline against Stockfish or challenge a friend online!"
                : 'No games match your current filter or search criteria.'}
            </p>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => navigate('/play/computer')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors shadow-lg shadow-cyan-500/20"
              >
                <Bot className="w-4 h-4" />
                Play Stockfish
              </button>
              <button
                onClick={() => navigate('/play/friend')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors border border-slate-700"
              >
                <Swords className="w-4 h-4" />
                Play a Friend
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onReview={(id) => navigate(`/review/${id}`)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
