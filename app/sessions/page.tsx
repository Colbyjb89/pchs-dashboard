'use client';
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Ava from '@/components/Ava';
import { MetricKey, METRIC_CONFIG } from '@/lib/types';
import { ALL_SLUGS, rowToMetrics, normalizeAthlete, normalizeActivity, NormalizedActivity, parseActivityDate, weekStart } from '@/lib/data';
import InjuryFlag from '@/components/InjuryFlag';
import { getInjuryHistory, fuzzyMatchName, isSessionInInjuryWindow, STATUS_COLORS as INJ_COLORS } from '@/lib/injuries';



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

// ── Comparison types + constants ──────────────────────────────────────────────
type CompMode = 'week' | 'day';
interface CompAthleteRow {
  id: string; name: string; position: string; positionGroup: string;
  a: Partial<Record<MetricKey, number>>;
  b: Partial<Record<MetricKey, number>>;
}
interface WeekOption { ws: string; label: string; }
interface SessionOption { id: string; name: string; date: string; }
const COMP_KPI_KEYS: MetricKey[] = ['playerLoad', 'playerLoadPerMin', 'truckStick', 'maxVelocity', 'totalDistance', 'maxAccel'];
const COMP_KPI_META: Record<string, { label: string; unit: string; color: string }> = {
  playerLoad:       { label: 'Player Load',  unit: 'AU',     color: '#1a6bff' },
  playerLoadPerMin: { label: 'PL / Min',     unit: 'AU/min', color: '#00e676' },
  truckStick:       { label: 'Truck Stick',  unit: 'N-s',    color: '#ff6d00' },
  maxVelocity:      { label: 'Max Velocity', unit: 'mph',    color: '#7c4dff' },
  totalDistance:    { label: 'Distance',     unit: 'yds',    color: '#00bcd4' },
  maxAccel:         { label: 'Max Accel',    unit: 'm/s²',   color: '#ff1744' },
};
const COMP_POSITION_GROUPS = ['All', 'Offensive Line', 'Skill', 'Defensive Line', 'Linebackers', 'Secondary', 'Special Teams'];
function compTAvg(rows: CompAthleteRow[], key: MetricKey, side: 'a' | 'b'): number {
  const vals = rows.map(r => r[side][key] ?? 0).filter(v => v > 0);
  return vals.length > 0 ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : 0;
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

// KPI comparison — desktop card / mobile approved row pattern
function SessionKPICard({ metricKey, label, unit, color, sessionAvg, histAvg, seasonBest, isMobile, isLast }: {
  metricKey: MetricKey; label: string; unit: string; color: string;
  sessionAvg: number; histAvg: number; seasonBest: number; isMobile: boolean; isLast: boolean;
}) {
  const [showTip, setShowTip] = useState(false);
  const changePct = histAvg > 0 && sessionAvg > 0 ? ((sessionAvg - histAvg) / histAvg) * 100 : 0;
  const up = changePct >= 0;
  const noHistory = histAvg <= 0;

  // % color = same 5-band legend as KPI cards
  const pctColor = !noHistory && sessionAvg > 0
    ? changePct >= 15  ? '#ff3b3b'
    : changePct >= 5   ? '#ff8c42'
    : changePct >= -5  ? '#06d6a0'
    : changePct >= -15 ? '#ffd166'
    :                    '#4da6ff'
    : 'var(--muted)';

  // Value color = % of best-ever team session avg (same bands as table cells)
  // Fall back to histAvg if seasonBest not yet loaded
  const effectiveBest = seasonBest > 0 ? seasonBest : (histAvg > 0 ? histAvg * 1.15 : 0);
  const { color: valueColor } = getIntensityColor(sessionAvg, effectiveBest);

  // ── Mobile: exactly like player KPI ──────────────────────────────────────
  if (isMobile) {
    // Derive intensity label from % of season best (same as player page)
    const pct = effectiveBest > 0 && sessionAvg > 0 ? Math.round((sessionAvg / effectiveBest) * 100) : 0;
    const intensityLabel = pct >= 90 ? '~Max' : pct >= 75 ? 'High' : pct >= 60 ? 'Mod-High' : pct >= 40 ? 'Moderate' : pct > 0 ? 'Low' : '';

    return (
      <div style={{
        position: 'relative',
        background: 'transparent',
        padding: '10px 14px 10px 16px',
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Left color bar — metric identity color */}
        <div style={{
          position: 'absolute', left: 0, top: 6, bottom: 6,
          width: 3, background: color,
          borderRadius: '0 3px 3px 0', opacity: 0.6,
        }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {/* Left: label, intensity, progress bar, % vs season */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</span>
              <button onClick={e => { e.stopPropagation(); setShowTip(v => !v); }}
                style={{ width: 14, height: 14, borderRadius: '50%', background: showTip ? color : 'rgba(255,255,255,0.07)', border: `1px solid ${showTip ? color : 'rgba(255,255,255,0.15)'}`, color: showTip ? 'white' : 'var(--muted)', fontSize: 7, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>?</button>
            </div>
            {sessionAvg > 0 && effectiveBest > 0 ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: valueColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: valueColor, fontWeight: 700 }}>{intensityLabel}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>· {pct}% of best</span>
                </div>
                <div style={{ height: 3, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden', marginBottom: 3 }}>
                  <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: valueColor, borderRadius: 2, transition: 'width 0.4s' }} />
                </div>
                {!noHistory && (
                  <div style={{ fontSize: 10, color: pctColor, fontWeight: 700 }}>
                    {up ? '▲' : '▼'}{Math.abs(changePct).toFixed(1)}% <span style={{ color: 'var(--muted)', fontWeight: 400, fontFamily: 'var(--font-mono)' }}>vs {histAvg.toFixed(1)} avg</span>
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 10, color: 'var(--muted)', opacity: 0.5 }}>No history yet</div>
            )}
          </div>

          {/* Right: value + unit */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color: valueColor, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {sessionAvg > 0 ? sessionAvg.toFixed(1) : '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, fontWeight: 500 }}>{unit}</div>
          </div>
        </div>

        {showTip && (
          <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, background: '#1a2540', border: `1px solid ${color}44`, borderRadius: 8, padding: '9px 11px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
            <strong style={{ color, display: 'block', marginBottom: 3, fontFamily: 'var(--font-display)', fontSize: 11 }}>Team Avg — {label}</strong>
            {KPI_DESCRIPTIONS[metricKey] || 'Team average for this metric across all athletes in the session.'}
          </div>
        )}
      </div>
    );
  }

  // ── Desktop: original card ─────────────────────────────────────────────────
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
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26, color: valueColor, lineHeight: 1, marginBottom: 4 }}>
        {sessionAvg > 0 ? sessionAvg.toFixed(1) : '—'}
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginLeft: 3 }}>{unit}</span>
      </div>
      <div style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 3 }}>Team Average</div>
      {!noHistory && sessionAvg > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: pctColor }}>
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
  const isMobile = useIsMobile();
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
  // Best-ever team session avg per metric (used to color KPI values)
  const [seasonBestAvgs, setSeasonBestAvgs] = useState<Partial<Record<MetricKey, number>>>({});
  const [sortCol, setSortCol] = useState<MetricKey>('playerLoad');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [sessionHasMax, setSessionHasMax] = useState<Record<string, boolean>>({});
  const [avaOpen, setAvaOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewToggle, setViewToggle] = useState<'daily' | 'weekly' | 'comparison'>('daily');
  const [weeklyRows, setWeeklyRows] = useState<AthleteRow[]>([]);
  const [weeklyAvgs, setWeeklyAvgs] = useState<Partial<Record<MetricKey, number>>>({});
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  // ── Comparison state ────────────────────────────────────────────────────────
  const [compMode, setCompMode] = useState<CompMode>('week');
  const [compSelectedGroup, setCompSelectedGroup] = useState('All');
  const [compWeekOptions, setCompWeekOptions] = useState<WeekOption[]>([]);
  const [compWeekA, setCompWeekA] = useState('');
  const [compWeekB, setCompWeekB] = useState('');
  const [compSessionOptions, setCompSessionOptions] = useState<SessionOption[]>([]);
  const [compSessionA, setCompSessionA] = useState('');
  const [compSessionB, setCompSessionB] = useState('');
  const [compAthletes, setCompAthletes] = useState<CompAthleteRow[]>([]);
  const [compLabelA, setCompLabelA] = useState('Period A');
  const [compLabelB, setCompLabelB] = useState('Period B');
  const [compSortMetric, setCompSortMetric] = useState<MetricKey>('playerLoad');
  const [compSortDir, setCompSortDir] = useState<'desc' | 'asc'>('desc');
  const [compComparing, setCompComparing] = useState(false);
  const [compPersonalBests, setCompPersonalBests] = useState<Record<string, Partial<Record<MetricKey, number>>>>({});
  const [weekOptions, setWeekOptions] = useState<{ ws: string; label: string; actIds: string[] }[]>([]);
  const [selectedWeek, setSelectedWeek] = useState('');

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

        // Build week options from activities
        const weekMap: Record<string, { label: string; actIds: string[] }> = {};
        acts.forEach(act => {
          const d = parseActivityDate(act.date);
          const ws = weekStart(d);
          if (!weekMap[ws]) {
            const start = new Date(ws + 'T12:00:00');
            const end = new Date(start); end.setDate(end.getDate() + 6);
            const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            weekMap[ws] = { label: `${fmt(start)} – ${fmt(end)}`, actIds: [] };
          }
          weekMap[ws].actIds.push(act.id);
        });
        const weeks = Object.entries(weekMap)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([ws, { label, actIds }]) => ({ ws, label, actIds }));
        setWeekOptions(weeks);
        if (!selectedWeek && weeks[0]) setSelectedWeek(weeks[0].ws);
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
        // Season best = highest single-session team avg ever
        const hAvgs: Partial<Record<MetricKey, number>> = {};
        const sBest: Partial<Record<MetricKey, number>> = {};
        Object.entries(histSums).forEach(([k, vals]) => {
          const key = k as MetricKey;
          if (vals && vals.length > 0) {
            hAvgs[key] = vals.reduce((s, v) => s + v, 0) / vals.length;
            sBest[key] = Math.max(...vals);
          }
        });
        setHistoricalAvgs(hAvgs);
        setSeasonBestAvgs(sBest);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setIsRefreshing(false); }
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  // Seed comparison options from activities once loaded
  useEffect(() => {
    if (!activities.length) return;
    const opts: SessionOption[] = activities.map(a => ({ id: a.id, name: a.name, date: a.date }));
    setCompSessionOptions(opts);
    if (!compSessionA && opts[0]) setCompSessionA(opts[0].id);
    if (!compSessionB && opts[1]) setCompSessionB(opts[1].id);
    // Week options for comparison
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
    const weeks = Object.entries(weekMap).sort(([a], [b]) => b.localeCompare(a)).map(([ws, label]) => ({ ws, label }));
    setCompWeekOptions(weeks);
    if (!compWeekA && weeks[0]) setCompWeekA(weeks[0].ws);
    if (!compWeekB && weeks[1]) setCompWeekB(weeks[1].ws);
  }, [activities]);

  const fetchCompPeriodStats = async (actIds: string[]): Promise<Record<string, Partial<Record<MetricKey, number[]>>>> => {
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

  const avgCompMetrics = (raw: Partial<Record<MetricKey, number[]>>): Partial<Record<MetricKey, number>> => {
    const out: Partial<Record<MetricKey, number>> = {};
    Object.entries(raw).forEach(([k, vals]) => {
      if (vals && vals.length > 0) out[k as MetricKey] = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
    });
    return out;
  };

  const runComparison = useCallback(async () => {
    setCompComparing(true);
    try {
      const athRes = await fetch('/api/athletes');
      const athResult = await athRes.json();
      if (!athResult.success) return;
      const athList = (Array.isArray(athResult.data) ? athResult.data : []).map((a: Record<string, unknown>) => normalizeAthlete(a));

      let idsA: string[] = [];
      let idsB: string[] = [];
      let lA = 'Period A'; let lB = 'Period B';

      if (compMode === 'week') {
        idsA = activities.filter(a => weekStart(parseActivityDate(a.date)) === compWeekA).map(a => a.id);
        idsB = activities.filter(a => weekStart(parseActivityDate(a.date)) === compWeekB).map(a => a.id);
        lA = compWeekOptions.find(w => w.ws === compWeekA)?.label ?? compWeekA;
        lB = compWeekOptions.find(w => w.ws === compWeekB)?.label ?? compWeekB;
      } else {
        idsA = [compSessionA]; idsB = [compSessionB];
        const sA = compSessionOptions.find(s => s.id === compSessionA);
        const sB = compSessionOptions.find(s => s.id === compSessionB);
        lA = sA ? `${sA.name} · ${sA.date}` : 'Session A';
        lB = sB ? `${sB.name} · ${sB.date}` : 'Session B';
      }

      setCompLabelA(lA); setCompLabelB(lB);
      const [rawA, rawB] = await Promise.all([fetchCompPeriodStats(idsA), fetchCompPeriodStats(idsB)]);

      // Personal bests from recent 20 sessions
      const recentIds = activities.slice(0, 20).map(a => a.id);
      const allRaw = await fetchCompPeriodStats(recentIds);
      const pbs: Record<string, Partial<Record<MetricKey, number>>> = {};
      Object.entries(allRaw).forEach(([athId, metricArrays]) => {
        pbs[athId] = {};
        Object.entries(metricArrays).forEach(([k, vals]) => {
          if (vals && vals.length > 0) pbs[athId][k as MetricKey] = Math.max(...vals);
        });
      });
      setCompPersonalBests(pbs);

      const rows: CompAthleteRow[] = athList
        .map((a: { id: string; name: string; position: string; positionGroup: string }) => ({
          id: a.id, name: a.name, position: a.position, positionGroup: a.positionGroup,
          a: avgCompMetrics(rawA[a.id] ?? {}),
          b: avgCompMetrics(rawB[a.id] ?? {}),
        }))
        .filter((r: CompAthleteRow) => Object.keys(r.a).length > 0 || Object.keys(r.b).length > 0);
      setCompAthletes(rows);
    } catch (e) { console.error(e); }
    finally { setCompComparing(false); }
  }, [compMode, compWeekA, compWeekB, compSessionA, compSessionB, compWeekOptions, compSessionOptions, activities]);

  // Auto-run comparison when selections change and comparison tab is active
  useEffect(() => {
    if (viewToggle !== 'comparison') return;
    const ready = compMode === 'week' ? (compWeekA && compWeekB) : (compSessionA && compSessionB);
    if (ready && !loading) runComparison();
  }, [viewToggle, compMode, compWeekA, compWeekB, compSessionA, compSessionB, loading]);

  // Load weekly data when toggle is weekly or selectedWeek changes
  useEffect(() => {
    if (viewToggle !== 'weekly' || !selectedWeek || !weekOptions.length) return;
    const week = weekOptions.find(w => w.ws === selectedWeek);
    if (!week || !week.actIds.length) return;

    setWeeklyLoading(true);
    Promise.all(week.actIds.map(actId =>
      fetch('/api/stats', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters: ALL_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [actId] }], group_by: ['athlete'] }),
      }).then(r => r.json())
        .then(r => Array.isArray(r.data) ? r.data : [])
        .catch(() => [])
    )).then(allRows => {
      const athVals: Record<string, Partial<Record<MetricKey, number[]>>> = {};
      const athInfo: Record<string, { name: string; position: string; positionGroup: string }> = {};

      allRows.flat().forEach((row: Record<string, unknown>) => {
        const id = String(row.athlete_id ?? '');
        const info = athleteMap[id] || { position: '', positionGroup: '' };
        if (!athVals[id]) {
          athVals[id] = {};
          athInfo[id] = { name: String(row.athlete_name ?? 'Unknown'), ...info };
        }
        const metrics = rowToMetrics(row);
        Object.entries(metrics).forEach(([k, v]) => {
          const key = k as MetricKey;
          if (v != null && v > 0) {
            if (!athVals[id][key]) athVals[id][key] = [];
            athVals[id][key]!.push(v);
          }
        });
      });

      const rows: AthleteRow[] = Object.entries(athVals).map(([id, metricVals]) => {
        const avgMetrics: Partial<Record<MetricKey, number>> = {};
        Object.entries(metricVals).forEach(([k, vals]) => {
          if (vals && vals.length > 0)
            avgMetrics[k as MetricKey] = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
        });
        return { id, ...athInfo[id], metrics: avgMetrics };
      });

      setWeeklyRows(rows);

      const wAvgs: Partial<Record<MetricKey, number>> = {};
      OVERVIEW_KPIS.forEach(({ key }) => { wAvgs[key] = teamAvg(rows, key); });
      COLUMNS.forEach(({ key }) => { if (!wAvgs[key]) wAvgs[key] = teamAvg(rows, key); });
      setWeeklyAvgs(wAvgs);
    }).finally(() => setWeeklyLoading(false));
  }, [viewToggle, selectedWeek, weekOptions, athleteMap]);

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

  // Display vars — switch between daily and weekly
  const displayRows = viewToggle === 'weekly' ? weeklyRows : athleteRows;
  const displayAvgs = viewToggle === 'weekly' ? weeklyAvgs : sessionAvgs;
  const displayLoading = viewToggle === 'weekly' ? weeklyLoading : statsLoading;

  // Re-group display rows
  const displayGrouped: Record<string, AthleteRow[]> = {};
  displayRows.forEach(r => {
    const g = getCustomGroup(r.position) || 'Other';
    if (!displayGrouped[g]) displayGrouped[g] = [];
    displayGrouped[g].push(r);
  });
  POSITION_ORDER.forEach(g => {
    if (displayGrouped[g]) {
      displayGrouped[g].sort((a, b) => {
        const av = a.metrics[sortCol] ?? 0;
        const bv = b.metrics[sortCol] ?? 0;
        return sortDir === 'desc' ? bv - av : av - bv;
      });
    }
  });
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
      <div style={{ padding: '24px 16px', maxWidth: 1400, margin: '0 auto' }}>
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 48, borderRadius: 8, marginBottom: 8 }} />)}
      </div>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} onRefresh={loadBase} isRefreshing={isRefreshing} />
      <Ava isOpen={avaOpen} onClose={() => setAvaOpen(false)} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '16px 12px' : '24px 16px', boxSizing: 'border-box', width: '100%' }}>

        {/* Toggle + selector stacked on mobile */}
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
            {/* Toggle — full width */}
            <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', width: '100%' }}>
              {(['daily', 'weekly', 'comparison'] as const).map(m => (
                <button key={m} onClick={() => setViewToggle(m)}
                  style={{ flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', background: viewToggle === m ? 'var(--accent)' : 'transparent', color: viewToggle === m ? 'white' : 'var(--muted)', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
                  {m}
                </button>
              ))}
            </div>
            {/* Selector — hidden in comparison mode */}
            {viewToggle !== 'comparison' && (
              <select
                value={viewToggle === 'weekly' ? selectedWeek : selectedId}
                onChange={e => viewToggle === 'weekly' ? setSelectedWeek(e.target.value) : setSelectedId(e.target.value)}
                style={{ width: '100%', background: 'var(--card)', border: '1px solid var(--accent)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
                {viewToggle === 'weekly'
                  ? weekOptions.map(w => <option key={w.ws} value={w.ws}>{w.label}</option>)
                  : activities.map(act => <option key={act.id} value={act.id}>{act.name}{act.isGame ? ' · GAME' : ''}</option>)
                }
              </select>
            )}
          </div>
        ) : (
          /* Desktop toggle */
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {(['daily', 'weekly', 'comparison'] as const).map(m => (
                <button key={m} onClick={() => setViewToggle(m)}
                  style={{ padding: '7px 24px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', background: viewToggle === m ? 'var(--accent)' : 'transparent', color: viewToggle === m ? 'white' : 'var(--muted)', transition: 'all 0.15s' }}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {viewToggle === 'comparison' ? (
          /* ── Comparison UI ─────────────────────────────────────── */
          <>
            {/* Mode + Selectors */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: isMobile ? '12px 14px' : '16px 20px', marginBottom: isMobile ? 10 : 16, marginTop: isMobile ? 14 : 0 }}>
              <div style={{ display: 'flex', gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 12, width: isMobile ? '100%' : 'fit-content' }}>
                {([['week', 'Week Range'], ['day', 'Day vs Day']] as [CompMode, string][]).map(([m, label]) => (
                  <button key={m} onClick={() => setCompMode(m)} style={{ flex: isMobile ? 1 : undefined, padding: isMobile ? '10px 0' : '8px 20px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', background: compMode === m ? 'var(--accent)' : 'transparent', color: compMode === m ? 'white' : 'var(--muted)', transition: 'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto 1fr', gap: isMobile ? 10 : 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-display)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{compMode === 'week' ? '⬤ Period A' : '⬤ Session A'}</div>
                  {compMode === 'week' ? (
                    <select value={compWeekA} onChange={e => setCompWeekA(e.target.value)} style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
                      {compWeekOptions.map(w => <option key={w.ws} value={w.ws}>{w.label}</option>)}
                    </select>
                  ) : (
                    <select value={compSessionA} onChange={e => setCompSessionA(e.target.value)} style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
                      {compSessionOptions.map(s => <option key={s.id} value={s.id}>{s.name}{isMobile ? '' : ` · ${s.date}`}</option>)}
                    </select>
                  )}
                </div>
                {!isMobile && <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, color: 'var(--muted)', paddingTop: 20 }}>VS</div>}
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{compMode === 'week' ? '○ Period B' : '○ Session B'}</div>
                  {compMode === 'week' ? (
                    <select value={compWeekB} onChange={e => setCompWeekB(e.target.value)} style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
                      {compWeekOptions.map(w => <option key={w.ws} value={w.ws}>{w.label}</option>)}
                    </select>
                  ) : (
                    <select value={compSessionB} onChange={e => setCompSessionB(e.target.value)} style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
                      {compSessionOptions.map(s => <option key={s.id} value={s.id}>{s.name}{isMobile ? '' : ` · ${s.date}`}</option>)}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {compComparing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
              </div>
            ) : compAthletes.length === 0 ? (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No data found for selected periods</div>
            ) : (
              <>
                {/* KPI Cards */}
                {isMobile ? (
                  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
                    {COMP_KPI_KEYS.map((key, idx) => {
                      const meta = COMP_KPI_META[key] || { label: METRIC_CONFIG[key]?.label, unit: METRIC_CONFIG[key]?.unit, color: 'var(--accent)' };
                      const compFiltered = compSelectedGroup === 'All' ? compAthletes : compAthletes.filter(a => a.positionGroup === compSelectedGroup);
                      const aVal = compTAvg(compFiltered, key, 'a');
                      const bVal = compTAvg(compFiltered, key, 'b');
                      const changePct = bVal > 0 && aVal > 0 ? ((aVal - bVal) / bVal) * 100 : null;
                      const up = changePct != null && changePct >= 0;
                      return (
                        <div key={key} style={{ position: 'relative', padding: '8px 12px 8px 14px', borderBottom: idx < COMP_KPI_KEYS.length - 1 ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
                          <div style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, background: meta.color, borderRadius: '0 3px 3px 0', opacity: 0.7 }} />
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 3 }}>{meta.label}</div>
                              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                                <div>
                                  <div style={{ fontSize: 8, color: 'var(--accent)', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 1, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{compLabelA}</div>
                                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: meta.color }}>{aVal > 0 ? aVal.toFixed(1) : '—'}</span>
                                </div>
                                <span style={{ fontSize: 10, color: 'var(--dim)' }}>·</span>
                                <div>
                                  <div style={{ fontSize: 8, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 1, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{compLabelB}</div>
                                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{bVal > 0 ? bVal.toFixed(1) : '—'}</span>
                                </div>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              {changePct != null ? (
                                <>
                                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: up ? '#06d6a0' : '#ff8c42', lineHeight: 1 }}>{up ? '▲' : '▼'}{Math.abs(changePct).toFixed(1)}%</div>
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                    {COMP_KPI_KEYS.map(key => {
                      const meta = COMP_KPI_META[key] || { label: METRIC_CONFIG[key]?.label, unit: METRIC_CONFIG[key]?.unit, color: 'var(--accent)' };
                      const compFiltered = compSelectedGroup === 'All' ? compAthletes : compAthletes.filter(a => a.positionGroup === compSelectedGroup);
                      const aVal = compTAvg(compFiltered, key, 'a');
                      const bVal = compTAvg(compFiltered, key, 'b');
                      const changePct = bVal > 0 && aVal > 0 ? ((aVal - bVal) / bVal) * 100 : null;
                      const up = changePct != null && changePct >= 0;
                      return (
                        <div key={key} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${meta.color}`, borderRadius: 12, padding: '14px 16px' }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>{meta.label}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <div style={{ background: 'rgba(26,107,255,0.08)', border: '1px solid rgba(26,107,255,0.2)', borderRadius: 8, padding: '8px 10px' }}>
                              <div style={{ fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{compLabelA}</div>
                              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, color: meta.color }}>{aVal > 0 ? aVal.toFixed(1) : '—'}<span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 2 }}>{meta.unit}</span></div>
                            </div>
                            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                              <div style={{ fontSize: 9, color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{compLabelB}</div>
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

                {/* Athlete Table */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: isMobile ? '10px 14px' : '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, marginBottom: 2 }}>Athlete Breakdown</div>
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
                    <select value={compSelectedGroup} onChange={e => setCompSelectedGroup(e.target.value)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12 }}>
                      {COMP_POSITION_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: isMobile ? '60vh' : '75vh' }}>
                    {(() => {
                      const compFiltered = compSelectedGroup === 'All' ? compAthletes : compAthletes.filter(a => a.positionGroup === compSelectedGroup);
                      const compSorted = [...compFiltered].sort((x, y) => {
                        const av = x.a[compSortMetric] ?? 0; const bv = y.a[compSortMetric] ?? 0;
                        return compSortDir === 'desc' ? bv - av : av - bv;
                      });
                      const compThStyle: React.CSSProperties = { padding: '9px 12px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', userSelect: 'none' };
                      return (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: isMobile ? 500 : 'auto' }}>
                          <thead>
                            <tr>
                              <th style={{ ...compThStyle, textAlign: 'left', position: 'sticky', top: 0, left: 0, background: 'var(--surface)', zIndex: 5, minWidth: isMobile ? 110 : 150 }}>Athlete</th>
                              {COMP_KPI_KEYS.map(key => {
                                const meta = COMP_KPI_META[key];
                                const isSort = compSortMetric === key;
                                return (
                                  <th key={`a-${key}`} colSpan={3} onClick={() => { if (compSortMetric === key) setCompSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setCompSortMetric(key); setCompSortDir('desc'); } }}
                                    style={{ ...compThStyle, textAlign: 'center', color: isSort ? 'var(--accent)' : 'var(--muted)', borderLeft: '2px solid var(--border)', position: 'sticky', top: 0, zIndex: 3 }}>
                                    {isMobile ? (METRIC_CONFIG[key]?.shortLabel ?? meta?.label) : (meta?.label ?? METRIC_CONFIG[key]?.shortLabel)} {isSort ? (compSortDir === 'desc' ? '↓' : '↑') : ''}
                                  </th>
                                );
                              })}
                            </tr>
                            <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                              <th style={{ ...compThStyle, textAlign: 'left', position: 'sticky', top: 34, left: 0, background: 'var(--surface)', zIndex: 5 }} />
                              {COMP_KPI_KEYS.map(key => (
                                <React.Fragment key={key}>
                                  <th style={{ ...compThStyle, color: 'var(--accent)', borderLeft: '2px solid var(--border)', fontSize: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 60, position: 'sticky', top: 34, zIndex: 3 }}>{compLabelA}</th>
                                  <th style={{ ...compThStyle, fontSize: 8, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 60, position: 'sticky', top: 34, zIndex: 3 }}>{compLabelB}</th>
                                  <th style={{ ...compThStyle, fontSize: 9, position: 'sticky', top: 34, zIndex: 3 }}>Δ%</th>
                                </React.Fragment>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {compSorted.map((row, i) => (
                              <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.05)')}
                                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}>
                                <td style={{ padding: '9px 14px', position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1, whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <button onClick={() => router.push(`/player?id=${row.id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 12, padding: 0, textAlign: 'left', fontFamily: 'inherit' }}>{row.name}</button>
                                    <InjuryFlag athleteId={row.id} athleteName={row.name} />
                                  </div>
                                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{row.position}</div>
                                </td>
                                {COMP_KPI_KEYS.map(key => {
                                  const aVal = row.a[key] ?? 0; const bVal = row.b[key] ?? 0;
                                  const delta = bVal > 0 && aVal > 0 ? ((aVal - bVal) / bVal) * 100 : null;
                                  const up = delta != null && delta >= 0;
                                  const pb = compPersonalBests[row.id]?.[key] ?? 0;
                                  const aColor = pb > 0 && aVal > 0 ? (() => { const pct = (aVal/pb)*100; return pct>=90?'#ff3b3b':pct>=75?'#ff8c42':pct>=60?'#ffd166':pct>=40?'#06d6a0':'#4da6ff'; })() : 'var(--accent)';
                                  const bColor = pb > 0 && bVal > 0 ? (() => { const pct = (bVal/pb)*100; return pct>=90?'#ff3b3b':pct>=75?'#ff8c42':pct>=60?'#ffd166':pct>=40?'#06d6a0':'#4da6ff'; })() : 'var(--text)';
                                  return (
                                    <React.Fragment key={key}>
                                      <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: aColor, whiteSpace: 'nowrap', borderLeft: '2px solid var(--border)' }}>{aVal > 0 ? aVal.toFixed(1) : '—'}</td>
                                      <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: bColor, whiteSpace: 'nowrap' }}>{bVal > 0 ? bVal.toFixed(1) : '—'}</td>
                                      <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: delta == null ? 'var(--dim)' : up ? '#06d6a0' : '#ff8c42', whiteSpace: 'nowrap' }}>{delta != null ? (up ? '▲' : '▼') + Math.abs(delta).toFixed(0) + '%' : '—'}</td>
                                    </React.Fragment>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '240px 1fr', gap: 14, alignItems: 'start' }}>

          {/* Session list — desktop only */}
          {!isMobile && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', position: 'sticky', top: 16 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              {viewToggle === 'weekly' ? `Weeks (${weekOptions.length})` : `Sessions (${activities.length})`}
            </div>
            <div style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
              {viewToggle === 'weekly' ? weekOptions.map(w => (
                <button key={w.ws} onClick={() => setSelectedWeek(w.ws)} style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '10px 14px', background: w.ws === selectedWeek ? 'rgba(26,107,255,0.12)' : 'transparent', borderLeft: w.ws === selectedWeek ? '3px solid var(--accent)' : '3px solid transparent', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)', marginBottom: 1 }}>{w.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{w.actIds.length} session{w.actIds.length !== 1 ? 's' : ''}</div>
                </button>
              )) : activities.map(act => (
                <button key={act.id} onClick={() => setSelectedId(act.id)} style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '10px 14px', background: act.id === selectedId ? 'rgba(26,107,255,0.12)' : 'transparent', borderLeft: act.id === selectedId ? '3px solid var(--accent)' : '3px solid transparent', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)', marginBottom: 1 }}>{act.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 5 }}>
                    <span>{act.date}</span><span>·</span><span>{act.durationMinutes}min</span>
                    {act.isGame && <span style={{ color: 'var(--orange)', fontWeight: 700 }}>GAME</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Main content */}
          <div style={{ minWidth: 0, width: '100%' }}>
            {(viewToggle === 'weekly' ? selectedWeek : selectedActivity) && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: isMobile ? '12px 12px 0 0' : 12, borderBottom: isMobile ? 'none' : undefined }}>
                  <div style={{ padding: isMobile ? '12px 14px' : '16px 20px 12px' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: isMobile ? 16 : 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {viewToggle === 'weekly'
                        ? (weekOptions.find(w => w.ws === selectedWeek)?.label ?? 'Week')
                        : selectedActivity?.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {viewToggle === 'weekly'
                        ? `${weekOptions.find(w => w.ws === selectedWeek)?.label ?? 'Week'} · Weekly averages · ${displayRows.length} athletes`
                        : `${selectedActivity?.date} · ${selectedActivity?.durationMinutes} min · ${athleteRows.length} athletes`}
                      {!isMobile && viewToggle === 'daily' && Object.keys(historicalAvgs).length > 0 && <span style={{ marginLeft: 8, color: 'var(--accent)' }}>· scored vs season avg</span>}
                    </div>
                  </div>

                  {/* KPI section */}
                  {isMobile ? (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      {OVERVIEW_KPIS.map(({ key, label, unit, color }, idx) => (
                        <SessionKPICard key={key} metricKey={key} label={label} unit={unit} color={color}
                          sessionAvg={displayAvgs[key] ?? 0} histAvg={historicalAvgs[key] ?? 0}
                          seasonBest={seasonBestAvgs[key] ?? 0} isMobile={true} isLast={idx === OVERVIEW_KPIS.length - 1} />
                      ))}
                      <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>vs Season Best</span>
                        {[{ color: '#ff3b3b', range: '≥90%' }, { color: '#ff8c42', range: '75–89%' }, { color: '#ffd166', range: '60–74%' }, { color: '#06d6a0', range: '40–59%' }, { color: '#4da6ff', range: '<40%' }].map(item => (
                          <div key={item.range} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 9, color: 'var(--muted)' }}>{item.range}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '0 20px 16px', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
                      {OVERVIEW_KPIS.map(({ key, label, unit, color }) => (
                        <SessionKPICard key={key} metricKey={key} label={label} unit={unit} color={color}
                          sessionAvg={displayAvgs[key] ?? 0} histAvg={historicalAvgs[key] ?? 0}
                          seasonBest={seasonBestAvgs[key] ?? 0} isMobile={false} isLast={false} />
                      ))}
                    </div>
                  )}

                  {/* Mobile: active injury flags */}
                  {isMobile && (() => {
                    const sessionDate = selectedActivity?.date ?? '';
                    const injuredWithRecord = athleteRows
                      .map(r => ({ r, inj: isSessionInInjuryWindow(r.name, sessionDate) }))
                      .filter(({ inj }) => inj !== null)
                      .map(({ r, inj }) => ({ r, inj: inj! }));
                    return injuredWithRecord.length > 0 ? (
                      <div style={{ background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.25)', borderRadius: 10, padding: '10px 14px', marginTop: 10 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ff3b3b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                            <path d="M1 2.5L1 10L6 8L11 10V2.5L6 0.5L1 2.5Z" fill="#ff3b3b" />
                            <line x1="1" y1="2.5" x2="1" y2="11.5" stroke="#ff3b3b" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                          Active Injuries ({injuredWithRecord.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {injuredWithRecord.map(({ r, inj }) => {
                            const statusColor = INJ_COLORS[inj.status]?.color ?? '#ff3b3b';
                            return (
                              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.name}</span>
                                  <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>{r.position}</span>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: statusColor }}>{inj.status}</div>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{(inj as any).bodyPart ?? ''}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* Desktop: color legend */}
                  {!isMobile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 20px 16px', borderTop: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>vs Season Avg</span>
                      {[{ label: '≥+15%', color: '#ff3b3b' }, { label: '+5–15%', color: '#ff8c42' }, { label: '±5%', color: '#06d6a0' }, { label: '-5–15%', color: '#ffd166' }, { label: '≤-15%', color: '#4da6ff' }].map(item => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: item.color }} />
                          <span style={{ fontSize: 9, color: 'var(--muted)' }}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Session Data header */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: isMobile ? 16 : 18, letterSpacing: '0.05em', textTransform: 'uppercase', margin: 0 }}>
                {viewToggle === 'weekly' ? 'Weekly Averages' : 'Session Data'}
              </h2>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>{displayRows.length} athletes</span>
            </div>

            {/* Table legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {viewToggle === 'weekly' ? 'Cell color = % of personal best' : 'Cell color = % of personal best'}
              </span>
              {[{ label: '~Max ≥90%', color: '#ff3b3b' }, { label: 'High 75–89%', color: '#ff8c42' }, { label: 'Mod-High 60–74%', color: '#ffd166' }, { label: 'Moderate 40–59%', color: '#06d6a0' }, { label: 'Low <40%', color: '#4da6ff' }].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                  <span style={{ fontSize: 9, color: 'var(--muted)' }}>{item.label}</span>
                </div>
              ))}
              {viewToggle === 'daily' && <>
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
              </>}
              <span style={{ fontSize: 9, color: 'var(--dim)', marginLeft: 4 }}>· Click header to sort · Click any value to view player</span>
            </div>

            {/* Table */}
            {displayLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...Array(8)].map((_, i) => <div key={i} className="skeleton" style={{ height: 40, borderRadius: 8 }} />)}
              </div>
            ) : displayRows.length === 0 ? (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                {selectedId ? 'No data for this session' : 'Select a session'}
              </div>
            ) : (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: isMobile ? '60vh' : '75vh' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 800 }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, textAlign: 'left', position: 'sticky', top: 0, left: 0, background: 'var(--surface)', zIndex: 5, minWidth: 150, width: 150 }}>Player</th>
                        <th style={{ ...th, textAlign: 'left', width: 46, minWidth: 46, background: 'var(--surface)', position: 'sticky', top: 0, left: 150, zIndex: 5 }}>Pos</th>
                        {COLUMNS.map(c => (
                          <th key={c.key} style={{ ...th, position: 'sticky', top: 0, color: sortCol === c.key ? 'var(--accent)' : 'var(--muted)', background: 'var(--surface)', zIndex: 3 }} onClick={() => handleSort(c.key)}>
                            {c.label} {sortCol === c.key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                            {c.unit && <div style={{ fontSize: 8, opacity: 0.6, fontWeight: 500 }}>{c.unit}</div>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Team avg row */}
                      <tr style={{ background: 'rgba(26,107,255,0.06)' }}>
                        <td style={{ ...td, textAlign: 'left', position: 'sticky', left: 0, background: '#0d1829', zIndex: 2, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)', width: 150, minWidth: 150 }}>Team Avg</td>
                        <td style={{ ...td, textAlign: 'left', position: 'sticky', left: 130, background: '#0d1829', zIndex: 1, width: 46, minWidth: 46 }} />
                        {COLUMNS.map(c => {
                          const avg = displayAvgs[c.key] ?? 0;
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
                      {POSITION_ORDER.filter(g => displayGrouped[g]?.length > 0).map(group => {
                        const groupColor = GROUP_NAME_COLOR[group] || 'var(--muted)';
                        const members = displayGrouped[group];
                        // Compute position avg for each column
                        const posAvg: Partial<Record<MetricKey, number>> = {};
                        COLUMNS.forEach(c => { posAvg[c.key] = teamAvg(members, c.key); });
                        return (
                        <>
                          <tr key={`group-${group}`} style={{ background: 'var(--surface)' }}>
                            <td colSpan={2} style={{ padding: '6px 14px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: groupColor, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', left: 0, width: 196, minWidth: 196, zIndex: 2 }}>
                              {group} — {members.length}
                            </td>
                            {COLUMNS.map(c => {
                              const avg = posAvg[c.key] ?? 0;
                              const teamA = displayAvgs[c.key] ?? 0;
                              const changePct = teamA > 0 && avg > 0 ? ((avg - teamA) / teamA) * 100 : 0;
                              const up = changePct >= 0;
                              return (
                                <td key={c.key} style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--surface)', padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: groupColor, whiteSpace: 'nowrap' }}>
                                  {avg > 0 ? avg.toFixed(c.decimals) : '—'}
                                  {teamA > 0 && avg > 0 && (
                                    <div style={{ fontSize: 8, color: up ? '#06d6a0' : '#ff8c42', marginTop: 1, fontWeight: 700 }}>
                                      {up ? '▲' : '▼'}{Math.abs(changePct).toFixed(0)}%
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                          {displayGrouped[group].map((row, i) => (
                            <tr key={row.id}
                              style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.05)')}
                              onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}>
                              <td style={{ ...td, textAlign: 'left', position: 'sticky', left: 0, background: '#0f1923', zIndex: 1, width: 150, minWidth: 150, overflow: 'visible' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <InjuryFlag athleteId={row.id} athleteName={row.name} sessionDate={selectedActivity?.date} />
                                  <button onClick={() => router.push(`/player?id=${row.id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 12, padding: 0, textAlign: 'left', fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 126 }}>
                                    {row.name}
                                  </button>
                                </div>
                              </td>
                              <td style={{ ...td, textAlign: 'left', position: 'sticky', left: 130, background: '#0f1923', zIndex: 1, color: getPosColor(row.position), fontSize: 11, fontWeight: 700, boxShadow: '2px 0 6px rgba(0,0,0,0.4)', width: 46, minWidth: 46 }}>{row.position}</td>
                              {COLUMNS.map(c => {
                                const val = row.metrics[c.key] ?? 0;
                                const pb = personalBests[row.id]?.[c.key] ?? 0;
                                const { color } = getIntensityColor(val, pb);
                                const isBold = pb > 0 && val > 0 && (val / pb) >= 0.75;
                                const isNewMax = viewToggle === 'daily' && pb > 0 && val > 0 && val >= pb &&
                                  !(['profileMaxVelocity', 'maxVelocityPct'] as MetricKey[]).includes(c.key);
                                return (
                                  <td key={c.key}
                                    onClick={() => {
                                      const isBand = (['velocityBand4Distance', 'velocityBand7Efforts'] as MetricKey[]).includes(c.key);
                                      router.push(isBand ? '/speed-bands' : `/player?id=${row.id}&session=${selectedId}`);
                                    }}
                                    style={{ ...td, color, fontWeight: isBold ? 700 : 400, cursor: 'pointer', position: 'relative' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.1)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                    {val > 0 ? val.toFixed(c.decimals) : '—'}
                                    {isNewMax && <span style={{ color: 'var(--text)', fontWeight: 900, fontSize: 11, marginLeft: 2, lineHeight: 1 }}>*</span>}
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
        )} {/* end comparison ternary */}
      </div>
    </div>
  );
}

export default function Sessions() {
  return <Suspense fallback={<div style={{ background: 'var(--bg)', minHeight: '100vh' }} />}><SessionsContent /></Suspense>;
}
