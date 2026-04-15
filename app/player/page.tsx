'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Ava from '@/components/Ava';
import { METRIC_CONFIG, MetricKey } from '@/lib/types';
import { ALL_SLUGS, rowToMetrics, normalizeAthlete, normalizeActivity, calcACWR, parseActivityDate } from '@/lib/data';

// ─── Color coding by % of personal best ──────────────────────────────────────
// ~Max ≥90% | High 75-89% | Mod-High 60-74% | Moderate 40-59% | Low <40%
function getLoadColor(val: number, personalMax: number): { color: string; label: string; dot: string } {
  if (personalMax <= 0 || val <= 0) return { color: 'var(--muted)', label: '—', dot: '#444' };
  const pct = (val / personalMax) * 100;
  if (pct >= 90) return { color: '#ff3b3b', label: '~Max',     dot: '#ff3b3b' };
  if (pct >= 75) return { color: '#ff8c42', label: 'High',     dot: '#ff8c42' };
  if (pct >= 60) return { color: '#ffd166', label: 'Mod-High', dot: '#ffd166' };
  if (pct >= 40) return { color: '#06d6a0', label: 'Moderate', dot: '#06d6a0' };
  return               { color: '#4da6ff', label: 'Low',       dot: '#4da6ff' };
}

const KPI_KEYS: { key: MetricKey; label: string; unit: string; color: string }[] = [
  { key: 'playerLoad',      label: 'Player Load',    unit: 'AU',    color: '#1a6bff' },
  { key: 'totalDistance',   label: 'Distance',       unit: 'yds',   color: '#00bcd4' },
  { key: 'maxVelocity',     label: 'Max Velocity',   unit: 'mph',   color: '#7c4dff' },
  { key: 'truckStick',      label: 'Truck Stick',    unit: 'N-s',   color: '#ff6d00' },
  { key: 'maxAccel',        label: 'Max Accel',      unit: 'm/s²',  color: '#ff1744' },
  { key: 'playerLoadPerMin',label: 'PL / Min',       unit: 'AU/min',color: '#00e676' },
];

const ACWR_COLORS = { green: 'var(--green)', yellow: 'var(--yellow)', red: 'var(--red)' };
const ACWR_LABELS = { green: 'Optimal', yellow: 'Caution', red: 'At Risk' };

interface SessionEntry {
  id: string; date: string; name: string; durationMinutes: number;
  metrics: Partial<Record<MetricKey, number>>;
}

interface PlayerInfo {
  id: string; name: string; position: string; positionGroup: string;
  acwr: number; acuteLoad: number; chronicLoad: number; acwrStatus: 'green' | 'yellow' | 'red';
  sessions: SessionEntry[];
  personalBests: Partial<Record<MetricKey, number>>;
}

