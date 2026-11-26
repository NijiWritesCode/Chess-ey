import React from 'react';

// Authentic Chess.com denotation glyphs, token badges, and color styling
export const CHESS_COM_BADGES = {
  brilliant: { symbol: '!!', bg: '#1baaa7', text: '#ffffff' },
  great: { symbol: '!', bg: '#5c8bb0', text: '#ffffff' },
  best: { symbol: '★', bg: '#81b64c', text: '#ffffff' },
  excellent: { symbol: '👍', bg: '#96bc4b', text: '#ffffff' },
  good: { symbol: '✔', bg: '#86a666', text: '#ffffff' },
  book: { symbol: '📖', bg: '#d5a47e', text: '#ffffff' },
  forced: { symbol: '□', bg: '#8c8c8c', text: '#ffffff' },
  interesting: { symbol: '!?', bg: '#a855f7', text: '#ffffff' },
  inaccuracy: { symbol: '?!', bg: '#f0c15c', text: '#ffffff' },
  mistake: { symbol: '?', bg: '#e58f2a', text: '#ffffff' },
  miss: { symbol: '❌', bg: '#ef4444', text: '#ffffff' },
  missed_win: { symbol: '❌', bg: '#ef4444', text: '#ffffff' },
  blunder: { symbol: '??', bg: '#fa412d', text: '#ffffff' },
  only_move: { symbol: '!', bg: '#5c8bb0', text: '#ffffff' }
};

/**
 * On-board move denotation token badge (anchored in square corner like Chess.com reference)
 */
export function BoardClassificationBadge({ classification }) {
  if (!classification) return null;
  const id = (typeof classification === 'string' ? classification : classification?.id || '')?.toLowerCase();
  const badgeConfig = CHESS_COM_BADGES[id] || {
    symbol: classification.symbol || '✔',
    bg: classification.badgeColor || '#81b64c',
    text: '#ffffff'
  };

  const isEmoji = badgeConfig.symbol === '👍' || badgeConfig.symbol === '❌';

  return (
    <div
      className="absolute z-30 pointer-events-none select-none flex items-center justify-center font-black text-white shadow-md animate-in zoom-in-75 duration-150"
      style={{
        bottom: '2px',
        right: '2px',
        width: '24px',
        height: '24px',
        borderRadius: '9999px',
        backgroundColor: badgeConfig.bg,
        border: '2px solid #ffffff',
        boxShadow: '0 2px 5px rgba(0, 0, 0, 0.45)',
        fontSize: isEmoji ? '11px' : badgeConfig.symbol.length > 1 ? '10px' : '13px',
        lineHeight: 1
      }}
      title={classification.label || id}
    >
      {badgeConfig.symbol === '📖' ? (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" />
        </svg>
      ) : badgeConfig.symbol === '❌' ? (
        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <span>{badgeConfig.symbol}</span>
      )}
    </div>
  );
}

export function MoveClassificationBadge({ classification, size = 'sm', showLabel = true }) {
  if (!classification) return null;

  const id = (classification.id || '')?.toLowerCase();
  const badgeConfig = CHESS_COM_BADGES[id] || {
    symbol: classification.symbol || '✔',
    bg: classification.badgeColor || '#81b64c',
    text: '#ffffff'
  };

  const isSm = size === 'sm';
  const isEmoji = badgeConfig.symbol === '👍' || badgeConfig.symbol === '❌';

  const tokenCircle = (
    <span
      className={`inline-flex items-center justify-center rounded-full font-black font-sans leading-none select-none shadow-sm shrink-0 ${
        isSm ? 'w-4 h-4' : 'w-5 h-5'
      }`}
      style={{
        backgroundColor: badgeConfig.bg,
        color: badgeConfig.text,
        fontSize: isEmoji ? (isSm ? '8px' : '10px') : isSm ? (badgeConfig.symbol.length > 1 ? '8px' : '10px') : (badgeConfig.symbol.length > 1 ? '9px' : '11px')
      }}
    >
      {badgeConfig.symbol === '📖' ? (
        <svg className={isSm ? 'w-2.5 h-2.5' : 'w-3 h-3'} viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" />
        </svg>
      ) : badgeConfig.symbol === '❌' ? (
        <svg className={isSm ? 'w-2 h-2' : 'w-2.5 h-2.5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <span>{badgeConfig.symbol}</span>
      )}
    </span>
  );

  if (!showLabel) {
    return (
      <span title={`${classification.label || id}: ${classification.description || ''}`} className="inline-flex items-center">
        {tokenCircle}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold rounded-lg border transition-colors ${
        isSm ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      }`}
      style={{
        backgroundColor: `${badgeConfig.bg}22`,
        borderColor: `${badgeConfig.bg}77`,
        color: badgeConfig.bg === '#f0c15c' ? '#fde047' : badgeConfig.bg
      }}
      title={`${classification.label || id}: ${classification.description || ''}`}
    >
      {tokenCircle}
      <span>{classification.label || id}</span>
    </span>
  );
}

