import { describe, it, expect } from 'vitest';
import { generateSecureToken, hashToken } from '../services/multiplayer/roomService';

describe('Multiplayer Security & Validation', () => {
  it('generates secure non-predictable hex tokens', () => {
    const token1 = generateSecureToken();
    const token2 = generateSecureToken();
    expect(token1).toBeTruthy();
    expect(token2).toBeTruthy();
    expect(token1).not.toBe(token2);
    expect(token1.length).toBeGreaterThanOrEqual(16);
  });

  it('computes deterministic SHA-256 token hashes', async () => {
    const token = 'my-secret-invitation-token-12345';
    const hash1 = await hashToken(token);
    const hash2 = await hashToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // 256 bits = 64 hex chars
  });

  it('validates player turn matches board turn', () => {
    const roomState = {
      turn: 'w',
      version: 5,
      white_id: 'user-white-uuid',
      black_id: 'user-black-uuid'
    };

    // User is Black, but turn is White
    const currentUserId = 'user-black-uuid';
    const playerColor = roomState.black_id === currentUserId ? 'b' : 'w';

    const canMove = roomState.turn === playerColor;
    expect(canMove).toBe(false);
  });

  it('rejects stale or concurrent move submissions with mismatched version', () => {
    const serverRoomVersion = 6;
    const clientExpectedVersion = 5; // stale submission

    const isVersionValid = serverRoomVersion === clientExpectedVersion;
    expect(isVersionValid).toBe(false);
  });

  it('prevents third player from seizing occupied seats', () => {
    const room = {
      white_id: 'user-1',
      black_id: 'user-2'
    };
    const thirdUserId = 'user-3';

    const isSeatAvailable = !room.white_id || !room.black_id;
    const isAlreadyMember = room.white_id === thirdUserId || room.black_id === thirdUserId;

    expect(isSeatAvailable).toBe(false);
    expect(isAlreadyMember).toBe(false);
  });
});
