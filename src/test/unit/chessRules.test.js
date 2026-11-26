import { describe, it, expect } from 'vitest';
import {
  STARTING_FEN,
  isValidFen,
  getLegalMoves,
  isLegalMove,
  applyMove,
  isInCheck,
  isCheckmate,
  isStalemate,
  isInsufficientMaterial,
  isDraw,
  getTurn,
  parsePgn,
  exportPgn
} from '../../features/game/domain/chessRules';

describe('Phase 1.1: Chess Rules Domain Service', () => {
  describe('FEN Validation and Initialization', () => {
    it('provides standard starting FEN and validates it', () => {
      expect(STARTING_FEN).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      expect(isValidFen(STARTING_FEN)).toBe(true);
      expect(isValidFen('invalid fen string')).toBe(false);
      expect(isValidFen('8/8/8/8/8/8/8/8 w - - 0 1')).toBe(false); // No kings
    });

    it('extracts turn correctly from FEN', () => {
      expect(getTurn(STARTING_FEN)).toBe('w');
      expect(getTurn('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe('b');
    });
  });

  describe('Move Generation & Validation', () => {
    it('generates 20 legal moves for White in the starting position', () => {
      const moves = getLegalMoves(STARTING_FEN);
      expect(moves.length).toBe(20);
      expect(moves.some(m => m.san === 'e4')).toBe(true);
      expect(moves.some(m => m.san === 'Nf3')).toBe(true);
    });

    it('filters legal moves for a specific square', () => {
      const e2Moves = getLegalMoves(STARTING_FEN, 'e2');
      expect(e2Moves.length).toBe(2); // e3, e4
      const g1Moves = getLegalMoves(STARTING_FEN, 'g1');
      expect(g1Moves.length).toBe(2); // Nf3, Nh3
    });

    it('validates legal and illegal moves correctly', () => {
      expect(isLegalMove(STARTING_FEN, { from: 'e2', to: 'e4' })).toBe(true);
      expect(isLegalMove(STARTING_FEN, { from: 'e2', to: 'e5' })).toBe(false); // Cannot jump 3 squares
      expect(isLegalMove(STARTING_FEN, { from: 'e1', to: 'e2' })).toBe(false); // King blocked
      expect(isLegalMove(STARTING_FEN, { from: 'a7', to: 'a5' })).toBe(false); // Wrong turn (Black pawn on White's turn)
    });
  });

  describe('Move Execution & Special Moves', () => {
    it('executes standard pawn push and returns complete move payload', () => {
      const result = applyMove(STARTING_FEN, { from: 'e2', to: 'e4' });
      expect(result.valid).toBe(true);
      expect(result.san).toBe('e4');
      expect(result.turnBefore).toBe('w');
      expect(result.turnAfter).toBe('b');
      expect(result.captured).toBeNull();
      expect(result.isCheck).toBe(false);
      expect(result.isGameOver).toBe(false);
      expect(result.fen).toContain('b KQkq');
    });

    it('executes kingside and queenside castling correctly', () => {
      // White can castle kingside or queenside
      const castlingFen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
      const oOMove = applyMove(castlingFen, { from: 'e1', to: 'g1' });
      expect(oOMove.valid).toBe(true);
      expect(oOMove.san).toBe('O-O');
      expect(oOMove.isCastle).toBe(true);

      const oOOMove = applyMove(castlingFen, { from: 'e1', to: 'c1' });
      expect(oOOMove.valid).toBe(true);
      expect(oOOMove.san).toBe('O-O-O');
      expect(oOOMove.isCastle).toBe(true);
    });

    it('executes en passant capture with correct captured piece details', () => {
      // White pawn on e5, Black pawn just played d7-d5 (fen has en passant target d6)
      const epFen = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
      const epResult = applyMove(epFen, { from: 'e5', to: 'd6' });
      expect(epResult.valid).toBe(true);
      expect(epResult.san).toBe('exd6');
      expect(epResult.isEnPassant).toBe(true);
      expect(epResult.captured).toBe('p');
      expect(epResult.capturedColor).toBe('b');
    });

    it('executes pawn promotion and handles underpromotions', () => {
      const promoFen = '8/4P3/8/8/8/8/8/4K2k w - - 0 1';
      // Default / Queen promotion
      const queenPromo = applyMove(promoFen, { from: 'e7', to: 'e8', promotion: 'q' });
      expect(queenPromo.valid).toBe(true);
      expect(queenPromo.san).toBe('e8=Q');
      expect(queenPromo.promotion).toBe('q');

      // Underpromotion to Knight
      const knightPromo = applyMove(promoFen, { from: 'e7', to: 'e8', promotion: 'n' });
      expect(knightPromo.valid).toBe(true);
      expect(knightPromo.san).toBe('e8=N');
      expect(knightPromo.promotion).toBe('n');
    });
  });

  describe('Check, Checkmate, and Terminal Conditions', () => {
    it('detects check correctly', () => {
      // White Queen checks Black King
      const checkFen = 'rnb1kbnr/pppp1ppp/8/4p3/7q/5P2/PPPPP1PP/RNBQKBNR w KQkq - 1 3';
      expect(isInCheck(checkFen)).toBe(true);
      expect(isCheckmate(checkFen)).toBe(false); // Can block with g3
    });

    it('detects checkmate correctly (Fool\'s mate & Scholar\'s mate)', () => {
      // Fool's mate: 1. f3 e5 2. g4 Qh4# (White is checkmated)
      const foolsMateFen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
      expect(isInCheck(foolsMateFen)).toBe(true);
      expect(isCheckmate(foolsMateFen)).toBe(true);

      const checkmateResult = applyMove(
        'r1bqkb1r/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
        { from: 'h5', to: 'f7' }
      );
      expect(checkmateResult.san).toBe('Qxf7#');
      expect(checkmateResult.isCheckmate).toBe(true);
      expect(checkmateResult.isGameOver).toBe(true);
      expect(checkmateResult.winner).toBe('white');
    });

    it('detects stalemate correctly', () => {
      const stalemateFen = 'k7/8/1Q6/8/8/8/8/7K b - - 0 1';
      expect(isInCheck(stalemateFen)).toBe(false);
      expect(isStalemate(stalemateFen)).toBe(true);
      expect(isDraw(stalemateFen)).toBe(true);
    });

    it('detects insufficient material draws', () => {
      // King vs King
      expect(isInsufficientMaterial('8/8/8/8/8/8/4k3/4K3 w - - 0 1')).toBe(true);
      // King and Bishop vs King
      expect(isInsufficientMaterial('8/8/8/8/8/8/4k3/4K2B w - - 0 1')).toBe(true);
      // King and Knight vs King
      expect(isInsufficientMaterial('8/8/8/8/8/8/4k3/4K2N w - - 0 1')).toBe(true);
      // King and Pawn vs King (NOT insufficient material)
      expect(isInsufficientMaterial('8/8/8/8/4P3/8/4k3/4K3 w - - 0 1')).toBe(false);
    });
  });

  describe('PGN Parsing and Exporting', () => {
    it('parses a full PGN into move objects', () => {
      const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6';
      const parsed = parsePgn(pgn);
      expect(parsed.length).toBe(8);
      expect(parsed[0].san).toBe('e4');
      expect(parsed[0].from).toBe('e2');
      expect(parsed[0].to).toBe('e4');
      expect(parsed[7].san).toBe('Nf6');
    });

    it('exports move history into a valid standard PGN string with headers', () => {
      const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'];
      const headers = {
        Event: 'Casual Game',
        Site: 'Chess-ey',
        White: 'Player 1',
        Black: 'Stockfish',
        Result: '*'
      };
      const pgn = exportPgn(moves, headers);
      expect(pgn).toContain('[Event "Casual Game"]');
      expect(pgn).toContain('[Site "Chess-ey"]');
      expect(pgn).toContain('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 *');
    });
  });
});