// ─── KPI card — desktop card / mobile approved row pattern ───────────────────
function PlayerKPICard({ metricKey, label, unit, accentColor, value, personalBest, pbDate, isMobile, isLast }: {
  metricKey: MetricKey; label: string; unit: string; accentColor: string;
  value: number; personalBest: number; pbDate?: string; isMobile: boolean; isLast: boolean;
}) {
  const [showTip, setShowTip] = useState(false);
  const cfg = METRIC_CONFIG[metricKey];
  const { color, label: intensityLabel } = getLoadColor(value, personalBest);
  const pct = personalBest > 0 && value > 0 ? Math.round((value / personalBest) * 100) : 0;

  // ── Mobile: approved row pattern ─────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{
        position: 'relative',
        background: 'transparent',
        padding: '10px 14px 10px 16px',
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Left color bar */}
        <div style={{
          position: 'absolute', left: 0, top: 6, bottom: 6,
          width: 3, background: accentColor,
          borderRadius: '0 3px 3px 0', opacity: 0.6,
        }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {/* Left: label, intensity, % of PB */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</span>
              <button onClick={e => { e.stopPropagation(); setShowTip(v => !v); }}
                style={{ width: 14, height: 14, borderRadius: '50%', background: showTip ? accentColor : 'rgba(255,255,255,0.07)', border: `1px solid ${showTip ? accentColor : 'rgba(255,255,255,0.15)'}`, color: showTip ? 'white' : 'var(--muted)', fontSize: 7, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>?</button>
            </div>
            {value > 0 && personalBest > 0 ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color, fontWeight: 700 }}>{intensityLabel}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>· {pct}% of PB</span>
                </div>
                <div style={{ height: 3, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 2, transition: 'width 0.4s' }} />
                </div>
              </>
            ) : (
              <div style={{ fontSize: 10, color: 'var(--muted)', opacity: 0.5 }}>No data</div>
            )}
          </div>

          {/* Right: value + PB below */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {value > 0 ? value.toFixed(1) : '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{unit}</div>
          </div>
        </div>

        {showTip && (
          <div style={{ marginTop: 8, background: '#1a2540', border: `1px solid ${accentColor}44`, borderRadius: 8, padding: '9px 11px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
            <strong style={{ color: accentColor, display: 'block', marginBottom: 3, fontFamily: 'var(--font-display)', fontSize: 11 }}>{cfg.label}</strong>
            {cfg.description}
          </div>
        )}
      </div>
    );
  }

  // ── Desktop card ──────────────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', borderTop: `2px solid ${accentColor}`, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</div>
        <button onClick={() => setShowTip(v => !v)} style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--dim)', border: 'none', color: 'var(--muted)', fontSize: 8, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</button>
      </div>
      {showTip && (
        <div style={{ background: '#1e2d42', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 2 }}>{cfg.label}</strong>
          {cfg.description}
        </div>
      )}
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26, color, lineHeight: 1, marginBottom: 2 }}>
        {value > 0 ? value.toFixed(1) : '—'}
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginLeft: 3 }}>{unit}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        {value > 0 && personalBest > 0 ? (
          <>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color, fontWeight: 700 }}>{intensityLabel}</span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>· {pct}% of max</span>
          </>
        ) : <span style={{ fontSize: 10, color: 'var(--muted)' }}>No data</span>}
      </div>
      <div style={{ height: 3, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
      <div style={{ borderTop: '1px solid var(--border)', marginBottom: 5 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>All-Time Max</div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: accentColor }}>
            {personalBest > 0 ? personalBest.toFixed(1) : '—'}
            <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 2 }}>{unit}</span>
          </span>
          {pbDate && <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 1 }}>{pbDate}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── 6-week player timeline ───────────────────────────────────────────────────
function PlayerTimeline({ sessions, selectedMetric, onMetricChange }: {
  sessions: SessionEntry[];
  selectedMetric: MetricKey;
  onMetricChange: (k: MetricKey) => void;
}) {
  const { weekStart } = require('@/lib/data');
  // Group sessions by week, take last 6 weeks
  const byWeek: Record<string, number[]> = {};
  sessions.forEach(s => {
    const d = s.date ? new Date(s.date.replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2')) : null;
    if (!d || isNaN(d.getTime())) return;
    const ws = weekStart(d);
    if (!byWeek[ws]) byWeek[ws] = [];
    const val = s.metrics[selectedMetric] ?? 0;
    if (val > 0) byWeek[ws].push(val);
  });

  const weeks = Object.entries(byWeek)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([ws, vals]) => {
      const d = new Date(ws + 'T12:00:00');
      const avg = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
      return {
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        avg: Math.round(avg * 10) / 10,
        max: Math.round(Math.max(...vals, 0) * 10) / 10,
      };
    });

  const cfg = METRIC_CONFIG[selectedMetric];
  const allVals = weeks.map(w => w.avg).filter(v => v > 0);
  const chartMin = allVals.length > 0 ? Math.min(...allVals) : 0;
  const chartMax = allVals.length > 0 ? Math.max(...allVals) : 1;
  const range = chartMax - chartMin || 1;
  const W = 500; const H = 90; const PAD = 14;

  const points = weeks.map((w, i) => ({
    x: PAD + (i / Math.max(weeks.length - 1, 1)) * (W - PAD * 2),
    y: w.avg > 0 ? H - PAD - ((w.avg - chartMin) / range) * (H - PAD * 2) : H - PAD,
    w,
  }));

  const pathD = points.length > 1
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    : '';
  const areaD = points.length > 1
    ? `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${H - PAD} L ${points[0].x.toFixed(1)} ${H - PAD} Z`
    : '';

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          6-Week Trend — {cfg.label}
        </div>
        <select value={selectedMetric} onChange={e => onMetricChange(e.target.value as MetricKey)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11 }}>
          {KPI_KEYS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      {weeks.length < 2 ? (
        <div style={{ color: 'var(--muted)', fontSize: 12, padding: '20px 0' }}>Not enough weeks of data yet</div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
            <span>↑ {chartMax.toFixed(1)} {cfg.unit}</span>
            <span>↓ {chartMin.toFixed(1)} {cfg.unit}</span>
          </div>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id="playerAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1a6bff" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#1a6bff" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border)" strokeWidth="1" />
            {areaD && <path d={areaD} fill="url(#playerAreaGrad)" />}
            {pathD && <path d={pathD} fill="none" stroke="#1a6bff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="3.5" fill="#1a6bff" stroke="var(--card)" strokeWidth="2" />
                <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="8" fill="var(--accent)" fontFamily="monospace">
                  {p.w.avg > 0 ? p.w.avg.toFixed(0) : ''}
                </text>
                <text x={p.x} y={H + 2} textAnchor="middle" fontSize="8" fill="var(--muted)" fontFamily="monospace">
                  {p.w.label}
                </text>
              </g>
            ))}
          </svg>
        </>
      )}
    </div>
  );
}

