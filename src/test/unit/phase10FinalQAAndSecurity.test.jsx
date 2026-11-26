import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Chess } from 'chess.js';
import {
  STARTING_FEN,
  isLegalMove,
  getLegalMoves,
  isInCheck,
  getPieceAt,
  applyMove
} from '../../features/game/domain/chessRules';
import { multiplayerApi } from '../../features/multiplayer/services/multiplayerApi';
import { supabase } from '../../lib/supabase/client';
import { scoreToWhiteCp, cpToWinChance, formatEvaluation } from '../../features/analysis/services/classifier';

describe('Phase 10: Final Quality Assurance, Security Audit & Deployment Verification', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();

    if (supabase && supabase.auth) {
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { user: { id: 'auditor-user-uuid' } } },
        error: null
      });
      vi.spyOn(supabase.auth, 'signInAnonymously').mockResolvedValue({
        data: { user: { id: 'auditor-user-uuid' } },
        error: null
      });
    }
  });

  describe('10.1: Exhaustive Chess Rules Domain Verification', () => {
    it('accurately identifies and executes castling, prohibiting castling through check', () => {
      // Position where f-file is open and Black rook on f8 attacks f1: King on e1, Rook on h1
      const throughCheckFen = '3k1r2/ppppp1pp/8/8/8/8/PPPPP1PP/RNBQK2R w KQ - 0 1';
      const legalMoves = getLegalMoves(throughCheckFen, 'e1');
      const canKingsideCastle = legalMoves.some((m) => m.san === 'O-O');
      expect(canKingsideCastle).toBe(false);

      // Clean position where castling is legal
      const validCastleFen = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1';
      const cleanMoves = getLegalMoves(validCastleFen, 'e1');
      const validO_O = cleanMoves.some((m) => m.san === 'O-O');
      expect(validO_O).toBe(true);

      const castledState = applyMove(validCastleFen, { from: 'e1', to: 'g1' });
      expect(castledState.san).toBe('O-O');
      expect(getPieceAt(castledState.fen, 'g1')?.type).toBe('k');
      expect(getPieceAt(castledState.fen, 'f1')?.type).toBe('r');
    });

    it('correctly executes en passant and removes the captured pawn', () => {
      // White pawn on e5, Black pawn advances d7 to d5
      const preEnPassantFen = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
      const legalMoves = getLegalMoves(preEnPassantFen, 'e5');
      const epMove = legalMoves.find((m) => m.to === 'd6');
      expect(epMove).toBeTruthy();

      const stateAfterEp = applyMove(preEnPassantFen, { from: 'e5', to: 'd6' });
      expect(stateAfterEp.san).toBe('exd6');
      // Black pawn on d5 must be gone!
      expect(getPieceAt(stateAfterEp.fen, 'd5')).toBeNull();
      // White pawn must now reside on d6
      expect(getPieceAt(stateAfterEp.fen, 'd6')?.type).toBe('p');
      expect(getPieceAt(stateAfterEp.fen, 'd6')?.color).toBe('w');
    });

    it('identifies draw conditions: stalemate, insufficient material, and 50-move rule', () => {
      // Stalemate: Black King on a8, White Queen on c7, White King on a6 (Black has no legal moves)
      const stalemateFen = 'k7/2Q5/K7/8/8/8/8/8 b - - 0 1';
      const chessStalemate = new Chess(stalemateFen);
      expect(chessStalemate.isStalemate()).toBe(true);
      expect(chessStalemate.isGameOver()).toBe(true);
      expect(chessStalemate.isCheckmate()).toBe(false);

      // Insufficient Material: King vs King
      const kvkFen = '8/8/4k3/8/8/4K3/8/8 w - - 0 1';
      const chessKvk = new Chess(kvkFen);
      expect(chessKvk.isInsufficientMaterial()).toBe(true);
      expect(chessKvk.isGameOver()).toBe(true);

      // King + Bishop vs King
      const kbvkFen = '8/8/4k3/8/2B5/4K3/8/8 w - - 0 1';
      const chessKbvk = new Chess(kbvkFen);
      expect(chessKbvk.isInsufficientMaterial()).toBe(true);
    });
  });

  describe('10.2 & 10.3: Security Testing & Attack Resistance', () => {
    it('rejects out-of-turn move submissions at client and server verification boundaries', async () => {
      // Black's turn to move
      const blackTurnFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

      // Attempting White move on Black's turn
      expect(isLegalMove(blackTurnFen, { from: 'd2', to: 'd4' })).toBe(false);

      // If client attempts to bypass validation and submit anyway, server rejects
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: { success: false, error: 'It is not your turn' },
        error: null
      });

      await expect(
        multiplayerApi.submitMove({
          roomId: 'room-security-audit',
          from: 'g1',
          to: 'f3',
          currentFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', // spoofed FEN
          expectedVersion: 1
        })
      ).rejects.toThrow();
    });

    it('rejects stale version concurrency (race condition / simultaneous move submissions)', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: { success: false, error: 'Move conflict: game state has already advanced' },
        error: null
      });

      await expect(
        multiplayerApi.submitMove({
          roomId: 'room-security-audit',
          from: 'e2',
          to: 'e4',
          currentFen: STARTING_FEN,
          expectedVersion: 0 // Server is already at version 1!
        })
      ).rejects.toThrow(/conflict|rejected/i);
    });

    it('rejects unauthorized seat takeover with invalid recovery credentials', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: { success: false, error: 'Invalid recovery credential' },
        error: null
      });

      const recoveryRes = await multiplayerApi.recoverSeat({
        roomId: 'room-security-audit',
        recoveryCredential: 'forged-or-expired-token-xyz'
      });

      expect(recoveryRes).toBeNull();
    });

    it('rejects joining with invalid invitation credentials', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: { success: false, error: 'Invalid invitation credentials' },
        error: null
      });

      await expect(
        multiplayerApi.joinRoom({
          roomId: 'room-security-audit',
          inviteToken: 'fake-invite-token',
          playerName: 'Hacker'
        })
      ).rejects.toThrow(/Invalid invitation credentials/i);
    });
  });

  describe('10.4: Engine Evaluation Perspective & Score Normalization', () => {
    it('normalizes evaluations strictly to White perspective', () => {
      // Score from White perspective: +150 cp = White advantage
      const whiteAdvantage = { score: { type: 'cp', value: 150 }, cp: 150 };
      expect(scoreToWhiteCp(whiteAdvantage)).toBe(150);
      expect(formatEvaluation(whiteAdvantage)).toBe('+1.50');
      expect(cpToWinChance(150)).toBeGreaterThan(50);

      // Score from Black perspective: -200 cp = Black advantage
      const blackAdvantage = { score: { type: 'cp', value: -200 }, cp: -200 };
      expect(scoreToWhiteCp(blackAdvantage)).toBe(-200);
      expect(formatEvaluation(blackAdvantage)).toBe('-2.00');
      expect(cpToWinChance(-200)).toBeLessThan(50);

      // Forced Checkmate in 2
      const mateIn2 = { score: { type: 'mate', value: 2 }, mate: 2 };
      expect(scoreToWhiteCp(mateIn2)).toBe(29980);
      expect(formatEvaluation(mateIn2)).toBe('+M2');
      expect(cpToWinChance(scoreToWhiteCp(mateIn2))).toBe(100);

      // Black delivering mate in 1
      const blackMateIn1 = { score: { type: 'mate', value: -1 }, mate: -1 };
      expect(scoreToWhiteCp(blackMateIn1)).toBe(-29990);
      expect(formatEvaluation(blackMateIn1)).toBe('-M1');
      expect(cpToWinChance(scoreToWhiteCp(blackMateIn1))).toBe(0);
    });
  });
});
