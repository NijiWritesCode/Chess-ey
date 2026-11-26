import React, { useEffect } from 'react';
import { Clock as ClockIcon } from 'lucide-react';

/**
 * Clock component displaying countdown timer with high-precision sub-second display
 * when time drops below 20 seconds.
 */
export function Clock({
  timeMs = 600000,
  isActive = false,
  isLowTime = false,
  player = 'White',
  onTimeout = () => {}
}) {
  const totalSeconds = Math.max(0, Math.floor(timeMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((Math.max(0, timeMs) % 1000) / 100);

  // Under 20 seconds, show tenths of a second for bullet/blitz precision
  const showTenths = totalSeconds < 20 && totalSeconds > 0;
  const isExpired = totalSeconds === 0 && timeMs <= 0;
  const isCritical = isLowTime || (totalSeconds < 30 && totalSeconds > 0);

  useEffect(() => {
    if (isExpired && isActive) {
      onTimeout();
    }
  }, [isExpired, isActive, onTimeout]);

  const formattedTime = showTenths
    ? `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div
      role="timer"
      aria-label={`${player} clock: ${formattedTime}`}
      className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-mono text-base font-bold transition-all shadow-sm ${
        isActive
          ? isCritical
            ? 'bg-red-500/20 border-red-500 text-red-300 animate-pulse ring-2 ring-red-500/40'
            : 'bg-canvas-subtle border-accent-500 text-ivory shadow-md ring-1 ring-accent-500/30'
          : 'bg-canvas-card border-canvas-border text-ivory-muted opacity-80'
      }`}
    >
      <ClockIcon className={`w-3.5 h-3.5 ${isActive ? 'text-accent-400' : 'text-ivory-faint'}`} />
      <span>{formattedTime}</span>
    </div>
  );
}

export default Clock;
