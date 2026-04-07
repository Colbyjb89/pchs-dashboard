'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Ava from '@/components/Ava';
import { MetricKey } from '@/lib/types';
import { ALL_SLUGS, rowToMetrics, normalizeAthlete, normalizeActivity, NormalizedActivity } from '@/lib/data';
import InjuryFlag from '@/components/InjuryFlag';
import { getInjuryHistory, fuzzyMatchName, isSessionInInjuryWindow, STATUS_COLORS as INJ_COLORS } from '@/lib/injuries';

// ─── Color coding by % of personal best (same as player drill-down) ───────────
function getIntensityColor(val: number, personalMax: number): { color: string; label: string } {
  if (personalMax <= 0 || val <= 0) return { color: 'var(--text)', label: '—' };
  const pct = (val / personalMax) * 100;
  if (pct >= 90) return { color: '#ff3b3b', label: '~Max' };
  if (pct >= 75) return { color: '#ff8c42', label: 'High' };
  if (pct >= 60) return { color: '#ffd166', label: 'Mod-High' };
  if (pct >= 40) return { color: '#06d6a0', label: 'Moderate' };
  return               { color: '#4da6ff', label: 'Low' };
}

// ─── Position color coding (matches By Position page) ────────────────────────
const POS_GROUPS: { group: string; positions: string[]; color: string }[] = [
  { group: 'QB',  positions: ['QB'],                                          color: '#ffd166' },
  { group: 'RB',  positions: ['RB', 'HB', 'FB'],                             color: '#06d6a0' },
  { group: 'WR',  positions: ['WR', 'SB'],                                   color: '#4da6ff' },
  { group: 'TE',  positions: ['TE'],                                         color: '#b388ff' },
  { group: 'OL',  positions: ['OL','C','OG','OT','LT','RT','LG','RG'],       color: '#ff8c42' },
  { group: 'DL',  positions: ['DL','DE','DT','NT','NG'],                     color: '#ff3b3b' },
  { group: 'LB',  positions: ['LB','OLB','ILB','MLB','WILL','MIKE','SAM'],   color: '#ff6d00' },
  { group: 'DB',  positions: ['DB','CB','S','SS','FS','SAF'],                color: '#e040fb' },
  { group: 'K/P', positions: ['K','P','LS','KR','PR'],                       color: '#90a4ae' },
];

const GROUP_NAME_COLOR: Record<string, string> = {
  'O Skill':     '#06d6a0',
  'D Skill':     '#4da6ff',
  'Corners':     '#b388ff',
  'Linebackers': '#ff6d00',
  'O Line':      '#ff8c42',
  'D Line':      '#ff3b3b',
  'Kicker':      '#90a4ae',
  'Other':       'var(--muted)',
};

function getPosColor(pos: string): string {
  const p = pos.toUpperCase();
  for (const g of POS_GROUPS) {
    if (g.positions.includes(p)) return g.color;
  }
  return 'var(--muted)';
}
const OVERVIEW_KPIS: { key: MetricKey; label: string; unit: string; color: string }[] = [
  { key: 'playerLoad',       label: 'Player Load',   unit: 'AU',    color: '#1a6bff' },
  { key: 'playerLoadPerMin', label: 'PL / Min',      unit: 'AU/min',color: '#00e676' },
  { key: 'truckStick',       label: 'Truck Stick',   unit: 'N-s',   color: '#ff6d00' },
  { key: 'maxVelocity',      label: 'Max Velocity',  unit: 'mph',   color: '#7c4dff' },
  { key: 'totalDistance',    label: 'Distance',       unit: 'yds',   color: '#00bcd4' },
  { key: 'maxAccel',         label: 'Max Accel',     unit: 'm/s²',  color: '#ff1744' },
];

