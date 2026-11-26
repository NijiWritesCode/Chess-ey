import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Clock } from '../../features/game/components/Clock';
import { MoveList } from '../../features/game/components/MoveList';
import { PromotionDialog } from '../../features/game/components/PromotionDialog';
import { GameOverModal } from '../../features/game/components/GameOverModal';
import { GameControls } from '../../features/game/components/GameControls';

describe('Phase 2 UI Components', () => {
  describe('Clock Component', () => {
    it('renders time properly in mm:ss format', () => {
      render(<Clock timeMs={300000} isActive={true} player="White" />);
      expect(screen.getByRole('timer')).toHaveTextContent('5:00');
    });

    it('shows tenths of seconds when under 20 seconds', () => {
      render(<Clock timeMs={15400} isActive={true} player="Black" />);
      expect(screen.getByRole('timer')).toHaveTextContent('0:15.4');
    });

    it('triggers onTimeout when expired', () => {
      const onTimeout = vi.fn();
      render(<Clock timeMs={0} isActive={true} player="White" onTimeout={onTimeout} />);
      expect(onTimeout).toHaveBeenCalled();
    });
  });

  describe('MoveList Component', () => {
    const mockMoves = [
      { ply: 1, san: 'e4' },
      { ply: 2, san: 'e5' },
      { ply: 3, san: 'Nf3' },
      { ply: 4, san: 'Nc6' }
    ];

    it('renders move pairs with correct numbering and SAN', () => {
      render(<MoveList moves={mockMoves} currentPly={4} isLive={true} />);
      expect(screen.getByText('1.')).toBeInTheDocument();
      expect(screen.getByText('2.')).toBeInTheDocument();
      expect(screen.getByText('e4')).toBeInTheDocument();
      expect(screen.getByText('e5')).toBeInTheDocument();
      expect(screen.getByText('Nf3')).toBeInTheDocument();
      expect(screen.getByText('Nc6')).toBeInTheDocument();
    });

    it('calls onSelectPly when a move is clicked', () => {
      const onSelectPly = vi.fn();
      render(<MoveList moves={mockMoves} currentPly={4} onSelectPly={onSelectPly} />);
      fireEvent.click(screen.getByText('e4'));
      expect(onSelectPly).toHaveBeenCalledWith(1);
    });

    it('renders navigation buttons and triggers selection', () => {
      const onSelectPly = vi.fn();
      render(<MoveList moves={mockMoves} currentPly={4} onSelectPly={onSelectPly} />);
      const firstButton = screen.getByLabelText('First Move');
      fireEvent.click(firstButton);
      expect(onSelectPly).toHaveBeenCalledWith(0);
    });
  });

  describe('PromotionDialog Component', () => {
    it('does not render when isOpen is false', () => {
      const { container } = render(<PromotionDialog isOpen={false} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders Queen, Rook, Bishop, Knight choices and handles selection', () => {
      const onSelect = vi.fn();
      render(<PromotionDialog isOpen={true} turn="w" onSelect={onSelect} />);

      expect(screen.getByLabelText('Promote to Queen')).toBeInTheDocument();
      expect(screen.getByLabelText('Promote to Rook')).toBeInTheDocument();
      expect(screen.getByLabelText('Promote to Bishop')).toBeInTheDocument();
      expect(screen.getByLabelText('Promote to Knight')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Promote to Queen'));
      expect(onSelect).toHaveBeenCalledWith('q');
    });
  });

  describe('GameOverModal Component', () => {
    it('renders victory message when player wins', () => {
      const onNewGame = vi.fn();
      render(
        <GameOverModal
          isOpen={true}
          result={{ winner: 'white', reason: 'checkmate' }}
          playerColor="w"
          onNewGame={onNewGame}
        />
      );

      expect(screen.getByText('Victory!')).toBeInTheDocument();
      expect(screen.getByText('Flawless checkmate executed!')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Play Again'));
      expect(onNewGame).toHaveBeenCalled();
    });

    it('renders draw message for stalemate', () => {
      render(
        <GameOverModal
          isOpen={true}
          result={{ winner: 'draw', reason: 'stalemate' }}
          playerColor="w"
        />
      );

      expect(screen.getByText('Match Drawn')).toBeInTheDocument();
      expect(screen.getByText('Drawn by stalemate: no legal moves available.')).toBeInTheDocument();
    });
  });

  describe('GameControls Component', () => {
    it('renders flip, undo, and resign controls', () => {
      const onFlipBoard = vi.fn();
      const onUndo = vi.fn();
      const onResign = vi.fn();

      render(
        <GameControls
          onFlipBoard={onFlipBoard}
          onUndo={onUndo}
          onResign={onResign}
          canUndo={true}
          isGameOver={false}
        />
      );

      fireEvent.click(screen.getByLabelText('Flip Board'));
      expect(onFlipBoard).toHaveBeenCalled();

      fireEvent.click(screen.getByLabelText('Undo Move'));
      expect(onUndo).toHaveBeenCalled();

      fireEvent.click(screen.getByTitle('Resign this match'));
      expect(onResign).toHaveBeenCalled();
    });
  });
});