// ─── Full metrics columns for session table ───────────────────────────────────
const SESSION_COLUMNS: { key: MetricKey; label: string; unit: string; decimals: number }[] = [
  { key: 'playerLoad',           label: 'PL',         unit: 'AU',    decimals: 1 },
  { key: 'playerLoadPerMin',     label: 'PL/Min',     unit: '',      decimals: 2 },
  { key: 'totalDistance',        label: 'Distance',   unit: 'yds',   decimals: 0 },
  { key: 'maxVelocity',          label: 'Max Vel',    unit: 'mph',   decimals: 1 },
  { key: 'profileMaxVelocity',   label: 'Profile Max',unit: 'mph',   decimals: 1 },
  { key: 'maxVelocityPct',       label: '% Max Vel',  unit: '%',     decimals: 1 },
  { key: 'explosiveEfforts',     label: 'Explosive',  unit: '',      decimals: 0 },
  { key: 'maxAccel',             label: 'Max Acc',    unit: 'm/s²',  decimals: 2 },
  { key: 'accelDecelEfforts',    label: 'A+D Effs',   unit: '',      decimals: 0 },
  { key: 'truckStick',           label: 'Truck',      unit: 'N-s',   decimals: 0 },
  { key: 'velocityBand4Distance',label: 'HSY (VB4)',  unit: 'yds',   decimals: 0 },
  { key: 'velocityBand7Efforts', label: 'VB7 Effs',   unit: '',      decimals: 0 },
  { key: 'metabolicPower',       label: 'Met Power',  unit: 'W/kg',  decimals: 1 },
];

const SESSION_COLUMNS_MOBILE: { key: MetricKey; label: string; unit: string; decimals: number }[] = [
  { key: 'playerLoad',           label: 'PL',     unit: 'AU',   decimals: 1 },
  { key: 'playerLoadPerMin',     label: 'PL/m',   unit: '',     decimals: 2 },
  { key: 'maxVelocity',          label: 'Vel',    unit: 'mph',  decimals: 1 },
  { key: 'totalDistance',        label: 'Dist',   unit: 'yds',  decimals: 0 },
  { key: 'explosiveEfforts',     label: 'Exp',    unit: '',     decimals: 0 },
  { key: 'metabolicPower',       label: 'Met Pwr',unit: 'W/kg', decimals: 1 },
];

function parseSessionDate(dateStr: string): number {
  if (!dateStr || dateStr === 'TBD') return 0;
  const clean = dateStr.replace(/-/g, '/');
  const parts = clean.split('/');
  if (parts.length === 3) {
    const [m, d, y] = parts.map(Number);
    const year = y < 100 ? 2000 + y : y;
    if (m && d && year) return new Date(year, m - 1, d).getTime();
  }
  return 0;
}

function SessionInjuryFlag({ playerName, sessionDate, playerInjuries }: { playerName: string; sessionDate: string; playerInjuries: any[] }) {
  if (!playerInjuries.length || !sessionDate) return null;
  const sesDate = parseSessionDate(sessionDate);
  if (!sesDate) return null;
  const activeInj = playerInjuries.find((r: any) => r.isCurrent);
  if (activeInj) {
    const start = parseSessionDate(activeInj.dateReported) - 86400000;
    // DEBUG: show raw values
    if (typeof window !== 'undefined' && (window as any).__injDebug !== true) {
      (window as any).__injDebug = true;
      console.log('INJURY DEBUG', { dateReported: activeInj.dateReported, start, startDate: new Date(start).toISOString(), sessionDate, sesDate, sesDateStr: new Date(sesDate).toISOString(), passes: start > 0 && sesDate >= start });
    }
    if (start > 0 && sesDate >= start) return <span style={{ fontSize: 11, flexShrink: 0, color: '#ff3b3b', lineHeight: 1 }}>✚</span>;
    return null;
  }
  const pastInj = playerInjuries.find((r: any) => {
    const start = parseSessionDate(r.dateReported) - 86400000;
    const end = (!r.expectedReturn || r.expectedReturn === 'TBD') ? new Date(9999, 0, 1).getTime() : parseSessionDate(r.expectedReturn) + 86400000;
    return start > 0 && sesDate >= start && sesDate <= end;
  });
  if (!pastInj) return null;
  return <span style={{ fontSize: 11, flexShrink: 0, color: '#555', lineHeight: 1 }}>✚</span>;
}

