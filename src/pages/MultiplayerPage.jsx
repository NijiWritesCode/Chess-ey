import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Copy,
  Check,
  Share2,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Database,
  KeyRound,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { isSupabaseConfigured, checkBackendHealth, supabaseProjectRef } from '../services/supabase/supabaseClient';
import { roomService } from '../services/multiplayer/roomService';
import { TIME_CONTROLS } from '../services/storage/settingsStore';
import migrationSql from '../../supabase/migrations/20261026000000_create_chess_rooms.sql?raw';

export function MultiplayerPage() {
  const navigate = useNavigate();

  const [creatorColor, setCreatorColor] = useState('random'); // 'white' | 'black' | 'random'
  const [selectedTimeControl, setSelectedTimeControl] = useState(TIME_CONTROLS[0]);
  const [playerName, setPlayerName] = useState(() => `Player ${Math.floor(100 + Math.random() * 900)}`);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Backend Health Diagnostic State
  const [health, setHealth] = useState({ checked: false, ready: false, authOk: false, tableOk: false, rpcOk: false });
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedNotify, setCopiedNotify] = useState(false);

  // Created room state
  const [createdRoomInfo, setCreatedRoomInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isSupabaseConfigured) {
      checkBackendHealth().then((res) => {
        setHealth({ ...res, checked: true });
      });
    }
  }, []);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase is not configured yet. Follow the setup instructions below to enable multiplayer.');
      return;
    }

    setIsCreating(true);
    setErrorMsg(null);

    try {
      const result = await roomService.createRoom({
        creatorColor,
        timeControl: selectedTimeControl,
        playerName: playerName.trim() || 'Player'
      });

      setCreatedRoomInfo(result);
    } catch (err) {
      console.error('Room creation failure:', err);
      setErrorMsg(err.message || 'Failed to create room.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyLink = () => {
    if (!createdRoomInfo?.shareUrl) return;
    navigator.clipboard.writeText(createdRoomInfo.shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleNativeShare = () => {
    if (navigator.share && createdRoomInfo?.shareUrl) {
      navigator.share({
        title: 'Join my Chess game on Chess-ey!',
        text: 'Play chess with me instantly without registration:',
        url: createdRoomInfo.shareUrl
      }).catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  const handleCopyMigrationSql = async () => {
    navigator.clipboard.writeText(migrationSql).then(() => {
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    });
  };

  const handleCopyNotify = async () => {
    navigator.clipboard.writeText("NOTIFY pgrst, 'reload schema';").then(() => {
      setCopiedNotify(true);
      setTimeout(() => setCopiedNotify(false), 2500);
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      {/* Title */}
      <div className="text-center max-w-xl mx-auto mb-8 space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold border border-blue-500/30">
          <Users className="w-3.5 h-3.5 text-blue-400" />
          <span>Frictionless Friend Matches</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-ivory">Play a Friend</h1>
        <p className="text-sm text-ivory-muted">
          Generate an invitation link. Your opponent clicks to join immediately—no email, password, or sign-up required.
        </p>
      </div>

      {/* Supabase Status / Guidance Banner */}
      {isSupabaseConfigured && health.checked && !health.ready && (
        <div className="mb-8 bg-amber-950/30 border border-amber-600/40 rounded-2xl p-6 text-ivory space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-2 w-full">
              <h3 className="font-bold text-base text-amber-300">
                Finish Enabling Your Supabase Multiplayer
              </h3>
              <p className="text-xs text-ivory-muted leading-relaxed">
                Your project <code className="bg-canvas px-1.5 py-0.5 rounded text-amber-200">https://xxmurbydocawczcqopvi.supabase.co</code> is connected! Just complete these two 1-minute steps in your Supabase dashboard:
              </p>

              <div className="space-y-2.5 pt-2">
                {/* Step 1: Anonymous Auth */}
                <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                  health.authOk
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                    : 'bg-canvas-subtle border-amber-500/30 text-ivory'
                }`}>
                  <div className="flex items-center gap-2.5">
                    {health.authOk ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <div>
                      <span className="font-bold block">1. Enable Anonymous Sign-Ins</span>
                      <span className="text-[11px] text-ivory-muted">
                        In Dashboard &rarr; <strong>Authentication</strong> &rarr; <strong>Providers</strong> &rarr; <strong>Anonymous</strong> &rarr; Toggle <strong>ON</strong> & Save.
                      </span>
                    </div>
                  </div>
                  {health.authOk ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Enabled</span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Required</span>
                  )}
                </div>

                {/* Step 2: Database Schema & RPC Functions */}
                <div className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                  health.tableOk && health.rpcOk
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                    : 'bg-canvas-subtle border-amber-500/30 text-ivory'
                }`}>
                  <div className="flex items-center gap-2.5">
                    {health.tableOk && health.rpcOk ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Database className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <div>
                      <span className="font-bold block">
                        2. {health.tableOk && !health.rpcOk ? 'Refresh PostgREST Schema Cache' : 'Run SQL Migration'}
                      </span>
                      <span className="text-[11px] text-ivory-muted">
                        {health.tableOk && !health.rpcOk
                          ? 'Table exists, but functions need indexing. Run NOTIFY pgrst, \'reload schema\'; or re-run migration.'
                          : 'In Supabase Dashboard \u2192 SQL Editor \u2192 New query \u2192 Paste and click Run.'}
                      </span>
                    </div>
                  </div>

                  {(!health.tableOk || !health.rpcOk) && (
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleCopyMigrationSql}
                        className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs flex items-center gap-1 transition-colors"
                      >
                        {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedSql ? 'Copied SQL!' : 'Copy Migration SQL'}</span>
                      </button>

                      {health.tableOk && !health.rpcOk && (
                        <button
                          type="button"
                          onClick={handleCopyNotify}
                          className="px-2.5 py-1.5 bg-canvas-card hover:bg-canvas-hover border border-canvas-border text-ivory font-bold rounded-lg text-xs flex items-center gap-1 transition-colors"
                        >
                          {copiedNotify ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedNotify ? 'Copied Reload!' : 'Copy Cache Reload'}</span>
                        </button>
                      )}

                      {supabaseProjectRef && (
                        <a
                          href={`https://supabase.com/dashboard/project/${supabaseProjectRef}/sql/new`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs flex items-center gap-1 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>SQL Editor</span>
                        </a>
                      )}
                    </div>
                  )}

                  {health.tableOk && health.rpcOk && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Created & Active</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supabase Ready Indicator */}
      {health.ready && (
        <div className="mb-6 bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-3 flex items-center justify-between text-xs max-w-lg mx-auto">
          <div className="flex items-center gap-2 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold">Supabase Realtime & Anonymous Auth Active</span>
          </div>
          <span className="text-[11px] text-emerald-400/80 font-mono">Ready to Play</span>
        </div>
      )}

      {/* Room Creation or Invitation Screen */}
      {!createdRoomInfo ? (
        <div className="bg-canvas-card border border-canvas-border rounded-2xl p-6 md:p-8 shadow-xl max-w-lg mx-auto">
          <form onSubmit={handleCreateRoom} className="space-y-6">
            {/* Display Name */}
            <div>
              <label className="text-xs font-semibold text-ivory-muted block mb-2">
                Your Display Name (Optional)
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={24}
                placeholder="e.g. Knight 42"
                className="w-full bg-canvas-subtle border border-canvas-border rounded-xl px-4 py-2.5 text-sm text-ivory placeholder-ivory-faint focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
              />
            </div>

            {/* Choose Side */}
            <div>
              <label className="text-xs font-semibold text-ivory-muted block mb-2">
                Your Piece Color
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { id: 'white', label: 'White', symbol: '♔' },
                  { id: 'random', label: 'Random', symbol: '☯' },
                  { id: 'black', label: 'Black', symbol: '♚' }
                ].map(({ id, label, symbol }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setCreatorColor(id)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                      creatorColor === id
                        ? 'border-accent-500 bg-accent-500/15 text-accent-200'
                        : 'border-canvas-border bg-canvas-subtle hover:bg-canvas-hover text-ivory-muted'
                    }`}
                  >
                    <span className="text-2xl leading-none select-none mb-1">{symbol}</span>
                    <span className="text-xs font-semibold">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Time Control */}
            <div>
              <label className="text-xs font-semibold text-ivory-muted block mb-2">
                Time Control
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TIME_CONTROLS.map((tc) => (
                  <button
                    key={tc.id}
                    type="button"
                    onClick={() => setSelectedTimeControl(tc)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      selectedTimeControl.id === tc.id
                        ? 'border-accent-500 bg-accent-500/15 text-accent-200'
                        : 'border-canvas-border bg-canvas-subtle hover:bg-canvas-hover text-ivory-muted'
                    }`}
                  >
                    <span className="text-xs font-bold text-ivory block">{tc.name}</span>
                    <span className="text-[10px] text-ivory-muted">{tc.category}</span>
                  </button>
                ))}
              </div>
            </div>

            {errorMsg && (
              <div className="p-3.5 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-200 space-y-2.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span className="font-semibold">{errorMsg}</span>
                </div>

                {(errorMsg.includes('schema cache') || errorMsg.includes('create_chess_room') || errorMsg.includes('Stored Procedure')) && (
                  <div className="pt-2 border-t border-red-500/20 space-y-2">
                    <p className="text-[11px] text-red-300">
                      PostgREST has not loaded the stored procedures into its cache yet. Run the migration or refresh the cache:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopyMigrationSql}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs flex items-center gap-1 transition-colors"
                      >
                        {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedSql ? 'Copied SQL!' : 'Copy Migration SQL'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyNotify}
                        className="px-2.5 py-1 bg-canvas-card hover:bg-canvas-hover border border-canvas-border text-ivory font-bold rounded-lg text-xs flex items-center gap-1 transition-colors"
                      >
                        {copiedNotify ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedNotify ? 'Copied Reload!' : 'Copy Cache Reload'}</span>
                      </button>
                      {supabaseProjectRef && (
                        <a
                          href={`https://supabase.com/dashboard/project/${supabaseProjectRef}/sql/new`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs flex items-center gap-1 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open SQL Editor</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isCreating}
              className="w-full py-3.5 bg-accent-600 hover:bg-accent-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Generating Secure Match...</span>
                </>
              ) : (
                <>
                  <span>Create Match & Generate Link</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      ) : (
        /* Invitation Share Screen */
        <div className="bg-canvas-card border border-canvas-border rounded-2xl p-6 md:p-8 shadow-xl max-w-lg mx-auto text-center space-y-6">
          <div className="w-14 h-14 mx-auto rounded-full bg-accent-600/30 border border-accent-500/50 flex items-center justify-center text-accent-300">
            <Sparkles className="w-7 h-7 text-accent-400 animate-pulse" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-ivory">Match Room Ready!</h2>
            <p className="text-xs text-ivory-muted mt-1">
              Share this secure link with your friend to start playing.
            </p>
          </div>

          {/* Invitation URL Box */}
          <div className="bg-canvas-subtle border border-canvas-border rounded-xl p-3 flex items-center justify-between gap-2">
            <input
              type="text"
              readOnly
              value={createdRoomInfo.shareUrl}
              className="bg-transparent text-xs font-mono text-ivory-muted select-all w-full focus:outline-none"
            />
            <button
              onClick={handleCopyLink}
              className="p-2 rounded-lg bg-accent-600 hover:bg-accent-500 text-white shrink-0 transition-colors"
              title="Copy Link"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleNativeShare}
              className="flex-1 py-2.5 px-4 bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-ivory rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5 text-blue-400" />
              <span>Share Link</span>
            </button>

            <button
              onClick={() => navigate(`/play/${createdRoomInfo.roomId}?invite=${createdRoomInfo.inviteToken}`)}
              className="flex-1 py-2.5 px-4 bg-accent-600 hover:bg-accent-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-md"
            >
              <span>Enter Room</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="pt-2 border-t border-canvas-border/50 text-[11px] text-ivory-faint flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Cryptographically signed 256-bit token &bull; Protected seats</span>
          </div>
        </div>
      )}
    </div>
  );
}

