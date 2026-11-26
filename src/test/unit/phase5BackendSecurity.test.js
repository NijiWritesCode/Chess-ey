import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Chess } from 'chess.js';
import { multiplayerApi } from '../../features/multiplayer/services/multiplayerApi';
import {
  generateSecureToken,
  hashToken,
  storeSeatRecoveryCredential,
  getSeatRecoveryCredential,
  clearSeatRecoveryCredential
} from '../../features/multiplayer/services/seatRecovery';
import { supabase } from '../../lib/supabase/client';

describe('Phase 5: Supabase Backend & Multiplayer Security', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    if (supabase && supabase.auth) {
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { user: { id: 'mock-user-123' } } },
        error: null
      });
      vi.spyOn(supabase.auth, 'signInAnonymously').mockResolvedValue({
        data: { user: { id: 'mock-user-123' } },
        error: null
      });
    }
  });

  describe('5.1 & 5.4: Anonymous Auth & Seat Recovery Credentials', () => {
    it('generates 256-bit entropy hexadecimal tokens', () => {
      const token1 = generateSecureToken();
      const token2 = generateSecureToken();

      expect(token1).toBeTruthy();
      expect(token2).toBeTruthy();
      expect(token1).not.toBe(token2);
      expect(token1.length).toBe(64);
    });

    it('computes deterministic SHA-256 hashes with 64 hex characters', async () => {
      const token = 'chessey-super-secret-invite-token-999';
      const hash1 = await hashToken(token);
      const hash2 = await hashToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });

    it('stores, retrieves, and clears seat recovery credentials per room', () => {
      const roomId = 'room-abc-123';
      const credential = generateSecureToken();

      storeSeatRecoveryCredential(roomId, credential);
      expect(getSeatRecoveryCredential(roomId)).toBe(credential);

      clearSeatRecoveryCredential(roomId);
      expect(getSeatRecoveryCredential(roomId)).toBeNull();
    });
  });

  describe('5.3: Invitation System & Seat Assignment Protocol', () => {
    it('creates room via RPC and preserves invitation token locally', async () => {
      const mockRpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: {
          success: true,
          roomId: 'test-room-uuid',
          playerColor: 'w',
          room: { id: 'test-room-uuid', status: 'waiting' }
        },
        error: null
      });

      const result = await multiplayerApi.createRoom({
        creatorColor: 'white',
        playerName: 'Alice'
      });

      expect(result).toBeTruthy();
      expect(result.roomId).toBe('test-room-uuid');
      expect(result.playerColor).toBe('w');
      expect(result.inviteToken).toBeTruthy();
      expect(result.recoveryCredential).toBeTruthy();
      expect(result.shareUrl).toContain(result.inviteToken);

      // Verify recovery credential was stored
      expect(getSeatRecoveryCredential('test-room-uuid')).toBe(result.recoveryCredential);

      mockRpc.mockRestore();
    });

    it('joins room, retrieves seat and stores player recovery credential', async () => {
      const mockRpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: {
          success: true,
          color: 'b',
          reconnect: false,
          room: { id: 'test-room-uuid', status: 'active' }
        },
        error: null
      });

      const result = await multiplayerApi.joinRoom({
        roomId: 'test-room-uuid',
        inviteToken: 'test-invite-token',
        playerName: 'Bob'
      });

      expect(result).toBeTruthy();
      expect(result.playerColor).toBe('b');
      expect(result.recoveryCredential).toBeTruthy();
      expect(getSeatRecoveryCredential('test-room-uuid')).toBe(result.recoveryCredential);

      mockRpc.mockRestore();
    });
  });

  describe('5.5 & 5.6: Server-Authoritative Move Submission & Rejection Rules', () => {
    it('rejects illegal moves client-side before dispatching to server', async () => {
      const currentFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

      // Pawn from e2 to e5 is illegal on ply 1
      await expect(
        multiplayerApi.submitMove({
          roomId: 'test-room',
          from: 'e2',
          to: 'e5',
          currentFen,
          expectedVersion: 1
        })
      ).rejects.toThrow(/Illegal move/);
    });

    it('pre-validates legal moves and submits canonical FEN and SAN to RPC', async () => {
      const currentFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

      const mockRpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: {
          success: true,
          version: 2,
          ply: 1,
          newFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
          turn: 'b',
          isGameOver: false,
          winner: null,
          reason: null
        },
        error: null
      });

      const result = await multiplayerApi.submitMove({
        roomId: 'test-room',
        from: 'e2',
        to: 'e4',
        currentFen,
        expectedVersion: 1
      });

      expect(result.success).toBe(true);
      expect(result.version).toBe(2);
      expect(result.san).toBe('e4');
      expect(result.turn).toBe('b');
      expect(mockRpc).toHaveBeenCalledWith('commit_chess_move', expect.objectContaining({
        p_room_id: 'test-room',
        p_from: 'e2',
        p_to: 'e4',
        p_san: 'e4',
        p_expected_version: 1
      }));

      mockRpc.mockRestore();
    });

    it('detects checkmate locally and submits terminal adjudication payload', async () => {
      // Scholar's Mate position before Qxf7#
      const beforeMateFen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';

      const mockRpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: {
          success: true,
          version: 8,
          ply: 7,
          newFen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
          turn: 'b',
          isGameOver: true,
          winner: 'white',
          reason: 'checkmate'
        },
        error: null
      });

      const result = await multiplayerApi.submitMove({
        roomId: 'test-room',
        from: 'h5',
        to: 'f7',
        currentFen: beforeMateFen,
        expectedVersion: 7
      });

      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe('white');
      expect(result.reason).toBe('checkmate');
      expect(result.san).toBe('Qxf7#');

      mockRpc.mockRestore();
    });

    it('rejects stale game version when server returns version conflict', async () => {
      const currentFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

      const mockRpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: {
          success: false,
          error: 'Move conflict: game state has already advanced'
        },
        error: null
      });

      await expect(
        multiplayerApi.submitMove({
          roomId: 'test-room',
          from: 'e2',
          to: 'e4',
          currentFen,
          expectedVersion: 1 // stale version
        })
      ).rejects.toThrow(/Move conflict/);

      mockRpc.mockRestore();
    });
  });

  describe('5.7: Resignation & Draw Negotiation Operations', () => {
    it('resigns match and clears seat recovery credential', async () => {
      storeSeatRecoveryCredential('test-room', 'secret-cred');

      const mockRpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: { success: true, winner: 'black', reason: 'resignation' },
        error: null
      });

      const res = await multiplayerApi.resignMatch('test-room');
      expect(res.success).toBe(true);
      expect(getSeatRecoveryCredential('test-room')).toBeNull();

      mockRpc.mockRestore();
    });

    it('handles draw offers and responses', async () => {
      const mockRpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: { success: true, offeredBy: 'w' },
        error: null
      });

      const offerRes = await multiplayerApi.offerDraw('test-room');
      expect(offerRes.success).toBe(true);

      mockRpc.mockResolvedValueOnce({
        data: { success: true, status: 'completed', winner: 'draw' },
        error: null
      });

      const acceptRes = await multiplayerApi.respondDraw('test-room', true);
      expect(acceptRes.success).toBe(true);

      mockRpc.mockRestore();
    });
  });
});
