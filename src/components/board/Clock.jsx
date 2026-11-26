import React, { useEffect } from 'react';
import { Clock as ClockIcon } from 'lucide-react';

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
  const tenths = Math.floor((timeMs % 1000) / 100);

  // Under 20 seconds, show tenths of a second for bullet/blitz precision
  const showTenths = totalSeconds < 20 && totalSeconds > 0;
  const isExpired = totalSeconds === 0;

  useEffect(() => {
    if (isExpired && isActive) {
      onTimeout();
    }
  }, [isExpired, isActive, onTimeout]);

  const formattedTime = showTenths
    ? `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const isCritical = totalSeconds < 30 && totalSeconds > 0;

  return (
    <div
      className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 font-mono text-base font-bold transition-all ${
        isActive
          ? isCritical
            ? 'bg-red-500/20 border-red-500 text-red-300 animate-pulse'
            : 'bg-canvas-subtle border-accent-500 text-ivory shadow-md'
          : 'bg-canvas-card border-canvas-border text-ivory-muted'
      }`}
    >
      <ClockIcon className={`w-3.5 h-3.5 ${isActive ? 'text-accent-400' : 'text-ivory-faint'}`} />
      <span>{formattedTime}</span>
    </div>
  );
}

