import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { settingsManager, BOARD_THEMES, TIME_CONTROLS } from '../../services/storage/settingsStore';
import { SettingsModal } from '../../components/modals/SettingsModal';
import { GameOverModal } from '../../features/game/components/GameOverModal';
import { NotFoundPage } from '../../pages/NotFoundPage';
import RecentGamesPage from '../../features/history/pages/RecentGamesPage';
import { soundEngine } from '../../utils/sound';
import { historyStorage } from '../../features/history/services/historyStorage';

describe('Phase 9: Settings, Experience and Product Polish', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    settingsManager.load();
  });

  describe('9.1: Settings Store & Reactive Persistence', () => {
    it('initializes with complete standard settings defaults', () => {
      const allSettings = settingsManager.getAll();

      expect(allSettings).toHaveProperty('defaultColor');
      expect(allSettings).toHaveProperty('timeControl');
      expect(allSettings).toHaveProperty('boardTheme');
      expect(allSettings).toHaveProperty('enableSounds');
      expect(allSettings).toHaveProperty('showLegalMoves');
      expect(allSettings).toHaveProperty('highlightLastMove');
      expect(allSettings).toHaveProperty('enableLiveAnalysis');
      expect(allSettings).toHaveProperty('showEvalBar');
      expect(allSettings).toHaveProperty('showBestMoveArrow');
      expect(allSettings).toHaveProperty('showEngineScores');
      expect(allSettings).toHaveProperty('liveDepth');
      expect(allSettings).toHaveProperty('reviewDepth');
      expect(allSettings).toHaveProperty('autoReviewGame');
    });

    it('persists changes to localStorage and notifies reactive subscribers', () => {
      const listenerSpy = vi.fn();
      const unsubscribe = settingsManager.subscribe(listenerSpy);

      settingsManager.update({
        boardTheme: 'walnut',
        liveDepth: 14,
        enableSounds: false
      });

      expect(listenerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          boardTheme: 'walnut',
          liveDepth: 14,
          enableSounds: false
        })
      );

      expect(settingsManager.get('boardTheme')).toBe('walnut');
      expect(settingsManager.get('liveDepth')).toBe(14);
      expect(settingsManager.get('enableSounds')).toBe(false);

      unsubscribe();
    });

    it('toggles soundEngine enabled status when audio setting changes', () => {
      const soundSpy = vi.spyOn(soundEngine, 'setEnabled');

      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      // Find move sound effects checkbox
      const soundCheckbox = screen.getByLabelText(/Move Sound Effects/i, { selector: 'input' });
      expect(soundCheckbox).toBeInTheDocument();

      fireEvent.click(soundCheckbox);
      expect(soundSpy).toHaveBeenCalled();
    });
  });

  describe('9.2 & 9.4: Modals, Keyboard Interaction & Polish', () => {
    it('SettingsModal closes on Escape key press and on Done click', () => {
      const closeSpy = vi.fn();
      const { rerender } = render(<SettingsModal isOpen={true} onClose={closeSpy} />);

      expect(screen.getByRole('dialog', { name: /Chess & Engine Settings/i })).toBeInTheDocument();

      // Press Escape key
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      expect(closeSpy).toHaveBeenCalledTimes(1);

      // Click "Done" button
      const doneBtn = screen.getByRole('button', { name: /Done/i });
      fireEvent.click(doneBtn);
      expect(closeSpy).toHaveBeenCalledTimes(2);

      // Verify unmount when isOpen is false
      rerender(<SettingsModal isOpen={false} onClose={closeSpy} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('GameOverModal displays outcome, accuracy summary, and invokes restart or review', () => {
      const restartSpy = vi.fn();
      const reviewSpy = vi.fn();

      render(
        <GameOverModal
          isOpen={true}
          result={{ winner: 'white', reason: 'checkmate' }}
          playerColor="w"
          whiteName="Alice"
          blackName="Bob"
          whiteAccuracy={88.5}
          blackAccuracy={71.2}
          onRematch={restartSpy}
          onStartReview={reviewSpy}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText(/Victory!/i)).toBeInTheDocument();
      expect(screen.getByText(/Flawless checkmate executed!/i)).toBeInTheDocument();
      expect(screen.getByText(/88.5%/i)).toBeInTheDocument();
      expect(screen.getByText(/71.2%/i)).toBeInTheDocument();

      const playAgainBtn = screen.getByRole('button', { name: /Play Again/i });
      fireEvent.click(playAgainBtn);
      expect(restartSpy).toHaveBeenCalled();

      const reviewBtn = screen.getByRole('button', { name: /Review \/ Analyze Game/i });
      fireEvent.click(reviewBtn);
      expect(reviewSpy).toHaveBeenCalled();
    });
  });

  describe('9.3 & 9.4: Empty States, Route Navigation & Error Handling', () => {
    it('NotFoundPage renders 404 message and working navigation shortcuts', () => {
      render(
        <BrowserRouter>
          <NotFoundPage />
        </BrowserRouter>
      );

      expect(screen.getByText(/404/i)).toBeInTheDocument();
      expect(screen.getByText(/Position Not Found/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Play against Stockfish/i })).toHaveAttribute('href', '/computer');
      expect(screen.getByRole('link', { name: /Multiplayer Room/i })).toHaveAttribute('href', '/multiplayer');
      expect(screen.getByRole('link', { name: /Analysis Board/i })).toHaveAttribute('href', '/analysis');
    });

    it('RecentGamesPage displays empty state when no games exist and provides action buttons', async () => {
      vi.spyOn(historyStorage, 'getRecentGames').mockResolvedValue([]);

      render(
        <BrowserRouter>
          <RecentGamesPage />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/No games found/i)).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /Play Stockfish/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Play a Friend/i })).toBeInTheDocument();
    });
  });
});
