'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Ava from '@/components/Ava';
import { rowToMetrics, normalizeAthlete, normalizeActivity, parseActivityDate } from '@/lib/data';
import InjuryFlag from '@/components/InjuryFlag';

const POSITION_GROUPS = ['All', 'Offensive Line', 'Skill', 'Defensive Line', 'Linebackers', 'Secondary', 'Special Teams'];

const ACWR_CONFIG = {
  green:  { label: 'Optimal',  color: 'var(--green)',  bg: 'rgba(0,230,118,0.1)',  border: 'rgba(0,230,118,0.3)',  range: '0.8–1.3' },
  yellow: { label: 'Caution',  color: 'var(--yellow)', bg: 'rgba(255,214,0,0.1)',  border: 'rgba(255,214,0,0.3)',  range: '0.5–0.79' },
  red:    { label: 'At Risk',  color: 'var(--red)',    bg: 'rgba(255,23,68,0.1)',  border: 'rgba(255,23,68,0.3)',  range: '<0.5 or >1.3' },
};

function acwrStatus(acwr: number): 'green' | 'yellow' | 'red' {
  if (acwr >= 0.8 && acwr <= 1.3) return 'green';
  if (acwr >= 0.5) return 'yellow';
  return 'red';
}

function acwrCellStyle(val: number): { background: string; color: string } {
  if (val <= 0) return { background: 'transparent', color: 'var(--dim)' };
  if (val > 1.5)  return { background: 'rgba(255,23,68,0.28)',   color: '#ff3b3b' };
  if (val > 1.3)  return { background: 'rgba(255,214,0,0.22)',   color: '#ffd166' };
  if (val >= 0.8) return { background: 'rgba(0,230,118,0.18)',   color: '#06d6a0' };
  return                  { background: 'rgba(100,149,237,0.18)', color: '#4da6ff' };
}

// Calculate ACWR as of a specific date using only sessions up to that date
function calcACWRAsOf(
  history: { date: string; load: number }[],
  asOfDate: Date
): number {
  const dayMs = 86400000;
  const asOfTs = asOfDate.getTime();
  const sessions = history.filter(s => parseActivityDate(s.date).getTime() <= asOfTs);
  const acute = sessions
    .filter(s => asOfTs - parseActivityDate(s.date).getTime() <= 7 * dayMs)
    .reduce((sum, s) => sum + s.load, 0);
  const chronic = sessions
    .filter(s => asOfTs - parseActivityDate(s.date).getTime() <= 28 * dayMs)
    .reduce((sum, s) => sum + s.load, 0) / 4;
  return chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : 0;
}

interface AthleteReadiness {
  id: string; name: string; position: string; positionGroup: string;
  acwr: number; acwrStatus: 'green' | 'yellow' | 'red';
  acuteLoad: number; chronicLoad: number;
  daysSinceLastSession: number; notSeenFlag: boolean;
}

interface DayData {
  date: string; label: string; teamAvgPL: number;
  athleteLoads: Record<string, number>;
  activityId: string;
}

type StatusFilter = 'all' | 'green' | 'yellow' | 'red' | 'notseen' | 'under' | 'optimal' | 'high';

