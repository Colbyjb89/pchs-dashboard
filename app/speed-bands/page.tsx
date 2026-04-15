'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Ava from '@/components/Ava';
import { SPEED_SLUGS, rowToMetrics, normalizeAthlete, normalizeActivity, weekStart, parseActivityDate } from '@/lib/data';
import InjuryFlag from '@/components/InjuryFlag';

const POSITION_GROUPS = ['All', 'Offensive Line', 'Skill', 'Defensive Line', 'Linebackers', 'Secondary', 'Special Teams'];

const VB4_TOOLTIP = `VB4 — High Speed Yards\n\nDistance covered (yards) at velocities in Band 4 (typically 65–85% of max velocity). Accumulated across all sessions in the selected week.\n\nTarget range = 120–160% of the athlete's best single-session VB4 output.`;
const VB7_TOOLTIP = `VB7 — Max Velocity Efforts\n\nNumber of efforts reaching Band 7 speed (>85% of max velocity) in the selected week.\n\nTarget: 2–5 efforts per week. Under 2 = under-exposed. Over 5 = potential overload risk.`;

interface SpeedBandRow {
  athleteId: string; athleteName: string; position: string; positionGroup: string;
  band4WeeklyYards: number; band4BestSession: number; band4Floor: number; band4Ceiling: number;
  band4Status: 'under' | 'on-track' | 'over';
  band7WeeklyEfforts: number; band7ProfileMax: number;
  band7Status: 'under' | 'on-track' | 'over';
}

const STATUS_META = {
  'under':    { label: 'Under',    color: '#4da6ff', bg: 'rgba(77,166,255,0.12)',  border: 'rgba(77,166,255,0.3)' },
  'on-track': { label: 'On Track', color: '#06d6a0', bg: 'rgba(6,214,160,0.12)',   border: 'rgba(6,214,160,0.3)' },
  'over':     { label: 'Over',     color: '#ff3b3b', bg: 'rgba(255,59,59,0.12)',   border: 'rgba(255,59,59,0.3)' },
};

function KPICard({ label, value, color, bg, border, sub, tip }: {
  label: string; value: number; color: string; bg: string; border: string; sub: string; tip: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '12px 16px', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 30, color, lineHeight: 1 }}>{value}</div>
        <button onClick={() => setOpen(v => !v)} onBlur={() => setOpen(false)}
          style={{ width: 15, height: 15, borderRadius: '50%', background: open ? color : 'var(--surface)', border: `1px solid ${open ? color : 'var(--border)'}`, color: open ? 'white' : 'var(--muted)', fontSize: 9, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'var(--font-display)' }}>?</button>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{sub}</div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 50, background: '#0f1926', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', width: 260, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
          {tip.split('\n').map((line, i) => (
            <p key={i} style={{ margin: 0, marginBottom: line === '' ? 6 : 2, fontSize: i === 0 ? 11 : 10, fontWeight: i === 0 ? 800 : 400, color: i === 0 ? color : 'var(--muted)', fontFamily: i === 0 ? 'var(--font-display)' : 'inherit', lineHeight: 1.5 }}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}


function Tooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        onClick={() => setOpen(v => !v)}
        onBlur={() => setOpen(false)}
        style={{ width: 15, height: 15, borderRadius: '50%', background: open ? 'var(--accent)' : 'var(--surface)', border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`, color: open ? 'white' : 'var(--muted)', fontSize: 9, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0, fontFamily: 'var(--font-display)' }}>
        ?
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 50, background: '#0f1926', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', width: 260, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', pointerEvents: 'none' }}>
          {text.split('\n').map((line, i) => (
            <p key={i} style={{ margin: 0, marginBottom: line === '' ? 6 : 2, fontSize: i === 0 ? 11 : 10, fontWeight: i === 0 ? 800 : 400, color: i === 0 ? 'var(--text)' : 'var(--muted)', fontFamily: i === 0 ? 'var(--font-display)' : 'inherit', lineHeight: 1.5 }}>{line}</p>
          ))}
        </div>
      )}
    </span>
  );
}

function StatusBadge({ status }: { status: 'under' | 'on-track' | 'over' }) {
  const m = STATUS_META[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: m.bg, border: `1px solid ${m.border}`, borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700, color: m.color, fontFamily: 'var(--font-display)', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

function ProgressBar({ value, floor, ceiling }: { value: number; floor: number; ceiling: number }) {
  const max = ceiling * 1.1;
  const valPct   = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const floorPct = max > 0 ? (floor / max) * 100 : 0;
  const ceilPct  = max > 0 ? Math.min((ceiling / max) * 100, 100) : 0;
  let barColor = '#4da6ff';
  if (value >= floor && value <= ceiling) barColor = '#06d6a0';
  else if (value > ceiling) barColor = '#ff3b3b';
  return (
    <div style={{ position: 'relative', height: 6, background: 'var(--surface)', borderRadius: 4, overflow: 'visible', minWidth: 80 }}>
      {/* Target zone highlight */}
      <div style={{ position: 'absolute', left: `${floorPct}%`, width: `${ceilPct - floorPct}%`, top: 0, bottom: 0, background: 'rgba(6,214,160,0.15)', borderRadius: 2 }} />
      {/* Value bar */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${valPct}%`, background: barColor, borderRadius: 4, transition: 'width 0.3s' }} />
      {/* Floor marker */}
      <div style={{ position: 'absolute', left: `${floorPct}%`, top: -2, bottom: -2, width: 2, background: 'rgba(6,214,160,0.6)', borderRadius: 1 }} />
    </div>
  );
}

