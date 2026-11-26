import { describe, it, expect, beforeEach, vi } from 'vitest';
import { gameStore } from '../services/storage/gameStore';

describe('GameStore Local Persistence & Parity', () => {
  beforeEach(async () => {
    localStorage.clear();
    await gameStore.clearGames();
  });

  it('saves game record and retrieves it by ID', async () => {
    const record = {
      id: 'test_game_001',
      timestamp: Date.now(),
      opponent: 'Stockfish (Level 5)',
      playerColor: 'w',
      pgn: '1. e4 e5',
      moves: [{ san: 'e4' }, { san: 'e5' }]
    };

    await gameStore.saveGame(record);
    const retrieved = await gameStore.getGameById('test_game_001');
    expect(retrieved).toBeTruthy();
    expect(retrieved.id).toBe('test_game_001');
    expect(retrieved.pgn).toBe('1. e4 e5');
  });

  it('retrieves recent games in reverse chronological order', async () => {
    const g1 = { id: 'game_old', timestamp: 1000, pgn: '1. d4' };
    const g2 = { id: 'game_new', timestamp: 2000, pgn: '1. e4' };

    await gameStore.saveGame(g1);
    await gameStore.saveGame(g2);

    const recents = await gameStore.getRecentGames(10);
    expect(recents.length).toBeGreaterThanOrEqual(2);
    expect(recents[0].id).toBe('game_new');
  });

  it('deletes game record cleanly', async () => {
    const g = { id: 'game_to_delete', timestamp: Date.now(), pgn: '1. c4' };
    await gameStore.saveGame(g);

    await gameStore.deleteGame('game_to_delete');
    const lookup = await gameStore.getGameById('game_to_delete');
    expect(lookup).toBeNull();
  });

  it('falls back to localStorage seamlessly if IndexedDB is unavailable', async () => {
    // Force getDb to return null to simulate blocked IndexedDB
    const originalGetDb = gameStore.getDb;
    gameStore.getDb = async () => null;

    try {
      const g = { id: 'ls_game_999', timestamp: Date.now(), pgn: '1. Nf3' };
      await gameStore.saveGame(g);

      const retrieved = await gameStore.getGameById('ls_game_999');
      expect(retrieved).toBeTruthy();
      expect(retrieved.id).toBe('ls_game_999');

      const recents = await gameStore.getRecentGames(5);
      expect(recents.some(r => r.id === 'ls_game_999')).toBe(true);
    } finally {
      gameStore.getDb = originalGetDb;
    }
  });
});
