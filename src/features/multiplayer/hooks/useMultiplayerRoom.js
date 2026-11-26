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
  const localBcRef = useRef(null);
  const roomRef = useRef(null);
  roomRef.current = room;

  // 1. Initial Room Load, Seat Claim & Recovery
  useEffect(() => {
    if (!roomId) return;

    // Handle Local Dual-Tab rooms via BroadcastChannel, Storage Events, & LocalStorage
    if (roomId.startsWith('local_')) {
      const localKey = `chessey_local_room_${roomId}`;
      let roomData = null;
      try {
        const raw = localStorage.getItem(localKey);
        if (raw) roomData = JSON.parse(raw);
      } catch (e) {}

      if (!roomData) {
        setError('Local room not found.');
        setStatus('error');
        return;
      }

      const sessionSeatKey = `chessey_local_seat_${roomId}`;
      let assignedColor = null;
      try {
        assignedColor = sessionStorage.getItem(sessionSeatKey);
      } catch (e) {}

      // If user joined and opposite seat is free:
      if (!assignedColor) {
        const creatorSeat = roomData.white_id === 'local_creator' ? 'w' : (roomData.black_id === 'local_creator' ? 'b' : null);
        const openSeat = !roomData.white_id ? 'w' : (!roomData.black_id ? 'b' : null);

        // If this tab opened with an invite token OR is a second tab joining an open seat:
        if ((inviteToken || openSeat) && openSeat && creatorSeat && openSeat !== creatorSeat) {
          const joinSeat = openSeat;
          if (joinSeat === 'b') {
            roomData.black_id = 'local_opponent';
            roomData.black_name = playerName || 'Friend';
          } else {
            roomData.white_id = 'local_opponent';
            roomData.white_name = playerName || 'Friend';
          }
          roomData.status = 'active';
          if (!roomData.last_move_timestamp) {
            roomData.last_move_timestamp = new Date().toISOString();
          }
          try {
            localStorage.setItem(localKey, JSON.stringify(roomData));
            sessionStorage.setItem(sessionSeatKey, joinSeat);
          } catch (e) {}
          assignedColor = joinSeat;
        } else {
          assignedColor = creatorSeat || 'w';
          try {
            sessionStorage.setItem(sessionSeatKey, assignedColor);
          } catch (e) {}
        }
      }

      if (roomData.white_id && roomData.black_id) {
        setIsOpponentOnline(true);
      }

      setPlayerColor(assignedColor);
      setRoom(roomData);
      setStatus(roomData.status);
      setWhiteTimeMs(roomData.white_time_ms || 600000);
      setBlackTimeMs(roomData.black_time_ms || 600000);

      const movesKey = `chessey_local_moves_${roomId}`;
      let savedMoves = [];
      try {
        const rawMoves = localStorage.getItem(movesKey);
        if (rawMoves) savedMoves = JSON.parse(rawMoves);
      } catch (e) {}
      setMoves(savedMoves);
      setCurrentPly(savedMoves.length);

      const bc = new BroadcastChannel(`chessey_channel_${roomId}`);
      localBcRef.current = bc;

      bc.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg) return;
        if (msg.type === 'presence') {
          setIsOpponentOnline(true);
        } else if (msg.type === 'join') {
          setIsOpponentOnline(true);
          setRoom(msg.room);
          setStatus(msg.room.status);
        } else if (msg.type === 'move') {
          setRoom((prev) => ({
            ...prev,
            fen: msg.fen,
            turn: msg.turn,
            version: msg.version,
            status: msg.isGameOver ? 'completed' : prev?.status,
            winner: msg.winner,
            termination_reason: msg.reason
          }));
          setMoves((prev) => {
            if (prev.some((x) => x.ply === msg.move.ply)) return prev;
            return [...prev, msg.move].sort((a, b) => a.ply - b.ply);
          });
          setCurrentPly((prev) => prev + 1);
          try {
            soundEngine.playMove(msg.move.san);
          } catch (e) {}
        } else if (msg.type === 'resign') {
          setRoom((prev) => ({
            ...prev,
            status: 'completed',
            winner: msg.winner,
            termination_reason: 'resignation'
          }));
          setStatus('completed');
        } else if (msg.type === 'timeout') {
          setRoom((prev) => ({
            ...prev,
            status: 'completed',
            winner: msg.winner,
            termination_reason: 'timeout'
          }));
          setStatus('completed');
        } else if (msg.type === 'draw_accepted') {
          setRoom((prev) => ({
            ...prev,
            status: 'completed',
            winner: 'draw',
            termination_reason: 'draw'
          }));
          setStatus('completed');
        } else if (msg.type === 'rematch_request') {
          setRoom((prev) => ({ ...prev, rematch_offered_by: msg.color }));
        } else if (msg.type === 'rematch_declined') {
          setRoom((prev) => ({ ...prev, rematch_offered_by: null }));
        } else if (msg.type === 'rematch_accepted') {
          setRoom((prev) => ({ ...prev, rematch_room_id: msg.nextRoomId }));
        }
      };

      // Cross-Window Storage Event Synchronization
      const handleStorageEvent = (e) => {
        if (!e.key) return;
        if (e.key === localKey && e.newValue) {
          try {
            const updated = JSON.parse(e.newValue);
            if (updated) {
              setRoom((prev) => {
                if (!prev || (updated.version || 0) >= (prev.version || 0)) {
                  return updated;
                }
                return prev;
              });
              setStatus(updated.status);
              if (updated.white_id && updated.black_id) {
                setIsOpponentOnline(true);
              }
            }
          } catch (err) {}
        }
        if (e.key === movesKey && e.newValue) {
          try {
            const updatedMoves = JSON.parse(e.newValue);
            if (Array.isArray(updatedMoves)) {
              setMoves((prev) => {
                if (updatedMoves.length > prev.length) {
                  const last = updatedMoves[updatedMoves.length - 1];
                  if (last?.san) {
                    try {
                      soundEngine.playMove(last.san);
                    } catch (err) {}
                  }
                  setCurrentPly(updatedMoves.length);
                  return updatedMoves;
                }
                return prev;
              });
            }
          } catch (err) {}
        }
      };
      window.addEventListener('storage', handleStorageEvent);

      // Periodic safety reconciliation polling (every 300ms)
      const syncPollTimer = setInterval(() => {
        try {
          const raw = localStorage.getItem(localKey);
          if (raw) {
            const stored = JSON.parse(raw);
            if (stored) {
              if (stored.version !== roomRef.current?.version || stored.status !== roomRef.current?.status) {
                setRoom(stored);
                setStatus(stored.status);
              }
              if (stored.white_id && stored.black_id) {
                setIsOpponentOnline(true);
              }
            }
          }
          const rawMoves = localStorage.getItem(movesKey);
          if (rawMoves) {
            const storedMoves = JSON.parse(rawMoves);
            if (Array.isArray(storedMoves)) {
              setMoves((prev) => {
                if (storedMoves.length !== prev.length) {
                  setCurrentPly(storedMoves.length);
                  return storedMoves;
                }
                return prev;
              });
            }
          }
        } catch (err) {}
      }, 300);

      bc.postMessage({ type: 'presence' });
      const pingTimer = setInterval(() => {
        try {
          bc.postMessage({ type: 'presence' });
        } catch (e) {}
      }, 1000);

      if (inviteToken || (roomData.white_id && roomData.black_id)) {
        bc.postMessage({ type: 'join', room: roomData });
      }

      return () => {
        clearInterval(pingTimer);
        clearInterval(syncPollTimer);
        window.removeEventListener('storage', handleStorageEvent);
        try {
          bc.close();
        } catch (e) {}
        localBcRef.current = null;
      };
    }

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured in your environment.');
      setStatus('error');
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
        const now = Date.now();
        const lastMoveTime = initialRoom.last_move_timestamp
          ? new Date(initialRoom.last_move_timestamp).getTime()
          : now;
        const elapsed = initialRoom.status === 'active' ? Math.max(0, now - lastMoveTime) : 0;

        const initialWhiteMs =
          initialRoom.turn === 'w'
            ? Math.max(0, (initialRoom.white_time_ms ?? 600000) - elapsed)
            : initialRoom.white_time_ms ?? 600000;
        const initialBlackMs =
          initialRoom.turn === 'b'
            ? Math.max(0, (initialRoom.black_time_ms ?? 600000) - elapsed)
            : initialRoom.black_time_ms ?? 600000;

        setRoom(initialRoom);
        setWhiteTimeMs(initialWhiteMs);
        setBlackTimeMs(initialBlackMs);
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
    if (!roomId || roomId.startsWith('local_') || !supabase || status === 'error' || status === 'loading') return;

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

      // 2. Handle Local Dual-Tab room
      if (roomId.startsWith('local_')) {
        try {
          const chess = new Chess(room.fen);
          const m = chess.move({ from, to, promotion: promotion || 'q' });
          if (!m) return false;

          const newFen = chess.fen();
          const isGameOver = chess.isGameOver();
          let winner = null;
          let reason = null;
          if (isGameOver) {
            if (chess.isCheckmate()) {
              winner = playerColor === 'w' ? 'white' : 'black';
              reason = 'checkmate';
            } else {
              winner = 'draw';
              reason = 'draw';
            }
          }

          const newPly = moves.length + 1;
          const moveRecord = {
            ply: newPly,
            from: m.from,
            to: m.to,
            promotion: m.promotion || 'q',
            san: m.san,
            fen: newFen,
            turn: playerColor,
            moveNumber: Math.floor((newPly - 1) / 2) + 1
          };

          const now = Date.now();
          const lastTime = room.last_move_timestamp ? new Date(room.last_move_timestamp).getTime() : now;
          const elapsed = Math.max(0, now - lastTime);
          const inc = room.time_control_increment_ms || 0;

          let newWhiteTime = room.white_time_ms ?? 600000;
          let newBlackTime = room.black_time_ms ?? 600000;
          if (playerColor === 'w') {
            newWhiteTime = Math.max(0, newWhiteTime - elapsed) + inc;
          } else {
            newBlackTime = Math.max(0, newBlackTime - elapsed) + inc;
          }

          const updatedRoom = {
            ...room,
            fen: newFen,
            turn: playerColor === 'w' ? 'b' : 'w',
            version: (room.version || 1) + 1,
            status: isGameOver ? 'completed' : 'active',
            white_time_ms: newWhiteTime,
            black_time_ms: newBlackTime,
            last_move_timestamp: new Date().toISOString(),
            winner,
            termination_reason: reason
          };

          setRoom(updatedRoom);
          const updatedMoves = [...moves, moveRecord];
          setMoves(updatedMoves);
          setCurrentPly(updatedMoves.length);

          try {
            localStorage.setItem(`chessey_local_room_${roomId}`, JSON.stringify(updatedRoom));
            localStorage.setItem(`chessey_local_moves_${roomId}`, JSON.stringify(updatedMoves));
          } catch (e) {}

          try {
            soundEngine.playMove(m.san);
          } catch (e) {}

          if (localBcRef.current) {
            try {
              localBcRef.current.postMessage({
                type: 'move',
                move: moveRecord,
                fen: newFen,
                turn: updatedRoom.turn,
                version: updatedRoom.version,
                isGameOver,
                winner,
                reason
              });
            } catch (e) {}
          }
          return true;
        } catch (e) {
          console.error('[useMultiplayerRoom] Local move error:', e);
          return false;
        }
      }

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
    if (roomId.startsWith('local_')) {
      const winner = playerColor === 'w' ? 'black' : 'white';
      const updatedRoom = {
        ...room,
        status: 'completed',
        winner,
        termination_reason: 'resignation',
        result: { winner, reason: 'resignation' }
      };
      setRoom(updatedRoom);
      setStatus('completed');
      try {
        localStorage.setItem(`chessey_local_room_${roomId}`, JSON.stringify(updatedRoom));
      } catch (e) {}
      if (localBcRef.current) {
        try {
          localBcRef.current.postMessage({ type: 'resign', winner });
        } catch (e) {}
      }
      return;
    }
    try {
      const res = await multiplayerApi.resignMatch(roomId);
      if (res?.success || res) {
        setRoom((prev) =>
          prev
            ? {
                ...prev,
                status: 'completed',
                winner: playerColor === 'w' ? 'black' : 'white',
                termination_reason: 'resignation',
                result: { winner: playerColor === 'w' ? 'black' : 'white', reason: 'resignation' }
              }
            : prev
        );
      }
    } catch (e) {
      console.error('[useMultiplayerRoom] Resignation failed:', e);
    }
  }, [roomId, playerColor, room]);

  const offerDraw = useCallback(async () => {
    if (!roomId) return;
    if (roomId.startsWith('local_')) {
      if (localBcRef.current) {
        try {
          localBcRef.current.postMessage({ type: 'draw_offer', color: playerColor });
        } catch (e) {}
      }
      return;
    }
    try {
      await multiplayerApi.offerDraw(roomId);
    } catch (e) {
      console.error('[useMultiplayerRoom] Offer draw failed:', e);
    }
  }, [roomId, playerColor]);

  const respondDraw = useCallback(
    async (accept = true) => {
      if (!roomId) return;
      if (roomId.startsWith('local_')) {
        if (accept) {
          const updatedRoom = {
            ...room,
            status: 'completed',
            winner: 'draw',
            termination_reason: 'draw',
            result: { winner: 'draw', reason: 'draw' }
          };
          setRoom(updatedRoom);
          setStatus('completed');
          try {
            localStorage.setItem(`chessey_local_room_${roomId}`, JSON.stringify(updatedRoom));
          } catch (e) {}
          if (localBcRef.current) {
            try {
              localBcRef.current.postMessage({ type: 'draw_accepted' });
            } catch (e) {}
          }
        }
        return;
      }
      try {
        await multiplayerApi.respondDraw(roomId, accept);
      } catch (e) {
        console.error('[useMultiplayerRoom] Respond draw failed:', e);
      }
    },
    [roomId, room]
  );

  const claimTimeout = useCallback(async () => {
    if (!roomId) return;
    if (roomId.startsWith('local_')) {
      const winner = playerColor === 'w' ? 'white' : 'black';
      const updatedRoom = {
        ...room,
        status: 'completed',
        winner,
        termination_reason: 'timeout',
        result: { winner, reason: 'timeout' }
      };
      setRoom(updatedRoom);
      setStatus('completed');
      try {
        localStorage.setItem(`chessey_local_room_${roomId}`, JSON.stringify(updatedRoom));
      } catch (e) {}
      if (localBcRef.current) {
        try {
          localBcRef.current.postMessage({ type: 'timeout', winner });
        } catch (e) {}
      }
      return;
    }
    try {
      await multiplayerApi.claimTimeout(roomId);
    } catch (e) {
      console.error('[useMultiplayerRoom] Claim timeout failed:', e);
    }
  }, [roomId, playerColor, room]);

  // Rematch Actions (Phase 7.4)
  const requestRematch = useCallback(async () => {
    if (!roomId) return;
    if (roomId.startsWith('local_')) {
      setRoom((prev) => ({ ...prev, rematch_offered_by: playerColor }));
      if (localBcRef.current) {
        try {
          localBcRef.current.postMessage({ type: 'rematch_request', color: playerColor });
        } catch (e) {}
      }
      return { success: true };
    }
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
    if (roomId.startsWith('local_')) {
      setRoom((prev) => ({ ...prev, rematch_offered_by: null }));
      if (localBcRef.current) {
        try {
          localBcRef.current.postMessage({ type: 'rematch_declined' });
        } catch (e) {}
      }
      return { success: true };
    }
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
    if (roomId.startsWith('local_')) {
      const newRoom = multiplayerApi.createLocalRoom({
        whiteName: room?.black_name || 'Player 1',
        blackName: room?.white_name || 'Player 2',
        initialSeconds: (room?.time_control_initial_ms || 600000) / 1000,
        increment: (room?.time_control_increment_ms || 0) / 1000
      });
      setRoom((prev) => ({ ...prev, rematch_room_id: newRoom.roomId }));
      if (localBcRef.current) {
        try {
          localBcRef.current.postMessage({ type: 'rematch_accepted', nextRoomId: newRoom.roomId });
        } catch (e) {}
      }
      return { success: true, newRoomId: newRoom.roomId };
    }
    try {
      const res = await multiplayerApi.acceptRematch(roomId);
      const newRoomId = res?.newRoomId || res?.new_room_id;
      if (newRoomId) {
        setRoom((prev) => ({ ...prev, rematch_room_id: newRoomId }));
      }
      return res;
    } catch (e) {
      console.error('[useMultiplayerRoom] Accept rematch error:', e);
      throw e;
    }
  }, [roomId, room]);

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