function SessionRow({ session, personalBests, isLatest, onClick, sortCol }: {
  session: SessionEntry;
  personalBests: Partial<Record<MetricKey, number>>;
  isLatest: boolean;
  onClick: () => void;
  sortCol: MetricKey;
}) {
  return (
    <tr
      onClick={onClick}
      style={{ cursor: 'pointer', background: isLatest ? 'rgba(26,107,255,0.05)' : 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.background = isLatest ? 'rgba(26,107,255,0.05)' : 'transparent')}
    >
      <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: isLatest ? 600 : 400, color: 'var(--text)' }}>
          {session.name}
          {isLatest && <span style={{ marginLeft: 6, fontSize: 8, fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--accent)', textTransform: 'uppercase' }}>LATEST</span>}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{session.date} · {session.durationMinutes}min</div>
      </td>
      {SESSION_COLUMNS.map(c => {
        const val = session.metrics[c.key] ?? 0;
        const pb = personalBests[c.key] ?? 0;
        const { color } = getLoadColor(val, pb);
        const isSorted = c.key === sortCol;
        const isNewMax = pb > 0 && val > 0 && val >= pb &&
          !(['profileMaxVelocity', 'maxVelocityPct'] as MetricKey[]).includes(c.key);
        return (
          <td key={c.key} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: isSorted ? 700 : 400, color: val > 0 ? color : 'var(--dim)', whiteSpace: 'nowrap' }}>
            {val > 0 ? val.toFixed(c.decimals) : '—'}
            {isNewMax && <span style={{ color: 'var(--text)', fontWeight: 900, fontSize: 11, marginLeft: 2 }}>*</span>}
          </td>
        );
      })}
    </tr>
  );
}

import InjuryFlag from '@/components/InjuryFlag';
import { STATUS_COLORS as INJ_COLORS } from '@/lib/injuries';
import { getCurrentInjuryAsync, getInjuriesForAthlete } from '@/lib/injuriesApi';

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return mobile;
}

