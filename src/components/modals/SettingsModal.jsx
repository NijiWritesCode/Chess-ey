import React, { useState, useEffect, useRef } from 'react';
import { X, Volume2, VolumeX, Eye, Sparkles, Sliders, Check, Clock, User, Cpu } from 'lucide-react';
import { settingsManager, BOARD_THEMES, TIME_CONTROLS } from '../../services/storage/settingsStore';
import { soundEngine } from '../../utils/sound';

export function SettingsModal({ isOpen, onClose }) {
  const [settings, setSettings] = useState(settingsManager.getAll());
  const modalRef = useRef(null);

  useEffect(() => {
    return settingsManager.subscribe(setSettings);
  }, []);

  // Keyboard accessibility: Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleUpdate = (patch) => {
    settingsManager.update(patch);
    if ('enableSounds' in patch) {
      soundEngine.setEnabled(patch.enableSounds);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      ref={modalRef}
    >
      <div className="bg-canvas-card border border-canvas-border rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-canvas-border flex items-center justify-between sticky top-0 bg-canvas-card z-10">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-accent-400" />
            <h2 id="settings-dialog-title" className="text-lg font-bold text-ivory">
              Chess & Engine Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-canvas-hover text-ivory-muted hover:text-white transition-colors"
            aria-label="Close settings dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Section: Match Preferences */}
          <div>
            <h3 className="text-xs font-semibold text-ivory-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-accent-400" />
              <span>Default Match Preferences</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ivory-muted block mb-1">Starting Color</label>
                <select
                  value={settings.defaultColor || 'white'}
                  onChange={(e) => handleUpdate({ defaultColor: e.target.value })}
                  className="w-full bg-canvas-subtle border border-canvas-border rounded-lg px-3 py-2 text-xs text-ivory font-medium focus:ring-1 focus:ring-accent-500"
                >
                  <option value="white">White Pieces</option>
                  <option value="black">Black Pieces</option>
                  <option value="random">Randomly Assigned</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-ivory-muted block mb-1">Default Time Control</label>
                <select
                  value={settings.timeControl || 'rapid-10'}
                  onChange={(e) => handleUpdate({ timeControl: e.target.value })}
                  className="w-full bg-canvas-subtle border border-canvas-border rounded-lg px-3 py-2 text-xs text-ivory font-medium focus:ring-1 focus:ring-accent-500"
                >
                  {TIME_CONTROLS.map((tc) => (
                    <option key={tc.id} value={tc.id}>
                      {tc.name} ({tc.category})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Board Appearance */}
          <div>
            <h3 className="text-xs font-semibold text-ivory-muted uppercase tracking-wider mb-3">
              Board Themes
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {BOARD_THEMES.map((theme) => {
                const isSelected = settings.boardTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    onClick={() => handleUpdate({ boardTheme: theme.id })}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-accent-500 bg-accent-500/10 shadow-sm'
                        : 'border-canvas-border bg-canvas-subtle hover:bg-canvas-hover'
                    }`}
                  >
                    <div className="w-7 h-7 rounded overflow-hidden flex border border-black/20 shrink-0">
                      <div className="w-1/2 h-full" style={{ backgroundColor: theme.light }} />
                      <div className="w-1/2 h-full" style={{ backgroundColor: theme.dark }} />
                    </div>
                    <span className="text-xs font-medium text-ivory truncate">{theme.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: Live Intelligence & Annotations */}
          <div>
            <h3 className="text-xs font-semibold text-ivory-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent-400" />
              <span>Live Engine Intelligence</span>
            </h3>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-xl bg-canvas-subtle border border-canvas-border hover:bg-canvas-hover cursor-pointer transition-colors">
                <div>
                  <span className="text-sm font-medium text-ivory block">Real-time Move Classifications</span>
                  <span className="text-xs text-ivory-muted block">
                    Evaluates moves with Stockfish to detect Brilliant, Best, Blunders & Book moves.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enableLiveAnalysis}
                  onChange={(e) => handleUpdate({ enableLiveAnalysis: e.target.checked })}
                  className="w-4 h-4 rounded text-accent-500 focus:ring-accent-500 accent-accent-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-canvas-subtle border border-canvas-border hover:bg-canvas-hover cursor-pointer transition-colors">
                <div>
                  <span className="text-sm font-medium text-ivory block">Evaluation Bar</span>
                  <span className="text-xs text-ivory-muted block">
                    Shows live win-percentage and advantage meter beside the board.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showEvalBar}
                  onChange={(e) => handleUpdate({ showEvalBar: e.target.checked })}
                  className="w-4 h-4 rounded text-accent-500 focus:ring-accent-500 accent-accent-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-canvas-subtle border border-canvas-border hover:bg-canvas-hover cursor-pointer transition-colors">
                <div>
                  <span className="text-sm font-medium text-ivory block">Best Move Arrows</span>
                  <span className="text-xs text-ivory-muted block">
                    Draws an overlay arrow showing the engine's primary recommendation.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showBestMoveArrow}
                  onChange={(e) => handleUpdate({ showBestMoveArrow: e.target.checked })}
                  className="w-4 h-4 rounded text-accent-500 focus:ring-accent-500 accent-accent-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-canvas-subtle border border-canvas-border hover:bg-canvas-hover cursor-pointer transition-colors">
                <div>
                  <span className="text-sm font-medium text-ivory block">Show Engine Centipawn Scores</span>
                  <span className="text-xs text-ivory-muted block">
                    Displays numeric values (+0.45, -1.20, M3) alongside win-percentages.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showEngineScores}
                  onChange={(e) => handleUpdate({ showEngineScores: e.target.checked })}
                  className="w-4 h-4 rounded text-accent-500 focus:ring-accent-500 accent-accent-500"
                />
              </label>
            </div>
          </div>

          {/* Section: Engine Depth Constraints */}
          <div>
            <h3 className="text-xs font-semibold text-ivory-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-accent-400" />
              <span>Calculation Search Depths</span>
            </h3>

            <div className="space-y-4 bg-canvas-subtle p-3 rounded-xl border border-canvas-border">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-ivory font-medium">Live Play Depth</span>
                  <span className="font-mono text-accent-300 font-bold">{settings.liveDepth || 12} plies</span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={18}
                  step={1}
                  value={settings.liveDepth || 12}
                  onChange={(e) => handleUpdate({ liveDepth: Number(e.target.value) })}
                  className="w-full accent-accent-500"
                />
                <span className="text-[10px] text-ivory-muted block mt-0.5">
                  Lower values provide faster response times on mobile devices.
                </span>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-ivory font-medium">Post-Game Review Depth</span>
                  <span className="font-mono text-accent-300 font-bold">{settings.reviewDepth || 16} plies</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={20}
                  step={1}
                  value={settings.reviewDepth || 16}
                  onChange={(e) => handleUpdate({ reviewDepth: Number(e.target.value) })}
                  className="w-full accent-accent-500"
                />
              </div>
            </div>
          </div>

          {/* Section: Audio & Assistance */}
          <div>
            <h3 className="text-xs font-semibold text-ivory-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-accent-400" />
              <span>Audio & Controls</span>
            </h3>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-xl bg-canvas-subtle border border-canvas-border hover:bg-canvas-hover cursor-pointer transition-colors">
                <div>
                  <span className="text-sm font-medium text-ivory block">Move Sound Effects</span>
                  <span className="text-xs text-ivory-muted block">
                    Crisp physical piece sounds for moves, captures, checks, and game ending.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enableSounds}
                  onChange={(e) => handleUpdate({ enableSounds: e.target.checked })}
                  className="w-4 h-4 rounded text-accent-500 focus:ring-accent-500 accent-accent-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-canvas-subtle border border-canvas-border hover:bg-canvas-hover cursor-pointer transition-colors">
                <div>
                  <span className="text-sm font-medium text-ivory block">Legal Move Highlights</span>
                  <span className="text-xs text-ivory-muted block">
                    Highlights target squares when a piece is clicked or dragged.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showLegalMoves}
                  onChange={(e) => handleUpdate({ showLegalMoves: e.target.checked })}
                  className="w-4 h-4 rounded text-accent-500 focus:ring-accent-500 accent-accent-500"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-canvas-border bg-canvas-subtle flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

