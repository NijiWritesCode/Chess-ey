// IndexedDB Storage for Completed Games & Analysis Reviews
// Enables local persistence of recent games without requiring an account, with full localStorage fallback parity

const DB_NAME = 'ChessEy_GamesDB';
const DB_VERSION = 1;
const STORE_NAME = 'games';
const LOCAL_STORAGE_KEY_PREFIX = 'chessey_game_';
const LOCAL_STORAGE_INDEX_KEY = 'chessey_games_index';

class GameStore {
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
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };

        req.onsuccess = () => {
          this.db = req.result;
          resolve(this.db);
        };

        req.onerror = () => {
          console.warn('Failed to open IndexedDB for games, using localStorage fallback', req.error);
          resolve(null);
        };
      } catch (e) {
        console.warn('IndexedDB unavailable, falling back to localStorage', e);
        resolve(null);
      }
    });

    return this.initPromise;
  }

  _getLocalStorageIndex() {
    try {
      const idx = localStorage.getItem(LOCAL_STORAGE_INDEX_KEY);
      return idx ? JSON.parse(idx) : [];
    } catch (e) {
      return [];
    }
  }

  _setLocalStorageIndex(ids) {
    try {
      localStorage.setItem(LOCAL_STORAGE_INDEX_KEY, JSON.stringify(ids));
    } catch (e) {}
  }

  async saveGame(gameRecord) {
    if (!gameRecord || !gameRecord.id) return;

    // Save to localStorage as redundancy & fallback
    try {
      const key = `${LOCAL_STORAGE_KEY_PREFIX}${gameRecord.id}`;
      localStorage.setItem(key, JSON.stringify(gameRecord));

      const ids = this._getLocalStorageIndex();
      if (!ids.includes(gameRecord.id)) {
        ids.unshift(gameRecord.id);
        if (ids.length > 50) {
          const removedId = ids.pop();
          localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}${removedId}`);
        }
        this._setLocalStorageIndex(ids);
      }
    } catch (e) {
      console.warn('localStorage save warning:', e);
    }

    const db = await this.getDb();
    if (!db) return gameRecord;

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(gameRecord);
        tx.oncomplete = () => resolve(gameRecord);
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        resolve(gameRecord);
      }
    });
  }

  async getRecentGames(limit = 30) {
    const db = await this.getDb();

    if (!db) {
      // LocalStorage fallback
      try {
        const ids = this._getLocalStorageIndex();
        const games = [];
        for (const id of ids.slice(0, limit)) {
          const item = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${id}`);
          if (item) {
            try {
              games.push(JSON.parse(item));
            } catch (err) {}
          }
        }
        return games.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      } catch (e) {
        return [];
      }
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const req = index.openCursor(null, 'prev');
        const results = [];

        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && results.length < limit) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };

        req.onerror = () => {
          // Fall back to localStorage on index error
          resolve(this._getLocalStorageGames(limit));
        };
      } catch (e) {
        resolve(this._getLocalStorageGames(limit));
      }
    });
  }

  _getLocalStorageGames(limit = 30) {
    try {
      const ids = this._getLocalStorageIndex();
      const games = [];
      for (const id of ids.slice(0, limit)) {
        const item = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${id}`);
        if (item) {
          try {
            games.push(JSON.parse(item));
          } catch (e) {}
        }
      }
      return games.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } catch (e) {
      return [];
    }
  }

  async getGameById(id) {
    if (!id) return null;

    const db = await this.getDb();
    if (!db) {
      try {
        const item = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${id}`);
        return item ? JSON.parse(item) : null;
      } catch (e) {
        return null;
      }
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => {
          if (req.result) {
            resolve(req.result);
          } else {
            // Check localStorage
            try {
              const item = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${id}`);
              resolve(item ? JSON.parse(item) : null);
            } catch (err) {
              resolve(null);
            }
          }
        };
        req.onerror = () => {
          try {
            const item = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${id}`);
            resolve(item ? JSON.parse(item) : null);
          } catch (err) {
            resolve(null);
          }
        };
      } catch (e) {
        try {
          const item = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${id}`);
          resolve(item ? JSON.parse(item) : null);
        } catch (err) {
          resolve(null);
        }
      }
    });
  }

  async deleteGame(id) {
    if (!id) return;
    try {
      localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}${id}`);
      const ids = this._getLocalStorageIndex().filter(x => x !== id);
      this._setLocalStorageIndex(ids);
    } catch (e) {}

    const db = await this.getDb();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  async clearGames() {
    try {
      const ids = this._getLocalStorageIndex();
      for (const id of ids) {
        localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}${id}`);
      }
      localStorage.removeItem(LOCAL_STORAGE_INDEX_KEY);
    } catch (e) {}

    const db = await this.getDb();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }
}

export const gameStore = new GameStore();
