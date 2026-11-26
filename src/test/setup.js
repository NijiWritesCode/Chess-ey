import '@testing-library/jest-dom';

// In-memory Storage implementation for test environments
class MemoryStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(String(key)) ? this.store.get(String(key)) : null;
  }
  setItem(key, value) {
    this.store.set(String(key), String(value));
  }
  removeItem(key) {
    this.store.delete(String(key));
  }
  clear() {
    this.store.clear();
  }
  get length() {
    return this.store.size;
  }
  key(index) {
    return Array.from(this.store.keys())[index] || null;
  }
}

const memLocalStorage = new MemoryStorage();
const memSessionStorage = new MemoryStorage();

try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: memLocalStorage,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: memSessionStorage,
    writable: true,
    configurable: true,
  });
} catch (e) {}

if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, 'localStorage', {
      value: memLocalStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'sessionStorage', {
      value: memSessionStorage,
      writable: true,
      configurable: true,
    });
  } catch (e) {}
}

// Polyfill Web Crypto API if needed in test environment
if (typeof window !== 'undefined' && !window.crypto) {
  window.crypto = {
    getRandomValues: (buffer) => {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
      }
      return buffer;
    }
  };
}