interface ReadinessCardProps {
  cardKey: string; label: string; subtitle: string; count: number;
  color: string; bg: string; border: string;
  tip: string; isActive: boolean;
  onClick: () => void;
}
function ReadinessCard({ cardKey, label, subtitle, count, color, bg, border, tip, isActive, onClick }: ReadinessCardProps) {
  const [tipOpen, setTipOpen] = useState(false);
  return (
    <div onClick={onClick}
      style={{ background: bg, border: `2px solid ${isActive ? color : border}`, borderRadius: 10, padding: 16, textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s', boxShadow: isActive ? `0 0 0 1px ${color}44` : 'none', position: 'relative' }}>
      {/* ? button */}
      <button
        onClick={e => { e.stopPropagation(); setTipOpen(v => !v); }}
        onBlur={() => setTipOpen(false)}
        style={{ position: 'absolute', top: 8, right: 8, width: 15, height: 15, borderRadius: '50%', background: tipOpen ? color : 'var(--surface)', border: `1px solid ${tipOpen ? color : 'var(--border)'}`, color: tipOpen ? 'white' : 'var(--muted)', fontSize: 9, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)' }}>?</button>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 36, color, lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>ACWR {subtitle}</div>
      {isActive && <div style={{ fontSize: 9, color, marginTop: 4, fontFamily: 'var(--font-display)', fontWeight: 700 }}>FILTERED ✕</div>}
      {tipOpen && (
        <div onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 50, background: '#0f1926', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', width: 260, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, textAlign: 'left', pointerEvents: 'none' }}>
          <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4, fontFamily: 'var(--font-display)' }}>{label} — ACWR {subtitle}</strong>
          {tip}
        </div>
      )}
    </div>
  );
}

function ReadinessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [athletes, setAthletes] = useState<AthleteReadiness[]>([]);
  const [athList, setAthList] = useState<{ id: string; name: string; position: string; positionGroup: string }[]>([]);
  const [loadHistories, setLoadHistories] = useState<Record<string, { date: string; load: number }[]>>({});
  const [days, setDays] = useState<DayData[]>([]);
  const [selectedGroup, setSelectedGroup] = useState(searchParams.get('group') || 'All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
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

      const list = (Array.isArray(athResult.data) ? athResult.data : []).map((a: Record<string, unknown>) => normalizeAthlete(a));
      setAthList(list);

      const activities = (actResult.data as Record<string, unknown>[]).map(normalizeActivity).slice(0, 30);

      const allSessionData: { date: string; activityId: string; rows: Record<string, unknown>[] }[] = [];
      await Promise.all(activities.map(act =>
        fetch('/api/stats', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parameters: ['total_player_load'], filters: [{ name: 'activity_id', comparison: '=', values: [act.id] }], group_by: ['athlete'] }),
        }).then(r => r.json())
          .then(result => { allSessionData.push({ date: act.date, activityId: act.id, rows: Array.isArray(result.data) ? result.data : [] }); })
          .catch(() => {})
      ));

      const byDate: Record<string, { loads: number[]; athleteLoads: Record<string, number>; activityId: string }> = {};
      const loadHistory: Record<string, { date: string; load: number }[]> = {};
      const lastSeen: Record<string, string> = {};

      allSessionData.forEach(({ date, activityId, rows }) => {
        if (!byDate[date]) byDate[date] = { loads: [], athleteLoads: {}, activityId };
        rows.forEach((row: Record<string, unknown>) => {
          const id = String(row.athlete_id ?? '');
          const metrics = rowToMetrics(row);
          const load = metrics.playerLoad ?? 0;
          if (load > 0) {
            byDate[date].loads.push(load);
            byDate[date].athleteLoads[id] = (byDate[date].athleteLoads[id] ?? 0) + load;
            if (!loadHistory[id]) loadHistory[id] = [];
            loadHistory[id].push({ date, load });
            if (!lastSeen[id] || parseActivityDate(date) > parseActivityDate(lastSeen[id])) lastSeen[id] = date;
          }
        });
      });

      setLoadHistories(loadHistory);

      const dayList: DayData[] = Object.entries(byDate)
        .sort(([a], [b]) => parseActivityDate(b).getTime() - parseActivityDate(a).getTime())
        .map(([date, { loads, athleteLoads, activityId }]) => {
          const d = parseActivityDate(date);
          return {
            date,
            label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
            teamAvgPL: loads.length > 0 ? Math.round(loads.reduce((s, v) => s + v, 0) / loads.length * 10) / 10 : 0,
            athleteLoads,
            activityId,
          };
        });
      setDays(dayList);

      // Current ACWR per athlete
      const now = Date.now();
      const dayMs = 86400000;
      const readiness: AthleteReadiness[] = list.map((a: { id: string; name: string; position: string; positionGroup: string }) => {
        const history = loadHistory[a.id] || [];
        const dayMs2 = 86400000;
        const acute = history.filter(s => now - parseActivityDate(s.date).getTime() <= 7 * dayMs2).reduce((sum, s) => sum + s.load, 0);
        const chronic = history.filter(s => now - parseActivityDate(s.date).getTime() <= 28 * dayMs2).reduce((sum, s) => sum + s.load, 0) / 4;
        const acwr = chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : 0;
        const ls = lastSeen[a.id];
        const daysSince = ls ? Math.floor((now - parseActivityDate(ls).getTime()) / dayMs) : 999;
        return {
          id: a.id, name: a.name, position: a.position, positionGroup: a.positionGroup,
          acwr, acwrStatus: acwrStatus(acwr),
          acuteLoad: Math.round(acute * 10) / 10,
          chronicLoad: Math.round(chronic * 10) / 10,
          daysSinceLastSession: daysSince,
          notSeenFlag: daysSince >= 4,
        };
      });
      setAthletes(readiness.sort((a, b) => b.acwr - a.acwr));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setIsRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // All athletes for counts (unfiltered by status)
  const byGroup = selectedGroup === 'All' ? athletes : athletes.filter(a => a.positionGroup === selectedGroup);
  const green   = byGroup.filter(a => a.acwrStatus === 'green');
  const yellow  = byGroup.filter(a => a.acwrStatus === 'yellow');
  const red     = byGroup.filter(a => a.acwrStatus === 'red');
  const notSeen = byGroup.filter(a => a.notSeenFlag);

  // Apply status filter on top
  const filtered = statusFilter === 'all'     ? byGroup
    : statusFilter === 'under'   ? byGroup.filter(a => a.acwr > 0 && a.acwr < 0.8)
    : statusFilter === 'optimal' ? byGroup.filter(a => a.acwr >= 0.8 && a.acwr <= 1.3)
    : statusFilter === 'high'    ? byGroup.filter(a => a.acwr > 1.3)
    : statusFilter === 'green'   ? green
    : statusFilter === 'yellow'  ? yellow
    : statusFilter === 'red'     ? red
    : notSeen;

  const filteredIds = new Set(filtered.map(a => a.id));
  const filteredList = athList.filter(a => filteredIds.has(a.id));

  const chartDays = days.slice(0, 20).reverse();
  const maxPL = Math.max(...days.map(d => d.teamAvgPL), 1);

  if (loading) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} isRefreshing />
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
      </div>
    </div>
  );

  const statusOrder = { red: 0, yellow: 1, green: 2 };

  // Single sorted list — filtered by status if active, full list if not
  const displayList = filtered.sort((a, b) => {
    if (statusFilter !== 'all') return b.acwr - a.acwr;
    // Default: sort by risk first (red → yellow → green), then by ACWR desc within group
    const orderDiff = statusOrder[a.acwrStatus] - statusOrder[b.acwrStatus];
    return orderDiff !== 0 ? orderDiff : b.acwr - a.acwr;
  });

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} onRefresh={loadData} isRefreshing={isRefreshing} />
      <Ava isOpen={avaOpen} onClose={() => setAvaOpen(false)} />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Readiness</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>ACWR · Acute:Chronic Workload Ratio · {byGroup.length} athletes</p>
          </div>
          <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
            {POSITION_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Clickable summary boxes — match ACWR legend colors */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {([
            {
              key: 'under', label: 'Under-Training', subtitle: '<0.8',
              count: byGroup.filter(a => a.acwr > 0 && a.acwr < 0.8).length,
              color: '#4da6ff', bg: 'rgba(100,149,237,0.15)', border: 'rgba(100,149,237,0.35)',
              tip: 'Acute:Chronic Workload Ratio below 0.8 indicates an athlete is under-prepared relative to their recent training history. Their current week\'s load is significantly lower than their 4-week average. This can increase injury risk when load suddenly spikes, and may indicate the athlete needs increased exposure to maintain fitness.',
            },
            {
              key: 'optimal', label: 'Optimal', subtitle: '0.8–1.3',
              count: byGroup.filter(a => a.acwr >= 0.8 && a.acwr <= 1.3).length,
              color: '#06d6a0', bg: 'rgba(0,230,118,0.15)', border: 'rgba(0,230,118,0.35)',
              tip: 'Acute:Chronic Workload Ratio between 0.8 and 1.3 is the optimal preparation zone. The athlete\'s current week load is well-matched to their 4-week training history. Research by Gabbett (2016) identifies this range as the "sweet spot" — athletes in this zone have the lowest injury rates and are best prepared for competition.',
            },
            {
              key: 'high', label: 'High Risk', subtitle: '>1.3',
              count: byGroup.filter(a => a.acwr > 1.3).length,
              color: '#ff3b3b', bg: 'rgba(255,23,68,0.15)', border: 'rgba(255,23,68,0.35)',
              tip: 'Acute:Chronic Workload Ratio above 1.3 indicates the athlete\'s current week load is significantly higher than their 4-week average — a "spike" in workload. Catapult research identifies ACWR >1.5 as High Risk. Athletes in this zone have a substantially elevated injury probability. Consider load reduction, extra recovery monitoring, and communication with medical staff.',
            },
          ] as const).map(item => (
            <ReadinessCard
              key={item.key}
              cardKey={item.key}
              label={item.label}
              subtitle={item.subtitle}
              count={item.count}
              color={item.color}
              bg={item.bg}
              border={item.border}
              tip={item.tip}
              isActive={statusFilter === item.key}
              onClick={() => setStatusFilter(statusFilter === item.key ? 'all' : item.key as StatusFilter)}
            />
          ))}
        </div>

        {/* Team PL Bar Chart */}
        {chartDays.length > 0 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 20px 12px', marginTop: 28, marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Team Avg Player Load — by Session</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>Latest session right · bars = team avg PL</div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 140 }}>
              {chartDays.map(day => {
                const h = maxPL > 0 ? (day.teamAvgPL / maxPL) * 120 : 2;
                return (
                  <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{day.teamAvgPL > 0 ? day.teamAvgPL.toFixed(0) : ''}</div>
                    <div style={{ width: '100%', height: `${Math.max(h, 2)}px`, background: 'var(--accent)', borderRadius: '3px 3px 0 0', opacity: 0.85 }} />
                    <div style={{ fontSize: 8, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.3, writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 40 }}>
                      {day.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ACWR History Table */}
        {days.length > 0 && filteredList.length > 0 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13 }}>
                A:C Ratio by Date
                {statusFilter !== 'all' && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', fontWeight: 500 }}>— filtered</span>}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[
                  { label: 'Under-Training (<0.8)', color: '#4da6ff', bg: 'rgba(100,149,237,0.18)' },
                  { label: 'Optimal (0.8–1.3)',     color: '#06d6a0', bg: 'rgba(0,230,118,0.18)' },
                  { label: 'Fair (1.3–1.5)',         color: '#ffd166', bg: 'rgba(255,214,0,0.22)' },
                  { label: 'High Risk (>1.5)',       color: '#ff3b3b', bg: 'rgba(255,23,68,0.28)' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: item.bg, border: `1px solid ${item.color}44` }} />
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <th style={{ padding: '9px 14px', textAlign: 'left', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', left: 0, zIndex: 3, whiteSpace: 'nowrap', minWidth: 140 }}>Athlete</th>
                    <th style={{ padding: '9px 12px', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)', borderBottom: '1px solid var(--border)', background: 'var(--surface)', whiteSpace: 'nowrap' }}>Current</th>
                    {days.map(day => (
                      <th key={day.date} style={{ padding: '9px 10px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 10, color: 'var(--muted)', borderBottom: '1px solid var(--border)', background: 'var(--surface)', whiteSpace: 'nowrap' }}>
                        {day.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((ath, i) => {
                    const readinessData = athletes.find(a => a.id === ath.id);
                    const currentACWR = readinessData?.acwr ?? 0;
                    const currentStyle = acwrCellStyle(currentACWR);
                    const history = loadHistories[ath.id] || [];
                    return (
                      <tr key={ath.id}
                        style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}>
                        {/* Athlete name + position inline — clickable */}
                        <td style={{ padding: '5px 14px', position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button onClick={() => router.push(`/player?id=${ath.id}`)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 12, padding: 0, textAlign: 'left', fontFamily: 'inherit' }}>
                              {ath.name}
                            </button>
                            <InjuryFlag athleteId={ath.id} athleteName={ath.name} />
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--muted)' }}>{ath.position}</span>
                        </td>
                        {/* Current ACWR */}
                        <td style={{ padding: '5px 10px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, background: currentStyle.background, color: currentStyle.color, cursor: 'pointer' }}
                          onClick={() => router.push(`/player?id=${ath.id}`)}>
                          {currentACWR > 0 ? currentACWR.toFixed(2) : '—'}
                        </td>
                        {/* Historical ACWR per day */}
                        {days.map(day => {
                          const asOf = parseActivityDate(day.date);
                          const acwr = calcACWRAsOf(history, asOf);
                          const hadSession = (day.athleteLoads[ath.id] ?? 0) > 0;
                          const style = hadSession ? acwrCellStyle(acwr) : { background: 'transparent', color: 'var(--dim)' };
                          return (
                            <td key={day.date}
                              onClick={() => router.push(`/player?id=${ath.id}${hadSession && day.activityId ? `&session=${day.activityId}` : ''}`)}
                              style={{ padding: '5px 10px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: hadSession ? 600 : 400, cursor: 'pointer', ...style }}>
                              {hadSession && acwr > 0 ? acwr.toFixed(2) : '—'}
                            </td>
                          );
                        })}
                      </tr>
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

export default function Readiness() {
  return <Suspense fallback={<div style={{ background: 'var(--bg)', minHeight: '100vh' }} />}><ReadinessContent /></Suspense>;
}
