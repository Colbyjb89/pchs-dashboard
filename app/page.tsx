'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Ava from '@/components/Ava';
import { METRIC_CONFIG, MetricKey } from '@/lib/types';
import { ALL_SLUGS, rowToMetrics, normalizeAthlete, normalizeActivity } from '@/lib/data';
import InjuryFlag from '@/components/InjuryFlag';

const KPI_CARDS: { key: MetricKey; color: string }[] = [
  { key: 'playerLoad',       color: '#1a6bff' },
  { key: 'playerLoadPerMin', color: '#00e676' },
  { key: 'truckStick',       color: '#ff6d00' },
  { key: 'maxVelocity',      color: '#7c4dff' },
  { key: 'totalDistance',    color: '#00bcd4' },
  { key: 'maxAccel',         color: '#ff1744' },
];

interface KPIMax { value: number; athleteName: string; date: string; }
interface AthleteRow { id: string; name: string; position: string; positionGroup: string; }
interface AthleteLeaderEntry extends AthleteRow { value: number; date: string; sessionId: string; }
interface SessionRow { weekStart: string; weekLabel: string; avgValue: number; maxValue: number; }

function KPICard({ metricKey, color, max, isActive, onClick }: {
  metricKey: MetricKey; color: string;
  max: KPIMax; isActive: boolean; onClick: () => void;
}) {
  const [showTip, setShowTip] = useState(false);
  const cfg = METRIC_CONFIG[metricKey];
  return (
    <div className={`kpi-card ${isActive ? 'active' : ''}`} onClick={onClick}
      style={{ borderTopColor: isActive ? color : 'transparent', borderTopWidth: 2, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{cfg.shortLabel}</div>
        <button onClick={e => { e.stopPropagation(); setShowTip(v => !v); }}
          style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--dim)', border: 'none', color: 'var(--muted)', fontSize: 9, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</button>
      </div>
      {showTip && (
        <div onClick={e => e.stopPropagation()} style={{ background: '#1e2d42', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, animation: 'fadeIn 0.15s ease' }}>
          <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>{cfg.label}</strong>
          {cfg.description}
        </div>
      )}
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 34, color, lineHeight: 1, marginBottom: 4 }}>
        {max.value > 0 ? max.value.toFixed(1) : '—'}
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginLeft: 4 }}>{cfg.unit}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{max.athleteName}</span>
        {max.date && <span> · {max.date}</span>}
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.04em', opacity: 0.7 }}>ALL-TIME MAX →</div>
    </div>
  );
}

