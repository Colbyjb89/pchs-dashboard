'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Ava from '@/components/Ava';
import { METRIC_CONFIG, MetricKey } from '@/lib/types';
import { ALL_SLUGS, rowToMetrics, normalizeAthlete, normalizeActivity, parseActivityDate, weekStart } from '@/lib/data';
import InjuryFlag from '@/components/InjuryFlag';

// Table columns shown in the all-players table
const TABLE_COLS: { key: MetricKey; label: string; unit: string; decimals: number }[] = [
  { key: 'playerLoad',          label: 'PL (AU)',        unit: 'AU',   decimals: 1 },
  { key: 'totalDistance',       label: 'Distance (yds)', unit: 'yds',  decimals: 0 },
  { key: 'maxVelocity',         label: 'Top Spd (mph)',  unit: 'mph',  decimals: 1 },
  { key: 'explosiveEfforts',    label: 'Explosive (N-s)',unit: '',     decimals: 0 },
  { key: 'maxAccel',            label: 'Pk Accel',       unit: 'm/s²', decimals: 1 },
  { key: 'maxDecel',            label: 'Pk Decel',       unit: 'm/s²', decimals: 1 },
  { key: 'truckStick',          label: 'Truck Stick',    unit: 'N-s',  decimals: 0 },
  { key: 'playerLoadPerMin',    label: 'PL/Min',         unit: '',     decimals: 2 },
  { key: 'velocityBand4Distance',label: 'HSY (VB4)',     unit: 'yds',  decimals: 0 },
];

// Position group cards — short labels + colors matching MHS
const GROUP_CARDS: { group: string; positions: string[]; color: string }[] = [
  { group: 'O Skill',     positions: ['QB', 'WR', 'RB', 'HB', 'FB', 'TE', 'SB'],                              color: '#06d6a0' },
  { group: 'D Skill',     positions: ['S', 'SS', 'FS', 'SAF'],                                                  color: '#4da6ff' },
  { group: 'Corners',     positions: ['CB', 'DB', 'NICKEL', 'DIME', 'DCB'],                                     color: '#b388ff' },
  { group: 'Linebackers', positions: ['LB', 'OLB', 'ILB', 'MLB', 'WILL', 'MIKE', 'SAM'],                       color: '#ff6d00' },
  { group: 'O Line',      positions: ['OL', 'C', 'OG', 'OT', 'LT', 'RT', 'LG', 'RG'],                         color: '#ff8c42' },
  { group: 'D Line',      positions: ['DL', 'DE', 'DT', 'NT', 'NG'],                                            color: '#ff3b3b' },
  { group: 'Kicker',      positions: ['K', 'P', 'LS', 'KR', 'PR'],                                              color: '#90a4ae' },
];

function getPositionCard(pos: string): { group: string; color: string } {
  const p = pos.toUpperCase();
  for (const g of GROUP_CARDS) {
    if (g.positions.includes(p)) return { group: g.group, color: g.color };
  }
  return { group: pos || '—', color: 'var(--muted)' };
}

// Intensity color by rank within column
function intensityColor(val: number, allVals: number[]): string {
  if (val <= 0 || allVals.length === 0) return 'var(--text)';
  const max = Math.max(...allVals.filter(v => v > 0));
  if (max <= 0) return 'var(--text)';
  const pct = (val / max) * 100;
  if (pct >= 90) return '#ff3b3b';
  if (pct >= 75) return '#ff8c42';
  if (pct >= 60) return '#ffd166';
  if (pct >= 40) return '#06d6a0';
  return '#4da6ff';
}

interface AthleteRow {
  id: string; name: string; position: string; posGroup: string; posColor: string;
  metrics: Partial<Record<MetricKey, number>>;
  maxSessionIds: Partial<Record<MetricKey, string>>;
}

type ViewMode = 'alltime' | 'range' | 'day';


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

