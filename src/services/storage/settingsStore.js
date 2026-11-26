// User Settings Store with localStorage persistence and reactive change listeners

export const BOARD_THEMES = [
  { id: 'classic-green', name: 'Emerald Wood', light: '#edeed1', dark: '#779952' },
  { id: 'slate', name: 'Deep Slate', light: '#dee3e6', dark: '#5b6a78' },
  { id: 'walnut', name: 'Warm Walnut', light: '#f0d9b5', dark: '#b58863' },
  { id: 'monochrome', name: 'Charcoal Minimal', light: '#c4c9cd', dark: '#444c56' },
  { id: 'midnight', name: 'Midnight Navy', light: '#cbd5e1', dark: '#334155' }
];

export const TIME_CONTROLS = [
  { id: 'rapid-10', name: '10 min', initialSeconds: 600, increment: 0, category: 'Rapid' },
  { id: 'rapid-15-10', name: '15 | 10', initialSeconds: 900, increment: 10, category: 'Rapid' },
  { id: 'blitz-5', name: '5 min', initialSeconds: 300, increment: 0, category: 'Blitz' },
  { id: 'blitz-3-2', name: '3 | 2', initialSeconds: 180, increment: 2, category: 'Blitz' },
  { id: 'bullet-1', name: '1 min', initialSeconds: 60, increment: 0, category: 'Bullet' },
  { id: 'custom-unlimited', name: 'Unlimited', initialSeconds: 0, increment: 0, category: 'Casual' }
];

const DEFAULT_SETTINGS = {
  // Gameplay
  defaultColor: 'white', // 'white' | 'black' | 'random'
  timeControl: 'rapid-10',
  boardTheme: 'classic-green',
  enableSounds: true,
  showLegalMoves: true,
  highlightLastMove: true,

  // Live Analysis (Move Denotation & Eval Bar — OFF by default per user preference)
  enableLiveAnalysis: false,
  showEvalBar: true,
  showBestMoveArrow: true,
  showEngineScores: true,
  liveDepth: 12,

  // Game Review
  reviewDepth: 16,
  autoReviewGame: true
};

const STORAGE_KEY = 'chessey_settings_v2';

class SettingsManager {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.listeners = new Set();
    this.load();
  }

  load() {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage', e);
    }
  }

  save() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      this.notify();
    } catch (e) {
      console.warn('Failed to save settings to localStorage', e);
    }
  }

  get(key) {
    return this.settings[key];
  }

  getAll() {
    return { ...this.settings };
  }

  update(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.save();
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.settings);
    }
  }
}

export const settingsManager = new SettingsManager();
