// Dedicated Multiplayer Room Hook (Rebuild Blueprint 6.4)
// Manages room loading, seat claiming, seat recovery, Realtime presence,
// version-concurrency reconciliation, and server-authoritative move submission.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';
import { supabase, ensureAnonymousAuth, isSupabaseConfigured } from '../../../lib/supabase/client';
import { multiplayerApi } from '../services/multiplayerApi';
import { getSeatRecoveryCredential } from '../services/seatRecovery';
import { isInCheck, isLegalMove } from '../../game/domain/chessRules';
import { reconstructGame } from '../../game/domain/moveHistory';
import { historyStorage } from '../../history/services/historyStorage';
import { soundEngine } from '../../../utils/sound';

export function useMultiplayerRoom(roomId, options = {}) {
  const { inviteToken = '', playerName = 'Player' } = options;

  const [room, setRoom] = useState(null);
  const [playerColor, setPlayerColor] = useState(null); // 'w' | 'b' | null
  const [moves, setMoves] = useState([]);
  const [currentPly, setCurrentPly] = useState(0);

  const [status, setStatus] = useState('loading'); // 'loading' | 'waiting' | 'active' | 'completed' | 'error'
  const [error, setError] = useState(null);
  const [isOpponentOnline, setIsOpponentOnline] = useState(false);

  const [whiteTimeMs, setWhiteTimeMs] = useState(600000);
  const [blackTimeMs, setBlackTimeMs] = useState(600000);

  const channelRef = useRef(null);
  const roomRef = useRef(null);
  roomRef.current = room;

  // 1. Initial Room Load, Seat Claim & Recovery
  useEffect(() => {
    if (!roomId || !isSupabaseConfigured) {
      if (!isSupabaseConfigured) {
        setError('Supabase is not configured in your environment.');
        setStatus('error');
      }
      return;
    }

    let isCancelled = false;

    async function initRoom() {
      setStatus('loading');
      setError(null);

      try {
        const user = await ensureAnonymousAuth();
        if (!user || isCancelled) return;

        // Fetch current room state
        const initialRoom = await multiplayerApi.getRoomState(roomId);
        if (!initialRoom) {
          throw new Error('Room not found or expired.');
        }

        if (isCancelled) return;

        // Check if user already holds a seat
        let assignedColor = null;
        if (initialRoom.white_id === user.id) {
          assignedColor = 'w';
        } else if (initialRoom.black_id === user.id) {
          assignedColor = 'b';
        } else {
          // Attempt seat recovery via stored credential
          const localRecoveryCred = options.recoveryCredential || getSeatRecoveryCredential(roomId);
          const recoveryRes = await multiplayerApi.recoverSeat({
            roomId,
            recoveryCredential: localRecoveryCred
          });
          if (recoveryRes?.success) {
            assignedColor = recoveryRes.playerColor;
          } else if (inviteToken && initialRoom.status === 'waiting') {
            // Join via invite token
            const joinRes = await multiplayerApi.joinRoom({
              roomId,
              inviteToken,
              playerName
            });
            if (joinRes?.room) {
              assignedColor = joinRes.playerColor;
              // Clean URL query after successful join
              if (typeof window !== 'undefined' && window.history?.replaceState) {
                const url = new URL(window.location.href);
                url.searchParams.delete('invite');
                window.history.replaceState({}, document.title, url.toString());
              }
            }
          }
        }

        if (isCancelled) return;

        setPlayerColor(assignedColor);

        // Fetch authoritative moves log
        const canonicalMoves = await multiplayerApi.getRoomMoves(roomId);
        const formattedMoves = (canonicalMoves || []).map((m) => ({
          ply: m.ply,
          from: m.from_sq,
          to: m.to_sq,
          promotion: m.promotion,
          san: m.san,
          fen: m.fen_after,
          turn: m.player_seat,
          moveNumber: Math.floor((m.ply - 1) / 2) + 1
        }));

        setMoves(formattedMoves);
        setCurrentPly(formattedMoves.length);
        setRoom(initialRoom);
        setWhiteTimeMs(initialRoom.white_time_ms ?? 600000);
        setBlackTimeMs(initialRoom.black_time_ms ?? 600000);
        setStatus(initialRoom.status);
      } catch (err) {
        if (!isCancelled) {
          console.error('[useMultiplayerRoom] Room initialization error:', err);
          setError(err.message || 'Failed to initialize multiplayer room.');
          setStatus('error');
        }
      }
    }

    initRoom();

    return () => {
      isCancelled = true;
    };
  }, [roomId, inviteToken, playerName, options.recoveryCredential]);

  // 2. Realtime Channel Subscription (Postgres Changes, Presence, and Authoritative Move Notifications)
  useEffect(() => {
    if (!roomId || !supabase || status === 'error' || status === 'loading') return;

    const channelName = `chess_room_${roomId}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: { key: playerColor || 'spectator' }
      }
    });

    channelRef.current = channel;

    // Presence tracking
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const opponentSeat = playerColor === 'w' ? 'b' : 'w';
        const hasOpponent = Boolean(state[opponentSeat] && state[opponentSeat].length > 0);
        setIsOpponentOnline(hasOpponent);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        const opponentSeat = playerColor === 'w' ? 'b' : 'w';
        if (key === opponentSeat) setIsOpponentOnline(true);
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        const opponentSeat = playerColor === 'w' ? 'b' : 'w';
        if (key === opponentSeat) setIsOpponentOnline(false);
      });

    // Database changes listener on rooms table
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`
      },
      async (payload) => {
        const newRoom = payload.new;
        if (!newRoom) return;

        const currentVersion = roomRef.current?.version || 0;

        // Reconcile version
        if (newRoom.version > currentVersion) {
          setRoom(newRoom);
          setStatus(newRoom.status);
          setWhiteTimeMs(newRoom.white_time_ms ?? 600000);
          setBlackTimeMs(newRoom.black_time_ms ?? 600000);

          // If there is a version gap, refetch all moves to guarantee 100% synchronization
          if (newRoom.version > currentVersion + 1) {
            const freshMoves = await multiplayerApi.getRoomMoves(roomId);
            const formatted = freshMoves.map((m) => ({
              ply: m.ply,
              from: m.from_sq,
              to: m.to_sq,
              promotion: m.promotion,
              san: m.san,
              fen: m.fen_after,
              turn: m.player_seat,
              moveNumber: Math.floor((m.ply - 1) / 2) + 1
            }));
            setMoves(formatted);
            setCurrentPly(formatted.length);
          }
        }
      }
    );

    // Database changes listener on room_moves table (new moves)
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'room_moves',
        filter: `room_id=eq.${roomId}`
      },
      (payload) => {
        const m = payload.new;
        if (!m) return;

        setMoves((prev) => {
          if (prev.some((x) => x.ply === m.ply)) return prev;
          const newMove = {
            ply: m.ply,
            from: m.from_sq,
            to: m.to_sq,
            promotion: m.promotion,
            san: m.san,
            fen: m.fen_after,
            turn: m.player_seat,
            moveNumber: Math.floor((m.ply - 1) / 2) + 1
          };
          const updated = [...prev, newMove].sort((a, b) => a.ply - b.ply);
          setCurrentPly(updated.length);

          try {
            soundEngine.playMove(newMove.san);
          } catch (e) {
            // Ignore sound error
          }

          return updated;
        });
      }
    );

    // Committed Move notification broadcast (received strictly AFTER server authorization)
    channel.on('broadcast', { event: 'committed_move' }, ({ payload }) => {
      if (payload && payload.version) {
        const currentVersion = roomRef.current?.version || 0;
        if (payload.version > currentVersion) {
          setRoom((prev) => ({
            ...prev,
            fen: payload.fen,
            turn: payload.turn,
            version: payload.version,
            status: payload.status || prev?.status,
            winner: payload.winner,
            termination_reason: payload.reason
          }));
          setMoves((prev) => {
            if (prev.some((x) => x.ply === payload.ply)) return prev;
            const newMove = {
              ply: payload.ply,
              from: payload.from,
              to: payload.to,
              promotion: payload.promotion,
              san: payload.san,
              fen: payload.fen,
              turn: payload.ply % 2 === 1 ? 'w' : 'b',
              moveNumber: Math.floor((payload.ply - 1) / 2) + 1
            };
            const updated = [...prev, newMove].sort((a, b) => a.ply - b.ply);
            setCurrentPly(updated.length);

            try {
              soundEngine.playMove(newMove.san);
            } catch (e) {
              // Ignore sound error
            }

            return updated;
          });
        }
      }
    });

    channel.subscribe(async (subStatus) => {
      if (subStatus === 'SUBSCRIBED' && playerColor) {
        await channel.track({
          color: playerColor,
          onlineAt: new Date().toISOString()
        });
      }
    });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, playerColor, status]);

  // 3. Authoritative Clock Countdown (Phase 7.1 & 7.2)
  // Calculates visible countdown using latest authoritative snapshot + actual elapsed time
  // Prevents independent clock drift and automatically triggers timeout adjudication on flag fall.
  useEffect(() => {
    if (status !== 'active' || !room) return;

    const updateClocks = () => {
      const now = Date.now();
      const lastMoveTime = room.last_move_timestamp ? new Date(room.last_move_timestamp).getTime() : now;
      const elapsed = Math.max(0, now - lastMoveTime);

      if (room.turn === 'w') {
        const whiteRemaining = Math.max(0, (room.white_time_ms ?? 600000) - elapsed);
        setWhiteTimeMs(whiteRemaining);
        setBlackTimeMs(room.black_time_ms ?? 600000);

        // Flag fall: opponent (Black) can claim timeout
        if (whiteRemaining === 0 && playerColor === 'b') {
          multiplayerApi.claimTimeout(roomId).catch(() => {});
        }
      } else if (room.turn === 'b') {
        const blackRemaining = Math.max(0, (room.black_time_ms ?? 600000) - elapsed);
        setBlackTimeMs(blackRemaining);
        setWhiteTimeMs(room.white_time_ms ?? 600000);

        // Flag fall: opponent (White) can claim timeout
        if (blackRemaining === 0 && playerColor === 'w') {
          multiplayerApi.claimTimeout(roomId).catch(() => {});
        }
      }
    };

    updateClocks();
    const interval = setInterval(updateClocks, 100);

    return () => clearInterval(interval);
  }, [
    status,
    room?.turn,
    room?.version,
    room?.last_move_timestamp,
    room?.white_time_ms,
    room?.black_time_ms,
    playerColor,
    roomId
  ]);

  // 4. Completed Game Persistence (Phase 7.5)
  // Automatically persists completed matches to local history (IndexedDB/localStorage)
  useEffect(() => {
    if (status !== 'completed' || !room || moves.length === 0) return;

    let pgnStr = '';
    try {
      const reconstructed = reconstructGame(moves);
      pgnStr = reconstructed.pgn || '';
    } catch (e) {}

    historyStorage
      .saveGame({
        id: roomId,
        gameMode: 'multiplayer',
        timestamp: Date.now(),
        white: { name: room.white_name || 'White', isBot: false },
        black: { name: room.black_name || 'Black', isBot: false },
        result:
          room.winner === 'white'
            ? '1-0'
            : room.winner === 'black'
            ? '0-1'
            : room.winner === 'draw'
            ? '1/2-1/2'
            : '*',
        reason: room.termination_reason || 'completed',
        winner: room.winner || 'draw',
        fen: room.fen,
        moves,
        pgn: pgnStr,
        timeControl: {
          initialSeconds: (room.time_control_initial_ms || 600000) / 1000,
          increment: (room.time_control_increment_ms || 0) / 1000
        }
      })
      .catch((e) => console.warn('[useMultiplayerRoom] History persistence warning:', e));
  }, [status, roomId, room?.winner, room?.termination_reason, moves]);

  // Derived Board State
  const isLive = currentPly === moves.length;
  const displayFen = useMemo(() => {
    if (!room) return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    if (currentPly === moves.length) {
      return room.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    }
    if (currentPly === 0) {
      return room.initial_fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    }
    return moves[currentPly - 1]?.fen || room.fen;
  }, [room, moves, currentPly]);

  const lastMove = useMemo(() => {
    if (currentPly === 0 || moves.length === 0) return null;
    const m = moves[currentPly - 1];
    return m ? { from: m.from, to: m.to } : null;
  }, [moves, currentPly]);

  const isCheck = useMemo(() => isInCheck(displayFen), [displayFen]);
  const isMyTurn = Boolean(
    room &&
      room.status === 'active' &&
      playerColor &&
      room.turn === playerColor &&
      isLive
  );

  const isGameOver = room?.status === 'completed';
  const result = useMemo(() => {
    if (!room || room.status !== 'completed') return null;
    return {
      winner: room.winner === 'white' ? 'white' : room.winner === 'black' ? 'black' : 'draw',
      reason: room.termination_reason || 'unknown',
      pgnResult:
        room.winner === 'white'
          ? '1-0'
          : room.winner === 'black'
          ? '0-1'
          : room.winner === 'draw'
          ? '1/2-1/2'
          : '*'
    };
  }, [room]);

  // Make Move Action (Client pre-validation -> Server Authoritative RPC -> Peer Notification)
  // Per Rebuild Blueprint: "Do not broadcast uncommitted moves."
  const makeMove = useCallback(
    async ({ from, to, promotion = 'q' }) => {
      if (!isMyTurn || !room || room.status !== 'active') return false;

      // 1. Client-side pre-validation
      const legal = isLegalMove(room.fen, { from, to, promotion });
      if (!legal) return false;

      const expectedVersion = room.version;
      const currentFen = room.fen;

      try {
        // Submit to authoritative server procedure FIRST
        const response = await multiplayerApi.submitMove({
          roomId,
          from,
          to,
          promotion,
          currentFen,
          expectedVersion
        });

        if (response?.success) {
          // Play sound
          try {
            soundEngine.playMove(response.san);
          } catch (e) {
            // Ignore sound error
          }

          // Broadcast strictly AFTER successful server commit
          if (channelRef.current) {
            channelRef.current.send({
              type: 'broadcast',
              event: 'committed_move',
              payload: {
                ply: response.ply,
                from,
                to,
                promotion,
                san: response.san,
                fen: response.newFen,
                turn: response.turn,
                version: response.version,
                status: response.isGameOver ? 'completed' : room.status,
                winner: response.winner,
                reason: response.reason
              }
            });
          }

          setRoom((prev) => ({
            ...prev,
            fen: response.newFen,
            turn: response.turn,
            version: response.version,
            status: response.isGameOver ? 'completed' : prev.status,
            winner: response.winner,
            termination_reason: response.reason
          }));

          setMoves((prev) => {
            if (prev.some((x) => x.ply === response.ply)) return prev;
            const newMove = {
              ply: response.ply,
              from,
              to,
              promotion,
              san: response.san,
              fen: response.newFen,
              turn: response.ply % 2 === 1 ? 'w' : 'b',
              moveNumber: Math.floor((response.ply - 1) / 2) + 1
            };
            const updated = [...prev, newMove].sort((a, b) => a.ply - b.ply);
            setCurrentPly(updated.length);
            return updated;
          });

          return true;
        }
        return false;
      } catch (err) {
        console.error('[useMultiplayerRoom] Move submission error:', err);
        return false;
      }
    },
    [isMyTurn, room, roomId]
  );

  const resign = useCallback(async () => {
    if (!roomId) return;
    try {
      await multiplayerApi.resignMatch(roomId);
    } catch (e) {
      console.error('[useMultiplayerRoom] Resignation failed:', e);
    }
  }, [roomId]);

  const offerDraw = useCallback(async () => {
    if (!roomId) return;
    try {
      await multiplayerApi.offerDraw(roomId);
    } catch (e) {
      console.error('[useMultiplayerRoom] Offer draw failed:', e);
    }
  }, [roomId]);

  const respondDraw = useCallback(
    async (accept = true) => {
      if (!roomId) return;
      try {
        await multiplayerApi.respondDraw(roomId, accept);
      } catch (e) {
        console.error('[useMultiplayerRoom] Respond draw failed:', e);
      }
    },
    [roomId]
  );

  const claimTimeout = useCallback(async () => {
    if (!roomId) return;
    try {
      await multiplayerApi.claimTimeout(roomId);
    } catch (e) {
      console.error('[useMultiplayerRoom] Claim timeout failed:', e);
    }
  }, [roomId]);

  // Rematch Actions (Phase 7.4)
  const requestRematch = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await multiplayerApi.requestRematch(roomId);
      if (res?.success) {
        setRoom((prev) => ({ ...prev, rematch_offered_by: playerColor }));
      }
      return res;
    } catch (e) {
      console.error('[useMultiplayerRoom] Request rematch error:', e);
      throw e;
    }
  }, [roomId, playerColor]);

  const declineRematch = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await multiplayerApi.declineRematch(roomId);
      if (res?.success) {
        setRoom((prev) => ({ ...prev, rematch_offered_by: null }));
      }
      return res;
    } catch (e) {
      console.error('[useMultiplayerRoom] Decline rematch error:', e);
      throw e;
    }
  }, [roomId]);

  const acceptRematch = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await multiplayerApi.acceptRematch(roomId);
      if (res?.newRoomId) {
        setRoom((prev) => ({ ...prev, rematch_room_id: res.newRoomId }));
      }
      return res;
    } catch (e) {
      console.error('[useMultiplayerRoom] Accept rematch error:', e);
      throw e;
    }
  }, [roomId]);

  return {
    room,
    roomId,
    status,
    error,
    playerColor,
    isMyTurn,
    isOpponentOnline,
    displayFen,
    moves,
    currentPly,
    lastMove,
    isCheck,
    isLive,
    isGameOver,
    result,
    rematchOfferedBy: room?.rematch_offered_by,
    rematchRoomId: room?.rematch_room_id,
    clocks: {
      whiteMs: whiteTimeMs,
      blackMs: blackTimeMs
    },
    players: {
      white: { name: room?.white_name || 'White' },
      black: { name: room?.black_name || 'Black' }
    },

    // Actions
    makeMove,
    resign,
    offerDraw,
    respondDraw,
    claimTimeout,
    requestRematch,
    declineRematch,
    acceptRematch,
    navigatePly: setCurrentPly
  };
}

export default useMultiplayerRoom;
