'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Ava from '@/components/Ava';
import { METRIC_CONFIG, MetricKey } from '@/lib/types';
import { ALL_SLUGS, rowToMetrics, normalizeAthlete, normalizeActivity, parseActivityDate, weekStart } from '@/lib/data';
import InjuryFlag from '@/components/InjuryFlag';

type Mode = 'week' | 'day';

const KPI_KEYS: MetricKey[] = ['playerLoad', 'playerLoadPerMin', 'truckStick', 'maxVelocity', 'totalDistance', 'maxAccel'];

const KPI_META: Record<MetricKey, { label: string; unit: string; color: string }> = {
  playerLoad:       { label: 'Player Load',  unit: 'AU',    color: '#1a6bff' },
  playerLoadPerMin: { label: 'PL / Min',     unit: 'AU/min',color: '#00e676' },
  truckStick:       { label: 'Truck Stick',  unit: 'N-s',   color: '#ff6d00' },
  maxVelocity:      { label: 'Max Velocity', unit: 'mph',   color: '#7c4dff' },
  totalDistance:    { label: 'Distance',     unit: 'yds',   color: '#00bcd4' },
  maxAccel:         { label: 'Max Accel',    unit: 'm/s²',  color: '#ff1744' },
} as any;

const POSITION_GROUPS = ['All', 'Offensive Line', 'Skill', 'Defensive Line', 'Linebackers', 'Secondary', 'Special Teams'];

interface AthleteRow {
  id: string; name: string; position: string; positionGroup: string;
  a: Partial<Record<MetricKey, number>>;
  b: Partial<Record<MetricKey, number>>;
}

interface WeekOption { ws: string; label: string; }
interface SessionOption { id: string; name: string; date: string; }

// Team avg for a set of athlete rows + metric
function tAvg(rows: AthleteRow[], key: MetricKey, side: 'a' | 'b'): number {
  const vals = rows.map(r => r[side][key] ?? 0).filter(v => v > 0);
  return vals.length > 0 ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : 0;
}


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

