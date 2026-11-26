import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useMultiplayerAnalysis } from '../../features/multiplayer/hooks/useMultiplayerAnalysis';
import * as analysisService from '../../features/analysis/services/analysisService';
import { multiplayerApi } from '../../features/multiplayer/services/multiplayerApi';
import { supabase } from '../../lib/supabase/client';
import { MultiplayerRoomPage } from '../../features/multiplayer/pages/MultiplayerRoomPage';

describe('Phase 8: Live Analysis in Multiplayer', () => {
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

  describe('8.1 & 8.2: Position Snapshots, Analysis Pipeline & Race Condition Safety', () => {
    it('analyzes move using immutable snapshots and caches results per ply', async () => {
      const mockAnalysisResult = {
        move: { ply: 1, san: 'e4', from: 'e2', to: 'e4' },
        turn: 'w',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        classification: { id: 'best', label: 'Best Move', badge: '★' },
        cpLoss: 0,
        winChanceLoss: 0,
        evalBefore: { score: { type: 'cp', value: 20 }, cp: 20, bestMove: 'e2e4' },
        evalAfter: { score: { type: 'cp', value: 25 }, cp: 25, bestMove: 'e7e5', depth: 12 },
        bestMove: 'e7e5',
        explanation: { summary: 'Strong opening move establishing central presence.' }
      };

      const analyzeSpy = vi.spyOn(analysisService, 'analyzeMove').mockResolvedValue(mockAnalysisResult);

      const moves = [
        {
          ply: 1,
          from: 'e2',
          to: 'e4',
          san: 'e4',
          fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
          turn: 'w'
        }
      ];

      const { result } = renderHook(() =>
        useMultiplayerAnalysis({
          roomId: 'room-analysis-1',
          moves,
          displayFen: moves[0].fen,
          currentPly: 1,
          isEnabled: true
        })
      );

      await waitFor(() => {
        expect(result.current.selectedMoveAnalysis).toBeTruthy();
      });

      expect(analyzeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: 'room-analysis-1',
          targetPly: 1,
          fenBefore: expect.stringContaining('rnbqkbnr'),
          fenAfter: moves[0].fen,
          turn: 'w'
        })
      );

      expect(result.current.selectedMoveAnalysis.classification.id).toBe('best');
      expect(result.current.currentEvaluation.cp).toBe(25);
      expect(result.current.bestMoveArrow).toEqual({ from: 'e7', to: 'e5' });

      // Verifying caching: calling getAnalysisForPly returns cached result synchronously
      const cached = result.current.getAnalysisForPly(1);
      expect(cached).toBe(mockAnalysisResult);
    });

    it('discards stale async analysis if user navigates or moves advance rapidly', async () => {
      let resolveFirstAnalysis;
      const firstPromise = new Promise((resolve) => {
        resolveFirstAnalysis = resolve;
      });

      const analyzeSpy = vi
        .spyOn(analysisService, 'analyzeMove')
        .mockImplementationOnce(() => firstPromise)
        .mockResolvedValueOnce({
          move: { ply: 2, san: 'e5' },
          classification: { id: 'good', label: 'Good Move' },
          evalAfter: { cp: 15, bestMove: 'g1f3' },
          bestMove: 'g1f3'
        });

      const moves = [
        { ply: 1, from: 'e2', to: 'e4', san: 'e4', fen: 'fen_ply_1', turn: 'w' },
        { ply: 2, from: 'e7', to: 'e5', san: 'e5', fen: 'fen_ply_2', turn: 'b' }
      ];

      const { result, rerender } = renderHook(
        ({ currentPly }) =>
          useMultiplayerAnalysis({
            roomId: 'room-stale-check',
            moves,
            displayFen: 'fen_ply_1',
            currentPly,
            isEnabled: true
          }),
        { initialProps: { currentPly: 1 } }
      );

      // Rapidly jump to ply 2 before ply 1 resolves
      rerender({ currentPly: 2 });

      await waitFor(() => {
        expect(result.current.selectedMoveAnalysis?.move?.ply).toBe(2);
      });

      // Now resolve the late first analysis
      resolveFirstAnalysis({
        move: { ply: 1, san: 'e4' },
        classification: { id: 'best' },
        evalAfter: { cp: 25 },
        bestMove: 'e7e5'
      });

      // The selectedMoveAnalysis should NOT be overwritten by the delayed ply 1 analysis!
      expect(result.current.selectedMoveAnalysis.move.ply).toBe(2);
    });
  });

  describe('8.3 & 8.4: Privacy, Toggling & Engine Fault Isolation', () => {
    it('runs purely locally and never broadcasts engine calculations over Realtime', async () => {
      const channelSendSpy = vi.fn();
      vi.spyOn(supabase, 'channel').mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn((cb) => cb && cb('SUBSCRIBED')),
        track: vi.fn().mockResolvedValue('ok'),
        send: channelSendSpy,
        presenceState: vi.fn().mockReturnValue({})
      });

      vi.spyOn(analysisService, 'analyzeMove').mockResolvedValue({
        move: { ply: 1, san: 'd4' },
        classification: { id: 'best' },
        evalAfter: { cp: 20 },
        bestMove: 'd7d5'
      });

      const moves = [{ ply: 1, from: 'd2', to: 'd4', san: 'd4', fen: 'fen_d4', turn: 'w' }];

      renderHook(() =>
        useMultiplayerAnalysis({
          roomId: 'room-privacy-test',
          moves,
          displayFen: 'fen_d4',
          currentPly: 1,
          isEnabled: true
        })
      );

      await waitFor(() => {
        expect(analysisService.analyzeMove).toHaveBeenCalled();
      });

      // Assert zero engine metrics were broadcast over Supabase Realtime channel
      expect(channelSendSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: expect.stringMatching(/eval|analysis|stockfish|bestmove/i)
        })
      );
    });

    it('handles engine failures gracefully without crashing or disrupting gameplay', async () => {
      vi.spyOn(analysisService, 'analyzeMove').mockRejectedValue(
        new Error('Stockfish WebWorker crashed or unsupported')
      );

      const moves = [{ ply: 1, from: 'e2', to: 'e4', san: 'e4', fen: 'fen_e4', turn: 'w' }];

      const { result } = renderHook(() =>
        useMultiplayerAnalysis({
          roomId: 'room-fault-test',
          moves,
          displayFen: 'fen_e4',
          currentPly: 1,
          isEnabled: true
        })
      );

      await waitFor(() => {
        expect(result.current.error).toContain('Stockfish WebWorker crashed');
      });

      // Does not throw unhandled exception, leaves selectedMoveAnalysis null
      expect(result.current.selectedMoveAnalysis).toBeNull();
      expect(result.current.isThinking).toBe(false);
    });

    it('renders EvaluationBar, AnalysisPanel and allows toggling engine assistance in UI', async () => {
      vi.spyOn(multiplayerApi, 'getRoomState').mockResolvedValue({
        id: 'room-ui-analysis',
        white_id: 'user-white-1',
        black_id: 'user-black-2',
        white_name: 'Alice',
        black_name: 'Bob',
        status: 'active',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        turn: 'b',
        version: 1
      });

      vi.spyOn(multiplayerApi, 'getRoomMoves').mockResolvedValue([
        { ply: 1, from_sq: 'e2', to_sq: 'e4', promotion: null, san: 'e4', fen_after: 'fen_e4', player_seat: 'w' }
      ]);

      vi.spyOn(analysisService, 'analyzeMove').mockResolvedValue({
        move: { ply: 1, san: 'e4' },
        classification: { id: 'best', label: 'Best Move', badge: '★' },
        evalAfter: { cp: 25, depth: 12, principalVariation: ['e7e5'] },
        bestMove: 'e7e5',
        explanation: { summary: 'Strong central control.' }
      });

      render(
        <MemoryRouter initialEntries={['/play/room-ui-analysis']}>
          <Routes>
            <Route path="/play/:roomId" element={<MultiplayerRoomPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Verify Analysis toggle button is rendered in match controls
      const toggleBtn = await screen.findByTitle(/Enable Live Engine|Disable Live Engine/i);
      expect(toggleBtn).toBeInTheDocument();

      // If initially OFF, click to toggle ON
      if (toggleBtn.getAttribute('title') === 'Enable Live Engine') {
        fireEvent.click(toggleBtn);
      }

      // Verify Evaluation bar is rendered
      await waitFor(() => {
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
      });

      // Toggle Engine off
      const disableBtn = screen.getByTitle(/Disable Live Engine/i);
      fireEvent.click(disableBtn);

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });
    });
  });
});
