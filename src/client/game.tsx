import './index.css';

import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GameState } from '../shared/api';
import {
  BAND_LIMITS,
  BAND_NAMES,
  SEA_STATE_NAMES,
  bandRangeKm,
  candidates,
  isSea,
  reachable,
  type Band,
  type Drop,
} from '../shared/engine';
import {
  askLogin,
  dropAt,
  isError,
  joinSubreddit,
  loadState,
  shareResult,
  toast,
} from './api';
import { BAND_COLORS, Chart, cellLabel } from './chart';

const INTRO_KEY = 'gd:intro-seen';
const introSeen = (): boolean => {
  try {
    return window.localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
};
const markIntroSeen = (): void => {
  try {
    window.localStorage.setItem(INTRO_KEY, '1');
  } catch {
    // ignore
  }
};

const km = (cells: number, cellKm: number) => Math.round(cells * cellKm);

const reading = (
  band: Band,
  cellKm: number
): { title: string; detail: string } => {
  if (band === 0) return { title: 'Contact', detail: 'Right under the buoy.' };
  if (band === 4)
    return {
      title: 'Silent',
      detail: `Farther than ${km(BAND_LIMITS[2], cellKm)} km, or land is in the way.`,
    };
  if (band === 1)
    return {
      title: 'Loud',
      detail: `Within ${km(BAND_LIMITS[0], cellKm)} km.`,
    };
  const r = bandRangeKm(band, cellKm)!;
  return { title: BAND_NAMES[band], detail: `${r[0]}–${r[1]} km away.` };
};

const useCountdown = (iso: string): string => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const Dot = ({
  color,
  hollow = false,
}: {
  color: string;
  hollow?: boolean;
}) => (
  <span
    aria-hidden
    className="inline-block h-3 w-3 shrink-0 rounded-full align-[-1px]"
    style={hollow ? { border: `2px solid ${color}` } : { background: color }}
  />
);

const BuoyTally = ({ drops, max }: { drops: readonly Drop[]; max: number }) => (
  <div
    className="flex items-center gap-1.5"
    aria-label={`${max - drops.length} of ${max} buoys left`}
  >
    {Array.from({ length: max }, (_, i) => {
      const d = drops[i];
      return d ? (
        <Dot key={i} color={BAND_COLORS[d.band]} />
      ) : (
        <Dot key={i} color="#5b7180" hollow />
      );
    })}
  </div>
);

const Help = ({
  cellKm,
  first,
  onClose,
}: {
  cellKm: number;
  first: boolean;
  onClose: () => void;
}) => (
  <div
    className="absolute inset-0 z-20 flex items-end bg-ink/75 backdrop-blur-[2px]"
    role="dialog"
    aria-modal="true"
    aria-labelledby="help-title"
  >
    <div className="w-full rounded-t-2xl border-t border-white/10 bg-panel px-5 pb-5 pt-4">
      <h2 id="help-title" className="text-[19px] font-semibold">
        A ship has gone dark
      </h2>
      <p className="mt-1 text-[14px] leading-snug text-muted">
        It switched off its transponder after the last fix{' '}
        <span className="text-amber">⊕</span>. You have six sonar buoys to find
        it.
      </p>
      <table className="mt-3 w-full text-[14px]">
        <tbody>
          <tr>
            <td className="w-6 py-1">
              <span className="inline-block h-3 w-3 rounded-[3px] bg-lit" />
            </td>
            <td>Lit water: where it can be by now.</td>
          </tr>
          <tr>
            <td className="py-1">
              <Dot color={BAND_COLORS[1]} />
            </td>
            <td>
              <b>Loud</b> · within {km(BAND_LIMITS[0], cellKm)} km
            </td>
          </tr>
          <tr>
            <td className="py-1">
              <Dot color={BAND_COLORS[2]} />
            </td>
            <td>
              <b>Clear</b> · {km(BAND_LIMITS[0], cellKm)}–
              {km(BAND_LIMITS[1], cellKm)} km
            </td>
          </tr>
          <tr>
            <td className="py-1">
              <Dot color={BAND_COLORS[3]} />
            </td>
            <td>
              <b>Faint</b> · {km(BAND_LIMITS[1], cellKm)}–
              {km(BAND_LIMITS[2], cellKm)} km
            </td>
          </tr>
          <tr>
            <td className="py-1">
              <Dot color={BAND_COLORS[4]} />
            </td>
            <td>
              <b>Silent</b> · farther,{' '}
              <span className="text-amber">or land blocks the sound</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-[13px] text-muted">
        Drop a buoy right on the ship for <b className="text-text">Contact</b>.
        One square ≈ {Math.round(cellKm)} km.
      </p>
      <p className="mt-1 text-[11px] text-muted/80">
        Real coastlines from Natural Earth (public domain). New ship every day
        at 00:02 UTC.
      </p>
      <button
        onClick={onClose}
        className="mt-4 h-12 w-full rounded-xl bg-amber text-[16px] font-semibold text-ink active:scale-[0.99]"
      >
        {first ? 'Start the search' : 'Back to the chart'}
      </button>
    </div>
  </div>
);

const Result = ({
  gs,
  showHeat,
  onToggleHeat,
  onShare,
  sharing,
  onJoin,
  joining,
}: {
  gs: GameState;
  showHeat: boolean;
  onToggleHeat: () => void;
  onShare: () => void;
  sharing: boolean;
  onJoin: () => void;
  joining: boolean;
}) => {
  const won = gs.status === 'won';
  const n = gs.drops.length;
  const c = gs.community;
  const finished = c.won + c.lost;
  const bars = [
    ...[1, 2, 3, 4, 5, 6].map((k) => ({
      label: String(k),
      count: c.wins[k] ?? 0,
      mine: won && k === n,
    })),
    { label: '✕', count: c.lost, mine: !won },
  ];
  const max = Math.max(1, ...bars.map((b) => b.count));
  const needMore = c.lost + c.wins.slice(n + 1).reduce((a, b) => a + b, 0);
  const pct =
    won && finished > 1 ? Math.round((100 * needMore) / finished) : null;
  const countdown = useCountdown(gs.nextAt);
  const ship = gs.ship === null ? '' : cellLabel(gs.ship);

  return (
    <section
      className="border-t border-white/10 bg-panel px-4 pb-4 pt-3"
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2
          className={`text-[22px] font-bold uppercase tracking-[0.12em] ${won ? 'text-text' : 'text-loud'}`}
        >
          {won ? 'Contact' : 'Lost contact'}
        </h2>
        <span className="label">
          Streak {gs.streak.current} · best {gs.streak.best}
        </span>
      </div>
      <p className="text-[14px] leading-snug text-muted">
        {won
          ? `Found at ${ship} with ${n} buoy${n > 1 ? 's' : ''}.`
          : `It slipped away at ${ship}.`}{' '}
        The expert needed {gs.par}.
        {pct !== null && ` ${pct}% of searchers needed more.`}
      </p>
      <div
        className="mt-3 flex h-16 items-end gap-1.5"
        role="img"
        aria-label="How everyone did today, by buoys used"
      >
        {bars.map((b) => (
          <div
            key={b.label}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1"
          >
            <span className="font-mono text-[10px] text-muted">
              {b.count || ''}
            </span>
            <div
              className="w-full rounded-t-[4px]"
              style={{
                height: `${Math.max(5, (70 * b.count) / max)}%`,
                background: b.mine ? '#ffb547' : 'rgba(157,179,191,0.35)',
              }}
            />
            <span
              className={`font-mono text-[11px] ${b.mine ? 'text-amber' : 'text-muted'}`}
            >
              {b.label}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={onShare}
          disabled={gs.shared || sharing}
          className="h-11 rounded-xl bg-amber text-[14px] font-semibold text-ink disabled:bg-white/10 disabled:text-muted"
        >
          {gs.shared
            ? 'Posted to comments'
            : sharing
              ? 'Posting…'
              : 'Post my result'}
        </button>
        <button
          onClick={onToggleHeat}
          aria-pressed={showHeat}
          className="h-11 rounded-xl border border-white/20 text-[14px] font-semibold"
        >
          {showHeat ? 'Hide the crowd' : "Everyone's buoys"}
        </button>
      </div>
      {gs.leaderboard && gs.leaderboard.top.length > 0 && (
        <div className="mt-3 rounded-xl border border-white/10 px-3 py-2">
          <div className="label flex justify-between">
            <span>This week in r/{gs.subreddit}</span>
            <span>you: {gs.leaderboard.mine} pts</span>
          </div>
          <ol className="mt-1 space-y-0.5 text-[13px]">
            {gs.leaderboard.top.map((r, i) => (
              <li key={r.name} className="flex justify-between">
                <span className={r.name === gs.username ? 'text-amber' : ''}>
                  {i + 1}. u/{r.name}
                </span>
                <span className="font-mono text-muted">{r.points}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {gs.streak.current > 0 && !gs.shared && (
        <p className="mt-1.5 text-center text-[11px] text-muted">
          Posting also shows your streak as flair in r/{gs.subreddit}.
        </p>
      )}
      {gs.subreddit && (
        <button
          onClick={onJoin}
          disabled={gs.joined || joining}
          className="mt-2 h-10 w-full rounded-xl border border-amber/60 text-[14px] font-semibold text-amber disabled:border-white/10 disabled:text-muted"
        >
          {gs.joined
            ? `Joined r/${gs.subreddit} · tomorrow's ship lands in your feed`
            : joining
              ? 'Joining…'
              : `Join r/${gs.subreddit} for tomorrow's ship`}
        </button>
      )}
      <p className="mt-2 text-center text-[12px] text-muted">
        Next ship goes dark in{' '}
        <span className="font-mono text-text">{countdown}</span>
      </p>
    </section>
  );
};

export const App = () => {
  const [gs, setGs] = useState<GameState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [help, setHelp] = useState<'intro' | 'help' | null>(() =>
    introSeen() ? null : 'intro'
  );
  const [showHeat, setShowHeat] = useState(false);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void loadState().then((r) => {
      if (!alive) return;
      if (isError(r)) setLoadError(r.message);
      else setGs(r);
    });
    return () => {
      alive = false;
    };
  }, [attempt]);
  const load = () => {
    setLoadError(null);
    setAttempt((n) => n + 1);
  };

  const playing = gs?.status === 'playing';

  const { lit, ruledOut } = useMemo(() => {
    if (!gs || gs.status !== 'playing')
      return { lit: new Set<number>(), ruledOut: new Set<number>() };
    const still = new Set(candidates(gs.region.mask, gs.clue, gs.drops));
    const all = reachable(gs.region.mask, gs.clue.cell, gs.clue.reach);
    return { lit: still, ruledOut: new Set(all.filter((c) => !still.has(c))) };
  }, [gs]);

  if (!gs) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-ink px-6 text-center">
        <span className="label">Gone Dark</span>
        {loadError ? (
          <>
            <p className="text-muted">{loadError}</p>
            <button
              onClick={load}
              className="h-11 rounded-xl bg-amber px-6 font-semibold text-ink"
            >
              Try again
            </button>
          </>
        ) : (
          <p className="text-muted">Listening for engines…</p>
        )}
      </div>
    );
  }

  const cellKm = gs.region.cellKm;

  const onSelect = (cell: number) => {
    if (!playing || pending) return;
    if (!isSea(gs.region.mask, cell)) {
      setNotice('Buoys only float on open water.');
      setSelected(null);
      return;
    }
    if (gs.drops.some((d) => d.cell === cell)) {
      setNotice('You already have a buoy there.');
      return;
    }
    setNotice(
      lit.has(cell) || gs.drops.length === 0
        ? null
        : 'The ship cannot be here, but a buoy here can still listen.'
    );
    setSelected(cell);
  };

  const onConfirm = async () => {
    if (selected === null || pending) return;
    if (!gs.loggedIn) {
      askLogin();
      return;
    }
    setPending(true);
    const r = await dropAt(selected);
    setPending(false);
    if (isError(r)) {
      if (r.code === 'login') askLogin();
      setNotice(r.message);
      return;
    }
    setSelected(null);
    setNotice(null);
    setGs(r);
  };

  const onShare = async () => {
    setSharing(true);
    const r = await shareResult();
    setSharing(false);
    if (isError(r)) setNotice(r.message);
    else setGs(r);
  };

  const onJoin = async () => {
    setJoining(true);
    const r = await joinSubreddit();
    setJoining(false);
    if (isError(r)) {
      if (r.code === 'login') askLogin();
      else toast(r.message);
    } else {
      setGs(r);
      toast(`Joined r/${r.subreddit}`);
    }
  };

  const last = gs.drops.at(-1);
  const status = (() => {
    if (!last) {
      return {
        color: '#ffb547',
        title: `Dark for ${gs.clue.hoursDark} h · up to ${gs.clue.knots} knots`,
        detail: `It is somewhere in the lit water: ${lit.size} squares.`,
      };
    }
    const r = reading(last.band, cellKm);
    const left =
      lit.size === 1
        ? 'Only one square fits. Drop on it!'
        : `${lit.size} squares still fit.`;
    return {
      color: BAND_COLORS[last.band],
      title: `Buoy ${gs.drops.length}: ${r.title}`,
      detail: `${r.detail} ${left}`,
    };
  })();

  return (
    <div className="relative flex h-full flex-col bg-ink text-text">
      <header className="flex items-start justify-between gap-3 px-4 pb-1 pt-3">
        <div className="min-w-0">
          <div className="label">
            Gone Dark #{gs.day} · {SEA_STATE_NAMES[gs.seaState]} sea
          </div>
          <h1 className="text-[18px] font-semibold leading-tight">
            {gs.region.name}
          </h1>
          <div className="truncate text-[12px] text-muted">
            {gs.region.where}
          </div>
        </div>
        <button
          onClick={() => setHelp('help')}
          aria-label="How to play"
          className="mt-1 h-9 w-9 shrink-0 rounded-full border border-white/20 text-[15px] font-semibold text-muted"
        >
          ?
        </button>
      </header>

      <main className="min-h-0 flex-1 px-3 py-2">
        <Chart
          label={`Chart of ${gs.region.name}. Arrow keys move the marker, Enter drops a buoy.`}
          mask={gs.region.mask}
          coast={gs.region.coast}
          clue={gs.clue}
          drops={gs.drops}
          lit={lit}
          ruledOut={ruledOut}
          selected={selected}
          ship={gs.ship}
          found={gs.status === 'won'}
          heat={showHeat ? gs.community.heat : null}
          interactive={playing && !pending}
          onSelect={onSelect}
          onConfirm={() => void onConfirm()}
        />
      </main>

      {playing ? (
        <footer
          className="border-t border-white/10 bg-panel px-4 pb-4 pt-3"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="flex min-h-[2.4em] min-w-0 items-center gap-2 text-[16px] font-semibold">
              <Dot color={status.color} />
              <span className="line-clamp-2 leading-tight">{status.title}</span>
            </p>
            <BuoyTally drops={gs.drops} max={gs.maxDrops} />
          </div>
          <p
            className={`mt-0.5 min-h-[2.5em] text-[14px] leading-snug ${notice ? 'text-amber' : 'text-muted'}`}
          >
            {notice ?? status.detail}
          </p>
          {!gs.loggedIn ? (
            <button
              onClick={askLogin}
              className="mt-2 h-12 w-full rounded-xl bg-amber text-[16px] font-semibold text-ink"
            >
              Log in to drop buoys
            </button>
          ) : (
            <button
              onClick={() => void onConfirm()}
              disabled={selected === null || pending}
              className={`mt-2 h-12 w-full rounded-xl text-[16px] font-semibold transition-colors ${
                selected === null
                  ? 'border border-dashed border-white/25 bg-transparent text-muted'
                  : 'bg-amber text-ink'
              }`}
            >
              {pending
                ? 'Listening…'
                : selected === null
                  ? `Tap the water to place buoy ${gs.drops.length + 1}`
                  : `Drop buoy ${gs.drops.length + 1} at ${cellLabel(selected)}`}
            </button>
          )}
        </footer>
      ) : (
        <Result
          gs={gs}
          showHeat={showHeat}
          onToggleHeat={() => setShowHeat((v) => !v)}
          onShare={() => void onShare()}
          sharing={sharing}
          onJoin={() => void onJoin()}
          joining={joining}
        />
      )}

      {help && (
        <Help
          cellKm={cellKm}
          first={help === 'intro'}
          onClose={() => {
            markIntroSeen();
            setHelp(null);
          }}
        />
      )}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
