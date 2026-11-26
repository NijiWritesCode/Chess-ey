// Interactive Evaluation Advantage Chart for Game Review
// Renders centipawn / win chance fluctuations with blunder/mistake/brilliant markers and click-to-navigate plies.

import React, { useMemo } from 'react';

export default function EvaluationGraph({
  evalHistory = [],
  currentPly = 0,
  onSelectPly = () => {},
  height = 120,
  className = ''
}) {
  if (!evalHistory || evalHistory.length <= 1) {
    return (
      <div className={`flex items-center justify-center bg-slate-900/60 rounded-xl border border-slate-800 text-xs text-slate-500 p-4 ${className}`}>
        No evaluation graph data available yet.
      </div>
    );
  }

  const { points, zeroY, pathD, areaWhiteD, areaBlackD, markers } = useMemo(() => {
    const width = 1000;
    const padding = 15;
    const availableWidth = width - padding * 2;
    const availableHeight = height - padding * 2;
    const zeroLineY = height / 2;

    // Convert evaluations to clamped [-1000, 1000] range for graph display
    const rawPoints = evalHistory.map((item, idx) => {
      let cp = item.cp !== undefined ? item.cp : 0;
      if (item.mate !== undefined && item.mate !== null) {
        cp = item.mate > 0 ? 1000 : -1000;
      }
      const clampedCp = Math.max(-1000, Math.min(1000, cp));
      // Invert Y because SVG 0 is top
      // clampedCp +1000 -> Y = padding
      // clampedCp 0 -> Y = zeroLineY
      // clampedCp -1000 -> Y = height - padding
      const y = zeroLineY - (clampedCp / 1000) * (availableHeight / 2);
      const x = padding + (idx / (evalHistory.length - 1)) * availableWidth;

      return {
        x,
        y,
        ply: item.ply ?? idx,
        san: item.san || '',
        cp,
        classification: item.classification
      };
    });

    if (rawPoints.length === 0) {
      return { points: [], zeroY: zeroLineY, pathD: '', areaWhiteD: '', areaBlackD: '', markers: [] };
    }

    // Build line path
    const lineCommands = rawPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');

    // Area paths
    const firstX = rawPoints[0].x.toFixed(1);
    const lastX = rawPoints[rawPoints.length - 1].x.toFixed(1);

    const areaWhite = `${lineCommands} L ${lastX} ${zeroLineY} L ${firstX} ${zeroLineY} Z`;

    // Markers for tactical highlights
    const specialMarkers = rawPoints.filter((pt) => {
      const id = pt.classification?.id;
      return id === 'blunder' || id === 'mistake' || id === 'miss' || id === 'brilliant' || id === 'great';
    });

    return {
      points: rawPoints,
      zeroY: zeroLineY,
      pathD: lineCommands,
      areaWhiteD: areaWhite,
      markers: specialMarkers
    };
  }, [evalHistory, height]);

  const currentPoint = points.find((p) => p.ply === currentPly) || points[currentPly] || null;

  return (
    <div className={`relative bg-slate-900/90 rounded-xl border border-slate-800 p-2 overflow-hidden shadow-inner select-none ${className}`}>
      <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium px-2 pb-1 border-b border-slate-800/80">
        <span>Evaluation Advantage</span>
        <span className="font-mono text-slate-300">
          {currentPoint ? `${currentPoint.san ? `${currentPoint.san}: ` : ''}${currentPoint.cp > 0 ? `+${(currentPoint.cp / 100).toFixed(1)}` : (currentPoint.cp / 100).toFixed(1)}` : '0.0'}
        </span>
      </div>

      <div className="relative w-full" style={{ height: `${height}px` }}>
        <svg
          viewBox={`0 0 1000 ${height}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="whiteAdvantageGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
          </defs>

          {/* Center 0.0 baseline */}
          <line
            x1="15"
            y1={zeroY}
            x2="985"
            y2={zeroY}
            stroke="#334155"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Area under curve */}
          <path d={areaWhiteD} fill="url(#whiteAdvantageGrad)" />

          {/* Evaluation curve */}
          <path
            d={pathD}
            fill="none"
            stroke="url(#lineGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Current ply vertical guide */}
          {currentPoint && (
            <g>
              <line
                x1={currentPoint.x}
                y1="10"
                x2={currentPoint.x}
                y2={height - 10}
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              <circle
                cx={currentPoint.x}
                cy={currentPoint.y}
                r="5"
                fill="#38bdf8"
                stroke="#0f172a"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Highlight markers for blunders/brilliants */}
          {markers.map((m, idx) => {
            const id = m.classification?.id;
            let fill = '#fa412d'; // Blunder default
            if (id === 'mistake') fill = '#e58f2a';
            if (id === 'miss') fill = '#ef4444';
            if (id === 'brilliant') fill = '#1baaa7';
            if (id === 'great') fill = '#5c8bb0';

            return (
              <circle
                key={`m-${idx}-${m.ply}`}
                cx={m.x}
                cy={m.y}
                r={id === 'brilliant' ? 5 : 4}
                fill={fill}
                stroke="#0f172a"
                strokeWidth="1.5"
                className="cursor-pointer transition-transform hover:scale-150"
                onClick={() => onSelectPly(m.ply)}
              >
                <title>{`${m.san}: ${m.classification?.label || id}`}</title>
              </circle>
            );
          })}
        </svg>

        {/* Clickable overlay targets for each ply */}
        <div className="absolute inset-0 flex">
          {points.map((pt) => (
            <div
              key={`target-${pt.ply}`}
              onClick={() => onSelectPly(pt.ply)}
              title={`${pt.ply}. ${pt.san}`}
              className="flex-1 h-full cursor-pointer hover:bg-white/5 transition-colors"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