function Band7Bar({ efforts }: { efforts: number }) {
  const target = 5;
  const max = Math.max(efforts, target + 1);
  const pct = (efforts / max) * 100;
  let color = '#4da6ff';
  if (efforts >= 2 && efforts <= 5) color = '#06d6a0';
  else if (efforts > 5) color = '#ff3b3b';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 80 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--surface)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', left: `${(2 / max) * 100}%`, width: `${((5 - 2) / max) * 100}%`, top: 0, bottom: 0, background: 'rgba(6,214,160,0.15)' }} />
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color, minWidth: 18, textAlign: 'right' }}>{efforts}</span>
    </div>
  );
}

function SpeedBandsContent() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<SpeedBandRow[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [availableWeeks, setAvailableWeeks] = useState<{ ws: string; label: string }[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
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

      const athletes = (Array.isArray(athResult.data) ? athResult.data : []).map((a: Record<string, unknown>) => normalizeAthlete(a));
      const athleteMap: Record<string, { position: string; positionGroup: string }> = {};
      athletes.forEach((a: { id: string; position: string; positionGroup: string }) => { athleteMap[a.id] = { position: a.position, positionGroup: a.positionGroup }; });

      const activities = (actResult.data as Record<string, unknown>[]).map(normalizeActivity).slice(0, 20);

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
      setAvailableWeeks(weeks);

      const targetWeek = selectedWeek || weeks[0]?.ws || weekStart(new Date());
      if (!selectedWeek && weeks[0]) setSelectedWeek(weeks[0].ws);

      const allSessions: { date: string; rows: Record<string, unknown>[]; ws: string }[] = [];
      await Promise.all(activities.map(act =>
        fetch('/api/stats', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parameters: SPEED_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [act.id] }], group_by: ['athlete'] }),
        }).then(r => r.json()).then(result => {
          const d = parseActivityDate(act.date);
          allSessions.push({ date: act.date, rows: Array.isArray(result.data) ? result.data : [], ws: weekStart(d) });
        }).catch(() => {})
      ));

      const athData: Record<string, { band4Week: number; band4BestSession: number; band7Week: number; profileMax: number }> = {};
      allSessions.forEach(({ ws, rows: sessionRows }) => {
        const isTargetWeek = ws === targetWeek;
        sessionRows.forEach((row: Record<string, unknown>) => {
          const id = String(row.athlete_id ?? '');
          if (!athData[id]) athData[id] = { band4Week: 0, band4BestSession: 0, band7Week: 0, profileMax: 0 };
          const metrics = rowToMetrics(row);
          const b4 = metrics.velocityBand4Distance ?? 0;
          const b7 = metrics.velocityBand7Efforts ?? 0;
          const pmax = metrics.profileMaxVelocity ?? 0;
          if (b4 > athData[id].band4BestSession) athData[id].band4BestSession = b4;
          if (pmax > athData[id].profileMax) athData[id].profileMax = pmax;
          if (isTargetWeek) { athData[id].band4Week += b4; athData[id].band7Week += b7; }
        });
      });

      const speedRows: SpeedBandRow[] = athletes.map((a: { id: string; name: string; position: string; positionGroup: string }) => {
        const d = athData[a.id] || { band4Week: 0, band4BestSession: 0, band7Week: 0, profileMax: 0 };
        const floor = Math.round(d.band4BestSession * 1.2 * 10) / 10;
        const ceiling = Math.round(d.band4BestSession * 1.6 * 10) / 10;
        let band4Status: 'under' | 'on-track' | 'over' = 'under';
        if (d.band4Week >= floor && d.band4Week <= ceiling) band4Status = 'on-track';
        else if (d.band4Week > ceiling) band4Status = 'over';
        let band7Status: 'under' | 'on-track' | 'over' = 'under';
        if (d.band7Week >= 2 && d.band7Week <= 5) band7Status = 'on-track';
        else if (d.band7Week > 5) band7Status = 'over';
        return {
          athleteId: a.id, athleteName: a.name, position: a.position, positionGroup: a.positionGroup,
          band4WeeklyYards: Math.round(d.band4Week * 10) / 10,
          band4BestSession: Math.round(d.band4BestSession * 10) / 10,
          band4Floor: floor, band4Ceiling: ceiling, band4Status,
          band7WeeklyEfforts: d.band7Week,
          band7ProfileMax: Math.round(d.profileMax * 10) / 10,
          band7Status,
        };
      }).filter((r: SpeedBandRow) => r.band4BestSession > 0 || r.band7ProfileMax > 0);

      setRows(speedRows);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setIsRefreshing(false); }
  }, [selectedWeek]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = selectedGroup === 'All' ? rows : rows.filter(r => r.positionGroup === selectedGroup);

  // Summary counts
  const vb4OnTrack  = filtered.filter(r => r.band4Status === 'on-track').length;
  const vb4Under    = filtered.filter(r => r.band4Status === 'under').length;
  const vb7OnTrack  = filtered.filter(r => r.band7Status === 'on-track').length;
  const vb7Under    = filtered.filter(r => r.band7Status === 'under').length;

  const selectStyle: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '8px 14px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
  };

  const thStyle: React.CSSProperties = {
    padding: '10px 14px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10,
    letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)',
    borderBottom: '1px solid var(--border)', background: 'var(--surface)',
    textAlign: 'left', whiteSpace: 'nowrap',
  };

  if (loading) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} isRefreshing />
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        <div className="skeleton" style={{ height: 400, borderRadius: 12 }} />
      </div>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} onRefresh={loadData} isRefreshing={isRefreshing} />
      <Ava isOpen={avaOpen} onClose={() => setAvaOpen(false)} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '12px 12px' : '20px 16px' }}>

        {/* Header */}
        {isMobile ? (
          <div style={{ marginBottom: 12 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1, marginBottom: 10 }}>Bands</h1>
            {/* Mobile filter card */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Week</div>
                <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
                  style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
                  {availableWeeks.map(w => <option key={w.ws} value={w.ws}>{w.label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Position Group</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {POSITION_GROUPS.map(g => (
                    <button key={g} onClick={() => setSelectedGroup(g)}
                      style={{ padding: '6px 12px', borderRadius: 20, border: `1px solid ${selectedGroup === g ? 'var(--accent)' : 'var(--border)'}`, background: selectedGroup === g ? 'var(--accent)' : 'var(--surface)', color: selectedGroup === g ? 'white' : 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, cursor: 'pointer', transition: 'all 0.15s' }}>
                      {g === 'All' ? 'All' : g.replace('Offensive Line', 'OL').replace('Defensive Line', 'DL').replace('Linebackers', 'LB').replace('Secondary', 'DB').replace('Special Teams', 'ST')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Bands</h1>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Weekly speed exposure · VB4 High Speed Yards · VB7 Max Velocity Efforts</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)} style={selectStyle}>
                {availableWeeks.map(w => <option key={w.ws} value={w.ws}>{w.label}</option>)}
              </select>
              <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} style={selectStyle}>
                {POSITION_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Summary KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            {
              label: 'VB4 On Track', value: vb4OnTrack, color: '#06d6a0', bg: 'rgba(6,214,160,0.1)', border: 'rgba(6,214,160,0.25)',
              sub: 'In target range',
              tip: 'VB4 — High Speed Yards (70–90% Max Velocity)\n\nOn Track means this athlete accumulated HSY within the target window: 1.2–1.6× their best single-session VB4 output.\n\nThis range ensures enough high-speed stimulus without overloading.',
            },
            {
              label: 'VB4 Under', value: vb4Under, color: '#4da6ff', bg: 'rgba(77,166,255,0.1)', border: 'rgba(77,166,255,0.25)',
              sub: 'Below 1.2× best session',
              tip: 'VB4 — High Speed Yards (70–90% Max Velocity)\n\nUnder means this athlete\'s weekly HSY accumulation is below the floor (1.2× their best single-session output).\n\nInsufficient high-speed exposure — consider adding speed work.',
            },
            {
              label: 'VB4 Over', value: filtered.filter(r => r.band4Status === 'over').length, color: '#ff3b3b', bg: 'rgba(255,59,59,0.1)', border: 'rgba(255,59,59,0.25)',
              sub: 'Exceeded 1.6× best session',
              tip: 'VB4 — High Speed Yards (70–90% Max Velocity)\n\nOver means this athlete\'s weekly HSY exceeded the ceiling (1.6× their best single-session output).\n\nExcess high-speed volume — monitor for fatigue and soft tissue risk.',
            },
            {
              label: 'VB7 On Track', value: vb7OnTrack, color: '#06d6a0', bg: 'rgba(6,214,160,0.1)', border: 'rgba(6,214,160,0.25)',
              sub: '2–5 efforts this week',
              tip: 'VB7 — Max Velocity Efforts (90%+ Max Velocity)\n\nOn Track means this athlete reached near-max sprint speed 2–5 times this week.\n\nThis range provides adequate neuromuscular stimulus for speed maintenance without overexposure.',
            },
            {
              label: 'VB7 Under', value: vb7Under, color: '#4da6ff', bg: 'rgba(77,166,255,0.1)', border: 'rgba(77,166,255,0.25)',
              sub: 'Fewer than 2 efforts',
              tip: 'VB7 — Max Velocity Efforts (90%+ Max Velocity)\n\nUnder means this athlete reached near-max sprint speed fewer than 2 times this week.\n\nInsufficient max-velocity exposure — speed qualities may deteriorate without regular high-intensity efforts.',
            },
            {
              label: 'VB7 Over', value: filtered.filter(r => r.band7Status === 'over').length, color: '#ff3b3b', bg: 'rgba(255,59,59,0.1)', border: 'rgba(255,59,59,0.25)',
              sub: 'More than 5 efforts',
              tip: 'VB7 — Max Velocity Efforts (90%+ Max Velocity)\n\nOver means this athlete reached near-max sprint speed more than 5 times this week.\n\nExcessive max-velocity exposure — high CNS and soft tissue stress. Monitor recovery closely.',
            },
          ].map(item => (
            <KPICard key={item.label} {...item} />
          ))}
        </div>

        {/* Main table */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {isMobile ? (
            /* Mobile: compact table — sticky name col, VB4 with target, VB7 as x/5 */
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 360 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, position: 'sticky', top: 0, left: 0, zIndex: 5, minWidth: 120, textAlign: 'left' }}>Athlete</th>
                    <th style={{ ...thStyle, position: 'sticky', top: 0, zIndex: 3, borderLeft: '2px solid var(--border)', textAlign: 'center' }}>
                      <span style={{ color: '#4da6ff' }}>VB4</span> <span style={{ color: 'var(--dim)', fontSize: 9 }}>yds</span>
                    </th>
                    <th style={{ ...thStyle, position: 'sticky', top: 0, zIndex: 3, textAlign: 'center', fontSize: 9 }}>Target</th>
                    <th style={{ ...thStyle, position: 'sticky', top: 0, zIndex: 3, borderLeft: '2px solid var(--border)', textAlign: 'center' }}>
                      <span style={{ color: '#7c4dff' }}>VB7</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => {
                    const vb4Color = row.band4Status === 'on-track' ? '#06d6a0' : row.band4Status === 'over' ? '#ff3b3b' : '#4da6ff';
                    const vb7Color = row.band7Status === 'on-track' ? '#06d6a0' : row.band7Status === 'over' ? '#ff3b3b' : '#4da6ff';
                    return (
                      <tr key={row.athleteId}
                        style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                        <td style={{ padding: '9px 12px', position: 'sticky', left: 0, background: '#0f1923', zIndex: 1, whiteSpace: 'nowrap', boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}>
                          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {row.athleteName}
                            <InjuryFlag athleteId={row.athleteId} athleteName={row.athleteName} />
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{row.position}</div>
                        </td>
                        <td style={{ padding: '9px 10px', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: vb4Color, borderLeft: '2px solid var(--border)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {row.band4WeeklyYards > 0 ? row.band4WeeklyYards.toFixed(0) : '—'}
                        </td>
                        <td style={{ padding: '9px 8px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {row.band4Floor > 0 ? `${row.band4Floor.toFixed(0)}–${row.band4Ceiling.toFixed(0)}` : '—'}
                        </td>
                        <td style={{ padding: '9px 10px', borderLeft: '2px solid var(--border)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: vb7Color }}>
                            {row.band7WeeklyEfforts}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>/5</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Desktop: full table with progress bars */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, minWidth: 160, position: 'sticky', left: 0, zIndex: 2 }}>Athlete</th>
                    <th style={{ ...thStyle, borderLeft: '2px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ color: '#4da6ff' }}>VB4</span>
                        <span style={{ color: 'var(--dim)' }}>HSY</span>
                        <Tooltip text={VB4_TOOLTIP} />
                      </div>
                    </th>
                    <th style={{ ...thStyle, minWidth: 130 }}>Progress</th>
                    <th style={{ ...thStyle }}>Target</th>
                    <th style={{ ...thStyle }}>Status</th>
                    <th style={{ ...thStyle, borderLeft: '2px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ color: '#7c4dff' }}>VB7</span>
                        <span style={{ color: 'var(--dim)' }}>Efforts</span>
                        <Tooltip text={VB7_TOOLTIP} />
                      </div>
                    </th>
                    <th style={{ ...thStyle, minWidth: 110 }}>Progress</th>
                    <th style={{ ...thStyle }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={row.athleteId}
                      style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.04)')}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}>
                      <td style={{ padding: '10px 14px', position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1, whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {row.athleteName}
                          <InjuryFlag athleteId={row.athleteId} athleteName={row.athleteName} />
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{row.position}</div>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: row.band4Status === 'on-track' ? '#06d6a0' : row.band4Status === 'over' ? '#ff3b3b' : '#4da6ff', borderLeft: '2px solid var(--border)', whiteSpace: 'nowrap' }}>
                        {row.band4WeeklyYards > 0 ? row.band4WeeklyYards.toFixed(0) : '—'}
                        <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400, marginLeft: 3 }}>yds</span>
                      </td>
                      <td style={{ padding: '10px 14px', minWidth: 130 }}>
                        <ProgressBar value={row.band4WeeklyYards} floor={row.band4Floor} ceiling={row.band4Ceiling} />
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {row.band4Floor > 0 ? `${row.band4Floor.toFixed(0)}–${row.band4Ceiling.toFixed(0)}` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <StatusBadge status={row.band4Status} />
                      </td>
                      <td style={{ padding: '10px 14px', borderLeft: '2px solid var(--border)' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: row.band7Status === 'on-track' ? '#06d6a0' : row.band7Status === 'over' ? '#ff3b3b' : '#4da6ff' }}>
                          {row.band7WeeklyEfforts}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', minWidth: 110 }}>
                        <Band7Bar efforts={row.band7WeeklyEfforts} />
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <StatusBadge status={row.band7Status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend footer */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Legend</span>
            {[
              { color: '#4da6ff', bg: 'rgba(77,166,255,0.12)',  label: 'Under target' },
              { color: '#06d6a0', bg: 'rgba(6,214,160,0.12)',   label: 'On track' },
              { color: '#ff3b3b', bg: 'rgba(255,59,59,0.12)',   label: 'Over target' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 28, height: 6, background: item.color, borderRadius: 3, opacity: 0.85 }} />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{item.label}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
              <div style={{ width: 20, height: 6, background: 'rgba(6,214,160,0.2)', border: '1px solid rgba(6,214,160,0.4)', borderRadius: 3 }} />
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>Target zone (1.2–1.6× best session)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 2, height: 10, background: 'rgba(6,214,160,0.7)', borderRadius: 1 }} />
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>Floor marker</span>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--dim)' }}>VB7 target: 2–5 efforts/week</div>
          </div>
        </div>
      </div>
    </div>
  );
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

export default function SpeedBands() {
  return <Suspense fallback={<div style={{ background: 'var(--bg)', minHeight: '100vh' }} />}><SpeedBandsContent /></Suspense>;
}
