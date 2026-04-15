'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Ava from '@/components/Ava';
import { METRIC_CONFIG, MetricKey } from '@/lib/types';
import { ALL_SLUGS, rowToMetrics, normalizeAthlete, normalizeActivity, parseActivityDate, weekStart } from '@/lib/data';
import InjuryFlag from '@/components/InjuryFlag';

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

const KPI_CARDS: { key: MetricKey; color: string }[] = [
  { key: 'playerLoad',       color: '#1a6bff' },
  { key: 'playerLoadPerMin', color: '#00e676' },
  { key: 'truckStick',       color: '#ff6d00' },
  { key: 'maxVelocity',      color: '#7c4dff' },
  { key: 'totalDistance',    color: '#00bcd4' },
  { key: 'maxAccel',         color: '#ff1744' },
];

const POSITION_GROUPS = ['All', 'O Skill', 'D Skill', 'Corners', 'Linebackers', 'O Line', 'D Line', 'Kicker'];
const POS_GROUP_MAP: Record<string, string[]> = {
  'O Skill':     ['QB','WR','RB','HB','FB','TE','SB'],
  'D Skill':     ['S','SS','FS','SAF'],
  'Corners':     ['CB','DB','NICKEL','DIME','DCB'],
  'Linebackers': ['LB','OLB','ILB','MLB','WILL','MIKE','SAM'],
  'O Line':      ['OL','C','OG','OT','LT','RT','LG','RG'],
  'D Line':      ['DL','DE','DT','NT','NG'],
  'Kicker':      ['K','P','LS','KR','PR'],
};

function getPosGroup(pos: string): string {
  const p = pos.toUpperCase();
  for (const [group, positions] of Object.entries(POS_GROUP_MAP)) {
    if (positions.includes(p)) return group;
  }
  return 'Other';
}

interface KPIMax { value: number; athleteName: string; date: string; }
interface AthleteRow { id: string; name: string; position: string; positionGroup: string; }
interface AthleteLeaderEntry extends AthleteRow { value: number; date: string; sessionId: string; }
interface SessionRow { weekStart: string; weekLabel: string; avgValue: number; maxValue: number; }
type ViewMode = 'alltime' | 'day' | 'range';
type DisplayMode = 'max' | 'avg';

// ─── KPI Card (unchanged) ─────────────────────────────────────────────────────
function KPICard({ metricKey, color, max, isActive, onClick, displayMode, viewMode }: {
  metricKey: MetricKey; color: string;
  max: KPIMax; isActive: boolean; onClick: () => void;
  displayMode?: DisplayMode;
  viewMode?: string;
}) {
  const isMobile = useIsMobile();
  const [showTip, setShowTip] = useState(false);
  const cfg = METRIC_CONFIG[metricKey];

  const kpiLabel = (() => {
    if (displayMode === 'avg') {
      if (viewMode === 'day') return `SESSION TEAM AVG →`;
      if (viewMode === 'range') return `PERIOD TEAM AVG →`;
      return `ALL-TIME TEAM AVG →`;
    }
    if (viewMode === 'day') return `SESSION MAX →`;
    if (viewMode === 'range') return `PERIOD MAX →`;
    return `ALL-TIME MAX →`;
  })();

  if (isMobile) {
    return (
      <div onClick={onClick} style={{ position: 'relative', background: isActive ? `${color}0f` : 'transparent', cursor: 'pointer', transition: 'background 0.15s', padding: '10px 14px 10px 16px' }}>
        <div style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: isActive ? 4 : 3, background: color, borderRadius: '0 3px 3px 0', opacity: isActive ? 1 : 0.5, transition: 'all 0.15s' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: isActive ? color : 'var(--muted)', transition: 'color 0.15s' }}>{cfg.shortLabel}</span>
              <button onClick={e => { e.stopPropagation(); setShowTip(v => !v); }}
                style={{ width: 14, height: 14, borderRadius: '50%', background: showTip ? color : 'rgba(255,255,255,0.07)', border: `1px solid ${showTip ? color : 'rgba(255,255,255,0.15)'}`, color: showTip ? 'white' : 'var(--muted)', fontSize: 7, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>?</button>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>{max.athleteName || '—'}</div>
            {max.date && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', opacity: 0.6, marginTop: 1 }}>{max.date}</div>}
            <div style={{ fontSize: 9, color, fontFamily: 'var(--font-display)', fontWeight: 700, opacity: 0.7, marginTop: 2 }}>{kpiLabel}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color, letterSpacing: '-0.02em', lineHeight: 1 }}>{max.value > 0 ? max.value.toFixed(2) : '—'}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, fontWeight: 500 }}>{cfg.unit}</div>
          </div>
        </div>
        {showTip && (
          <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, background: '#1a2540', border: `1px solid ${color}44`, borderRadius: 8, padding: '9px 11px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
            <strong style={{ color, display: 'block', marginBottom: 3, fontFamily: 'var(--font-display)', fontSize: 11 }}>{cfg.label}</strong>
            {cfg.description}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`kpi-card ${isActive ? 'active' : ''}`} onClick={onClick}
      style={{ borderTopColor: isActive ? color : 'transparent', borderTopWidth: 2, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{cfg.shortLabel}</div>
        <button onClick={e => { e.stopPropagation(); setShowTip(v => !v); }}
          style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--dim)', border: 'none', color: 'var(--muted)', fontSize: 9, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</button>
      </div>
      {showTip && (
        <div onClick={e => e.stopPropagation()} style={{ background: '#1e2d42', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>{cfg.label}</strong>
          {cfg.description}
        </div>
      )}
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 34, color, lineHeight: 1, marginBottom: 4 }}>
        {max.value > 0 ? max.value.toFixed(2) : '—'}
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginLeft: 4 }}>{cfg.unit}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{max.athleteName}</span>
        {max.date && <span> · {max.date}</span>}
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.04em', opacity: 0.7 }}>{kpiLabel}</div>
    </div>
  );
}

