import React, { useMemo } from 'react';

export function EvaluationGraph({
  evalHistory = [], // array of { ply, score, cp, isMate, classification }
  currentPly = 0,
  onSelectPly = () => {},
  height = 140
}) {
  const width = 600; // viewBox coordinate space

  const points = useMemo(() => {
    if (!evalHistory || evalHistory.length === 0) return [];

    const totalPlies = Math.max(1, evalHistory.length - 1);

    return evalHistory.map((item, idx) => {
      const x = (idx / totalPlies) * (width - 40) + 20;

      // Clamp centipawns between -1000 and +1000 for chart scaling
      const clampedCp = Math.max(-1000, Math.min(1000, item.cp || 0));
      // Normalize to 0 (top = +1000) to height (bottom = -1000)
      // Midline is height / 2 (0 cp)
      const y = (height / 2) - (clampedCp / 1000) * ((height - 30) / 2);

      return {
        ...item,
        x,
        y
      };
    });
  }, [evalHistory, height, width]);

  // Construct SVG path string for area and line
  const { linePath, areaPath } = useMemo(() => {
    if (points.length === 0) return { linePath: '', areaPath: '' };

    let line = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      line += ` L ${points[i].x} ${points[i].y}`;
    }

    const midY = height / 2;
    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    const area = `${line} L ${lastX} ${midY} L ${firstX} ${midY} Z`;

    return { linePath: line, areaPath: area };
  }, [points, height]);

  // Find currently active point
  const activePoint = points.find(p => p.ply === currentPly) || points[0];

  return (
    <div className="bg-canvas-card border border-canvas-border rounded-xl p-3 shadow-md flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-ivory-muted px-1">
        <span className="font-semibold text-ivory">Evaluation Flow</span>
        <span>Click anywhere to inspect position</span>
      </div>

      <div className="relative w-full overflow-hidden select-none cursor-pointer">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = ((e.clientX - rect.left) / rect.width) * width;
            // Find closest point
            let closest = points[0];
            let minDist = Infinity;
            points.forEach(p => {
              const dist = Math.abs(p.x - clickX);
              if (dist < minDist) {
                minDist = dist;
                closest = p;
              }
            });
            if (closest) onSelectPly(closest.ply);
          }}
        >
          <defs>
            <linearGradient id="evalGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#64748b" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.4" />
            </linearGradient>
          </defs>

          {/* Midline (0.00 Equal) */}
          <line
            x1="10"
            y1={height / 2}
            x2={width - 10}
            y2={height / 2}
            stroke="#484f58"
            strokeDasharray="4 4"
            strokeWidth="1"
          />

          {/* Area Fill */}
          {areaPath && (
            <path d={areaPath} fill="url(#evalGradient)" />
          )}

          {/* Evaluation Line */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#e2ded4"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Critical Move Dots */}
          {points.map((p) => {
            const classId = p.classification?.id;
            if (!classId) return null;

            let color = null;
            let radius = 3.5;

            if (classId === 'blunder') color = '#fa412d';
            else if (classId === 'mistake') color = '#e58f2a';
            else if (classId === 'missed_win' || classId === 'miss') color = '#ef4444';
            else if (classId === 'brilliant') {
              color = '#1baaa7';
              radius = 4.5;
            }

            if (!color) return null;

            return (
              <circle
                key={p.ply}
                cx={p.x}
                cy={p.y}
                r={radius}
                fill={color}
                stroke="#161b22"
                strokeWidth="1.5"
                className="transition-transform hover:scale-150"
              />
            );
          })}

          {/* Current Position Marker */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                y1="10"
                x2={activePoint.x}
                y2={height - 10}
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="5"
                fill="#38bdf8"
                stroke="#fff"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

