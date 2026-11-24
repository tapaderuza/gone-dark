import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import {
  BAND_LIMITS,
  CELLS,
  COLS,
  ROWS,
  cellCol,
  cellRow,
  isSea,
  type Band,
  type Clue,
  type Drop,
} from '../shared/engine';

export const BAND_COLORS = [
  '#ffffff',
  '#ff7a59',
  '#ffb547',
  '#7fd1c7',
  '#8a9ba6',
] as const;

export const cellLabel = (cell: number): string =>
  `${String.fromCharCode(65 + cellCol(cell))}${cellRow(cell) + 1}`;

const cx = (cell: number) => cellCol(cell) + 0.5;
const cy = (cell: number) => cellRow(cell) + 0.5;
const circle = (x: number, y: number, r: number) =>
  `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;

const GRID = (() => {
  let d = '';
  for (let x = 1; x < COLS; x++) d += `M${x},0V${ROWS}`;
  for (let y = 1; y < ROWS; y++) d += `M0,${y}H${COLS}`;
  return d;
})();

type Props = {
  label: string;
  mask: string;
  coast: string;
  clue: Clue;
  drops: readonly Drop[];
  /** Cells where the ship can still be. */
  lit: ReadonlySet<number>;
  /** Cells the ship could reach but the readings rule out. */
  ruledOut: ReadonlySet<number>;
  selected: number | null;
  ship: number | null;
  found: boolean;
  heat: Record<string, number> | null;
  interactive: boolean;
  onSelect: (cell: number) => void;
  onConfirm: () => void;
};

const Ring = ({ drop, faded }: { drop: Drop; faded: boolean }) => {
  const x = cx(drop.cell);
  const y = cy(drop.cell);
  const color = BAND_COLORS[drop.band];
  const o = faded ? 0.35 : 1;
  if (drop.band === 0) return null;
  if (drop.band === 4) {
    return (
      <circle
        cx={x}
        cy={y}
        r={BAND_LIMITS[2]}
        fill="none"
        stroke={color}
        strokeWidth={0.04}
        strokeDasharray="0.12 0.12"
        opacity={0.5 * o}
      />
    );
  }
  const band = drop.band as 1 | 2 | 3;
  const lo = band === 1 ? 0 : BAND_LIMITS[band - 2]!;
  const hi = BAND_LIMITS[band - 1]!;
  return (
    <g opacity={o}>
      <path
        d={circle(x, y, hi) + (lo ? circle(x, y, lo) : '')}
        fillRule="evenodd"
        fill={color}
        opacity={0.13}
      />
      <circle
        cx={x}
        cy={y}
        r={hi}
        fill="none"
        stroke={color}
        strokeWidth={0.05}
        strokeDasharray="0.16 0.1"
      />
      {lo > 0 && (
        <circle
          cx={x}
          cy={y}
          r={lo}
          fill="none"
          stroke={color}
          strokeWidth={0.05}
          strokeDasharray="0.16 0.1"
        />
      )}
    </g>
  );
};

export const Chart = (p: Props) => {
  const svgRef = useRef<SVGSVGElement>(null);

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    if (!p.interactive) return;
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      ctm.inverse()
    );
    const c = Math.floor(pt.x);
    const r = Math.floor(pt.y);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
    p.onSelect(r * COLS + c);
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!p.interactive) return;
    const from = p.selected ?? p.clue.cell;
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -COLS,
      ArrowDown: COLS,
    };
    const step = moves[e.key];
    if (step !== undefined) {
      e.preventDefault();
      const next = from + step;
      const wraps =
        (step === -1 && cellCol(from) === 0) ||
        (step === 1 && cellCol(from) === COLS - 1);
      if (next >= 0 && next < CELLS && !wraps) p.onSelect(next);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      p.onConfirm();
    }
  };

  const heatMax = p.heat ? Math.max(1, ...Object.values(p.heat)) : 1;
  const last = p.drops.length - 1;
  const shallow: number[] = [];
  for (let i = 0; i < CELLS; i++) if (!isSea(p.mask, i)) shallow.push(i);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${COLS} ${ROWS}`}
      className="block h-full w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-amber"
      role="application"
      aria-label={p.label}
      tabIndex={0}
      onPointerDown={pick}
      onKeyDown={onKey}
    >
      <defs>
        <clipPath id="frame">
          <rect width={COLS} height={ROWS} rx={0.18} />
        </clipPath>
        <pattern
          id="ruled"
          width={0.28}
          height={0.28}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={0.28}
            stroke="#9db3bf"
            strokeWidth={0.035}
            opacity={0.32}
          />
        </pattern>
      </defs>
      <g clipPath="url(#frame)">
        <rect width={COLS} height={ROWS} fill="#0b2233" />
        {[...p.lit].map((c) => (
          <rect
            key={`l${c}`}
            x={cellCol(c)}
            y={cellRow(c)}
            width={1}
            height={1}
            fill="#145071"
            opacity={0.75}
          />
        ))}
        {[...p.ruledOut].map((c) => (
          <rect
            key={`r${c}`}
            x={cellCol(c)}
            y={cellRow(c)}
            width={1}
            height={1}
            fill="url(#ruled)"
          />
        ))}
        {shallow.map((c) => (
          <rect
            key={`s${c}`}
            x={cellCol(c)}
            y={cellRow(c)}
            width={1}
            height={1}
            fill="#c9b98f"
            opacity={0.06}
          />
        ))}
        {p.heat &&
          Object.entries(p.heat).map(([cell, n]) => (
            <rect
              key={`h${cell}`}
              x={cellCol(Number(cell)) + 0.08}
              y={cellRow(Number(cell)) + 0.08}
              width={0.84}
              height={0.84}
              rx={0.12}
              fill="#ffb547"
              opacity={0.12 + 0.7 * (n / heatMax)}
            />
          ))}
        <path d={GRID} stroke="#9db3bf" strokeWidth={0.02} opacity={0.18} />
        <path
          d={p.coast}
          fill="#25281f"
          stroke="#c9b98f"
          strokeWidth={0.045}
          strokeLinejoin="round"
        />
        {p.drops.map((d, i) => (
          <Ring
            key={`g${d.cell}`}
            drop={d}
            faded={i !== last || p.ship !== null}
          />
        ))}
        <g stroke="#ffb547" strokeWidth={0.06} fill="none" aria-hidden>
          <circle cx={cx(p.clue.cell)} cy={cy(p.clue.cell)} r={0.26} />
          <path
            d={`M${cx(p.clue.cell) - 0.5},${cy(p.clue.cell)}h0.18M${cx(p.clue.cell) + 0.32},${cy(p.clue.cell)}h0.18M${cx(p.clue.cell)},${cy(p.clue.cell) - 0.5}v0.18M${cx(p.clue.cell)},${cy(p.clue.cell) + 0.32}v0.18`}
          />
        </g>
        {p.drops.map((d, i) => (
          <g key={`b${d.cell}`}>
            <circle
              cx={cx(d.cell)}
              cy={cy(d.cell)}
              r={0.3}
              fill={BAND_COLORS[d.band]}
              stroke="#06121c"
              strokeWidth={0.06}
            />
            <text
              x={cx(d.cell)}
              y={cy(d.cell) + 0.01}
              fontSize={0.36}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#06121c"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {i + 1}
            </text>
          </g>
        ))}
        {p.ship !== null && (
          <g transform={`translate(${cx(p.ship)} ${cy(p.ship)})`}>
            <circle
              r={0.5}
              fill="none"
              stroke={p.found ? '#ffffff' : '#ff7a59'}
              strokeWidth={0.05}
              className="pulse"
            />
            <path
              d="M0,-0.4L0.2,0.05L0.15,0.36L-0.15,0.36L-0.2,0.05Z"
              fill={p.found ? '#ffffff' : '#ff7a59'}
              stroke="#06121c"
              strokeWidth={0.05}
            />
          </g>
        )}
        {p.selected !== null && (
          <rect
            x={cellCol(p.selected) + 0.06}
            y={cellRow(p.selected) + 0.06}
            width={0.88}
            height={0.88}
            rx={0.12}
            fill="#ffb547"
            fillOpacity={0.18}
            stroke="#ffb547"
            strokeWidth={0.07}
          />
        )}
      </g>
      <rect
        width={COLS}
        height={ROWS}
        rx={0.18}
        fill="none"
        stroke="#9db3bf"
        strokeOpacity={0.35}
        strokeWidth={0.04}
      />
    </svg>
  );
};

export type { Band };
