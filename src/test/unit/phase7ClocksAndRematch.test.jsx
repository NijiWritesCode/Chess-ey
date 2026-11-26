import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useMultiplayerRoom } from '../../features/multiplayer/hooks/useMultiplayerRoom';
import { multiplayerApi } from '../../features/multiplayer/services/multiplayerApi';
import { historyStorage } from '../../features/history/services/historyStorage';
import { supabase } from '../../lib/supabase/client';
import { MultiplayerRoomPage } from '../../features/multiplayer/pages/MultiplayerRoomPage';

describe('Phase 7: Clocks, Game Lifecycle and Rematch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();

    if (supabase && supabase.auth) {
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { user: { id: 'user-white-1' } } },
        error: null
      });
      vi.spyOn(supabase.auth, 'signInAnonymously').mockResolvedValue({
        data: { user: { id: 'user-white-1' } },
        error: null
      });
    }

    if (supabase && supabase.channel) {
      vi.spyOn(supabase, 'channel').mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn((cb) => {
          if (cb) cb('SUBSCRIBED');
          return { unsubscribe: vi.fn() };
        }),
        track: vi.fn().mockResolvedValue('ok'),
        send: vi.fn().mockResolvedValue('ok'),
        presenceState: vi.fn().mockReturnValue({})
      });
    }

    if (supabase && supabase.removeChannel) {
      vi.spyOn(supabase, 'removeChannel').mockReturnValue({});
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('7.1 & 7.2: Clock Synchronization and Timeout Adjudication', () => {
    it('calculates visible countdown from authoritative last_move_timestamp without clock drift', async () => {
      const pastTime = new Date(Date.now() - 5000).toISOString(); // 5 seconds ago
      vi.spyOn(multiplayerApi, 'getRoomState').mockResolvedValue({
        id: 'room-clock-sync',
        white_id: 'user-white-1',
        black_id: 'user-black-2',
        status: 'active',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        version: 1,
        white_time_ms: 600000,
        black_time_ms: 600000,
        last_move_timestamp: pastTime
      });

      vi.spyOn(multiplayerApi, 'getRoomMoves').mockResolvedValue([]);

      const { result } = renderHook(() => useMultiplayerRoom('room-clock-sync'));

      await waitFor(() => {
        expect(result.current.status).toBe('active');
      });

      // White's clock should have deducted at least 5000ms (~595,000ms)
      expect(result.current.clocks.whiteMs).toBeLessThanOrEqual(595100);
      expect(result.current.clocks.whiteMs).toBeGreaterThan(590000);

      // Black's clock was not running, so it must remain exactly 600000ms
      expect(result.current.clocks.blackMs).toBe(600000);
    });

    it('triggers timeout adjudication when an opponent clock expires', async () => {
      // White player observing Black whose clock has expired
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { user: { id: 'user-white-1' } } },
        error: null
      });

      const longAgo = new Date(Date.now() - 700000).toISOString(); // Expired!
      vi.spyOn(multiplayerApi, 'getRoomState').mockResolvedValue({
        id: 'room-flag-fall',
        white_id: 'user-white-1',
        black_id: 'user-black-2',
        status: 'active',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        turn: 'b', // Black's turn to move
        version: 1,
        white_time_ms: 595000,
        black_time_ms: 60000, // Black had 60s remaining, but 700s passed
        last_move_timestamp: longAgo
      });

      vi.spyOn(multiplayerApi, 'getRoomMoves').mockResolvedValue([]);
      const timeoutSpy = vi.spyOn(multiplayerApi, 'claimTimeout').mockResolvedValue({
        success: true,
        winner: 'white',
        reason: 'timeout'
      });

      const { result } = renderHook(() => useMultiplayerRoom('room-flag-fall'));

      await waitFor(() => {
        expect(result.current.status).toBe('active');
      });

      // Black clock is 0
      expect(result.current.clocks.blackMs).toBe(0);

      // Timeout claim should have been requested on behalf of White
      expect(timeoutSpy).toHaveBeenCalledWith('room-flag-fall');
    });
  });

  describe('7.4: Genuine Rematch Flow', () => {
    it('dispatches rematch requests and updates local room state', async () => {
      vi.spyOn(multiplayerApi, 'getRoomState').mockResolvedValue({
        id: 'room-rematch',
        white_id: 'user-white-1',
        black_id: 'user-black-2',
        status: 'completed',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        winner: 'white',
        termination_reason: 'checkmate',
        version: 10
      });

      vi.spyOn(multiplayerApi, 'getRoomMoves').mockResolvedValue([]);
      const reqSpy = vi.spyOn(multiplayerApi, 'requestRematch').mockResolvedValue({
        success: true,
        rematchOfferedBy: 'w'
      });

      const { result } = renderHook(() => useMultiplayerRoom('room-rematch'));

      await waitFor(() => {
        expect(result.current.status).toBe('completed');
      });

      await act(async () => {
        await result.current.requestRematch();
      });

      expect(reqSpy).toHaveBeenCalledWith('room-rematch');
      expect(result.current.rematchOfferedBy).toBe('w');
    });

    it('atomically accepts rematch, creates new room, and sets rematchRoomId', async () => {
      vi.spyOn(multiplayerApi, 'getRoomState').mockResolvedValue({
        id: 'room-rematch-accept',
        white_id: 'user-white-1',
        black_id: 'user-black-2',
        status: 'completed',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        winner: 'white',
        termination_reason: 'checkmate',
        rematch_offered_by: 'b', // Opponent (Black) offered rematch
        version: 10
      });

      vi.spyOn(multiplayerApi, 'getRoomMoves').mockResolvedValue([]);
      const acceptSpy = vi.spyOn(multiplayerApi, 'acceptRematch').mockResolvedValue({
        success: true,
        newRoomId: 'new-rematch-room-uuid',
        newWhiteName: 'Bob',
        newBlackName: 'Alice'
      });

      const { result } = renderHook(() => useMultiplayerRoom('room-rematch-accept'));

      await waitFor(() => {
        expect(result.current.status).toBe('completed');
      });

      expect(result.current.rematchOfferedBy).toBe('b');

      await act(async () => {
        await result.current.acceptRematch();
      });

      expect(acceptSpy).toHaveBeenCalledWith('room-rematch-accept');
      expect(result.current.rematchRoomId).toBe('new-rematch-room-uuid');
    });

    it('renders rematch challenge banner in MultiplayerRoomPage when opponent requests rematch', async () => {
      vi.spyOn(multiplayerApi, 'getRoomState').mockResolvedValue({
        id: 'room-rematch-ui',
        white_id: 'user-white-1',
        black_id: 'user-black-2',
        white_name: 'Alice',
        black_name: 'Bob',
        status: 'completed',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        winner: 'white',
        termination_reason: 'checkmate',
        rematch_offered_by: 'b', // Bob challenged Alice
        version: 10
      });

      vi.spyOn(multiplayerApi, 'getRoomMoves').mockResolvedValue([]);

      render(
        <MemoryRouter initialEntries={['/play/room-rematch-ui']}>
          <Routes>
            <Route path="/play/:roomId" element={<MultiplayerRoomPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Rematch Challenge!/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/Accept Rematch/i)).toBeInTheDocument();
      expect(screen.getByText(/Decline/i)).toBeInTheDocument();
    });
  });

  describe('7.5: Completed Game Persistence', () => {
    it('persists completed match to historyStorage automatically upon completion', async () => {
      const saveSpy = vi.spyOn(historyStorage, 'saveGame').mockResolvedValue('room-persist-123');

      vi.spyOn(multiplayerApi, 'getRoomState').mockResolvedValue({
        id: 'room-persist-123',
        white_id: 'user-white-1',
        black_id: 'user-black-2',
        white_name: 'Alice',
        black_name: 'Bob',
        status: 'completed',
        fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
        turn: 'w',
        winner: 'black',
        termination_reason: 'checkmate',
        time_control_initial_ms: 300000,
        time_control_increment_ms: 2000,
        version: 4
      });

      vi.spyOn(multiplayerApi, 'getRoomMoves').mockResolvedValue([
        { ply: 1, from_sq: 'f2', to_sq: 'f3', promotion: null, san: 'f3', fen_after: '...', player_seat: 'w' },
        { ply: 2, from_sq: 'e7', to_sq: 'e5', promotion: null, san: 'e5', fen_after: '...', player_seat: 'b' },
        { ply: 3, from_sq: 'g2', to_sq: 'g4', promotion: null, san: 'g4', fen_after: '...', player_seat: 'w' },
        { ply: 4, from_sq: 'd8', to_sq: 'h4', promotion: null, san: 'Qh4#', fen_after: '...', player_seat: 'b' }
      ]);

      const { result } = renderHook(() => useMultiplayerRoom('room-persist-123'));

      await waitFor(() => {
        expect(result.current.status).toBe('completed');
      });

      await waitFor(() => {
        expect(saveSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'room-persist-123',
            gameMode: 'multiplayer',
            winner: 'black',
            reason: 'checkmate',
            result: '0-1'
          })
        );
      });
    });
  });
});
