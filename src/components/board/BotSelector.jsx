import React from 'react';
import { BOT_TIERS, BOT_PERSONAS, getPersona } from '../../data/botPersonas';
import { PersonaAvatar } from './PersonaAvatar';
import { Sparkles, Trophy, Zap, Shield, Play } from 'lucide-react';

/**
 * BotSelector renders bot personas arranged in tiers with square avatar tiles,
 * matching the user's reference image style.
 */
export function BotSelector({ selectedLevel, onSelectBot, onStartGame = null }) {
  const selectedPersona = getPersona(selectedLevel);

  return (
    <div className="space-y-4">
      {BOT_TIERS.map((tierGroup) => {
        const bots = tierGroup.bots
          .map((lvl) => BOT_PERSONAS.find((b) => b.level === lvl))
          .filter(Boolean);

        return (
          <div key={tierGroup.tier} className="bg-canvas-subtle/60 rounded-xl p-3 border border-canvas-border/70">
            {/* Tier Header (like reference image: "New to Chess  5 bots") */}
            <div className="flex items-center justify-between mb-2.5 px-0.5">
              <div>
                <h3 className="text-sm font-bold text-ivory tracking-tight">{tierGroup.tier}</h3>
                {tierGroup.description && (
                  <p className="text-[11px] text-ivory-muted hidden sm:block">{tierGroup.description}</p>
                )}
              </div>
              <span className="text-xs font-mono font-medium text-accent-400/90 bg-accent-500/10 px-2 py-0.5 rounded-full border border-accent-500/20">
                {bots.length} {bots.length === 1 ? 'bot' : 'bots'}
              </span>
            </div>

            {/* Row of Square Avatar Tiles (matching reference image) */}
            <div className="flex flex-wrap sm:flex-nowrap gap-2.5 overflow-x-auto pb-1 scrollbar-none">
              {bots.map((persona) => {
                const isSelected = selectedLevel === persona.level;

                return (
                  <button
                    key={persona.level}
                    type="button"
                    onClick={() => onSelectBot(persona.level)}
                    className={`group relative flex flex-col items-center p-2 rounded-xl transition-all text-center focus:outline-none shrink-0 ${
                      isSelected
                        ? 'bg-accent-500/15 border-2 border-accent-400 shadow-md shadow-accent-500/20 scale-[1.03]'
                        : 'bg-canvas-card border-2 border-canvas-border hover:border-accent-400/50 hover:bg-canvas-hover'
                    }`}
                    style={{ width: '84px' }}
                    title={`${persona.name} (${persona.gender}) — ${persona.elo} ELO`}
                  >
                    {/* Selected Indicator Ping */}
                    {isSelected && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-accent-500" />
                      </span>
                    )}

                    {/* Small Square Avatar Face */}
                    <div className="rounded-lg overflow-hidden mb-1.5 shadow-sm transition-transform group-hover:scale-105">
                      <PersonaAvatar persona={persona} size={54} />
                    </div>

                    {/* Bot Name */}
                    <span
                      className={`text-xs font-bold leading-tight truncate w-full ${
                        isSelected ? 'text-accent-300' : 'text-ivory group-hover:text-accent-200'
                      }`}
                    >
                      {persona.name.split(' ')[0]}
                    </span>

                    {/* Gender & ELO */}
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px] text-ivory-muted font-mono font-semibold">
                        {persona.elo}
                      </span>
                    </div>

                    <span className="text-[9px] text-accent-400/80 uppercase font-semibold">
                      {persona.gender}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Selected Bot Details Spotlight Card */}
      {selectedPersona && (
        <div className="bg-canvas-card border border-canvas-border rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="rounded-xl overflow-hidden border-2 border-accent-400/60 shadow-md">
              <PersonaAvatar persona={selectedPersona} size={52} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-sm sm:text-base text-ivory">
                  {selectedPersona.name}
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-accent-500/20 text-accent-300 text-[10px] font-mono font-bold border border-accent-500/30">
                  {selectedPersona.elo} ELO
                </span>
                <span className="text-[10px] text-ivory-muted uppercase font-bold">
                  {selectedPersona.gender}
                </span>
              </div>
              <p className="text-xs text-ivory-muted mt-0.5 max-w-lg leading-relaxed">
                {selectedPersona.description}
              </p>
            </div>
          </div>

          {onStartGame && (
            <button
              type="button"
              onClick={() => onStartGame(selectedPersona.level)}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 text-canvas font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all shadow-md shrink-0 active:scale-95"
            >
              <Play className="w-4 h-4 fill-canvas" />
              <span>Play vs {selectedPersona.name.split(' ')[0]}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
