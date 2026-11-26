// Authoritative IndexedDB and Local Storage Persistence for Chess-ey
// Handles game persistence, move records, PGNs, review metadata, and database migrations.

const DB_NAME = 'ChessEy_GamesDB';
const DB_VERSION = 2;
const STORE_GAMES = 'games';
const STORE_REVIEWS = 'reviews';

const LS_KEY_PREFIX = 'chessey_game_';
const LS_INDEX_KEY = 'chessey_games_index';
const LS_REVIEW_PREFIX = 'chessey_review_';

class LocalGameStorage {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  async getDb() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        resolve(null);
        return;
      }

      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (event) => {
          const db = event.target.result;

          // Store: games
          if (!db.objectStoreNames.contains(STORE_GAMES)) {
            const gameStore = db.createObjectStore(STORE_GAMES, { keyPath: 'id' });
            gameStore.createIndex('timestamp', 'timestamp', { unique: false });
            gameStore.createIndex('gameMode', 'gameMode', { unique: false });
          } else {
            const gameStore = req.transaction.objectStore(STORE_GAMES);
            if (!gameStore.indexNames.contains('gameMode')) {
              gameStore.createIndex('gameMode', 'gameMode', { unique: false });
            }
          }

          // Store: reviews
          if (!db.objectStoreNames.contains(STORE_REVIEWS)) {
            db.createObjectStore(STORE_REVIEWS, { keyPath: 'gameId' });
          }
        };

        req.onsuccess = () => {
          this.db = req.result;
          resolve(this.db);
        };

        req.onerror = () => {
          console.warn('[HistoryStorage] IndexedDB open error, falling back to localStorage:', req.error);
          resolve(null);
        };
      } catch (e) {
        console.warn('[HistoryStorage] IndexedDB unavailable, using localStorage:', e);
        resolve(null);
      }
    });

    return this.initPromise;
  }

  _getLocalStorageIndex() {
    try {
      const raw = localStorage.getItem(LS_INDEX_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  _setLocalStorageIndex(ids) {
    try {
      localStorage.setItem(LS_INDEX_KEY, JSON.stringify(ids));
    } catch (e) {}
  }

  /**
   * Saves or updates a completed game record.
   */
  async saveGame(gameRecord) {
    if (!gameRecord || !gameRecord.id) return null;

    const record = {
      ...gameRecord,
      timestamp: gameRecord.timestamp || Date.now(),
      updatedAt: Date.now()
    };

    // Mirror to localStorage for redundancy and offline reliability
    try {
      const key = `${LS_KEY_PREFIX}${record.id}`;
      localStorage.setItem(key, JSON.stringify(record));

      const ids = this._getLocalStorageIndex();
      if (!ids.includes(record.id)) {
        ids.unshift(record.id);
        // Keep up to 50 games in localStorage
        if (ids.length > 50) {
          const removedId = ids.pop();
          localStorage.removeItem(`${LS_KEY_PREFIX}${removedId}`);
          localStorage.removeItem(`${LS_REVIEW_PREFIX}${removedId}`);
        }
        this._setLocalStorageIndex(ids);
      }
    } catch (e) {
      console.warn('[HistoryStorage] LocalStorage mirror warning:', e);
    }

    const db = await this.getDb();
    if (!db) return record;

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_GAMES, 'readwrite');
        const store = tx.objectStore(STORE_GAMES);
        store.put(record);
        tx.oncomplete = () => resolve(record);
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        resolve(record);
      }
    });
  }

  /**
   * Retrieves a game by its unique ID.
   */
  async getGameById(id) {
    if (!id) return null;

    const db = await this.getDb();
    if (!db) {
      try {
        const raw = localStorage.getItem(`${LS_KEY_PREFIX}${id}`);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_GAMES, 'readonly');
        const store = tx.objectStore(STORE_GAMES);
        const req = store.get(id);

        req.onsuccess = () => {
          if (req.result) {
            resolve(req.result);
          } else {
            // Check fallback
            try {
              const raw = localStorage.getItem(`${LS_KEY_PREFIX}${id}`);
              resolve(raw ? JSON.parse(raw) : null);
            } catch (e) {
              resolve(null);
            }
          }
        };

        req.onerror = () => {
          try {
            const raw = localStorage.getItem(`${LS_KEY_PREFIX}${id}`);
            resolve(raw ? JSON.parse(raw) : null);
          } catch (e) {
            resolve(null);
          }
        };
      } catch (e) {
        resolve(null);
      }
    });
  }

  /**
   * Retrieves games in reverse-chronological order.
   */
  async getRecentGames(limit = 30, filterMode = null) {
    const db = await this.getDb();

    if (!db) {
      try {
        const ids = this._getLocalStorageIndex();
        const games = [];
        for (const id of ids) {
          const item = localStorage.getItem(`${LS_KEY_PREFIX}${id}`);
          if (item) {
            try {
              const parsed = JSON.parse(item);
              if (!filterMode || parsed.gameMode === filterMode) {
                games.push(parsed);
              }
            } catch (e) {}
          }
          if (games.length >= limit) break;
        }
        return games.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      } catch (e) {
        return [];
      }
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_GAMES, 'readonly');
        const store = tx.objectStore(STORE_GAMES);
        const index = store.index('timestamp');
        const req = index.openCursor(null, 'prev');
        const results = [];

        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && results.length < limit) {
            const game = cursor.value;
            if (!filterMode || game.gameMode === filterMode) {
              results.push(game);
            }
            cursor.continue();
          } else {
            resolve(results);
          }
        };

        req.onerror = () => {
          resolve(this._getLocalStorageGames(limit, filterMode));
        };
      } catch (e) {
        resolve([]);
      }
    });
  }

  _getLocalStorageGames(limit = 30, filterMode = null) {
    try {
      const ids = this._getLocalStorageIndex();
      const list = [];
      for (const id of ids) {
        const item = localStorage.getItem(`${LS_KEY_PREFIX}${id}`);
        if (item) {
          try {
            const parsed = JSON.parse(item);
            if (!filterMode || parsed.gameMode === filterMode) {
              list.push(parsed);
            }
          } catch (e) {}
        }
        if (list.length >= limit) break;
      }
      return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } catch (e) {
      return [];
    }
  }

  /**
   * Deletes a game and its associated review.
   */
  async deleteGame(id) {
    if (!id) return;

    try {
      localStorage.removeItem(`${LS_KEY_PREFIX}${id}`);
      localStorage.removeItem(`${LS_REVIEW_PREFIX}${id}`);
      const ids = this._getLocalStorageIndex().filter((x) => x !== id);
      this._setLocalStorageIndex(ids);
    } catch (e) {}

    const db = await this.getDb();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_GAMES, STORE_REVIEWS], 'readwrite');
        tx.objectStore(STORE_GAMES).delete(id);
        tx.objectStore(STORE_REVIEWS).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  /**
   * Clears all saved games and reviews.
   */
  async clearGames() {
    try {
      const ids = this._getLocalStorageIndex();
      for (const id of ids) {
        localStorage.removeItem(`${LS_KEY_PREFIX}${id}`);
        localStorage.removeItem(`${LS_REVIEW_PREFIX}${id}`);
      }
      this._setLocalStorageIndex([]);
    } catch (e) {}

    const db = await this.getDb();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_GAMES, STORE_REVIEWS], 'readwrite');
        tx.objectStore(STORE_GAMES).clear();
        tx.objectStore(STORE_REVIEWS).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  /**
   * Saves or attaches deep review metadata to a game.
   */
  async saveGameReview(gameId, reviewData) {
    if (!gameId || !reviewData) return null;

    const payload = {
      gameId,
      ...reviewData,
      analyzedAt: Date.now()
    };

    // Save in localStorage mirror
    try {
      localStorage.setItem(`${LS_REVIEW_PREFIX}${gameId}`, JSON.stringify(payload));
    } catch (e) {}

    // Update embedded review inside game record as well
    const game = await this.getGameById(gameId);
    if (game) {
      game.review = payload;
      await this.saveGame(game);
    }

    const db = await this.getDb();
    if (!db) return payload;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_REVIEWS, 'readwrite');
        tx.objectStore(STORE_REVIEWS).put(payload);
        tx.oncomplete = () => resolve(payload);
        tx.onerror = () => resolve(payload);
      } catch (e) {
        resolve(payload);
      }
    });
  }

  /**
   * Retrieves review metadata for a game.
   */
  async getGameReview(gameId) {
    if (!gameId) return null;

    // Check game record first
    const game = await this.getGameById(gameId);
    if (game && game.review) return game.review;

    // Check localStorage
    try {
      const raw = localStorage.getItem(`${LS_REVIEW_PREFIX}${gameId}`);
      if (raw) return JSON.parse(raw);
    } catch (e) {}

    const db = await this.getDb();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_REVIEWS, 'readonly');
        const req = tx.objectStore(STORE_REVIEWS).get(gameId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }
}

export const historyStorage = new LocalGameStorage();
export const gameStore = historyStorage;
export default historyStorage;