function LeaderboardPanel({ metricKey, athletes, sessions }: {
  metricKey: MetricKey;
  athletes: AthleteLeaderEntry[];
  sessions: SessionRow[];
}) {
  const cfg = METRIC_CONFIG[metricKey];

  // SVG line chart — draws a connected path showing rise and fall clearly
  const visible = sessions.slice(-6);
  const vals = visible.map(s => s.avgValue).filter(v => v > 0);
  const chartMin = vals.length > 0 ? Math.min(...vals) : 0;
  const chartMax = vals.length > 0 ? Math.max(...vals) : 1;
  const chartRange = chartMax - chartMin || 1;
  const W = 340; const H = 100; const PAD = 12;
  const points = visible
    .map((s, i) => {
      const x = PAD + (i / Math.max(visible.length - 1, 1)) * (W - PAD * 2);
      const y = s.avgValue > 0
        ? H - PAD - ((s.avgValue - chartMin) / chartRange) * (H - PAD * 2)
        : H - PAD;
      return { x, y, s };
    });
  const pathD = points.length > 1
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    : '';
  const areaD = points.length > 1
    ? `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(H - PAD)} L ${points[0].x.toFixed(1)} ${(H - PAD)} Z`
    : '';

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', animation: 'fadeIn 0.25s ease', marginTop: 16 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14 }}>{cfg.label} — Leaderboard</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>All-time maximums by athlete</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>

        {/* SVG line chart */}
        <div style={{ padding: 16, borderRight: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Weekly Team Avg</div>
          {visible.length < 2 ? (
            <div style={{ color: 'var(--muted)', fontSize: 12, paddingTop: 20 }}>Not enough weeks of data yet</div>
          ) : (
            <>
              {/* Min/max labels */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                <span>↑ {chartMax.toFixed(1)}</span>
                <span>↓ {chartMin.toFixed(1)} {cfg.unit}</span>
              </div>
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a6bff" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#1a6bff" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {/* Zero/baseline */}
                <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border)" strokeWidth="1" />
                {/* Area fill */}
                {areaD && <path d={areaD} fill="url(#areaGrad)" />}
                {/* Line */}
                {pathD && <path d={pathD} fill="none" stroke="#1a6bff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
                {/* Dots + labels */}
                {points.map((p, i) => (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r="4" fill="#1a6bff" stroke="var(--surface)" strokeWidth="2" />
                    <text x={p.x} y={H} textAnchor="middle" fontSize="8" fill="var(--muted)" fontFamily="monospace">
                      {p.s.weekLabel}
                    </text>
                    <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="9" fill="var(--accent)" fontFamily="monospace">
                      {p.s.avgValue > 0 ? p.s.avgValue.toFixed(0) : ''}
                    </text>
                  </g>
                ))}
              </svg>
            </>
          )}
        </div>

        {/* Leaderboard */}
        <div style={{ padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>All Athletes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
            {athletes.map((a, i) => (
              <a key={a.id} href={`/player?id=${a.id}&session=${a.sessionId}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: i === 0 ? 'rgba(26,107,255,0.1)' : 'var(--card)', borderRadius: 8, border: '1px solid var(--border)', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: i === 0 ? 'var(--accent)' : 'var(--dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, color: 'white', flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)', display: 'flex', alignItems: 'center' }}>
                    {a.name}
                    <InjuryFlag athleteId={a.id} athleteName={a.name} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{a.position}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color: i === 0 ? 'var(--accent)' : 'var(--text)' }}>
                    {a.value.toFixed(1)}<span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 2 }}>{cfg.unit}</span>
                  </div>
                  {a.date && <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 1 }}>{a.date}</div>}
                </div>
              </a>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default function TeamOverview() {
  const router = useRouter();
  const [athletes, setAthletes] = useState<AthleteRow[]>([]);
  const [kpiMaxes, setKpiMaxes] = useState<Record<MetricKey, KPIMax>>({} as Record<MetricKey, KPIMax>);
  const [leaderboards, setLeaderboards] = useState<Record<MetricKey, AthleteLeaderEntry[]>>({} as any);
  const [weeklySessions, setWeeklySessions] = useState<Record<MetricKey, SessionRow[]>>({} as any);
  const [activeKPI, setActiveKPI] = useState<MetricKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [avaOpen, setAvaOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'error' | null>(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');

  const buildEmpty = (): Record<MetricKey, KPIMax> => {
    const r = {} as Record<MetricKey, KPIMax>;
    KPI_CARDS.forEach(({ key }) => { r[key] = { value: 0, athleteName: '—', date: '' }; });
    return r;
  };

  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [athRes, actRes] = await Promise.all([fetch('/api/athletes'), fetch('/api/activities')]);
      const athResult = await athRes.json();
      const actResult = await actRes.json();

      if (!athResult.success) throw new Error(athResult.error || 'Athletes failed');
      const athList = (Array.isArray(athResult.data) ? athResult.data : []).map((a: Record<string, unknown>) => normalizeAthlete(a));
      setAthletes(athList);

      const athMap: Record<string, AthleteRow> = {};
      athList.forEach((a: AthleteRow) => { athMap[a.id] = a; });

      if (!actResult.success) throw new Error(actResult.error || 'Activities failed');
      const activities = (actResult.data as Record<string, unknown>[]).map(normalizeActivity).slice(0, 20);

      // Fetch stats for all recent sessions in parallel
      const allSessionData = await Promise.all(
        activities.map(act =>
          fetch('/api/stats', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parameters: ALL_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [act.id] }], group_by: ['athlete'] }),
          }).then(r => r.json())
            .then(r => ({ act, rows: Array.isArray(r.data) ? r.data : [] }))
            .catch(() => ({ act, rows: [] }))
        )
      );

      // Build all-time maxes + per-athlete maxes
      const maxes = buildEmpty();
      const athMaxes: Record<string, Partial<Record<MetricKey, number>>> = {};
      const athMaxDates: Record<string, Partial<Record<MetricKey, string>>> = {};

      allSessionData.forEach(({ act, rows }) => {
        rows.forEach((row: Record<string, unknown>) => {
          const id = String(row.athlete_id ?? '');
          const metrics = rowToMetrics(row);
          if (!athMaxes[id]) athMaxes[id] = {};
          if (!athMaxDates[id]) athMaxDates[id] = {};
          if (!(athMaxDates[id] as any).sessionIds) (athMaxDates[id] as any).sessionIds = {};
          KPI_CARDS.forEach(({ key }) => {
            const val = metrics[key] ?? 0;
            if (val > (maxes[key]?.value ?? 0)) {
              maxes[key] = { value: val, athleteName: String(row.athlete_name ?? '—'), date: act.date };
            }
            if (val > (athMaxes[id][key] ?? 0)) {
              athMaxes[id][key] = val;
              athMaxDates[id][key] = act.date;
              (athMaxDates[id] as any).sessionIds = (athMaxDates[id] as any).sessionIds || {};
              (athMaxDates[id] as any).sessionIds[key] = act.id;
            }
          });
        });
      });
      setKpiMaxes(maxes);

      // Build leaderboards with date
      const boards: Record<MetricKey, AthleteLeaderEntry[]> = {} as any;
      KPI_CARDS.forEach(({ key }) => {
        boards[key] = athList
          .map((a: AthleteRow) => ({ ...a, value: athMaxes[a.id]?.[key] ?? 0, date: athMaxDates[a.id]?.[key] ?? '', sessionId: (athMaxDates[a.id] as any)?.sessionIds?.[key] ?? '' }))
          .filter((a: AthleteLeaderEntry) => a.value > 0)
          .sort((a: AthleteLeaderEntry, b: AthleteLeaderEntry) => b.value - a.value);
      });
      setLeaderboards(boards);

      // Build weekly sessions for the chart
      const { weekStart } = await import('@/lib/data');
      const byWeek: Record<string, Record<MetricKey, number[]>> = {};
      allSessionData.forEach(({ act, rows }) => {
        const d = new Date(act.startTime * 1000);
        const ws = weekStart(d);
        if (!byWeek[ws]) byWeek[ws] = {} as Record<MetricKey, number[]>;
        rows.forEach((row: Record<string, unknown>) => {
          const metrics = rowToMetrics(row);
          KPI_CARDS.forEach(({ key }) => {
            if (!byWeek[ws][key]) byWeek[ws][key] = [];
            const val = metrics[key] ?? 0;
            if (val > 0) byWeek[ws][key].push(val);
          });
        });
      });

      const weekly: Record<MetricKey, SessionRow[]> = {} as any;
      KPI_CARDS.forEach(({ key }) => {
        weekly[key] = Object.entries(byWeek)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([ws, metricData]) => {
            const d = new Date(ws + 'T12:00:00');
            const vals = metricData[key] || [];
            return {
              weekStart: ws,
              weekLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              avgValue: vals.length > 0 ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : 0,
              maxValue: vals.length > 0 ? Math.round(Math.max(...vals) * 10) / 10 : 0,
            };
          });
      });
      setWeeklySessions(weekly);

      setConnectionStatus('connected');
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(String(err));
      setConnectionStatus('error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} isRefreshing />
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 120, borderRadius: 12 }} />)}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} onRefresh={loadData} isRefreshing={isRefreshing} />
      <Ava isOpen={avaOpen} onClose={() => setAvaOpen(false)} />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>

        {/* Connection status */}
        {connectionStatus === 'error' && (
          <div style={{ background: 'rgba(255,23,68,0.1)', border: '1px solid rgba(255,23,68,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--red)', fontSize: 16 }}>⚠</span>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--red)', fontSize: 13 }}>API Connection Issue</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{error}</div>
            </div>
          </div>
        )}
        {connectionStatus === 'connected' && (
          <div style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.2)', borderRadius: 10, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', animation: 'pulse-dot 2s infinite' }} />
              <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>Catapult API Connected · {athletes.length} athletes loaded</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Updated {lastUpdated}</span>
          </div>
        )}

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Team Overview</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>All-time maximums · Click any card to view leaderboard</p>
        </div>

        {/* KPI Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 8 }}>
          {KPI_CARDS.map(({ key, color }) => (
            <KPICard key={key} metricKey={key} color={color}
              max={kpiMaxes[key] || { value: 0, athleteName: '—', date: '' }}
              isActive={activeKPI === key}
              onClick={() => setActiveKPI(activeKPI === key ? null : key)} />
          ))}
        </div>

        {/* Leaderboard panel */}
        {activeKPI && (
          <LeaderboardPanel
            metricKey={activeKPI}
            athletes={leaderboards[activeKPI] || []}
            sessions={weeklySessions[activeKPI] || []} />
        )}

      </div>
    </div>
  );
}