function InjuryBanner({ athleteName }: { athleteName: string }) {
  const [current, setCurrent] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [cur, all] = await Promise.all([
        getCurrentInjuryAsync(athleteName),
        getInjuriesForAthlete(athleteName),
      ]);
      if (cancelled) return;
      setCurrent(cur);
      setHistory(all.filter((r: any) => !r.isCurrent));
    }
    load();
    return () => { cancelled = true; };
  }, [athleteName]);

  if (!current && history.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      {current && (() => {
        const s = INJ_COLORS[current.status as keyof typeof INJ_COLORS];
        return (
          <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderLeft: `4px solid ${s.color}`, borderRadius: 10, padding: '10px 14px', marginBottom: history.length > 0 ? 8 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: s.color, fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🚩 {current.status}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{current.part} — {current.injury}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Reported {current.dateReported}</span>
              <span style={{ fontSize: 11, color: current.expectedReturn === 'TBD' ? '#ff8c42' : 'var(--muted)', fontWeight: current.expectedReturn === 'TBD' ? 700 : 400 }}>Return: {current.expectedReturn}</span>
              {current.info && <span style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>{current.info}</span>}
            </div>
          </div>
        );
      })()}
      {history.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Injury History</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {history.map((r: any, i: number) => {
              const s = INJ_COLORS[r.status as keyof typeof INJ_COLORS];
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: s.color, minWidth: 80 }}>{r.status}</span>
                  <span style={{ fontSize: 11, color: 'var(--text)' }}>{r.part} — {r.injury}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{r.dateReported} → {r.expectedReturn}</span>
                  <span style={{ fontSize: 9, color: 'var(--dim)' }}>{r.uploadBatch}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerContent() {
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [athletes, setAthletes] = useState<{ id: string; name: string; position: string; positionGroup: string }[]>([]);
  const [selectedId, setSelectedId] = useState(searchParams.get('id') || '');
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [timelineMetric, setTimelineMetric] = useState<MetricKey>('playerLoad');
  const [sortCol, setSortCol] = useState<MetricKey>('playerLoad');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [sortByDate, setSortByDate] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(searchParams.get('session') || '');
  const [avaOpen, setAvaOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [playerInjuries, setPlayerInjuries] = useState<any[]>([]);
  const [athleteProfile, setAthleteProfile] = useState<{ height: string; weight: string; armLength: string; handWidth: string } | null>(null);

  const loadAthletes = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/athletes');
      const result = await res.json();
      if (result.success) {
        const list = (Array.isArray(result.data) ? result.data : []).map((a: Record<string, unknown>) => normalizeAthlete(a));
        setAthletes(list);
        if (!selectedId && list[0]) setSelectedId(list[0].id);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setIsRefreshing(false); }
  }, []);

  useEffect(() => { loadAthletes(); }, [loadAthletes]);

  useEffect(() => {
    if (!selectedId) return;
    setPlayerLoading(true);
    setPlayer(null);
    // Only reset session selection if none was passed via URL
    if (!searchParams.get('session')) setSelectedSessionId('');

    Promise.all([
      fetch('/api/activities').then(r => r.json()),
      fetch('/api/athletes').then(r => r.json()),
    ]).then(async ([actResult, athResult]) => {
      const athInfo = (Array.isArray(athResult.data) ? athResult.data : [])
        .map((a: Record<string, unknown>) => normalizeAthlete(a))
        .find((a: { id: string }) => a.id === selectedId);

      const activities = actResult.success
        ? (actResult.data as Record<string, unknown>[]).map(normalizeActivity).slice(0, 30)
        : [];

      const sessionStats = await Promise.all(
        activities.map(act =>
          fetch('/api/stats', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parameters: ALL_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [act.id] }], group_by: ['athlete'] }),
          }).then(r => r.json())
            .then(r => ({ act, rows: Array.isArray(r.data) ? r.data : [] }))
            .catch(() => ({ act, rows: [] }))
        )
      );

      const sessions: SessionEntry[] = [];
      const personalBests: Partial<Record<MetricKey, { value: number; date: string }>> = {};

      sessionStats.forEach(({ act, rows }) => {
        const row = rows.find((r: Record<string, unknown>) => String(r.athlete_id) === selectedId);
        if (!row) return;
        const metrics = rowToMetrics(row);

        // Track personal bests
        Object.entries(metrics).forEach(([k, v]) => {
          const key = k as MetricKey;
          if (v != null && v > (personalBests[key]?.value ?? 0)) {
            personalBests[key] = { value: v, date: act.date };
          }
        });

        sessions.push({ id: act.id, date: act.date, name: act.name, durationMinutes: act.durationMinutes, metrics });
      });

      sessions.sort((a, b) => parseActivityDate(b.date).getTime() - parseActivityDate(a.date).getTime());

      const pbValues: Partial<Record<MetricKey, number>> = {};
      Object.entries(personalBests).forEach(([k, v]) => { pbValues[k as MetricKey] = v.value; });

      const acwrData = calcACWR(sessions.map(s => ({ date: s.date, load: s.metrics.playerLoad ?? 0 })));

      setPlayer({
        id: selectedId,
        name: athInfo?.name || 'Unknown',
        position: athInfo?.position || '',
        positionGroup: athInfo?.positionGroup || '',
        acwr: acwrData.acwr,
        acuteLoad: acwrData.acuteLoad,
        chronicLoad: acwrData.chronicLoad,
        acwrStatus: acwrData.status,
        sessions,
        personalBests: pbValues,
      });

      // Load injury records for this athlete from API
      const playerName = athInfo?.name || 'Unknown';
      Promise.all([
        getInjuriesForAthlete(playerName),
        getCurrentInjuryAsync(playerName),
      ]).then(([records, currentInj]) => {
        // Mark which records are current based on the active injury report
        const currentName = currentInj?.name ?? null;
        const marked = records.map((r: any) => ({
          ...r,
          isCurrent: currentInj ? (r.name === currentInj.name && r.injury === currentInj.injury && r.dateReported === currentInj.dateReported) : false,
        }));
        // If there's a current injury not in history, add it
        if (currentInj && !marked.some((r: any) => r.isCurrent)) {
          marked.unshift({ ...currentInj, isCurrent: true });
        }
        setPlayerInjuries(marked.length > 0 ? marked : currentInj ? [{ ...currentInj, isCurrent: true }] : []);
      }).catch(() => setPlayerInjuries([]));

      // Load athlete profile
      fetch('/api/athlete-profiles').then(r => r.json()).then(d => {
        if (d.profiles && d.profiles[selectedId]) {
          setAthleteProfile(d.profiles[selectedId]);
        } else {
          setAthleteProfile(null);
        }
      }).catch(() => setAthleteProfile(null));
    }).catch(console.error).finally(() => setPlayerLoading(false));
  }, [selectedId]);

  // Session shown in KPI cards — selected or default to most recent
  const latestSession = selectedSessionId
    ? (player?.sessions.find(s => s.id === selectedSessionId) ?? player?.sessions[0] ?? null)
    : (player?.sessions[0] ?? null);
  const latestMetrics = latestSession?.metrics ?? {};

  if (loading) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} isRefreshing />
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
      </div>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} onRefresh={loadAthletes} isRefreshing={isRefreshing} />
      <Ava isOpen={avaOpen} onClose={() => setAvaOpen(false)} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '16px 12px' : '24px 16px', boxSizing: 'border-box', width: '100%' }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Player Drill-Down</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '220px 1fr', gap: 16, alignItems: 'start' }}>

          {/* ── Roster — dropdown on mobile, list on desktop ───── */}
          {isMobile ? (
            <div style={{ marginBottom: 4, width: '100%', boxSizing: 'border-box' }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 6 }}>
                Select a Player ↓
              </div>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                style={{ width: '100%', background: 'var(--card)', border: '1px solid var(--accent)', borderRadius: 10, padding: '11px 14px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
                {athletes.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.position})</option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Roster ({athletes.length})
              </div>
              <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                {athletes.map(a => (
                  <button key={a.id} onClick={() => setSelectedId(a.id)} style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '9px 14px', background: a.id === selectedId ? 'rgba(26,107,255,0.12)' : 'transparent', borderLeft: a.id === selectedId ? '3px solid var(--accent)' : '3px solid transparent', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {a.name}
                      <InjuryFlag athleteId={a.id} athleteName={a.name} size="sm" />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{a.position}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Player detail ─────────────────────────── */}
          <div style={{ minWidth: 0, width: '100%' }}>
            {playerLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
              </div>
            ) : player ? (
              <>
                {/* Header */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: isMobile ? '12px 14px' : '16px 20px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    {/* Name + meta — left */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: isMobile ? 18 : 22, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{player.name}</div>
                        <InjuryFlag athleteId={player.id} athleteName={player.name} size="md" />
                      </div>
                      <div style={{ fontSize: isMobile ? 11 : 12, color: 'var(--muted)', marginTop: 2 }}>
                        {player.position} · {player.positionGroup} · {player.sessions.length} sessions
                        {latestSession && <span> · Last: {latestSession.date}</span>}
                      </div>
                      {/* Profile fields */}
                      {athleteProfile && (athleteProfile.height || athleteProfile.weight || athleteProfile.armLength || athleteProfile.handWidth) && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? '4px 14px' : '4px 20px', marginTop: 6 }}>
                          {athleteProfile.height && (
                            <div style={{ fontSize: isMobile ? 13 : 15 }}>
                              <span style={{ color: 'var(--muted)', fontSize: isMobile ? 10 : 10, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>HT </span>
                              <span style={{ color: 'white', fontWeight: 600 }}>{athleteProfile.height}</span>
                            </div>
                          )}
                          {athleteProfile.weight && (
                            <div style={{ fontSize: isMobile ? 13 : 15 }}>
                              <span style={{ color: 'var(--muted)', fontSize: isMobile ? 10 : 10, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>WT </span>
                              <span style={{ color: 'white', fontWeight: 600 }}>{athleteProfile.weight}</span>
                            </div>
                          )}
                          {athleteProfile.armLength && (
                            <div style={{ fontSize: isMobile ? 13 : 15 }}>
                              <span style={{ color: 'var(--muted)', fontSize: isMobile ? 10 : 10, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>REACH </span>
                              <span style={{ color: 'white', fontWeight: 600 }}>{athleteProfile.armLength}{!athleteProfile.armLength.includes('"') ? '"' : ''}</span>
                            </div>
                          )}
                          {athleteProfile.handWidth && (
                            <div style={{ fontSize: isMobile ? 13 : 15 }}>
                              <span style={{ color: 'var(--muted)', fontSize: isMobile ? 10 : 10, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>HAND </span>
                              <span style={{ color: 'white', fontWeight: 600 }}>{athleteProfile.handWidth}{!athleteProfile.handWidth.includes('"') ? '"' : ''}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {/* ACWR + Met Power badges — right */}
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {/* Metabolic Power */}
                      {latestMetrics.metabolicPower != null && latestMetrics.metabolicPower > 0 && (
                        <div style={{ background: 'rgba(124,77,255,0.12)', border: '1px solid rgba(124,77,255,0.3)', borderRadius: 10, padding: isMobile ? '8px 10px' : '10px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Met Power</div>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: isMobile ? 18 : 22, color: '#7c4dff', lineHeight: 1 }}>{latestMetrics.metabolicPower.toFixed(1)}</div>
                          <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 1 }}>W/kg · session</div>
                          {(() => {
                            const allVals = player.sessions.map(s => s.metrics.metabolicPower ?? 0).filter(v => v > 0);
                            if (!allVals.length) return null;
                            const avg = allVals.reduce((s, v) => s + v, 0) / allVals.length;
                            return <div style={{ fontSize: 9, color: '#7c4dff', opacity: 0.7, marginTop: 3, fontFamily: 'var(--font-display)', fontWeight: 700 }}>avg {avg.toFixed(1)}</div>;
                          })()}
                        </div>
                      )}
                      {/* ACWR badge */}
                      <div style={{ background: `${ACWR_COLORS[player.acwrStatus]}18`, border: `1px solid ${ACWR_COLORS[player.acwrStatus]}44`, borderRadius: 10, padding: isMobile ? '8px 12px' : '10px 18px', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>ACWR</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: isMobile ? 22 : 26, color: ACWR_COLORS[player.acwrStatus] }}>{player.acwr.toFixed(2)}</div>
                        <div style={{ fontSize: 10, color: ACWR_COLORS[player.acwrStatus], fontWeight: 600 }}>{ACWR_LABELS[player.acwrStatus]}</div>
                        <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>A: {player.acuteLoad.toFixed(0)} / C: {player.chronicLoad.toFixed(0)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Color coding legend — desktop only, moves to KPI box on mobile */}
                  {!isMobile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Intensity vs PB</span>
                      {[
                        { label: '~Max', color: '#ff3b3b', range: '≥90%' },
                        { label: 'High', color: '#ff8c42', range: '75–89%' },
                        { label: 'Mod-High', color: '#ffd166', range: '60–74%' },
                        { label: 'Moderate', color: '#06d6a0', range: '40–59%' },
                        { label: 'Low', color: '#4da6ff', range: '<40%' },
                      ].map(item => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                          <span style={{ fontSize: 10, color: item.color, fontWeight: 700 }}>{item.label}</span>
                          <span style={{ fontSize: 9, color: 'var(--muted)' }}>{item.range}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Injury banner */}
                <InjuryBanner athleteName={player.name} />

                {/* KPI Cards — selected session vs personal best */}
                {player.sessions.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    {/* Session selector */}
                    <div style={{ marginBottom: 10 }}>
                      {isMobile && (
                        <div style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 6 }}>
                          Select a Session ↓
                        </div>
                      )}
                      <select
                        value={selectedSessionId || player.sessions[0]?.id || ''}
                        onChange={e => setSelectedSessionId(e.target.value)}
                        style={{ width: '100%', background: 'var(--surface)', border: `1px solid ${isMobile ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '6px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, maxWidth: isMobile ? '100%' : 420 }}>
                        {player.sessions.map((s, i) => (
                          <option key={s.id} value={s.id}>
                            {s.name}{i === 0 ? ' (latest)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* KPI list */}
                    {isMobile ? (
                      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                        {KPI_KEYS.map(({ key, label, unit, color }, idx) => {
                          const pb = player.personalBests[key] ?? 0;
                          const pbSession = player.sessions.find(s => s.metrics[key] === pb);
                          return (
                            <PlayerKPICard
                              key={key} metricKey={key} label={label} unit={unit} accentColor={color}
                              value={latestMetrics[key] ?? 0} personalBest={pb} pbDate={pbSession?.date}
                              isMobile={true} isLast={idx === KPI_KEYS.length - 1}
                            />
                          );
                        })}
                        {/* Legend at bottom of KPI box */}
                        <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Intensity vs PB</span>
                          {[
                            { label: '~Max', color: '#ff3b3b', range: '≥90%' },
                            { label: 'High', color: '#ff8c42', range: '75–89%' },
                            { label: 'Mod', color: '#ffd166', range: '60–74%' },
                            { label: 'Mod', color: '#06d6a0', range: '40–59%' },
                            { label: 'Low', color: '#4da6ff', range: '<40%' },
                          ].map(item => (
                            <div key={item.range} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                              <span style={{ fontSize: 9, color: 'var(--muted)' }}>{item.range}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                        {KPI_KEYS.map(({ key, label, unit, color }) => {
                          const pb = player.personalBests[key] ?? 0;
                          const pbSession = player.sessions.find(s => s.metrics[key] === pb);
                          return (
                            <PlayerKPICard
                              key={key} metricKey={key} label={label} unit={unit} accentColor={color}
                              value={latestMetrics[key] ?? 0} personalBest={pb} pbDate={pbSession?.date}
                              isMobile={false} isLast={false}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 6-week player timeline */}
                <PlayerTimeline
                  sessions={player.sessions}
                  selectedMetric={timelineMetric}
                  onMetricChange={setTimelineMetric}
                />

                {/* Session history table */}
                {(() => {
                  const th: React.CSSProperties = {
                    padding: '8px 10px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10,
                    letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)',
                    textAlign: 'right', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
                    borderBottom: '1px solid var(--border)', background: 'var(--surface)',
                  };
                  const td: React.CSSProperties = {
                    padding: '7px 10px', fontFamily: 'var(--font-mono)', fontSize: 12,
                    textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
                  };
                  const parseDate = (d: string) => {
                    const parts = d.split('/').map(Number);
                    if (parts.length === 3) return new Date(parts[2], parts[0] - 1, parts[1]).getTime();
                    return 0;
                  };
                  const sortedSessions = [...player.sessions].sort((a, b) => {
                    if (sortByDate) {
                      return sortDir === 'desc'
                        ? parseDate(b.date) - parseDate(a.date)
                        : parseDate(a.date) - parseDate(b.date);
                    }
                    const av = a.metrics[sortCol] ?? 0;
                    const bv = b.metrics[sortCol] ?? 0;
                    return sortDir === 'desc' ? bv - av : av - bv;
                  });
                  return (
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: isMobile ? '60vh' : '75vh' }}>
                        {(() => {
                          const cols = isMobile ? SESSION_COLUMNS_MOBILE : SESSION_COLUMNS;
                          return (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: isMobile ? 360 : 800 }}>
                          <thead>
                            <tr>
                              <th
                                onClick={() => { if (sortByDate) setSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSortByDate(true); setSortDir('desc'); } }}
                                style={{ ...th, textAlign: 'left', position: 'sticky', top: 0, left: 0, background: 'var(--surface)', zIndex: 5, minWidth: isMobile ? 120 : 160, width: isMobile ? 120 : 160, color: sortByDate ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer' }}>
                                Session {sortByDate ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                              </th>
                              {cols.map(c => (
                                <th key={c.key}
                                  onClick={() => { setSortByDate(false); if (sortCol === c.key) setSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSortCol(c.key); setSortDir('desc'); } }}
                                  style={{ ...th, position: 'sticky', top: 0, color: !sortByDate && sortCol === c.key ? 'var(--accent)' : 'var(--muted)', zIndex: 3 }}>
                                  {c.label} {!sortByDate && sortCol === c.key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                                  {c.unit && <div style={{ fontSize: 8, opacity: 0.6, fontWeight: 500 }}>{c.unit}</div>}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sortedSessions.map((s, i) => {
                              const isLatest = s.id === player.sessions[0]?.id;
                              return (
                                <tr key={s.id}
                                  onClick={() => router.push(`/sessions?session=${s.id}`)}
                                  style={{ cursor: 'pointer', background: isLatest ? 'rgba(26,107,255,0.05)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.08)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = isLatest ? 'rgba(26,107,255,0.05)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}>
                                  <td style={{ ...td, textAlign: 'left', position: 'sticky', left: 0, background: '#0f1923', zIndex: 1, width: isMobile ? 120 : 160, minWidth: isMobile ? 120 : 160 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <SessionInjuryFlag playerName={player.name} sessionDate={s.date} playerInjuries={playerInjuries} />
                                      <div style={{ fontSize: 12, fontWeight: isLatest ? 600 : 400, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                        {s.name}
                                        {isLatest && <span style={{ marginLeft: 6, fontSize: 8, fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--accent)', textTransform: 'uppercase' }}>LATEST</span>}
                                      </div>
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)', boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}>{s.date} · {s.durationMinutes}min</div>
                                  </td>
                                  {cols.map(c => {
                                    const val = s.metrics[c.key] ?? 0;
                                    const pb = player.personalBests[c.key] ?? 0;
                                    const { color } = getLoadColor(val, pb);
                                    const isNewMax = pb > 0 && val > 0 && val >= pb &&
                                      !(['profileMaxVelocity', 'maxVelocityPct'] as MetricKey[]).includes(c.key);
                                    return (
                                      <td key={c.key} style={{ ...td, color: val > 0 ? color : 'var(--dim)', fontWeight: sortCol === c.key ? 700 : 400 }}>
                                        {val > 0 ? val.toFixed(c.decimals) : '—'}
                                        {isNewMax && <span style={{ color: 'var(--text)', fontWeight: 900, fontSize: 11, marginLeft: 2 }}>*</span>}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Select a player</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Player() {
  return (
    <Suspense fallback={<div style={{ background: 'var(--bg)', minHeight: '100vh' }} />}>
      <PlayerContent />
    </Suspense>
  );
}