// Table columns
const COLUMNS: { key: MetricKey; label: string; unit: string; decimals: number }[] = [
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

// Custom position order and mapping
const POSITION_ORDER = ['O Skill', 'D Skill', 'Corners', 'Linebackers', 'O Line', 'D Line', 'Kicker', 'Other'];

const POSITION_GROUP_COLOR: Record<string, string> = {
  'O Skill':     '#06d6a0',  // green
  'D Skill':     '#4da6ff',  // blue
  'Corners':     '#b388ff',  // light purple
  'Linebackers': '#ff6d00',  // orange
  'O Line':      '#ff8c42',  // light orange
  'D Line':      '#ff3b3b',  // red
  'Kicker':      '#90a4ae',  // grey
  'Other':       'var(--muted)',
};

function getCustomGroup(position: string): string {
  const p = position.toUpperCase().trim();
  // O Skill: QB, WR, RB, HB, FB, TE, SB
  if (['QB', 'WR', 'RB', 'HB', 'FB', 'TE', 'SB'].includes(p)) return 'O Skill';
  // D Skill: CB, DB, S, SS, FS, SAF
  if (['CB', 'DB'].includes(p)) return 'Corners';
  // Safety → D Skill
  if (['S', 'SS', 'FS', 'SAF'].includes(p)) return 'D Skill';
  // D Skill catch-all — DE, DT, NT, NG go to D Line
  // LB
  if (['LB', 'OLB', 'ILB', 'MLB', 'WILL', 'MIKE', 'SAM'].includes(p)) return 'Linebackers';
  // O Line
  if (['OL', 'C', 'OG', 'OT', 'LT', 'RT', 'LG', 'RG'].includes(p)) return 'O Line';
  // D Line
  if (['DL', 'DE', 'DT', 'NT', 'NG'].includes(p)) return 'D Line';
  // D Skill — any defensive back not already caught
  if (['DCB', 'NICKEL', 'DIME'].includes(p)) return 'Corners';
  // Kicker
  if (['K', 'P', 'LS', 'KR', 'PR'].includes(p)) return 'Kicker';
  return 'Other';
}

interface AthleteRow {
  id: string; name: string; position: string; positionGroup: string;
  metrics: Partial<Record<MetricKey, number>>;
}

// Compute session team avg for a set of rows + metric
function teamAvg(rows: AthleteRow[], key: MetricKey): number {
  const vals = rows.map(r => r.metrics[key] ?? 0).filter(v => v > 0);
  return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}

const KPI_DESCRIPTIONS: Record<string, string> = {
  playerLoad: 'Team average Player Load for this session. Player Load is a composite measure of mechanical stress based on accelerometer data.',
  playerLoadPerMin: 'Team average Player Load per minute — normalizes load by session duration, useful for comparing sessions of different lengths.',
  truckStick: 'Team average Truck Stick — measures peak impact force during contact events.',
  maxVelocity: 'Team average of each athlete\'s top speed reached during this session.',
  totalDistance: 'Team average total distance covered by each athlete during this session.',
  maxAccel: 'Team average of each athlete\'s peak acceleration reached during this session.',
};

// KPI comparison card
function SessionKPICard({ metricKey, label, unit, color, sessionAvg, histAvg }: {
  metricKey: MetricKey; label: string; unit: string; color: string;
  sessionAvg: number; histAvg: number;
}) {
  const [showTip, setShowTip] = useState(false);
  const changePct = histAvg > 0 && sessionAvg > 0 ? ((sessionAvg - histAvg) / histAvg) * 100 : 0;
  const up = changePct >= 0;
  const noHistory = histAvg <= 0;

  let intensityColor = color;
  if (!noHistory && sessionAvg > 0) {
    if (changePct >= 15)       intensityColor = '#ff3b3b';
    else if (changePct >= 5)   intensityColor = '#ff8c42';
    else if (changePct >= -5)  intensityColor = '#06d6a0';
    else if (changePct >= -15) intensityColor = '#ffd166';
    else                       intensityColor = '#4da6ff';
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', borderTop: `2px solid ${color}`, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</div>
        <button onClick={() => setShowTip(v => !v)} onBlur={() => setShowTip(false)}
          style={{ width: 14, height: 14, borderRadius: '50%', background: showTip ? 'var(--accent)' : 'var(--surface)', border: `1px solid ${showTip ? 'var(--accent)' : 'var(--border)'}`, color: showTip ? 'white' : 'var(--muted)', fontSize: 8, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>?</button>
      </div>
      {showTip && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 20, background: '#0f1926', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, width: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', pointerEvents: 'none' }}>
          <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4, fontSize: 11 }}>Team Avg — {label}</strong>
          {KPI_DESCRIPTIONS[metricKey] || 'Team average for this metric across all athletes in the session.'}
        </div>
      )}
      {/* Session avg */}
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26, color: intensityColor, lineHeight: 1, marginBottom: 4 }}>
        {sessionAvg > 0 ? sessionAvg.toFixed(1) : '—'}
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginLeft: 3 }}>{unit}</span>
      </div>
      <div style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 3 }}>Team Average</div>
      {!noHistory && sessionAvg > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: up ? '#06d6a0' : '#ff8c42' }}>
            {up ? '▲' : '▼'} {Math.abs(changePct).toFixed(1)}%
          </span>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>vs season avg {histAvg.toFixed(1)}</span>
        </div>
      ) : (
        <div style={{ fontSize: 10, color: 'var(--muted)' }}>No history yet</div>
      )}
    </div>
  );
}

function SessionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activities, setActivities] = useState<NormalizedActivity[]>([]);
  const [selectedId, setSelectedId] = useState<string>(searchParams.get('session') || '');
  const [athleteRows, setAthleteRows] = useState<AthleteRow[]>([]);
  const [athleteMap, setAthleteMap] = useState<Record<string, { position: string; positionGroup: string }>>({});
  // Per-athlete all-time personal bests (for intensity color coding)
  const [personalBests, setPersonalBests] = useState<Record<string, Partial<Record<MetricKey, number>>>>({});
  // Historical session team avgs (excluding current session)
  const [historicalAvgs, setHistoricalAvgs] = useState<Partial<Record<MetricKey, number>>>({});
  const [sortCol, setSortCol] = useState<MetricKey>('playerLoad');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [sessionHasMax, setSessionHasMax] = useState<Record<string, boolean>>({});
  const [avaOpen, setAvaOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadBase = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [actRes, athRes] = await Promise.all([fetch('/api/activities'), fetch('/api/athletes')]);
      const actResult = await actRes.json();
      const athResult = await athRes.json();

      let acts: NormalizedActivity[] = [];
      if (actResult.success) {
        acts = (actResult.data as Record<string, unknown>[]).map(normalizeActivity);
        acts.sort((a, b) => b.startTime - a.startTime);
        setActivities(acts);
        if (!selectedId && acts[0]) setSelectedId(acts[0].id);
      }

      if (athResult.success) {
        const raw = Array.isArray(athResult.data) ? athResult.data : [];
        const map: Record<string, { position: string; positionGroup: string }> = {};
        raw.forEach((a: Record<string, unknown>) => {
          const n = normalizeAthlete(a);
          map[n.id] = { position: n.position, positionGroup: n.positionGroup };
        });
        setAthleteMap(map);
      }

      // Fetch stats for recent sessions to build personal bests + historical avgs
      if (acts.length > 1) {
        const recentActs = acts.slice(0, 20);
        const allSessionStats = await Promise.all(
          recentActs.map(act =>
            fetch('/api/stats', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ parameters: ALL_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [act.id] }], group_by: ['athlete'] }),
            }).then(r => r.json())
              .then(r => ({ actId: act.id, rows: Array.isArray(r.data) ? r.data : [] }))
              .catch(() => ({ actId: act.id, rows: [] }))
          )
        );

        // Build personal bests per athlete + track which session set each PB
        const pbs: Record<string, Partial<Record<MetricKey, number>>> = {};
        const pbSessions: Record<string, Partial<Record<MetricKey, string>>> = {}; // athleteId → metricKey → actId
        const histSums: Partial<Record<MetricKey, number[]>> = {};

        // Metrics to exclude from new-max detection — these are profile/cumulative fields not session performance
        const EXCLUDE_FROM_MAX = new Set<MetricKey>(['profileMaxVelocity', 'maxVelocityPct']);

        // First pass: build all-time PBs
        allSessionStats.forEach(({ actId, rows }) => {
          rows.forEach((row: Record<string, unknown>) => {
            const id = String(row.athlete_id ?? '');
            const metrics = rowToMetrics(row);
            if (!pbs[id]) pbs[id] = {};
            if (!pbSessions[id]) pbSessions[id] = {};
            Object.entries(metrics).forEach(([k, v]) => {
              const key = k as MetricKey;
              if (EXCLUDE_FROM_MAX.has(key)) return; // skip profile-level fields
              if (v != null && v > (pbs[id][key] ?? 0)) {
                pbs[id][key] = v;
                pbSessions[id][key] = actId;
              }
            });
          });
        });

        // Build sessionHasMax: true if any athlete set a PB in that session
        const hasMax: Record<string, boolean> = {};
        Object.values(pbSessions).forEach(metricMap => {
          Object.values(metricMap).forEach(actId => {
            if (actId) hasMax[actId] = true;
          });
        });
        setSessionHasMax(hasMax);

        // Build historical team avgs
        allSessionStats.forEach(({ rows }) => {
          const sessionVals: Partial<Record<MetricKey, number[]>> = {};
          rows.forEach((row: Record<string, unknown>) => {
            const metrics = rowToMetrics(row);
            Object.entries(metrics).forEach(([k, v]) => {
              const key = k as MetricKey;
              if (!sessionVals[key]) sessionVals[key] = [];
              if (v != null && v > 0) sessionVals[key]!.push(v);
            });
          });
          Object.entries(sessionVals).forEach(([k, vals]) => {
            const key = k as MetricKey;
            if (!histSums[key]) histSums[key] = [];
            if (vals && vals.length > 0) {
              const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
              histSums[key]!.push(avg);
            }
          });
        });

        setPersonalBests(pbs);

        // Overall historical avg = avg of all session team avgs
        const hAvgs: Partial<Record<MetricKey, number>> = {};
        Object.entries(histSums).forEach(([k, vals]) => {
          const key = k as MetricKey;
          if (vals && vals.length > 0) hAvgs[key] = vals.reduce((s, v) => s + v, 0) / vals.length;
        });
        setHistoricalAvgs(hAvgs);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setIsRefreshing(false); }
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  useEffect(() => {
    if (!selectedId) return;
    setStatsLoading(true);
    setAthleteRows([]);
    fetch('/api/stats', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: ALL_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [selectedId] }], group_by: ['athlete'] }),
    }).then(r => r.json()).then(result => {
      const rows: AthleteRow[] = (Array.isArray(result.data) ? result.data : []).map((row: Record<string, unknown>) => {
        const id = String(row.athlete_id ?? '');
        const info = athleteMap[id] || { position: '', positionGroup: '' };
        return { id, name: String(row.athlete_name ?? 'Unknown'), position: info.position, positionGroup: info.positionGroup, metrics: rowToMetrics(row) };
      });
      setAthleteRows(rows);
    }).catch(console.error).finally(() => setStatsLoading(false));
  }, [selectedId, athleteMap]);

  const selectedActivity = activities.find(a => a.id === selectedId);

  // Group by position
  const grouped: Record<string, AthleteRow[]> = {};
  athleteRows.forEach(r => {
    const g = getCustomGroup(r.position) || 'Other';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(r);
  });
  POSITION_ORDER.forEach(g => {
    if (grouped[g]) {
      grouped[g].sort((a, b) => {
        const av = a.metrics[sortCol] ?? 0;
        const bv = b.metrics[sortCol] ?? 0;
        return sortDir === 'desc' ? bv - av : av - bv;
      });
    }
  });

  // Current session team avgs
  const sessionAvgs: Partial<Record<MetricKey, number>> = {};
  OVERVIEW_KPIS.forEach(({ key }) => { sessionAvgs[key] = teamAvg(athleteRows, key); });
  COLUMNS.forEach(({ key }) => { if (!sessionAvgs[key]) sessionAvgs[key] = teamAvg(athleteRows, key); });

  const handleSort = (key: MetricKey) => {
    if (sortCol === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(key); setSortDir('desc'); }
  };

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

  if (loading) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} isRefreshing />
      <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 48, borderRadius: 8, marginBottom: 8 }} />)}
      </div>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} onRefresh={loadBase} isRefreshing={isRefreshing} />
      <Ava isOpen={avaOpen} onClose={() => setAvaOpen(false)} />

      <div style={{ maxWidth: 1600, margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 14, alignItems: 'start' }}>

          {/* Session list */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', position: 'sticky', top: 16 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              Sessions ({activities.length})
            </div>
            <div style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
              {activities.map(act => (
                <button key={act.id} onClick={() => setSelectedId(act.id)} style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '10px 14px', background: act.id === selectedId ? 'rgba(26,107,255,0.12)' : 'transparent', borderLeft: act.id === selectedId ? '3px solid var(--accent)' : '3px solid transparent', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)', marginBottom: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {act.name}
                    {sessionHasMax[act.id] && <span style={{ color: 'var(--text)', fontWeight: 900, fontSize: 12 }}>*</span>}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 5 }}>
                    <span>{act.date}</span><span>·</span><span>{act.durationMinutes}min</span>
                    {act.isGame && <span style={{ color: 'var(--orange)', fontWeight: 700 }}>GAME</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Main content */}
          <div>
            {/* Session header */}
            {selectedActivity && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 12 }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20 }}>{selectedActivity.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {selectedActivity.date} · {selectedActivity.durationMinutes} min · {athleteRows.length} athletes
                    {Object.keys(historicalAvgs).length > 0 && <span style={{ marginLeft: 8, color: 'var(--accent)' }}>· scored vs season avg</span>}
                  </div>
                </div>
                {/* KPI comparison cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                  {OVERVIEW_KPIS.map(({ key, label, unit, color }) => (
                    <SessionKPICard
                      key={key}
                      metricKey={key}
                      label={label}
                      unit={unit}
                      color={color}
                      sessionAvg={sessionAvgs[key] ?? 0}
                      histAvg={historicalAvgs[key] ?? 0}
                    />
                  ))}
                </div>
                {/* Color legend */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>vs Season Avg</span>
                  {[
                    { label: '≥+15%', color: '#ff3b3b' },
                    { label: '+5–15%', color: '#ff8c42' },
                    { label: '±5%', color: '#06d6a0' },
                    { label: '-5–15%', color: '#ffd166' },
                    { label: '≤-15%', color: '#4da6ff' },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: item.color }} />
                      <span style={{ fontSize: 9, color: 'var(--muted)' }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Table legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cell color = % of personal best</span>
              {[
                { label: '~Max ≥90%', color: '#ff3b3b' },
                { label: 'High 75–89%', color: '#ff8c42' },
                { label: 'Mod-High 60–74%', color: '#ffd166' },
                { label: 'Moderate 40–59%', color: '#06d6a0' },
                { label: 'Low <40%', color: '#4da6ff' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                  <span style={{ fontSize: 9, color: 'var(--muted)' }}>{item.label}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 800 }}>*</span>
                <span style={{ fontSize: 9, color: 'var(--muted)' }}> = New personal max</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M1 2.5L1 10L6 8L11 10V2.5L6 0.5L1 2.5Z" fill="#ff3b3b" />
                  <line x1="1" y1="2.5" x2="1" y2="11.5" stroke="#ff3b3b" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span style={{ fontSize: 9, color: 'var(--muted)' }}> = Active injury</span>
              </div>
              <span style={{ fontSize: 9, color: 'var(--dim)', marginLeft: 4 }}>· Click header to sort · Click any value to view player</span>
            </div>

            {/* Table */}
            {statsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...Array(8)].map((_, i) => <div key={i} className="skeleton" style={{ height: 40, borderRadius: 8 }} />)}
              </div>
            ) : athleteRows.length === 0 ? (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                {selectedId ? 'No data for this session' : 'Select a session'}
              </div>
            ) : (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 2, minWidth: 140 }}>Player</th>
                        <th style={{ ...th, textAlign: 'left', minWidth: 50 }}>Pos</th>
                        {COLUMNS.map(c => (
                          <th key={c.key} style={{ ...th, color: sortCol === c.key ? 'var(--accent)' : 'var(--muted)' }} onClick={() => handleSort(c.key)}>
                            {c.label} {sortCol === c.key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                            {c.unit && <div style={{ fontSize: 8, opacity: 0.6, fontWeight: 500 }}>{c.unit}</div>}
                          </th>
                        ))}
                      </tr>
                      {/* Team avg row */}
                      <tr style={{ background: 'rgba(26,107,255,0.06)' }}>
                        <td style={{ ...td, textAlign: 'left', position: 'sticky', left: 0, background: 'rgba(26,107,255,0.08)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)' }}>Team Avg</td>
                        <td style={{ ...td, textAlign: 'left' }} />
                        {COLUMNS.map(c => {
                          const avg = sessionAvgs[c.key] ?? 0;
                          const histAvg = historicalAvgs[c.key] ?? 0;
                          const changePct = histAvg > 0 && avg > 0 ? ((avg - histAvg) / histAvg) * 100 : 0;
                          const up = changePct >= 0;
                          return (
                            <td key={c.key} style={{ ...td, color: 'var(--accent)', fontWeight: 700 }}>
                              {avg > 0 ? avg.toFixed(c.decimals) : '—'}
                              {histAvg > 0 && avg > 0 && (
                                <div style={{ fontSize: 8, color: up ? '#06d6a0' : '#ff8c42', marginTop: 1 }}>
                                  {up ? '▲' : '▼'}{Math.abs(changePct).toFixed(0)}%
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {POSITION_ORDER.filter(g => grouped[g]?.length > 0).map(group => (
                        <>
                          <tr key={`group-${group}`} style={{ background: 'var(--surface)' }}>
                            <td colSpan={COLUMNS.length + 2} style={{ padding: '5px 14px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: GROUP_NAME_COLOR[group] || 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                              {group} — {grouped[group].length}
                            </td>
                          </tr>
                          {grouped[group].map((row, i) => (
                            <tr key={row.id}
                              style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.05)')}
                              onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}>
                              <td style={{ ...td, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1 }}>
                                <button onClick={() => router.push(`/player?id=${row.id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 12, padding: 0, textAlign: 'left', fontFamily: 'inherit' }}>
                                  {row.name}
                                </button>
                                <InjuryFlag athleteId={row.id} athleteName={row.name} sessionDate={selectedActivity?.date} />
                              </td>
                              <td style={{ ...td, textAlign: 'left', color: getPosColor(row.position), fontSize: 11, fontWeight: 700 }}>{row.position}</td>
                              {COLUMNS.map(c => {
                                const val = row.metrics[c.key] ?? 0;
                                const pb = personalBests[row.id]?.[c.key] ?? 0;
                                const { color } = getIntensityColor(val, pb);
                                const isBold = pb > 0 && val > 0 && (val / pb) >= 0.75;
                                const isNewMax = pb > 0 && val > 0 && val >= pb &&
                                  !(['profileMaxVelocity', 'maxVelocityPct'] as MetricKey[]).includes(c.key);
                                return (
                                  <td key={c.key}
                                    onClick={() => router.push(`/player?id=${row.id}&session=${selectedId}`)}
                                    style={{ ...td, color, fontWeight: isBold ? 700 : 400, cursor: 'pointer', position: 'relative' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.1)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                    {val > 0 ? val.toFixed(c.decimals) : '—'}
                                    {isNewMax && (
                                      <span style={{ color: 'var(--text)', fontWeight: 900, fontSize: 11, marginLeft: 2, lineHeight: 1 }}>*</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Sessions() {
  return <Suspense fallback={<div style={{ background: 'var(--bg)', minHeight: '100vh' }} />}><SessionsContent /></Suspense>;
}
