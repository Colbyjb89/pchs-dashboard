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

// ─── KPI card with color coding ───────────────────────────────────────────────
function PlayerKPICard({ metricKey, label, unit, accentColor, value, personalBest, pbDate }: {
  metricKey: MetricKey; label: string; unit: string; accentColor: string;
  value: number; personalBest: number; pbDate?: string;
}) {
  const [showTip, setShowTip] = useState(false);
  const cfg = METRIC_CONFIG[metricKey];
  const { color, label: intensityLabel } = getLoadColor(value, personalBest);
  const pct = personalBest > 0 && value > 0 ? Math.round((value / personalBest) * 100) : 0;

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', borderTop: `2px solid ${accentColor}`, position: 'relative' }}>
      {/* Header */}
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

      {/* Latest session value */}
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26, color, lineHeight: 1, marginBottom: 2 }}>
        {value > 0 ? value.toFixed(1) : '—'}
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginLeft: 3 }}>{unit}</span>
      </div>

      {/* Intensity + % of max */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        {value > 0 && personalBest > 0 ? (
          <>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color, fontWeight: 700 }}>{intensityLabel}</span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>· {pct}% of max</span>
          </>
        ) : <span style={{ fontSize: 10, color: 'var(--muted)' }}>No data</span>}
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border)', marginBottom: 5 }} />

      {/* All-time max */}
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
  { key: 'maxDecel',             label: 'Max Dec',    unit: 'm/s²',  decimals: 2 },
  { key: 'accelDecelEfforts',    label: 'A+D Effs',   unit: '',      decimals: 0 },
  { key: 'truckStick',           label: 'Truck',      unit: 'N-s',   decimals: 0 },
  { key: 'velocityBand4Distance',label: 'HSY (VB4)',  unit: 'yds',   decimals: 0 },
  { key: 'velocityBand7Efforts', label: 'VB7 Effs',   unit: '',      decimals: 0 },
];

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
import { getCurrentInjury, getAthleteInjuries, STATUS_COLORS as INJ_COLORS } from '@/lib/injuries';

function InjuryBanner({ athleteName }: { athleteName: string }) {
  const [current, setCurrent] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  useEffect(() => {
    setCurrent(getCurrentInjury(athleteName));
    setHistory(getAthleteInjuries(athleteName).filter((r: any) => !r.isCurrent));
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
  const [selectedSessionId, setSelectedSessionId] = useState<string>(searchParams.get('session') || '');
  const [avaOpen, setAvaOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Player Drill-Down</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}>

          {/* ── Roster list ───────────────────────────── */}
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

          {/* ── Player detail ─────────────────────────── */}
          <div>
            {playerLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
              </div>
            ) : player ? (
              <>
                {/* Header */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22 }}>{player.name}</div>
                        <InjuryFlag athleteId={player.id} athleteName={player.name} size="md" />
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {player.position} · {player.positionGroup} · {player.sessions.length} sessions
                        {latestSession && <span> · Last: {latestSession.date}</span>}
                      </div>
                    </div>
                    {/* ACWR badge */}
                    <div style={{ background: `${ACWR_COLORS[player.acwrStatus]}18`, border: `1px solid ${ACWR_COLORS[player.acwrStatus]}44`, borderRadius: 10, padding: '10px 18px', textAlign: 'center', minWidth: 120 }}>
                      <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>ACWR</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26, color: ACWR_COLORS[player.acwrStatus] }}>{player.acwr.toFixed(2)}</div>
                      <div style={{ fontSize: 10, color: ACWR_COLORS[player.acwrStatus], fontWeight: 600 }}>{ACWR_LABELS[player.acwrStatus]}</div>
                      <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>A: {player.acuteLoad.toFixed(0)} / C: {player.chronicLoad.toFixed(0)}</div>
                    </div>
                  </div>

                  {/* Color coding legend */}
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
                </div>

                {/* Injury banner */}
                <InjuryBanner athleteName={player.name} />

                {/* KPI Cards — selected session vs personal best */}
                {player.sessions.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    {/* Session selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Session
                      </div>
                      <select
                        value={selectedSessionId || player.sessions[0]?.id || ''}
                        onChange={e => setSelectedSessionId(e.target.value)}
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, flex: 1, maxWidth: 420 }}>
                        {player.sessions.map((s, i) => (
                          <option key={s.id} value={s.id}>
                            {s.name} · {s.date}{i === 0 ? ' (latest)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {KPI_KEYS.map(({ key, label, unit, color }) => {
                        const pb = player.personalBests[key] ?? 0;
                        const pbSession = player.sessions.find(s => s.metrics[key] === pb);
                        return (
                          <PlayerKPICard
                            key={key}
                            metricKey={key}
                            label={label}
                            unit={unit}
                            accentColor={color}
                            value={latestMetrics[key] ?? 0}
                            personalBest={pb}
                            pbDate={pbSession?.date}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 6-week player timeline */}
                <PlayerTimeline
                  sessions={player.sessions}
                  selectedMetric={timelineMetric}
                  onMetricChange={setTimelineMetric}
                />

                {/* Session history table */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto', maxHeight: 460 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                        <tr>
                          <th style={{ padding: '9px 14px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', left: 0, zIndex: 3 }}>
                            Session
                          </th>
                          {SESSION_COLUMNS.map(c => (
                            <th key={c.key}
                              onClick={() => { if (sortCol === c.key) setSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSortCol(c.key); setSortDir('desc'); } }}
                              style={{ padding: '9px 10px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: sortCol === c.key ? 'var(--accent)' : 'var(--muted)', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', userSelect: 'none' }}>
                              {c.label} {sortCol === c.key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                              {c.unit && <div style={{ fontSize: 8, opacity: 0.6, fontWeight: 500 }}>{c.unit}</div>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...player.sessions]
                          .sort((a, b) => {
                            const av = a.metrics[sortCol] ?? 0;
                            const bv = b.metrics[sortCol] ?? 0;
                            return sortDir === 'desc' ? bv - av : av - bv;
                          })
                          .map((s, i) => (
                            <SessionRow
                              key={s.id}
                              session={s}
                              personalBests={player.personalBests}
                              isLatest={s.id === player.sessions[0]?.id}
                              sortCol={sortCol}
                              onClick={() => router.push(`/sessions?session=${s.id}`)}
                            />
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
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
