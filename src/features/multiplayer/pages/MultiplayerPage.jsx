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
  ExternalLink,
  Clock,
  ShieldCheck,
  MessageCircle
} from 'lucide-react';
import { isSupabaseConfigured, checkBackendHealth } from '../../../lib/supabase/client';
import { multiplayerApi } from '../services/multiplayerApi';
import { TIME_CONTROLS } from '../../../services/storage/settingsStore';

export function MultiplayerPage() {
  const navigate = useNavigate();

  const [creatorColor, setCreatorColor] = useState('random'); // 'white' | 'black' | 'random'
  const [selectedTimeControl, setSelectedTimeControl] = useState(TIME_CONTROLS[0]);
  const [playerName, setPlayerName] = useState(() => `Player ${Math.floor(100 + Math.random() * 900)}`);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Created room state
  const [createdRoomInfo, setCreatedRoomInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  // Backend Health Diagnostic State
  const [health, setHealth] = useState({ checked: false, ready: false });

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
      setErrorMsg('Supabase is not configured yet. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable multiplayer.');
      return;
    }

    setIsCreating(true);
    setErrorMsg(null);

    try {
      const result = await multiplayerApi.createRoom({
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
    if (!createdRoomInfo?.shareUrl) return;
    if (navigator.share) {
      navigator
        .share({
          title: 'Play Chess with me on Chess-ey!',
          text: 'Play chess with me instantly without registration:',
          url: createdRoomInfo.shareUrl
        })
        .catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  const handleWhatsAppShare = () => {
    if (!createdRoomInfo?.shareUrl) return;
    const msg = encodeURIComponent(
      `Join my chess game on Chess-ey! Play instantly with no login required:\n${createdRoomInfo.shareUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header Banner */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-400 text-xs font-semibold uppercase tracking-wider">
          <Users className="w-3.5 h-3.5" />
          <span>Account-Free Multiplayer</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-ivory tracking-tight">
          Play with a Friend
        </h1>
        <p className="text-ivory-muted text-sm sm:text-base max-w-xl mx-auto">
          Create a room in seconds, share the invitation link via WhatsApp or any app, and start playing immediately without registering or signing in.
        </p>
      </div>

      {/* Supabase Not Configured Warning */}
      {!isSupabaseConfigured && (
        <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-3 shadow-lg">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
            <h3 className="font-bold text-base text-amber-300">Supabase Setup Required</h3>
          </div>
          <p className="text-xs sm:text-sm text-amber-200/90 leading-relaxed">
            Multiplayer requires connecting to your Supabase project. Add your credentials to <code className="px-1.5 py-0.5 rounded bg-black/40 font-mono text-amber-300">.env</code>:
          </p>
          <pre className="p-3 rounded-lg bg-black/50 text-[11px] font-mono text-amber-200 overflow-x-auto border border-amber-500/20">
            {`VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key`}
          </pre>
        </div>
      )}

      {/* Main Container */}
      {!createdRoomInfo ? (
        <div className="p-6 sm:p-8 rounded-3xl bg-canvas-card border border-canvas-border shadow-2xl space-y-6">
          <form onSubmit={handleCreateRoom} className="space-y-6">
            {/* Player Name */}
            <div>
              <label className="block text-xs font-semibold text-ivory-muted uppercase tracking-wider mb-2">
                Your Display Name
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={24}
                required
                className="w-full px-4 py-3 rounded-xl bg-canvas-subtle border border-canvas-border text-ivory placeholder-ivory-faint focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-all font-medium text-sm"
                placeholder="e.g. Magnus"
              />
            </div>

            {/* Side Selection */}
            <div>
              <label className="block text-xs font-semibold text-ivory-muted uppercase tracking-wider mb-2">
                Play As
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'white', label: 'White', icon: '♔', desc: 'Move first' },
                  { id: 'random', label: 'Random', icon: '☯', desc: '50 / 50 chance' },
                  { id: 'black', label: 'Black', icon: '♚', desc: 'Move second' }
                ].map((side) => {
                  const isSelected = creatorColor === side.id;
                  return (
                    <button
                      type="button"
                      key={side.id}
                      onClick={() => setCreatorColor(side.id)}
                      className={`p-4 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                        isSelected
                          ? 'bg-accent-500/15 border-accent-500 text-ivory ring-2 ring-accent-500/30 shadow-lg'
                          : 'bg-canvas-subtle/50 border-canvas-border text-ivory-muted hover:bg-canvas-subtle hover:text-ivory'
                      }`}
                    >
                      <span className="text-2xl leading-none">{side.icon}</span>
                      <span className="text-sm font-bold">{side.label}</span>
                      <span className="text-[10px] text-ivory-faint">{side.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Controls */}
            <div>
              <label className="block text-xs font-semibold text-ivory-muted uppercase tracking-wider mb-2">
                Time Control
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {TIME_CONTROLS.map((tc) => {
                  const isSelected = selectedTimeControl.id === tc.id;
                  return (
                    <button
                      type="button"
                      key={tc.id}
                      onClick={() => setSelectedTimeControl(tc)}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        isSelected
                          ? 'bg-accent-500/15 border-accent-500 text-ivory ring-2 ring-accent-500/30'
                          : 'bg-canvas-subtle/50 border-canvas-border text-ivory-muted hover:bg-canvas-subtle hover:text-ivory'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold text-ivory">
                        <Clock className="w-3.5 h-3.5 text-accent-400" />
                        <span>{tc.label}</span>
                      </div>
                      <div className="text-[11px] text-ivory-faint mt-1">
                        {tc.initialSeconds / 60} min {tc.increment > 0 ? `+ ${tc.increment}s` : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {errorMsg && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs sm:text-sm">
                {errorMsg}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isCreating}
              className="w-full py-4 rounded-2xl bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-canvas font-bold text-base transition-all shadow-xl hover:shadow-accent-500/20 active:scale-[0.99] flex items-center justify-center gap-2"
            >
              {isCreating ? (
                <>
                  <div className="w-5 h-5 border-2 border-canvas border-t-transparent rounded-full animate-spin" />
                  <span>Creating Room...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>Create Room & Get Link</span>
                </>
              )}
            </button>
          </form>
        </div>
      ) : (
        /* Room Created Screen with Instant Share Options */
        <div className="p-6 sm:p-8 rounded-3xl bg-canvas-card border border-canvas-border shadow-2xl space-y-6 animate-fade-in">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-md">
              <Check className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-ivory">Room is Ready!</h2>
            <p className="text-xs sm:text-sm text-ivory-muted max-w-md mx-auto">
              Share this invitation link with your opponent. The game will automatically start the moment they join.
            </p>
          </div>

          {/* Share Link Field */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-ivory-muted uppercase tracking-wider">
              Invitation Link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={createdRoomInfo.shareUrl}
                className="flex-1 px-4 py-3 rounded-xl bg-canvas-subtle border border-canvas-border text-ivory font-mono text-xs select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={`px-4 py-3 rounded-xl border font-semibold text-xs transition-all flex items-center gap-1.5 shrink-0 ${
                  copied
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-canvas-subtle border-canvas-border text-ivory hover:border-ivory/40'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Share Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-md active:scale-[0.99]"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Share on WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={handleNativeShare}
              className="py-3 px-4 rounded-xl bg-canvas-subtle hover:bg-canvas-border border border-canvas-border text-ivory font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              <Share2 className="w-4 h-4 text-accent-400" />
              <span>Share Link</span>
            </button>
          </div>

          {/* Enter Game Button */}
          <div className="pt-4 border-t border-canvas-border/60">
            <button
              type="button"
              onClick={() => navigate(`/play/${createdRoomInfo.roomId}`)}
              className="w-full py-4 rounded-2xl bg-accent-500 hover:bg-accent-400 text-canvas font-bold text-base transition-all shadow-xl hover:shadow-accent-500/20 flex items-center justify-center gap-2 group"
            >
              <span>Enter Room as {createdRoomInfo.playerColor === 'w' ? 'White' : 'Black'}</span>
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      )}

      {/* Features Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
        <div className="p-4 rounded-2xl bg-canvas-card/60 border border-canvas-border/60 space-y-2">
          <div className="text-accent-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Instant Access</span>
          </div>
          <p className="text-xs text-ivory-muted leading-relaxed">
            No signup, password, or verification needed. Anonymous cryptographic sessions protect every match.
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-canvas-card/60 border border-canvas-border/60 space-y-2">
          <div className="text-accent-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Authoritative Engine</span>
          </div>
          <p className="text-xs text-ivory-muted leading-relaxed">
            Every move is validated and atomically committed with chess.js and Postgres rules to prevent cheating.
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-canvas-card/60 border border-canvas-border/60 space-y-2">
          <div className="text-accent-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Realtime Clocks</span>
          </div>
          <p className="text-xs text-ivory-muted leading-relaxed">
            Synchronized clocks with millisecond accuracy and automatic timeout claim detection.
          </p>
        </div>
      </div>
    </div>
  );
}

export default MultiplayerPage;