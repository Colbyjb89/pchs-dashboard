'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Ava from '@/components/Ava';
import { METRIC_CONFIG, MetricKey } from '@/lib/types';
import { ALL_SLUGS, rowToMetrics, normalizeActivity, parseActivityDate, weekStart } from '@/lib/data';

const KPI_CARDS: { key: MetricKey; label: string; unit: string; color: string }[] = [
  { key: 'playerLoad',       label: 'Player Load',   unit: 'AU',    color: '#1a6bff' },
  { key: 'playerLoadPerMin', label: 'PL / Min',      unit: 'AU/min',color: '#00e676' },
  { key: 'truckStick',       label: 'Truck Stick',   unit: 'N-s',   color: '#ff6d00' },
  { key: 'maxVelocity',      label: 'Max Velocity',  unit: 'mph',   color: '#7c4dff' },
  { key: 'totalDistance',    label: 'Distance',      unit: 'yds',   color: '#00bcd4' },
  { key: 'maxAccel',         label: 'Max Accel',     unit: 'm/s²',  color: '#ff1744' },
];

interface WeekData {
  ws: string;
  label: string;
  avgValues: Partial<Record<MetricKey, number>>;
  maxValues: Partial<Record<MetricKey, number>>;
  sessionCount: number;
}

function TrendsContent() {
  const searchParams = useSearchParams();
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>(
    (searchParams.get('metric') as MetricKey) || 'playerLoad'
  );
  const [allWeeks, setAllWeeks] = useState<WeekData[]>([]);
  const [availableWeeks, setAvailableWeeks] = useState<{ ws: string; label: string }[]>([]);
  const [fromWeek, setFromWeek] = useState('');
  const [toWeek, setToWeek] = useState('');
  const [loading, setLoading] = useState(true);
  const [avaOpen, setAvaOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const actRes = await fetch('/api/activities');
      const actResult = await actRes.json();
      if (!actResult.success) return;
      const activities = (actResult.data as Record<string, unknown>[]).map(normalizeActivity).slice(0, 20);

      const statsPromises = activities.map(act =>
        fetch('/api/stats', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parameters: ALL_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [act.id] }], group_by: ['athlete'] }),
        }).then(r => r.json())
          .then(r => ({ activityId: act.id, date: act.date, rows: Array.isArray(r.data) ? r.data : [] }))
          .catch(() => ({ activityId: act.id, date: act.date, rows: [] }))
      );
      const allStats = await Promise.all(statsPromises);

      // Group by week — accumulate all metric values
      const byWeek: Record<string, { values: Partial<Record<MetricKey, number[]>>; sessions: Set<string> }> = {};
      allStats.forEach(({ activityId, date, rows }) => {
        if (!date) return;
        const d = parseActivityDate(date);
        const ws = weekStart(d);
        if (!byWeek[ws]) byWeek[ws] = { values: {}, sessions: new Set() };
        byWeek[ws].sessions.add(activityId);
        rows.forEach((row: Record<string, unknown>) => {
          const m = rowToMetrics(row);
          KPI_CARDS.forEach(({ key }) => {
            const val = m[key];
            if (val != null && val > 0) {
              if (!byWeek[ws].values[key]) byWeek[ws].values[key] = [];
              byWeek[ws].values[key]!.push(val);
            }
          });
        });
      });

      const weeks: WeekData[] = Object.entries(byWeek)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ws, { values, sessions }]) => {
          const d = new Date(ws + 'T12:00:00');
          const end = new Date(d); end.setDate(end.getDate() + 6);
          const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const label = `${fmt(d)} – ${fmt(end)}`;
          const avgValues: Partial<Record<MetricKey, number>> = {};
          const maxValues: Partial<Record<MetricKey, number>> = {};
          KPI_CARDS.forEach(({ key }) => {
            const vals = values[key] || [];
            if (vals.length > 0) {
              avgValues[key] = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
              maxValues[key] = Math.round(Math.max(...vals) * 10) / 10;
            }
          });
          return { ws, label, avgValues, maxValues, sessionCount: sessions.size };
        });

      setAllWeeks(weeks);

      const weekOptions = [...weeks].reverse().map(w => ({ ws: w.ws, label: w.label }));
      setAvailableWeeks(weekOptions);

      // Default: show all weeks
      if (weeks.length > 0) {
        setToWeek(weeks[weeks.length - 1].ws);
        setFromWeek(weeks[Math.max(0, weeks.length - 8)].ws);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setIsRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter weeks by selected range
  const filteredWeeks = allWeeks.filter(w =>
    (!fromWeek || w.ws >= fromWeek) && (!toWeek || w.ws <= toWeek)
  );

  // Latest week in filtered range
  const latestWeek = filteredWeeks[filteredWeeks.length - 1];
  const prevWeek = filteredWeeks[filteredWeeks.length - 2];

  // Season avg (all weeks) for % comparison
  const seasonAvg = (key: MetricKey): number => {
    const vals = allWeeks.map(w => w.avgValues[key] ?? 0).filter(v => v > 0);
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  };

  // Chart data for selected metric
  const chartData = filteredWeeks;
  const chartVals = chartData.map(w => w.avgValues[selectedMetric] ?? 0).filter(v => v > 0);
  const chartMin = chartVals.length > 0 ? Math.min(...chartVals) : 0;
  const chartMax = chartVals.length > 0 ? Math.max(...chartVals) : 1;
  const chartRange = chartMax - chartMin || 1;
  const W = 600; const H = 110; const PAD = 16;

  const points = chartData.map((w, i) => {
    const val = w.avgValues[selectedMetric] ?? 0;
    const x = PAD + (i / Math.max(chartData.length - 1, 1)) * (W - PAD * 2);
    const y = val > 0 ? H - PAD - ((val - chartMin) / chartRange) * (H - PAD * 2) : H - PAD;
    return { x, y, w, val };
  });
  const pathD = points.length > 1
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    : '';
  const areaD = points.length > 1
    ? `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${H - PAD} L ${points[0].x.toFixed(1)} ${H - PAD} Z`
    : '';

  const cfg = METRIC_CONFIG[selectedMetric];
  const kpiColor = KPI_CARDS.find(k => k.key === selectedMetric)?.color ?? 'var(--accent)';

  if (loading) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} isRefreshing />
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        <div className="skeleton" style={{ height: 160, borderRadius: 12, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
      </div>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} onRefresh={loadData} isRefreshing={isRefreshing} />
      <Ava isOpen={avaOpen} onClose={() => setAvaOpen(false)} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Trends</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {allWeeks.length} weeks of data · Click any KPI to view its trend
          </p>
        </div>

        {/* ── KPI Cards ─────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {KPI_CARDS.map(({ key, label, unit, color }) => {
            const latest = latestWeek?.avgValues[key] ?? 0;
            const sAvg = seasonAvg(key);
            const changePct = sAvg > 0 && latest > 0 ? ((latest - sAvg) / sAvg) * 100 : null;
            const up = changePct != null && changePct >= 0;
            const isActive = selectedMetric === key;

            // Color the value by how it compares to season avg
            let valColor = color;
            if (changePct != null) {
              if (changePct >= 15)       valColor = '#ff3b3b';
              else if (changePct >= 5)   valColor = '#ff8c42';
              else if (changePct >= -5)  valColor = '#06d6a0';
              else if (changePct >= -15) valColor = '#ffd166';
              else                       valColor = '#4da6ff';
            }

            return (
              <div
                key={key}
                onClick={() => setSelectedMetric(key)}
                style={{
                  background: 'var(--card)',
                  border: `1px solid ${isActive ? color : 'var(--border)'}`,
                  borderTop: `3px solid ${color}`,
                  borderRadius: 12,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                  boxShadow: isActive ? `0 0 0 1px ${color}44` : 'none',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = color + '88'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</div>
                  {isActive && <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, animation: 'pulse-dot 2s infinite' }} />}
                </div>

                {/* Current week value */}
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, color: valColor, lineHeight: 1, marginBottom: 4 }}>
                  {latest > 0 ? latest.toFixed(1) : '—'}
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginLeft: 3 }}>{unit}</span>
                </div>

                {/* % vs season avg */}
                {changePct != null ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: up ? '#06d6a0' : '#ff8c42' }}>
                      {up ? '▲' : '▼'} {Math.abs(changePct).toFixed(1)}%
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>vs season avg {sAvg.toFixed(1)}</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>No history</div>
                )}

                {/* Mini sparkline */}
                {allWeeks.length > 1 && (() => {
                  const sparkVals = allWeeks.slice(-6).map(w => w.avgValues[key] ?? 0);
                  const sMax = Math.max(...sparkVals, 1);
                  const sMin = Math.min(...sparkVals.filter(v => v > 0), sMax);
                  const sRange = sMax - sMin || 1;
                  const sw = 80; const sh = 24;
                  const sPoints = sparkVals.map((v, i) => ({
                    x: (i / Math.max(sparkVals.length - 1, 1)) * sw,
                    y: v > 0 ? sh - ((v - sMin) / sRange) * (sh - 4) - 2 : sh,
                  }));
                  const spD = sPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
                  return (
                    <svg width={sw} height={sh} style={{ marginTop: 8, display: 'block' }}>
                      <path d={spD} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity="0.6" />
                    </svg>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* ── Week Range Selector ────────────────────────── */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>Date Range</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>From</span>
              <select value={fromWeek} onChange={e => setFromWeek(e.target.value)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12 }}>
                {availableWeeks.map(w => <option key={w.ws} value={w.ws}>{w.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>To</span>
              <select value={toWeek} onChange={e => setToWeek(e.target.value)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12 }}>
                {availableWeeks.map(w => <option key={w.ws} value={w.ws}>{w.label}</option>)}
              </select>
            </div>
            <button onClick={() => {
              if (allWeeks.length > 0) {
                setFromWeek(allWeeks[Math.max(0, allWeeks.length - 8)].ws);
                setToWeek(allWeeks[allWeeks.length - 1].ws);
              }
            }} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
              Reset
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{filteredWeeks.length} week{filteredWeeks.length !== 1 ? 's' : ''} shown</div>
        </div>

        {/* ── Chart ─────────────────────────────────────── */}
        <div style={{ background: 'var(--card)', border: `1px solid ${kpiColor}33`, borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: kpiColor }}>{cfg.label} — Weekly Team Avg</div>
              {latestWeek && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  Latest: <span style={{ color: kpiColor, fontWeight: 700 }}>{(latestWeek.avgValues[selectedMetric] ?? 0).toFixed(1)} {cfg.unit}</span>
                  {prevWeek && prevWeek.avgValues[selectedMetric] && (() => {
                    const chg = ((( latestWeek.avgValues[selectedMetric] ?? 0) - (prevWeek.avgValues[selectedMetric] ?? 0)) / (prevWeek.avgValues[selectedMetric] ?? 1)) * 100;
                    return <span style={{ marginLeft: 8, color: chg >= 0 ? '#06d6a0' : '#ff8c42', fontWeight: 700 }}>{chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(1)}% vs prev week</span>;
                  })()}
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
              {chartVals.length > 0 && `${chartMin.toFixed(1)} – ${chartMax.toFixed(1)} ${cfg.unit}`}
            </div>
          </div>

          {chartData.length < 2 ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Not enough data in selected range</div>
          ) : (
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
              <defs>
                <linearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={kpiColor} stopOpacity="0.2" />
                  <stop offset="100%" stopColor={kpiColor} stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {/* Baseline */}
              <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border)" strokeWidth="1" />
              {/* Season avg reference line */}
              {(() => {
                const sAvg = seasonAvg(selectedMetric);
                if (sAvg <= 0 || chartVals.length === 0) return null;
                const y = H - PAD - ((sAvg - chartMin) / chartRange) * (H - PAD * 2);
                if (y < PAD || y > H - PAD) return null;
                return (
                  <g>
                    <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="var(--muted)" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
                    <text x={W - PAD + 4} y={y + 4} fontSize="8" fill="var(--muted)" fontFamily="monospace">avg</text>
                  </g>
                );
              })()}
              {/* Area */}
              {areaD && <path d={areaD} fill="url(#trendAreaGrad)" />}
              {/* Line */}
              {pathD && <path d={pathD} fill="none" stroke={kpiColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
              {/* Dots + labels */}
              {points.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r="4" fill={kpiColor} stroke="var(--card)" strokeWidth="2" />
                  {p.val > 0 && (
                    <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="9" fill={kpiColor} fontFamily="monospace" fontWeight="700">
                      {p.val.toFixed(0)}
                    </text>
                  )}
                  <text x={p.x} y={H + 4} textAnchor="middle" fontSize="8" fill="var(--muted)" fontFamily="monospace">
                    {p.w.label.split('–')[0].trim()}
                  </text>
                  <text x={p.x} y={H + 13} textAnchor="middle" fontSize="7" fill="var(--dim)" fontFamily="monospace">
                    {p.w.sessionCount}s
                  </text>
                </g>
              ))}
            </svg>
          )}

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 24, height: 2, background: kpiColor, borderRadius: 1 }} />
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>Team Avg</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 24, height: 1, background: 'var(--muted)', borderRadius: 1, opacity: 0.5 }} />
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>Season Avg</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Trends() {
  return <Suspense fallback={<div style={{ background: 'var(--bg)', minHeight: '100vh' }} />}><TrendsContent /></Suspense>;
}