// ─── Leaderboard Panel ────────────────────────────────────────────────────────
function LeaderboardPanel({ metricKey, athletes, sessions, displayMode, viewMode, fromDate, toDate }: {
  metricKey: MetricKey;
  athletes: AthleteLeaderEntry[];
  sessions: SessionRow[];
  displayMode: DisplayMode;
  viewMode: string;
  fromDate: string;
  toDate: string;
}) {
  const isMobile = useIsMobile();
  const [showTip, setShowTip] = useState(false);
  const cfg = METRIC_CONFIG[metricKey];
  const visible = sessions; // limited upstream (8 weeks alltime, 10 sessions day, all in range)
  const chartVals = visible.map(s => displayMode === 'avg' ? s.avgValue : s.maxValue).filter(v => v > 0);
  const chartMin = chartVals.length > 0 ? Math.min(...chartVals) : 0;
  const chartMax = chartVals.length > 0 ? Math.max(...chartVals) : 1;
  const chartRange = chartMax - chartMin || 1;
  const W = 340; const H = 100; const PAD = 12;
  const points = visible.map((s, i) => {
    const v = displayMode === 'avg' ? s.avgValue : s.maxValue;
    const x = PAD + (i / Math.max(visible.length - 1, 1)) * (W - PAD * 2);
    const y = v > 0 ? H - PAD - ((v - chartMin) / chartRange) * (H - PAD * 2) : H - PAD;
    return { x, y, s, v };
  });
  const pathD = points.length > 1 ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') : '';
  const areaD = points.length > 1 ? `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${H - PAD} L ${points[0].x.toFixed(1)} ${H - PAD} Z` : '';

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', animation: 'fadeIn 0.25s ease', marginTop: isMobile ? 4 : 16 }}>
      <div style={{ padding: isMobile ? '12px 14px' : '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: isMobile ? 13 : 14 }}>{cfg.label} — Leaderboard</div>
            <button onClick={() => setShowTip(v => !v)}
              style={{ width: 16, height: 16, borderRadius: '50%', background: showTip ? 'var(--accent)' : 'var(--dim)', border: 'none', color: showTip ? 'white' : 'var(--muted)', fontSize: 9, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>?</button>
          </div>
          {showTip && (
            <div style={{ marginTop: 6, background: '#1e2d42', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 360 }}>
              <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 3 }}>{cfg.label}</strong>
              {cfg.description}
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: showTip ? 6 : 1 }}>{displayMode === 'avg' ? 'Average values' : 'All-time maximums'} by athlete</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 0 }}>
        {/* Chart */}
        <div style={{ padding: isMobile ? '12px 14px' : 16, borderRight: isMobile ? 'none' : '1px solid var(--border)', borderBottom: isMobile ? '1px solid var(--border)' : 'none' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
            {viewMode === 'day'
              ? `${displayMode === 'avg' ? 'Avg' : 'Max'} — Trailing 10 Sessions`
              : viewMode === 'range'
              ? `${displayMode === 'avg' ? 'Daily Avg' : 'Daily Max'} — Date Range`
              : `Weekly Team ${displayMode === 'avg' ? 'Avg' : 'Max'}`}
          </div>
          {visible.length < 2 ? (
            <div style={{ color: 'var(--muted)', fontSize: 12, paddingTop: 20 }}>
              {viewMode === 'range' && (!fromDate || !toDate) ? 'Select a date range to view data' : 'Not enough data for this selection'}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                <span>↑ {chartMax.toFixed(2)}</span>
                <span>↓ {chartMin.toFixed(2)} {cfg.unit}</span>
              </div>
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a6bff" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#1a6bff" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border)" strokeWidth="1" />
                {areaD && <path d={areaD} fill="url(#areaGrad)" />}
                {pathD && <path d={pathD} fill="none" stroke="#1a6bff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
                {points.map((p, i) => (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r="4" fill="#1a6bff" stroke="var(--surface)" strokeWidth="2" />
                    <text x={p.x} y={H} textAnchor="middle" fontSize="8" fill="var(--muted)" fontFamily="monospace">{p.s.weekLabel}</text>
                    <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={isMobile ? "9" : "7"} fill="white" fontFamily="monospace">{p.v > 0 ? p.v.toFixed(2) : ''}</text>
                  </g>
                ))}
              </svg>
            </>
          )}
        </div>
        {/* Leaderboard list */}
        <div style={{ padding: isMobile ? '12px 14px' : 16 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: isMobile ? 8 : 12 }}>All Athletes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 6 : 8, maxHeight: isMobile ? 320 : 420, overflowY: 'auto' }}>
            {athletes.map((a, i) => (
              <a key={a.id} href={`/player?id=${a.id}&session=${a.sessionId}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 10, padding: isMobile ? '9px 10px' : '8px 10px', background: i === 0 ? 'rgba(26,107,255,0.1)' : 'var(--card)', borderRadius: 8, border: '1px solid var(--border)', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <div style={{ width: isMobile ? 24 : 22, height: isMobile ? 24 : 22, borderRadius: '50%', background: i === 0 ? 'var(--accent)' : 'var(--dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, color: 'white', flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)', display: 'flex', alignItems: 'center' }}>
                    {a.name}<InjuryFlag athleteId={a.id} athleteName={a.name} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{a.position}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: isMobile ? 14 : 13, color: i === 0 ? 'var(--accent)' : 'var(--text)' }}>
                    {a.value.toFixed(2)}<span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 2 }}>{cfg.unit}</span>
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

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function TeamOverview() {
  const isMobile = useIsMobile();
  const router = useRouter();

  // Core data
  const [athletes, setAthletes] = useState<AthleteRow[]>([]);
  const [kpiMaxes, setKpiMaxes] = useState<Record<MetricKey, KPIMax>>({} as Record<MetricKey, KPIMax>);
  const [leaderboards, setLeaderboards] = useState<Record<MetricKey, AthleteLeaderEntry[]>>({} as any);
  const [leaderboardsAvg, setLeaderboardsAvg] = useState<Record<MetricKey, AthleteLeaderEntry[]>>({} as any);
  const [weeklySessions, setWeeklySessions] = useState<Record<MetricKey, SessionRow[]>>({} as any);
  const [allSessionData, setAllSessionData] = useState<{ act: ReturnType<typeof normalizeActivity>; rows: Record<string, unknown>[] }[]>([]);
  const [sessionOptions, setSessionOptions] = useState<{ id: string; name: string; date: string }[]>([]);
  const [weekOptions, setWeekOptions] = useState<{ ws: string; label: string }[]>([]);

  // UI state
  const [activeKPI, setActiveKPI] = useState<MetricKey | null>('__filter__' as any);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [avaOpen, setAvaOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'error' | null>(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');

  // Filter state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterMetric, setFilterMetric] = useState<MetricKey>('playerLoad');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('max');
  const [viewMode, setViewMode] = useState<ViewMode>('alltime');
  const [selectedDay, setSelectedDay] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [positionFilter, setPositionFilter] = useState('All');
  const [kpiPositionFilter, setKpiPositionFilter] = useState('All');
  // kpiPositionFilter controls everything — KPIs, leaderboard, chart
  // positionFilter is kept for the expandable filter section compatibility but mirrors kpiPositionFilter
  const [playerFilter, setPlayerFilter] = useState('All');

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

      if (!actResult.success) throw new Error(actResult.error || 'Activities failed');
      const activities = (actResult.data as Record<string, unknown>[]).map(normalizeActivity);
      activities.sort((a, b) => b.startTime - a.startTime);

      // Session + week options
      setSessionOptions(activities.map(a => ({ id: a.id, name: a.name, date: a.date })));
      if (activities[0]) setSelectedDay(activities[0].id);

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
      setWeekOptions(weeks);

      const recent = activities.slice(0, 20);
      const sessionData = await Promise.all(
        recent.map(act =>
          fetch('/api/stats', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parameters: ALL_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [act.id] }], group_by: ['athlete'] }),
          }).then(r => r.json())
            .then(r => ({ act, rows: Array.isArray(r.data) ? r.data : [] }))
            .catch(() => ({ act, rows: [] }))
        )
      );
      setAllSessionData(sessionData);

      // Build KPI maxes + leaderboards for the 6 fixed KPI cards
      const maxes = buildEmpty();
      const athMaxes: Record<string, Partial<Record<MetricKey, number>>> = {};
      const athMaxDates: Record<string, Partial<Record<MetricKey, string>>> = {};
      const athMaxSessionIds: Record<string, Partial<Record<MetricKey, string>>> = {};
      const athSums: Record<string, Partial<Record<MetricKey, number>>> = {};
      const athCounts: Record<string, Partial<Record<MetricKey, number>>> = {};

      sessionData.forEach(({ act, rows }) => {
        rows.forEach((row: Record<string, unknown>) => {
          const id = String(row.athlete_id ?? '');
          const metrics = rowToMetrics(row);
          if (!athMaxes[id]) { athMaxes[id] = {}; athMaxDates[id] = {}; athMaxSessionIds[id] = {}; athSums[id] = {}; athCounts[id] = {}; }
          KPI_CARDS.forEach(({ key }) => {
            const val = metrics[key] ?? 0;
            if (val > (maxes[key]?.value ?? 0)) maxes[key] = { value: val, athleteName: String(row.athlete_name ?? '—'), date: act.date };
            if (val > (athMaxes[id][key] ?? 0)) {
              athMaxes[id][key] = val;
              athMaxDates[id][key] = act.date;
              athMaxSessionIds[id][key] = act.id;
            }
            if (val > 0) {
              athSums[id][key] = (athSums[id][key] ?? 0) + val;
              athCounts[id][key] = (athCounts[id][key] ?? 0) + 1;
            }
          });
        });
      });
      setKpiMaxes(maxes);

      const boards: Record<MetricKey, AthleteLeaderEntry[]> = {} as any;
      const boardsAvg: Record<MetricKey, AthleteLeaderEntry[]> = {} as any;
      KPI_CARDS.forEach(({ key }) => {
        boards[key] = athList
          .map((a: AthleteRow) => ({ ...a, value: athMaxes[a.id]?.[key] ?? 0, date: athMaxDates[a.id]?.[key] ?? '', sessionId: athMaxSessionIds[a.id]?.[key] ?? '' }))
          .filter((a: AthleteLeaderEntry) => a.value > 0)
          .sort((a: AthleteLeaderEntry, b: AthleteLeaderEntry) => b.value - a.value);
        boardsAvg[key] = athList
          .map((a: AthleteRow) => {
            const sum = athSums[a.id]?.[key] ?? 0;
            const count = athCounts[a.id]?.[key] ?? 0;
            const avg = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;
            return { ...a, value: avg, date: '', sessionId: '' };
          })
          .filter((a: AthleteLeaderEntry) => a.value > 0)
          .sort((a: AthleteLeaderEntry, b: AthleteLeaderEntry) => b.value - a.value);
      });
      setLeaderboards(boards);
      setLeaderboardsAvg(boardsAvg);

      // Weekly sessions for chart
      const byWeek: Record<string, Record<MetricKey, number[]>> = {};
      sessionData.forEach(({ act, rows }) => {
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
        weekly[key] = Object.entries(byWeek).sort(([a], [b]) => a.localeCompare(b)).map(([ws, md]) => {
          const d = new Date(ws + 'T12:00:00');
          const vals = md[key] || [];
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

  // ── Compute filtered leaderboard for filter metric ───────────────────────
  const filteredLeaderboard = useCallback((): AthleteLeaderEntry[] => {
    if (!allSessionData.length || !athletes.length) return [];

    // Step 1: filter sessions by time period
    let filteredSessions = allSessionData;
    if (viewMode === 'day' && selectedDay) {
      filteredSessions = allSessionData.filter(s => s.act.id === selectedDay);
    } else if (viewMode === 'range' && fromDate && toDate) {
      const from = new Date(fromDate + 'T00:00:00').getTime();
      const to = new Date(toDate + 'T23:59:59').getTime();
      filteredSessions = allSessionData.filter(s => {
        const t = parseActivityDate(s.act.date).getTime();
        return t >= from && t <= to;
      });
    }

    // Step 2: aggregate per athlete — collect all values, track date of max
    const athVals: Record<string, number[]> = {};
    const athMaxDate: Record<string, string> = {};
    const athMaxSessionId: Record<string, string> = {};
    const athFirstDate: Record<string, string> = {};
    const athFirstSessionId: Record<string, string> = {};

    filteredSessions.forEach(({ act, rows }) => {
      rows.forEach((row: Record<string, unknown>) => {
        const id = String(row.athlete_id ?? '');
        const val = (rowToMetrics(row))[filterMetric] ?? 0;
        if (val <= 0) return;
        if (!athVals[id]) {
          athVals[id] = [];
          athFirstDate[id] = act.date;
          athFirstSessionId[id] = act.id;
        }
        athVals[id].push(val);
        // Track date of personal max
        const curMax = athMaxDate[id] ? Math.max(...athVals[id].slice(0, -1)) : 0;
        if (val >= curMax) {
          athMaxDate[id] = act.date;
          athMaxSessionId[id] = act.id;
        }
      });
    });

    // Step 3: compute final value per athlete based on displayMode
    let entries: AthleteLeaderEntry[] = athletes
      .filter(a => athVals[a.id]?.length > 0)
      .map(a => {
        const vals = athVals[a.id];
        const isMax = displayMode === 'max';
        const value = isMax
          ? Math.max(...vals)
          : Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100;
        return {
          ...a,
          value: Math.round(value * 100) / 100,
          date: isMax ? (athMaxDate[a.id] ?? '') : (athFirstDate[a.id] ?? ''),
          sessionId: isMax ? (athMaxSessionId[a.id] ?? '') : (athFirstSessionId[a.id] ?? ''),
        };
      })
      .filter(a => a.value > 0)
      .sort((a, b) => b.value - a.value);

    // Step 4: apply position + player filters
    if (kpiPositionFilter !== 'All') {
      const allowed = POS_GROUP_MAP[kpiPositionFilter] ?? [];
      entries = entries.filter(a => allowed.includes(a.position.toUpperCase()));
    }
    if (playerFilter !== 'All') {
      entries = entries.filter(a => a.id === playerFilter);
    }

    return entries;
  }, [allSessionData, athletes, filterMetric, displayMode, viewMode, selectedDay, fromDate, toDate, kpiPositionFilter, playerFilter]);

  // Compute filter weekly sessions for chart
  const filterWeeklySessions = useCallback((): SessionRow[] => {
    if (!allSessionData.length) return [];

    const allowedPos = kpiPositionFilter !== 'All' ? (POS_GROUP_MAP[kpiPositionFilter] ?? []) : null;

    const sessionToPoint = ({ act, rows }: { act: ReturnType<typeof normalizeActivity>; rows: Record<string, unknown>[] }): SessionRow | null => {
      const filtered = rows.filter((row: Record<string, unknown>) => {
        if (allowedPos) {
          const id = String(row.athlete_id ?? '');
          const pos = (athletes.find(a => a.id === id)?.position ?? '').toUpperCase();
          if (!allowedPos.includes(pos)) return false;
        }
        if (playerFilter !== 'All' && String(row.athlete_id ?? '') !== playerFilter) return false;
        return true;
      });
      const vals = filtered.map((row: Record<string, unknown>) => (rowToMetrics(row))[filterMetric] ?? 0).filter(v => v > 0);
      if (!vals.length) return null;
      const avg = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
      const max = Math.round(Math.max(...vals) * 10) / 10;
      const d = parseActivityDate(act.date);
      return {
        weekStart: act.date,
        weekLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        avgValue: avg,
        maxValue: max,
      };
    };

    // Single day → trailing 10 individual sessions
    if (viewMode === 'day') {
      const sorted = [...allSessionData].sort((a, b) => parseActivityDate(a.act.date).getTime() - parseActivityDate(b.act.date).getTime());
      return sorted.slice(-10).map(sessionToPoint).filter((s): s is SessionRow => s !== null);
    }

    // Date range → individual sessions within range
    if (viewMode === 'range' && fromDate && toDate) {
      const from = new Date(fromDate + 'T00:00:00').getTime();
      const to = new Date(toDate + 'T23:59:59').getTime();
      return [...allSessionData]
        .sort((a, b) => parseActivityDate(a.act.date).getTime() - parseActivityDate(b.act.date).getTime())
        .filter(s => { const t = parseActivityDate(s.act.date).getTime(); return t >= from && t <= to; })
        .map(sessionToPoint)
        .filter((s): s is SessionRow => s !== null);
    }

    // All time → weekly buckets, last 8
    const byWeek: Record<string, number[]> = {};
    allSessionData.forEach(({ act, rows }) => {
      const ws = weekStart(new Date(act.startTime * 1000));
      if (!byWeek[ws]) byWeek[ws] = [];
      rows.filter((row: Record<string, unknown>) => {
        if (allowedPos) {
          const id = String(row.athlete_id ?? '');
          const pos = (athletes.find(a => a.id === id)?.position ?? '').toUpperCase();
          if (!allowedPos.includes(pos)) return false;
        }
        if (playerFilter !== 'All' && String(row.athlete_id ?? '') !== playerFilter) return false;
        return true;
      }).forEach((row: Record<string, unknown>) => {
        const val = (rowToMetrics(row))[filterMetric] ?? 0;
        if (val > 0) byWeek[ws].push(val);
      });
    });

    return Object.entries(byWeek).sort(([a], [b]) => a.localeCompare(b)).slice(-8).map(([ws, vals]) => {
      const d = new Date(ws + 'T12:00:00');
      const avg = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
      const max = Math.round(Math.max(...vals) * 10) / 10;
      return { weekStart: ws, weekLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), avgValue: avg, maxValue: max };
    });
  }, [allSessionData, filterMetric, viewMode, selectedDay, fromDate, toDate, kpiPositionFilter, playerFilter, athletes]);

  const selectStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '7px 10px', color: 'var(--text)', fontFamily: 'var(--font-display)',
    fontWeight: 700, fontSize: 12, width: '100%',
  };

  // KPI values — computed dynamically from all active filters
  const filteredKpiMaxes: Record<MetricKey, KPIMax> = useMemo(() => {
    const result = {} as Record<MetricKey, KPIMax>;

    // Filter sessions by time period
    let filteredSessions = allSessionData;
    if (viewMode === 'day' && selectedDay) {
      filteredSessions = allSessionData.filter(s => s.act.id === selectedDay);
    } else if (viewMode === 'range' && fromDate && toDate) {
      const from = new Date(fromDate + 'T00:00:00').getTime();
      const to = new Date(toDate + 'T23:59:59').getTime();
      filteredSessions = allSessionData.filter(s => {
        const t = parseActivityDate(s.act.date).getTime();
        return t >= from && t <= to;
      });
    }

    // Position + player filters
    const allowedPos = kpiPositionFilter !== 'All' ? (POS_GROUP_MAP[kpiPositionFilter] ?? []) : null;

    KPI_CARDS.forEach(({ key }) => {
      const athVals: Record<string, number[]> = {};
      const athDates: Record<string, string> = {};

      filteredSessions.forEach(({ act, rows }) => {
        rows.forEach((row: Record<string, unknown>) => {
          const id = String(row.athlete_id ?? '');
          if (allowedPos) {
            const ath = athletes.find(a => a.id === id);
            const pos = (ath?.position ?? '').toUpperCase();
            if (!allowedPos.includes(pos)) return;
          }
          if (playerFilter !== 'All' && id !== playerFilter) return;
          const val = (rowToMetrics(row))[key] ?? 0;
          if (val <= 0) return;
          if (!athVals[id]) { athVals[id] = []; athDates[id] = act.date; }
          athVals[id].push(val);
          if (val >= Math.max(...athVals[id])) athDates[id] = act.date;
        });
      });

      if (displayMode === 'max') {
        // Max: top individual athlete's all-time max in filtered window
        let topValue = 0; let topName = '—'; let topDate = '';
        Object.entries(athVals).forEach(([id, vals]) => {
          const ath = athletes.find(a => a.id === id);
          if (!ath) return;
          const value = Math.max(...vals);
          if (value > topValue) { topValue = value; topName = ath.name; topDate = athDates[id] ?? ''; }
        });
        result[key] = { value: topValue > 0 ? Math.round(topValue * 100) / 100 : 0, athleteName: topValue > 0 ? topName : '—', date: topDate };
      } else {
        // Avg: team average — each athlete contributes their per-period average, then average across athletes
        const athAvgs: number[] = [];
        Object.values(athVals).forEach(vals => {
          athAvgs.push(vals.reduce((s, v) => s + v, 0) / vals.length);
        });
        const teamAvg = athAvgs.length > 0
          ? Math.round((athAvgs.reduce((s, v) => s + v, 0) / athAvgs.length) * 100) / 100
          : 0;
        result[key] = { value: teamAvg, athleteName: teamAvg > 0 ? `Team avg · ${athAvgs.length}` : '—', date: '' };
      }
    });

    return result;
  }, [allSessionData, athletes, viewMode, selectedDay, fromDate, toDate, kpiPositionFilter, playerFilter, displayMode]);

  // Determine which leaderboard to show
  const showFilterLeaderboard = activeKPI === '__filter__' as any;
  const displayedLeaderboard = showFilterLeaderboard ? filteredLeaderboard() : (activeKPI ? leaderboards[activeKPI] || [] : []);
  const displayedSessions = showFilterLeaderboard ? filterWeeklySessions() : (activeKPI ? weeklySessions[activeKPI] || [] : []);
  const displayedMetric = showFilterLeaderboard ? filterMetric : (activeKPI ?? 'playerLoad');

  if (loading) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} isRefreshing />
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 16 }}>
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 120, borderRadius: 12 }} />)}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} onRefresh={loadData} isRefreshing={isRefreshing} />
      <Ava isOpen={avaOpen} onClose={() => setAvaOpen(false)} />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '10px 12px' : '24px 16px', boxSizing: 'border-box', width: '100%' }}>

        {/* Status banner */}
        {connectionStatus === 'error' && (
          <div style={{ background: 'rgba(255,23,68,0.1)', border: '1px solid rgba(255,23,68,0.3)', borderRadius: 8, padding: isMobile ? '8px 12px' : '12px 16px', marginBottom: isMobile ? 12 : 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--red)', fontSize: 14 }}>⚠</span>
            <div style={{ fontWeight: 600, color: 'var(--red)', fontSize: isMobile ? 12 : 13 }}>API Connection Issue</div>
          </div>
        )}
        {connectionStatus === 'connected' && (
          <div style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.2)', borderRadius: 8, padding: isMobile ? '5px 12px' : '10px 16px', marginBottom: isMobile ? 8 : 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse-dot 2s infinite' }} />
              <span style={{ fontSize: isMobile ? 10 : 12, color: 'var(--green)', fontWeight: 600 }}>
                {isMobile ? `${athletes.length} athletes · ${lastUpdated}` : `Catapult API Connected · ${athletes.length} athletes loaded`}
              </span>
            </div>
            {!isMobile && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{lastUpdated}</span>}
          </div>
        )}

        {/* Header */}
        <div style={{ marginBottom: isMobile ? 8 : 16 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: isMobile ? 20 : 28, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1 }}>Team Overview</h1>
          {!isMobile && <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>All-time maximums · Click any card to view leaderboard</p>}
        </div>

        {/* ── Filter Bar — above KPIs ─────────────────────────────────────── */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: isMobile ? 12 : 14, overflow: 'hidden' }}>
          {/* Always-visible row: metric + toggle */}
          <div style={{ padding: isMobile ? '10px 14px' : '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', flexShrink: 0 }}>Metric</div>
            <select value={filterMetric} onChange={e => { setFilterMetric(e.target.value as MetricKey); setActiveKPI('__filter__' as any); }} style={{ ...selectStyle, flex: 1, maxWidth: isMobile ? '100%' : 280 }}>
              {Object.entries(METRIC_CONFIG).filter(([k]) => k !== 'profileMaxVelocity' && k !== 'maxVelocityPct').map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
            </select>
            <button
              onClick={() => setFiltersOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: filtersOpen ? 'var(--accent)' : 'var(--surface)', border: `1px solid ${filtersOpen ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, color: filtersOpen ? 'white' : 'var(--muted)', flexShrink: 0, transition: 'all 0.15s' }}>
              Filters
              <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: filtersOpen ? 'rotate(180deg)' : 'rotate(0deg)', fontSize: 10 }}>▾</span>
            </button>
          </div>

          {/* Expandable filters */}
          {filtersOpen && (
            <div style={{ borderTop: '1px solid var(--border)', padding: isMobile ? '12px 14px' : '14px 16px' }}>
              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Display mode */}
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Display</div>
                    <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      {(['max', 'avg'] as DisplayMode[]).map(m => (
                        <button key={m} onClick={() => setDisplayMode(m)} style={{ flex: 1, padding: '8px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', background: displayMode === m ? 'var(--accent)' : 'transparent', color: displayMode === m ? 'white' : 'var(--muted)' }}>
                          {m === 'max' ? 'Maximum' : 'Average'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* View mode */}
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Time Period</div>
                    <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      {([['alltime', 'All Time'], ['day', 'Single Day'], ['range', 'Range']] as [ViewMode, string][]).map(([m, label]) => (
                        <button key={m} onClick={() => setViewMode(m)} style={{ flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', background: viewMode === m ? 'var(--accent)' : 'transparent', color: viewMode === m ? 'white' : 'var(--muted)' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {viewMode === 'day' && (
                    <div>
                      <div style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 4 }}>Select Session ↓</div>
                      <select value={selectedDay} onChange={e => setSelectedDay(e.target.value)} style={{ ...selectStyle, border: '1px solid var(--accent)' }}>
                        {sessionOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  )}
                  {viewMode === 'range' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>From</div>
                        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box' as const, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, colorScheme: 'dark' } as React.CSSProperties} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>To</div>
                        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box' as const, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, colorScheme: 'dark' } as React.CSSProperties} />
                      </div>
                    </div>
                  )}
                  {/* Position filter */}
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Position</div>
                    <select value={kpiPositionFilter} onChange={e => { setKpiPositionFilter(e.target.value); setActiveKPI('__filter__' as any); }} style={selectStyle}>
                      {POSITION_GROUPS.map(g => <option key={g} value={g}>{g === 'All' ? 'All Positions' : g}</option>)}
                    </select>
                  </div>
                  {/* Player filter */}
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Player</div>
                    <select value={playerFilter} onChange={e => { setPlayerFilter(e.target.value); setActiveKPI('__filter__' as any); }} style={selectStyle}>
                      <option value="All">All</option>
                      {athletes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                /* Desktop filter row */
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
                  {/* Display mode */}
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Display</div>
                    <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      {(['max', 'avg'] as DisplayMode[]).map(m => (
                        <button key={m} onClick={() => setDisplayMode(m)} style={{ padding: '7px 16px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', background: displayMode === m ? 'var(--accent)' : 'transparent', color: displayMode === m ? 'white' : 'var(--muted)' }}>
                          {m === 'max' ? 'Maximum' : 'Average'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Time period */}
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Time Period</div>
                    <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      {([['alltime', 'All Time'], ['day', 'Single Day'], ['range', 'Date Range']] as [ViewMode, string][]).map(([m, label]) => (
                        <button key={m} onClick={() => setViewMode(m)} style={{ padding: '7px 14px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', background: viewMode === m ? 'var(--accent)' : 'transparent', color: viewMode === m ? 'white' : 'var(--muted)' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {viewMode === 'day' && (
                    <div style={{ minWidth: 220 }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Session</div>
                      <select value={selectedDay} onChange={e => setSelectedDay(e.target.value)} style={selectStyle}>
                        {sessionOptions.map(s => <option key={s.id} value={s.id}>{s.name} · {s.date}</option>)}
                      </select>
                    </div>
                  )}
                  {viewMode === 'range' && (
                    <>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>From</div>
                        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ ...selectStyle, width: 'auto', colorScheme: 'dark' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>To</div>
                        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ ...selectStyle, width: 'auto', colorScheme: 'dark' }} />
                      </div>
                    </>
                  )}
                  {/* Position */}
                  <div style={{ minWidth: 160 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Position</div>
                    <select value={kpiPositionFilter} onChange={e => { setKpiPositionFilter(e.target.value); setActiveKPI('__filter__' as any); }} style={selectStyle}>
                      {POSITION_GROUPS.map(g => <option key={g} value={g}>{g === 'All' ? 'All Positions' : g}</option>)}
                    </select>
                  </div>
                  {/* Player */}
                  <div style={{ minWidth: 180 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Player</div>
                    <select value={playerFilter} onChange={e => { setPlayerFilter(e.target.value); setActiveKPI('__filter__' as any); }} style={selectStyle}>
                      <option value="All">All Players</option>
                      {athletes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* KPI Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 0 : 14, marginBottom: isMobile ? 12 : 14, background: isMobile ? 'var(--card)' : undefined, border: isMobile ? '1px solid var(--border)' : undefined, borderRadius: isMobile ? 14 : undefined, overflow: isMobile ? 'hidden' : undefined }}>
          {KPI_CARDS.map(({ key, color }, idx) => (
            <div key={key} style={{ borderBottom: isMobile && idx < KPI_CARDS.length - 1 ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
              <KPICard metricKey={key} color={color}
                max={filteredKpiMaxes[key] || { value: 0, athleteName: '—', date: '' }}
                isActive={activeKPI === key}
                displayMode={displayMode}
                viewMode={viewMode}
                onClick={() => { setActiveKPI(key); setFilterMetric(key); }} />
            </div>
          ))}
        </div>

        {/* Leaderboard panel — always visible */}
        <LeaderboardPanel
          metricKey={displayedMetric}
          athletes={displayedLeaderboard}
          sessions={displayedSessions}
          displayMode={showFilterLeaderboard ? displayMode : 'max'}
          viewMode={viewMode}
          fromDate={fromDate}
          toDate={toDate} />

      </div>
    </div>
  );
}