export default function Comparison() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('week');
  const [selectedGroup, setSelectedGroup] = useState('All');

  // Week mode state
  const [weekOptions, setWeekOptions] = useState<WeekOption[]>([]);
  const [weekA, setWeekA] = useState('');
  const [weekB, setWeekB] = useState('');

  // Day mode state
  const [sessionOptions, setSessionOptions] = useState<SessionOption[]>([]);
  const [sessionA, setSessionA] = useState('');
  const [sessionB, setSessionB] = useState('');

  // Data
  const [athletes, setAthletes] = useState<AthleteRow[]>([]);
  const [labelA, setLabelA] = useState('Period A');
  const [labelB, setLabelB] = useState('Period B');
  const [sortMetric, setSortMetric] = useState<MetricKey>('playerLoad');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [personalBests, setPersonalBests] = useState<Record<string, Partial<Record<MetricKey, number>>>>({});
  const [avaOpen, setAvaOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

function getIntensityColor(val: number, pb: number): string {
  if (pb <= 0 || val <= 0) return 'var(--text)';
  const pct = (val / pb) * 100;
  if (pct >= 90) return '#ff3b3b';
  if (pct >= 75) return '#ff8c42';
  if (pct >= 60) return '#ffd166';
  if (pct >= 40) return '#06d6a0';
  return '#4da6ff';
}

  // Load activities + build week/session options
  const loadBase = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [actRes, athRes] = await Promise.all([fetch('/api/activities'), fetch('/api/athletes')]);
      const actResult = await actRes.json();
      const athResult = await athRes.json();
      if (!actResult.success) return;

      const activities = (actResult.data as Record<string, unknown>[]).map(normalizeActivity);
      activities.sort((a, b) => b.startTime - a.startTime);

      // Session options (day mode)
      setSessionOptions(activities.map(a => ({ id: a.id, name: a.name, date: a.date })));
      if (activities.length >= 2) {
        setSessionA(activities[0].id);
        setSessionB(activities[1].id);
      }

      // Week options
      const weekMap: Record<string, string> = {};
      activities.forEach(act => {
        const d = parseActivityDate(act.date);
        const ws = weekStart(d);
        if (!weekMap[ws]) {
          const start = new Date(ws + 'T12:00:00');
          const end = new Date(start); end.setDate(end.getDate() + 6);
          const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          weekMap[ws] = `${fmt(start)} – ${fmt(end)}`;
        }
      });
      const weeks = Object.entries(weekMap)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([ws, label]) => ({ ws, label }));
      setWeekOptions(weeks);
      if (weeks.length >= 2) {
        setWeekA(weeks[0].ws);
        setWeekB(weeks[1].ws);
      } else if (weeks.length === 1) {
        setWeekA(weeks[0].ws);
        setWeekB(weeks[0].ws);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setIsRefreshing(false); }
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  // Fetch stats for a set of activity IDs, return per-athlete avg per metric
  const fetchPeriodStats = async (actIds: string[]): Promise<Record<string, Partial<Record<MetricKey, number[]>>>> => {
    const athMetrics: Record<string, Partial<Record<MetricKey, number[]>>> = {};
    await Promise.all(actIds.map(id =>
      fetch('/api/stats', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters: ALL_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [id] }], group_by: ['athlete'] }),
      }).then(r => r.json()).then(result => {
        (Array.isArray(result.data) ? result.data : []).forEach((row: Record<string, unknown>) => {
          const athId = String(row.athlete_id ?? '');
          const metrics = rowToMetrics(row);
          if (!athMetrics[athId]) athMetrics[athId] = {};
          Object.entries(metrics).forEach(([k, v]) => {
            const key = k as MetricKey;
            if (v != null && v > 0) {
              if (!athMetrics[athId][key]) athMetrics[athId][key] = [];
              athMetrics[athId][key]!.push(v);
            }
          });
        });
      }).catch(() => {})
    ));
    return athMetrics;
  };

  // Average out accumulated values
  const avgMetrics = (raw: Partial<Record<MetricKey, number[]>>): Partial<Record<MetricKey, number>> => {
    const out: Partial<Record<MetricKey, number>> = {};
    Object.entries(raw).forEach(([k, vals]) => {
      if (vals && vals.length > 0) out[k as MetricKey] = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
    });
    return out;
  };

  const runComparison = useCallback(async () => {
    setComparing(true);
    try {
      const [athRes, actRes] = await Promise.all([fetch('/api/athletes'), fetch('/api/activities')]);
      const athResult = await athRes.json();
      const actResult = await actRes.json();
      if (!athResult.success || !actResult.success) return;

      const athList = (Array.isArray(athResult.data) ? athResult.data : []).map((a: Record<string, unknown>) => normalizeAthlete(a));
      const activities = (actResult.data as Record<string, unknown>[]).map(normalizeActivity);

      let idsA: string[] = [];
      let idsB: string[] = [];
      let lA = 'Period A';
      let lB = 'Period B';

      if (mode === 'week') {
        idsA = activities.filter(a => weekStart(parseActivityDate(a.date)) === weekA).map(a => a.id);
        idsB = activities.filter(a => weekStart(parseActivityDate(a.date)) === weekB).map(a => a.id);
        const wA = weekOptions.find(w => w.ws === weekA);
        const wB = weekOptions.find(w => w.ws === weekB);
        lA = wA?.label ?? weekA;
        lB = wB?.label ?? weekB;
      } else {
        idsA = [sessionA];
        idsB = [sessionB];
        const sA = sessionOptions.find(s => s.id === sessionA);
        const sB = sessionOptions.find(s => s.id === sessionB);
        lA = sA ? `${sA.name} · ${sA.date}` : 'Session A';
        lB = sB ? `${sB.name} · ${sB.date}` : 'Session B';
      }

      setLabelA(lA);
      setLabelB(lB);

      const [rawA, rawB] = await Promise.all([
        fetchPeriodStats(idsA),
        fetchPeriodStats(idsB),
      ]);

      // Build all-time personal bests from recent sessions
      const recentIds = activities.slice(0, 20).map(a => a.id);
      const allRaw = await fetchPeriodStats(recentIds);
      const pbs: Record<string, Partial<Record<MetricKey, number>>> = {};
      Object.entries(allRaw).forEach(([athId, metricArrays]) => {
        pbs[athId] = {};
        Object.entries(metricArrays).forEach(([k, vals]) => {
          if (vals && vals.length > 0) pbs[athId][k as MetricKey] = Math.max(...vals);
        });
      });
      setPersonalBests(pbs);

      const rows: AthleteRow[] = athList.map((a: { id: string; name: string; position: string; positionGroup: string }) => ({
        id: a.id, name: a.name, position: a.position, positionGroup: a.positionGroup,
        a: avgMetrics(rawA[a.id] ?? {}),
        b: avgMetrics(rawB[a.id] ?? {}),
      })).filter((r: AthleteRow) => Object.keys(r.a).length > 0 || Object.keys(r.b).length > 0);

      setAthletes(rows);
    } catch (e) { console.error(e); }
    finally { setComparing(false); }
  }, [mode, weekA, weekB, sessionA, sessionB, weekOptions, sessionOptions]);

  // Auto-run when selections change
  useEffect(() => {
    const ready = mode === 'week' ? (weekA && weekB) : (sessionA && sessionB);
    if (ready && !loading) runComparison();
  }, [mode, weekA, weekB, sessionA, sessionB, loading]);

  const filtered = selectedGroup === 'All' ? athletes : athletes.filter(a => a.positionGroup === selectedGroup);
  const sorted = [...filtered].sort((x, y) => {
    const av = x.a[sortMetric] ?? 0;
    const bv = y.a[sortMetric] ?? 0;
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const handleSort = (key: MetricKey) => {
    if (sortMetric === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortMetric(key); setSortDir('desc'); }
  };

  const selectStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
  };

  const thStyle: React.CSSProperties = {
    padding: '9px 12px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10,
    letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)',
    textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
    background: 'var(--surface)', cursor: 'pointer', userSelect: 'none',
  };

  if (loading) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} isRefreshing />
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        <div className="skeleton" style={{ height: 200, borderRadius: 12, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 400, borderRadius: 12 }} />
      </div>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} onRefresh={runComparison} isRefreshing={isRefreshing || comparing} />
      <Ava isOpen={avaOpen} onClose={() => setAvaOpen(false)} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '10px 12px' : '20px 16px' }}>
        {!isMobile && (
          <div style={{ marginBottom: 18 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Comparison</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Compare team averages across two periods</p>
          </div>
        )}

        {/* ── Mode + Selectors ──────────────────────────── */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: isMobile ? '12px 14px' : '16px 20px', marginBottom: isMobile ? 10 : 16 }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 12, width: isMobile ? '100%' : 'fit-content' }}>
            {([['week', 'Week Range'], ['day', 'Day vs Day']] as [Mode, string][]).map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} style={{ flex: isMobile ? 1 : undefined, padding: isMobile ? '10px 0' : '8px 20px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', background: mode === m ? 'var(--accent)' : 'transparent', color: mode === m ? 'white' : 'var(--muted)', transition: 'all 0.15s' }}>
                {label}
              </button>
            ))}
          </div>

          {/* Selectors */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto 1fr', gap: isMobile ? 10 : 12, alignItems: 'center' }}>
            {/* Period A */}
            <div>
              <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-display)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                {mode === 'week' ? '⬤ Period A' : '⬤ Session A'}
              </div>
              {mode === 'week' ? (
                <select value={weekA} onChange={e => setWeekA(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
                  {weekOptions.map(w => <option key={w.ws} value={w.ws}>{w.label}</option>)}
                </select>
              ) : (
                <select value={sessionA} onChange={e => setSessionA(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
                  {sessionOptions.map(s => <option key={s.id} value={s.id}>{s.name}{isMobile ? '' : ` · ${s.date}`}</option>)}
                </select>
              )}
            </div>

            {/* VS */}
            {!isMobile && <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, color: 'var(--muted)', paddingTop: 20 }}>VS</div>}

            {/* Period B */}
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                {mode === 'week' ? '○ Period B' : '○ Session B'}
              </div>
              {mode === 'week' ? (
                <select value={weekB} onChange={e => setWeekB(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
                  {weekOptions.map(w => <option key={w.ws} value={w.ws}>{w.label}</option>)}
                </select>
              ) : (
                <select value={sessionB} onChange={e => setSessionB(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
                  {sessionOptions.map(s => <option key={s.id} value={s.id}>{s.name}{isMobile ? '' : ` · ${s.date}`}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>

        {comparing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
          </div>
        ) : athletes.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            No data found for selected periods
          </div>
        ) : (
          <>
            {/* ── KPI Cards ──────────────────────────────── */}
            {isMobile ? (
              /* Mobile: KPI row format */
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
                {KPI_KEYS.map((key, idx) => {
                  const meta = KPI_META[key] || { label: METRIC_CONFIG[key]?.label, unit: METRIC_CONFIG[key]?.unit, color: 'var(--accent)' };
                  const aVal = tAvg(filtered, key, 'a');
                  const bVal = tAvg(filtered, key, 'b');
                  const changePct = bVal > 0 && aVal > 0 ? ((aVal - bVal) / bVal) * 100 : null;
                  const up = changePct != null && changePct >= 0;
                  return (
                    <div key={key} style={{ position: 'relative', padding: '8px 12px 8px 14px', borderBottom: idx < KPI_KEYS.length - 1 ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
                      <div style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, background: meta.color, borderRadius: '0 3px 3px 0', opacity: 0.7 }} />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 3 }}>{meta.label}</div>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                            <div>
                              <div style={{ fontSize: 8, color: 'var(--accent)', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 1, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelA}</div>
                              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: meta.color }}>{aVal > 0 ? aVal.toFixed(1) : '—'}</span>
                            </div>
                            <span style={{ fontSize: 10, color: 'var(--dim)' }}>·</span>
                            <div>
                              <div style={{ fontSize: 8, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 1, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelB}</div>
                              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{bVal > 0 ? bVal.toFixed(1) : '—'}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {changePct != null ? (
                            <>
                              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: up ? '#06d6a0' : '#ff8c42', lineHeight: 1 }}>
                                {up ? '▲' : '▼'}{Math.abs(changePct).toFixed(1)}%
                              </div>
                              <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{meta.unit}</div>
                            </>
                          ) : <div style={{ fontSize: 13, color: 'var(--dim)' }}>—</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Desktop: original grid cards */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                {KPI_KEYS.map(key => {
                  const meta = KPI_META[key] || { label: METRIC_CONFIG[key]?.label, unit: METRIC_CONFIG[key]?.unit, color: 'var(--accent)' };
                  const aVal = tAvg(filtered, key, 'a');
                  const bVal = tAvg(filtered, key, 'b');
                  const changePct = bVal > 0 && aVal > 0 ? ((aVal - bVal) / bVal) * 100 : null;
                  const up = changePct != null && changePct >= 0;
                  return (
                    <div key={key} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${meta.color}`, borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>{meta.label}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <div style={{ background: 'rgba(26,107,255,0.08)', border: '1px solid rgba(26,107,255,0.2)', borderRadius: 8, padding: '8px 10px' }}>
                          <div style={{ fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelA}</div>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, color: meta.color }}>{aVal > 0 ? aVal.toFixed(1) : '—'}<span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 2 }}>{meta.unit}</span></div>
                        </div>
                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                          <div style={{ fontSize: 9, color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelB}</div>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, color: 'var(--text)' }}>{bVal > 0 ? bVal.toFixed(1) : '—'}<span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 2 }}>{meta.unit}</span></div>
                        </div>
                      </div>
                      {changePct != null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: up ? '#06d6a0' : '#ff8c42' }}>{up ? '▲' : '▼'} {Math.abs(changePct).toFixed(1)}%</span>
                          <span style={{ fontSize: 10, color: 'var(--muted)' }}>A vs B</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Athlete Table ───────────────────────────── */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: isMobile ? '10px 14px' : '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13 }}>Athlete Breakdown</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>A: {labelA}</span>
                    <span style={{ margin: '0 8px', color: 'var(--dim)' }}>vs</span>
                    <span style={{ color: 'var(--text)', fontWeight: 700 }}>B: {labelB}</span>
                  </div>
                  {!isMobile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>% of personal best</span>
                      {[{ label: '~Max ≥90%', color: '#ff3b3b' }, { label: 'High 75–89%', color: '#ff8c42' }, { label: 'Mod 60–74%', color: '#ffd166' }, { label: 'Avg 40–59%', color: '#06d6a0' }, { label: 'Low <40%', color: '#4da6ff' }].map(item => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.color }} />
                          <span style={{ fontSize: 9, color: 'var(--muted)' }}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} style={{ ...selectStyle, fontSize: 12 }}>
                  {POSITION_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              {/* Same table for both mobile and desktop — sticky first col + header */}
              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: isMobile ? '60vh' : '75vh' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: isMobile ? 500 : 'auto' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, textAlign: 'left', position: 'sticky', top: 0, left: 0, background: 'var(--surface)', zIndex: 5, minWidth: isMobile ? 110 : 150 }}>Athlete</th>
                      {KPI_KEYS.map(key => {
                        const meta = KPI_META[key];
                        const isSort = sortMetric === key;
                        return (
                          <th key={`a-${key}`} colSpan={3} onClick={() => handleSort(key)}
                            style={{ ...thStyle, textAlign: 'center', color: isSort ? 'var(--accent)' : 'var(--muted)', borderLeft: '2px solid var(--border)', position: 'sticky', top: 0, zIndex: 3 }}>
                            {isMobile ? (METRIC_CONFIG[key]?.shortLabel ?? meta?.label) : (meta?.label ?? METRIC_CONFIG[key]?.shortLabel)} {isSort ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                          </th>
                        );
                      })}
                    </tr>
                    <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                      <th style={{ ...thStyle, textAlign: 'left', position: 'sticky', top: thStyle.padding ? 34 : 34, left: 0, background: 'var(--surface)', zIndex: 5 }} />
                      {KPI_KEYS.map(key => (
                        <>
                          <th key={`ha-${key}`} style={{ ...thStyle, color: 'var(--accent)', borderLeft: '2px solid var(--border)', fontSize: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 60, position: 'sticky', top: 34, zIndex: 3 }}>{labelA}</th>
                          <th key={`hb-${key}`} style={{ ...thStyle, fontSize: 8, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 60, position: 'sticky', top: 34, zIndex: 3 }}>{labelB}</th>
                          <th key={`hd-${key}`} style={{ ...thStyle, fontSize: 9, position: 'sticky', top: 34, zIndex: 3 }}>Δ%</th>
                        </>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((row, i) => (
                      <tr key={row.id}
                        style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}>
                        <td style={{ padding: '9px 14px', position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button onClick={() => router.push(`/player?id=${row.id}`)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 12, padding: 0, textAlign: 'left', fontFamily: 'inherit' }}>
                              {row.name}
                            </button>
                            <InjuryFlag athleteId={row.id} athleteName={row.name} />
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{row.position}</div>
                        </td>
                        {KPI_KEYS.map(key => {
                          const aVal = row.a[key] ?? 0;
                          const bVal = row.b[key] ?? 0;
                          const delta = bVal > 0 && aVal > 0 ? ((aVal - bVal) / bVal) * 100 : null;
                          const up = delta != null && delta >= 0;
                          const pb = personalBests[row.id]?.[key] ?? 0;
                          const excludeFromMax = (['profileMaxVelocity', 'maxVelocityPct'] as MetricKey[]).includes(key);
                          const aColor = getIntensityColor(aVal, pb);
                          const bColor = getIntensityColor(bVal, pb);
                          const aIsMax = !excludeFromMax && pb > 0 && aVal > 0 && aVal >= pb;
                          const bIsMax = !excludeFromMax && pb > 0 && bVal > 0 && bVal >= pb;
                          return (
                            <>
                              <td key={`a-${key}`} onClick={() => router.push(`/player?id=${row.id}`)}
                                style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: pb > 0 ? aColor : 'var(--accent)', whiteSpace: 'nowrap', borderLeft: '2px solid var(--border)', cursor: 'pointer' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.08)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                {aVal > 0 ? aVal.toFixed(1) : '—'}{aIsMax && <span style={{ color: 'var(--text)', fontWeight: 900, fontSize: 11, marginLeft: 2 }}>*</span>}
                              </td>
                              <td key={`b-${key}`} onClick={() => router.push(`/player?id=${row.id}`)}
                                style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: pb > 0 ? bColor : 'var(--text)', whiteSpace: 'nowrap', cursor: 'pointer' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.08)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                {bVal > 0 ? bVal.toFixed(1) : '—'}{bIsMax && <span style={{ color: 'var(--text)', fontWeight: 900, fontSize: 11, marginLeft: 2 }}>*</span>}
                              </td>
                              <td key={`d-${key}`} style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: delta == null ? 'var(--dim)' : up ? '#06d6a0' : '#ff8c42', whiteSpace: 'nowrap' }}>
                                {delta != null ? (up ? '▲' : '▼') + Math.abs(delta).toFixed(0) + '%' : '—'}
                              </td>
                            </>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
