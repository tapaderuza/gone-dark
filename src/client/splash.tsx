import './index.css';

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Summary } from '../shared/api';
import { CELLS, COLS, ROWS, cellCol, cellRow } from '../shared/engine';
import { isError, loadSummary, openGame } from './api';

const Backdrop = ({ mask }: { mask: string }) => (
  <svg
    viewBox={`0 0 ${COLS} ${ROWS}`}
    preserveAspectRatio="xMidYMid slice"
    className="absolute inset-0 h-full w-full opacity-40"
    aria-hidden
  >
    {Array.from({ length: CELLS }, (_, i) =>
      mask[i] === '1' ? null : (
        <rect
          key={i}
          x={cellCol(i) + 0.12}
          y={cellRow(i) + 0.12}
          width={0.76}
          height={0.76}
          rx={0.12}
          fill="#c9b98f"
          opacity={0.35}
        />
      )
    )}
    <g transform={`translate(${COLS / 2} ${ROWS / 2})`}>
      <circle
        r={1.2}
        fill="none"
        stroke="#ffb547"
        strokeWidth={0.06}
        className="sonar"
      />
      <circle
        r={1.2}
        fill="none"
        stroke="#ffb547"
        strokeWidth={0.06}
        className="sonar sonar-late"
      />
    </g>
  </svg>
);

export const Splash = () => {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    void loadSummary().then((r) => {
      if (!isError(r)) setS(r);
    });
  }, []);

  const cta =
    s?.status === 'playing'
      ? 'Resume the search'
      : s?.status
        ? 'See the results'
        : 'Start the search';
  const footer = s
    ? [
        s.players
          ? `${s.players.toLocaleString('en-US')} searching today`
          : 'Be the first to search today',
        s.streak ? `your streak: ${s.streak}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : ' ';

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-3 overflow-hidden bg-ink px-6 text-center text-text">
      {s && <Backdrop mask={s.mask} />}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,18,28,0.35),rgba(6,18,28,0.92))]"
        aria-hidden
      />
      <div className="relative">
        <div className="label">Daily search {s ? `#${s.day}` : ''}</div>
        <h1 className="mt-1 text-[32px] font-black uppercase leading-none tracking-[0.2em]">
          Gone Dark
        </h1>
        <p className="mx-auto mt-2 max-w-[22rem] text-[15px] leading-snug text-muted">
          {s
            ? `A ship switched off its transponder near ${s.regionName}.`
            : 'A ship switched off its transponder.'}{' '}
          Find it with six sonar buoys.
        </p>
      </div>
      <button
        onClick={(e) => openGame(e.nativeEvent)}
        className="relative h-12 rounded-full bg-amber px-8 text-[16px] font-semibold text-ink active:scale-[0.98]"
      >
        {cta}
      </button>
      <p className="relative text-[12px] text-muted">{footer}</p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
