import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, BrowserRouter } from 'react-router-dom';
import { useMultiplayerRoom } from '../../features/multiplayer/hooks/useMultiplayerRoom';
import { multiplayerApi } from '../../features/multiplayer/services/multiplayerApi';
import { storeSeatRecoveryCredential } from '../../features/multiplayer/services/seatRecovery';
import { supabase } from '../../lib/supabase/client';
import { MultiplayerPage } from '../../features/multiplayer/pages/MultiplayerPage';
import { MultiplayerRoomPage } from '../../features/multiplayer/pages/MultiplayerRoomPage';

describe('Phase 6: Multiplayer Gameplay and Realtime Synchronization', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();

    if (supabase && supabase.auth) {
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { user: { id: 'mock-user-w' } } },
        error: null
      });
      vi.spyOn(supabase.auth, 'signInAnonymously').mockResolvedValue({
        data: { user: { id: 'mock-user-w' } },
        error: null
      });
    }

    // Mock supabase channel
    if (supabase && supabase.channel) {
      vi.spyOn(supabase, 'channel').mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn((cb) => {
          if (cb) cb('SUBSCRIBED');
          return { unsubscribe: vi.fn() };
        }),
        track: vi.fn().mockResolvedValue('ok'),
        send: vi.fn().mockResolvedValue('ok'),
        presenceState: vi.fn().mockReturnValue({
          b: [{ color: 'b', onlineAt: new Date().toISOString() }]
        })
      });
    }

    if (supabase && supabase.removeChannel) {
      vi.spyOn(supabase, 'removeChannel').mockReturnValue({});
    }
  });

  describe('6.1 & 6.2: Room Creation and Join Initialization', () => {
    it('creates room and generates valid shareable URL with invite token', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: {
          success: true,
          roomId: 'room-12345',
          playerColor: 'w',
          room: {
            id: 'room-12345',
            status: 'waiting',
            turn: 'w',
            white_id: 'mock-user-w',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            version: 0
          }
        },
        error: null
      });

      const result = await multiplayerApi.createRoom({
        creatorColor: 'white',
        timeControl: { initialSeconds: 600, increment: 0 },
        playerName: 'Alice'
      });

      expect(result.roomId).toBe('room-12345');
      expect(result.playerColor).toBe('w');
      expect(result.shareUrl).toContain('/play/room-12345?invite=');
      expect(result.inviteToken).toBeTruthy();
    });

    it('initializes useMultiplayerRoom and assigns player seat based on user id', async () => {
      vi.spyOn(multiplayerApi, 'getRoomState').mockResolvedValue({
        id: 'room-12345',
        white_id: 'mock-user-w',
        black_id: 'mock-user-b',
        white_name: 'Alice',
        black_name: 'Bob',
        status: 'active',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        version: 0,
        white_time_ms: 600000,
        black_time_ms: 600000
      });

      vi.spyOn(multiplayerApi, 'getRoomMoves').mockResolvedValue([]);

      const { result } = renderHook(() => useMultiplayerRoom('room-12345'));

      await waitFor(() => {
        expect(result.current.status).toBe('active');
      });

      expect(result.current.playerColor).toBe('w');
      expect(result.current.isMyTurn).toBe(true);
      expect(result.current.moves.length).toBe(0);
      expect(result.current.displayFen).toContain('rnbqkbnr');
    });

    it('recovers player seat via stored credential if user id is anonymous/unmatched', async () => {
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { user: { id: 'unmatched-anon-user' } } },
        error: null
      });

      vi.spyOn(multiplayerApi, 'getRoomState').mockResolvedValue({
        id: 'room-rec-999',
        white_id: 'prev-anon-id',
        black_id: 'other-player-id',
        white_name: 'Alice',
        black_name: 'Bob',
        status: 'active',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        version: 0
      });

      vi.spyOn(multiplayerApi, 'recoverSeat').mockResolvedValue({
        success: true,
        roomId: 'room-rec-999',
        playerColor: 'w',
        playerName: 'Alice'
      });

      vi.spyOn(multiplayerApi, 'getRoomMoves').mockResolvedValue([]);

      const { result } = renderHook(() =>
        useMultiplayerRoom('room-rec-999', { recoveryCredential: 'stored-token-123' })
      );

      await waitFor(() => {
        expect(result.current.status).toBe('active');
      });

      expect(result.current.playerColor).toBe('w');
    });
  });

  describe('6.3 & 6.4: Authoritative Move Submission & Realtime Version Reconciliation', () => {
    it('enforces turn permissions: rejects moves when isMyTurn is false', async () => {
      vi.spyOn(multiplayerApi, 'getRoomState').mockResolvedValue({
        id: 'room-test-turn',
        white_id: 'mock-user-w',
        black_id: 'mock-user-b',
        status: 'active',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        turn: 'b', // Black's turn!
        version: 1
      });

      vi.spyOn(multiplayerApi, 'getRoomMoves').mockResolvedValue([]);
      const submitSpy = vi.spyOn(multiplayerApi, 'submitMove');

      const { result } = renderHook(() => useMultiplayerRoom('room-test-turn'));

      await waitFor(() => {
        expect(result.current.playerColor).toBe('w');
      });

      expect(result.current.isMyTurn).toBe(false);

      // Attempt moving white pawn on black's turn
      let moveResult;
      await act(async () => {
        moveResult = await result.current.makeMove({ from: 'd2', to: 'd4' });
      });

      expect(moveResult).toBe(false);
      expect(submitSpy).not.toHaveBeenCalled();
    });

    it('submits legal moves to authoritative server and commits confirmed version', async () => {
      vi.spyOn(multiplayerApi, 'getRoomState').mockResolvedValue({
        id: 'room-move-submit',
        white_id: 'mock-user-w',
        black_id: 'mock-user-b',
        status: 'active',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        version: 0
      });

      vi.spyOn(multiplayerApi, 'getRoomMoves').mockResolvedValue([]);

      const newFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      vi.spyOn(multiplayerApi, 'submitMove').mockResolvedValue({
        success: true,
        version: 1,
        ply: 1,
        newFen,
        san: 'e4',
        turn: 'b',
        isGameOver: false,
        winner: null,
        reason: null
      });

      const { result } = renderHook(() => useMultiplayerRoom('room-move-submit'));

      await waitFor(() => {
        expect(result.current.isMyTurn).toBe(true);
      });

      let moveResult;
      await act(async () => {
        moveResult = await result.current.makeMove({ from: 'e2', to: 'e4' });
      });

      expect(moveResult).toBe(true);
      expect(result.current.room.version).toBe(1);
      expect(result.current.room.turn).toBe('b');
      expect(result.current.displayFen).toBe(newFen);
      expect(result.current.moves.length).toBe(1);
      expect(result.current.moves[0].san).toBe('e4');
    });

    it('refetches authoritative canonical moves when a version gap is detected', async () => {
      let postgresChangeCallback;
      vi.spyOn(supabase, 'channel').mockReturnValue({
        on: vi.fn((type, filter, cb) => {
          if (type === 'postgres_changes' && filter.table === 'rooms') {
            postgresChangeCallback = cb;
          }
          return { on: vi.fn().mockReturnThis(), subscribe: vi.fn((scb) => scb && scb('SUBSCRIBED')) };
        }),
        subscribe: vi.fn((cb) => {
          if (cb) cb('SUBSCRIBED');
          return { unsubscribe: vi.fn() };
        }),
        track: vi.fn().mockResolvedValue('ok'),
        send: vi.fn().mockResolvedValue('ok'),
        presenceState: vi.fn().mockReturnValue({})
      });

      vi.spyOn(multiplayerApi, 'getRoomState').mockResolvedValue({
        id: 'room-gap',
        white_id: 'mock-user-w',
        black_id: 'mock-user-b',
        status: 'active',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        version: 0
      });

      vi.spyOn(multiplayerApi, 'getRoomMoves').mockResolvedValueOnce([]).mockResolvedValueOnce([
        { ply: 1, from_sq: 'e2', to_sq: 'e4', promotion: null, san: 'e4', fen_after: '...', player_seat: 'w' },
        { ply: 2, from_sq: 'e7', to_sq: 'e5', promotion: null, san: 'e5', fen_after: '...', player_seat: 'b' }
      ]);

      const { result } = renderHook(() => useMultiplayerRoom('room-gap'));

      await waitFor(() => {
        expect(result.current.status).toBe('active');
      });

      expect(result.current.room.version).toBe(0);

      // Simulate a multi-version jump (version jump from 0 to 2)
      await act(async () => {
        if (postgresChangeCallback) {
          await postgresChangeCallback({
            new: {
              id: 'room-gap',
              version: 2, // version gap > 1
              status: 'active',
              fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
              turn: 'w',
              white_time_ms: 590000,
              black_time_ms: 595000
            }
          });
        }
      });

      expect(result.current.room.version).toBe(2);
      expect(result.current.moves.length).toBe(2);
      expect(result.current.moves[0].san).toBe('e4');
      expect(result.current.moves[1].san).toBe('e5');
    });

    it('dispatches resignation and draw negotiations cleanly', async () => {
      vi.spyOn(multiplayerApi, 'getRoomState').mockResolvedValue({
        id: 'room-actions',
        white_id: 'mock-user-w',
        black_id: 'mock-user-b',
        status: 'active',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        version: 0
      });

      vi.spyOn(multiplayerApi, 'getRoomMoves').mockResolvedValue([]);
      const resignSpy = vi.spyOn(multiplayerApi, 'resignMatch').mockResolvedValue({ success: true });
      const drawSpy = vi.spyOn(multiplayerApi, 'offerDraw').mockResolvedValue({ success: true });
      const respondDrawSpy = vi.spyOn(multiplayerApi, 'respondDraw').mockResolvedValue({ success: true });

      const { result } = renderHook(() => useMultiplayerRoom('room-actions'));

      await waitFor(() => {
        expect(result.current.status).toBe('active');
      });

      await act(async () => {
        await result.current.offerDraw();
      });
      expect(drawSpy).toHaveBeenCalledWith('room-actions');

      await act(async () => {
        await result.current.respondDraw(true);
      });
      expect(respondDrawSpy).toHaveBeenCalledWith('room-actions', true);

      await act(async () => {
        await result.current.resign();
      });
      expect(resignSpy).toHaveBeenCalledWith('room-actions');
    });
  });

  describe('6.5: UI Presentation and Waiting Screen', () => {
    it('renders MultiplayerPage with form inputs and options', () => {
      render(
        <BrowserRouter>
          <MultiplayerPage />
        </BrowserRouter>
      );

      expect(screen.getByText(/Play with a Friend/i)).toBeInTheDocument();
      expect(screen.getByText(/Create Room & Get Link/i)).toBeInTheDocument();
      expect(screen.getByText(/White/i)).toBeInTheDocument();
      expect(screen.getByText(/Random/i)).toBeInTheDocument();
      expect(screen.getByText(/Black/i)).toBeInTheDocument();
    });

    it('renders MultiplayerRoomPage in waiting state with invite share tools', async () => {
      vi.spyOn(multiplayerApi, 'getRoomState').mockResolvedValue({
        id: 'room-wait-test',
        white_id: 'mock-user-w',
        black_id: null,
        white_name: 'Alice',
        black_name: null,
        status: 'waiting',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        version: 0
      });

      vi.spyOn(multiplayerApi, 'getRoomMoves').mockResolvedValue([]);

      render(
        <MemoryRouter initialEntries={['/play/room-wait-test']}>
          <Routes>
            <Route path="/play/:roomId" element={<MultiplayerRoomPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Waiting for Opponent/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/White \(Move first\)/i)).toBeInTheDocument();
      expect(screen.getByText(/WhatsApp/i)).toBeInTheDocument();
      expect(screen.getByText(/Copy/i)).toBeInTheDocument();
    });
  });
});