export default function ByPosition() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [athletes, setAthletes] = useState<AthleteRow[]>([]);
  const [primaryMetric, setPrimaryMetric] = useState<MetricKey>('playerLoad');
  const [sortCol, setSortCol] = useState<MetricKey>('playerLoad');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [sessionOptions, setSessionOptions] = useState<{ id: string; name: string; date: string }[]>([]);
  const [weekOptions, setWeekOptions] = useState<{ ws: string; label: string }[]>([]);
  const [selectedDay, setSelectedDay] = useState('');
  const [fromWeek, setFromWeek] = useState('');
  const [toWeek, setToWeek] = useState('');
  const [loading, setLoading] = useState(true);
  const [avaOpen, setAvaOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [athRes, actRes] = await Promise.all([fetch('/api/athletes'), fetch('/api/activities')]);
      const athResult = await athRes.json();
      const actResult = await actRes.json();
      if (!athResult.success || !actResult.success) return;

      const athList = (Array.isArray(athResult.data) ? athResult.data : []).map((a: Record<string, unknown>) => normalizeAthlete(a));
      const athleteMap: Record<string, { position: string }> = {};
      athList.forEach((a: { id: string; position: string }) => { athleteMap[a.id] = { position: a.position }; });

      const allActivities = (actResult.data as Record<string, unknown>[]).map(normalizeActivity);
      allActivities.sort((a, b) => b.startTime - a.startTime);

      // Build session + week options on first load
      setSessionOptions(allActivities.map(a => ({ id: a.id, name: a.name, date: a.date })));
      if (!selectedDay && allActivities[0]) setSelectedDay(allActivities[0].id);

      const weekMap: Record<string, string> = {};
      allActivities.forEach(act => {
        const d = parseActivityDate(act.date);
        const ws = weekStart(d);
        if (!weekMap[ws]) {
          const start = new Date(ws + 'T12:00:00');
          const end = new Date(start); end.setDate(end.getDate() + 6);
          const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          weekMap[ws] = `${fmt(start)} – ${fmt(end)}`;
        }
      });
      const weeks = Object.entries(weekMap).sort(([a], [b]) => b.localeCompare(a)).map(([ws, label]) => ({ ws, label }));
      setWeekOptions(weeks);
      if (!fromWeek && weeks[0]) { setFromWeek(weeks[weeks.length - 1]?.ws ?? ''); setToWeek(weeks[0].ws); }

      // Filter activities by mode
      let activities = allActivities.slice(0, 30);
      if (viewMode === 'day') {
        activities = allActivities.filter(a => a.id === selectedDay);
      } else if (viewMode === 'range' && fromWeek && toWeek) {
        activities = allActivities.filter(a => {
          const ws = weekStart(parseActivityDate(a.date));
          return ws >= fromWeek && ws <= toWeek;
        });
      }

      // Build maxes per athlete across filtered activities
      const athMaxes: Record<string, Partial<Record<MetricKey, number>>> = {};
      const athMaxSessions: Record<string, Partial<Record<MetricKey, string>>> = {};
      await Promise.all(activities.map(act =>
        fetch('/api/stats', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parameters: ALL_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [act.id] }], group_by: ['athlete'] }),
        }).then(r => r.json()).then(result => {
          (Array.isArray(result.data) ? result.data : []).forEach((row: Record<string, unknown>) => {
            const id = String(row.athlete_id ?? '');
            const metrics = rowToMetrics(row);
            if (!athMaxes[id]) athMaxes[id] = {};
            if (!athMaxSessions[id]) athMaxSessions[id] = {};
            Object.entries(metrics).forEach(([k, v]) => {
              const key = k as MetricKey;
              if (v != null && v > (athMaxes[id][key] ?? 0)) {
                athMaxes[id][key] = v;
                athMaxSessions[id][key] = act.id;
              }
            });
          });
        }).catch(() => {})
      ));

      const rows: AthleteRow[] = athList.map((a: { id: string; name: string; position: string }) => {
        const { group, color } = getPositionCard(a.position);
        return { id: a.id, name: a.name, position: a.position, posGroup: group, posColor: color, metrics: athMaxes[a.id] ?? {}, maxSessionIds: athMaxSessions[a.id] ?? {} };
      }).filter((a: AthleteRow) => Object.keys(a.metrics).length > 0);

      setAthletes(rows);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setIsRefreshing(false); }
  }, [viewMode, selectedDay, fromWeek, toWeek]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSort = (key: MetricKey) => {
    if (sortCol === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(key); setSortDir('desc'); }
  };

  // Group cards — compute group max for primary metric
  const groupCardData = GROUP_CARDS.map(gc => {
    const members = athletes.filter(a => a.posGroup === gc.group);
    const vals = members.map(a => a.metrics[primaryMetric] ?? 0).filter(v => v > 0);
    const groupMax = vals.length > 0 ? Math.max(...vals) : 0;
    return { ...gc, count: members.length, groupMax };
  }).filter(g => g.count > 0);

  // All-time column vals for intensity coloring
  const colVals: Record<string, number[]> = {};
  TABLE_COLS.forEach(c => {
    colVals[c.key] = athletes.map(a => a.metrics[c.key] ?? 0).filter(v => v > 0);
  });

  // Group athletes, sort within group
  const posGroupOrder = GROUP_CARDS.map(g => g.group);
  const grouped: Record<string, AthleteRow[]> = {};
  athletes.forEach(a => {
    if (!grouped[a.posGroup]) grouped[a.posGroup] = [];
    grouped[a.posGroup].push(a);
  });
  posGroupOrder.forEach(g => {
    if (grouped[g]) {
      grouped[g].sort((a, b) => {
        const av = a.metrics[sortCol] ?? 0;
        const bv = b.metrics[sortCol] ?? 0;
        return sortDir === 'desc' ? bv - av : av - bv;
      });
    }
  });

  // Primary metric always first column, rest follow
  const displayCols = [
    TABLE_COLS.find(c => c.key === primaryMetric)!,
    ...TABLE_COLS.filter(c => c.key !== primaryMetric),
  ].filter(Boolean);

  const thStyle: React.CSSProperties = {
    padding: '9px 12px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10,
    letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    textAlign: 'right', borderBottom: '1px solid var(--border)', background: 'var(--surface)',
    cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, zIndex: 3,
  };

  const selectStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)',
    fontWeight: 700, fontSize: 13, width: '100%',
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
      <Navigation onAvaOpen={() => setAvaOpen(true)} onRefresh={loadData} isRefreshing={isRefreshing} />
      <Ava isOpen={avaOpen} onClose={() => setAvaOpen(false)} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '16px 12px' : '20px 16px', boxSizing: 'border-box', width: '100%' }}>

        {/* Controls */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: isMobile ? '12px 14px' : '14px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: isMobile ? 20 : 26, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1 }}>By Position</h1>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{athletes.length} athletes</div>
          </div>

          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Primary Metric</div>
                <select value={primaryMetric} onChange={e => { setPrimaryMetric(e.target.value as MetricKey); setSortCol(e.target.value as MetricKey); }} style={selectStyle}>
                  {TABLE_COLS.map(c => <option key={c.key} value={c.key}>{METRIC_CONFIG[c.key].label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>View</div>
                <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  {([['alltime', 'All Time'], ['range', 'Range'], ['day', 'Single Day']] as [ViewMode, string][]).map(([m, label]) => (
                    <button key={m} onClick={() => setViewMode(m)} style={{ flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', background: viewMode === m ? 'var(--accent)' : 'transparent', color: viewMode === m ? 'white' : 'var(--muted)' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {viewMode === 'day' && (
                <div>
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 4 }}>Select a Session ↓</div>
                  <select value={selectedDay} onChange={e => setSelectedDay(e.target.value)} style={{ ...selectStyle, border: '1px solid var(--accent)' }}>
                    {sessionOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              {viewMode === 'range' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>From</div>
                    <select value={fromWeek} onChange={e => setFromWeek(e.target.value)} style={selectStyle}>{weekOptions.map(w => <option key={w.ws} value={w.ws}>{w.label}</option>)}</select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>To</div>
                    <select value={toWeek} onChange={e => setToWeek(e.target.value)} style={selectStyle}>{weekOptions.map(w => <option key={w.ws} value={w.ws}>{w.label}</option>)}</select>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ minWidth: 200 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Primary Metric</div>
                <select value={primaryMetric} onChange={e => { setPrimaryMetric(e.target.value as MetricKey); setSortCol(e.target.value as MetricKey); }} style={selectStyle}>
                  {TABLE_COLS.map(c => <option key={c.key} value={c.key}>{METRIC_CONFIG[c.key].label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>View</div>
                <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  {([['alltime', 'All Time'], ['range', 'Date Range'], ['day', 'Single Day']] as [ViewMode, string][]).map(([m, label]) => (
                    <button key={m} onClick={() => setViewMode(m)} style={{ padding: '7px 14px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', background: viewMode === m ? 'var(--accent)' : 'transparent', color: viewMode === m ? 'white' : 'var(--muted)' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {viewMode === 'day' && (
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Session</div>
                  <select value={selectedDay} onChange={e => setSelectedDay(e.target.value)} style={selectStyle}>
                    {sessionOptions.map(s => <option key={s.id} value={s.id}>{s.name} · {s.date}</option>)}
                  </select>
                </div>
              )}
              {viewMode === 'range' && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>From</div>
                    <select value={fromWeek} onChange={e => setFromWeek(e.target.value)} style={{ ...selectStyle, width: 'auto' }}>{weekOptions.map(w => <option key={w.ws} value={w.ws}>{w.label}</option>)}</select>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>To</div>
                    <select value={toWeek} onChange={e => setToWeek(e.target.value)} style={{ ...selectStyle, width: 'auto' }}>{weekOptions.map(w => <option key={w.ws} value={w.ws}>{w.label}</option>)}</select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Position group summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
          {groupCardData.map(gc => {
            const cfg = METRIC_CONFIG[primaryMetric];
            return (
              <div key={gc.group} style={{ background: 'var(--card)', border: `1px solid ${gc.color}33`, borderRadius: 12, padding: '12px 14px', borderLeft: `4px solid ${gc.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 14, color: gc.color }}>{gc.group}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>{gc.count}</div>
                </div>
                <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>Group Max</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, color: gc.color, lineHeight: 1 }}>
                  {gc.groupMax > 0 ? gc.groupMax.toFixed(1) : '—'}
                  <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 3, fontWeight: 600 }}>{cfg.unit}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile: approved row list per group */}
        {isMobile ? (
          <div style={{ minWidth: 0, width: '100%' }}>
            {posGroupOrder.filter(g => grouped[g]?.length > 0).map(group => {
              const gc = GROUP_CARDS.find(x => x.group === group);
              const color = gc?.color ?? 'var(--muted)';
              const members = grouped[group];
              const primaryCfg = TABLE_COLS.find(c => c.key === primaryMetric)!;
              const allVals = members.map(a => a.metrics[primaryMetric] ?? 0).filter(v => v > 0);
              const leaderVal = allVals.length > 0 ? Math.max(...allVals) : 0;
              return (
                <div key={group} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{ padding: '10px 14px', background: `${color}18`, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 13, color }}>{group}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{members.length} · <span style={{ color, fontWeight: 700 }}>{leaderVal > 0 ? leaderVal.toFixed(primaryCfg.decimals) : '—'} {primaryCfg.unit}</span></div>
                  </div>
                  {members.map((a, i) => {
                    const val = a.metrics[primaryMetric] ?? 0;
                    const valColor = intensityColor(val, allVals);
                    const pct = leaderVal > 0 && val > 0 ? Math.round((val / leaderVal) * 100) : 0;
                    const behindPct = i > 0 && leaderVal > 0 && val > 0 ? Math.round(((leaderVal - val) / leaderVal) * 100) : 0;
                    return (
                      <div key={a.id} style={{ position: 'relative', padding: '10px 14px 10px 16px', borderBottom: i < members.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', cursor: 'pointer' }}
                        onClick={() => router.push(`/player?id=${a.id}`)}>
                        <div style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, background: color, borderRadius: '0 3px 3px 0', opacity: 0.6 }} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                              <InjuryFlag athleteId={a.id} athleteName={a.name} />
                              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                              <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>({a.position})</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                              <span style={{ fontSize: 11, color: valColor, fontWeight: 700 }}>{i === 0 ? 'Leader' : `${behindPct}% behind`}</span>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>· {pct}% of top</span>
                            </div>
                            <div style={{ height: 3, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: valColor, borderRadius: 2, transition: 'width 0.4s' }} />
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color: valColor, letterSpacing: '-0.02em', lineHeight: 1 }}>
                              {val > 0 ? val.toFixed(primaryCfg.decimals) : '—'}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{primaryCfg.unit}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop: sticky table */
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13 }}>All Players by Position</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Click player → Drill-Down</div>
            </div>
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '75vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 800 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'left', width: 48, left: 0, zIndex: 5 }}>Pos</th>
                    <th style={{ ...thStyle, textAlign: 'left', position: 'sticky', left: 48, zIndex: 5, minWidth: 160 }}>Player</th>
                    {displayCols.map(c => (
                      <th key={c.key} onClick={() => handleSort(c.key)} style={{ ...thStyle, color: sortCol === c.key ? 'var(--accent)' : 'var(--muted)' }}>
                        {c.label} {sortCol === c.key ? (sortDir === 'desc' ? '▼' : '▲') : '↕'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {posGroupOrder.filter(g => grouped[g]?.length > 0).map(group => {
                    const gc = GROUP_CARDS.find(x => x.group === group);
                    const color = gc?.color ?? 'var(--muted)';
                    const members = grouped[group];
                    const groupMaxRow: Partial<Record<MetricKey, number>> = {};
                    displayCols.forEach(c => {
                      const vals = members.map(a => a.metrics[c.key] ?? 0).filter(v => v > 0);
                      groupMaxRow[c.key] = vals.length > 0 ? Math.max(...vals) : 0;
                    });
                    return (
                      <>
                        <tr key={`${group}-header`} style={{ background: `${color}12`, borderLeft: `3px solid ${color}` }}>
                          <td style={{ padding: '8px 12px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, color, borderBottom: '1px solid var(--border)', position: 'sticky', left: 0, background: `${color}18`, zIndex: 2 }}>{group}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, color, borderBottom: '1px solid var(--border)', position: 'sticky', left: 48, background: `${color}18`, zIndex: 2 }}>{group} ({members.length})</td>
                          {displayCols.map(c => {
                            const val = groupMaxRow[c.key] ?? 0;
                            return <td key={c.key} style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{val > 0 ? val.toFixed(c.decimals) : '—'}</td>;
                          })}
                        </tr>
                        {members.map((a, i) => (
                          <tr key={a.id}
                            style={{ borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${color}`, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.05)')}
                            onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}>
                            <td style={{ padding: '8px 12px', position: 'sticky', left: 0, background: '#0f1923', zIndex: 1 }}>
                              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, color }}>{a.posGroup}</span>
                            </td>
                            <td style={{ padding: '8px 12px', position: 'sticky', left: 48, background: '#0f1923', zIndex: 1, whiteSpace: 'nowrap', boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <button onClick={() => router.push(`/player?id=${a.id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontWeight: 600, fontSize: 12, padding: 0, textAlign: 'left', fontFamily: 'inherit' }}>
                                  {a.name} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({a.position})</span>
                                </button>
                                <InjuryFlag athleteId={a.id} athleteName={a.name} />
                              </div>
                            </td>
                            {displayCols.map(c => {
                              const val = a.metrics[c.key] ?? 0;
                              const cellColor = intensityColor(val, colVals[c.key] ?? []);
                              const sessionId = a.maxSessionIds[c.key] ?? '';
                              return (
                                <td key={c.key}
                                  onClick={() => router.push(`/player?id=${a.id}${sessionId ? `&session=${sessionId}` : ''}`)}
                                  style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: val > 0 ? cellColor : 'var(--dim)', fontWeight: sortCol === c.key ? 700 : 400, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                                  {val > 0 ? val.toFixed(c.decimals) : '—'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
