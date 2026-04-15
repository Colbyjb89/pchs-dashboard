'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Ava from '@/components/Ava';
import { ALL_SLUGS, rowToMetrics, normalizeAthlete, normalizeActivity, parseActivityDate } from '@/lib/data';
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

// ─── Same 5-band intensity colors used across all pages ───────────────────────
function getBarColor(avgLoad: number, seasonMax: number, isGame: boolean): string {
  if (isGame) return '#ffffff';
  if (seasonMax <= 0 || avgLoad <= 0) return '#4da6ff';
  const pct = (avgLoad / seasonMax) * 100;
  if (pct >= 90) return '#ff3b3b';
  if (pct >= 75) return '#ff8c42';
  if (pct >= 60) return '#ffd166';
  if (pct >= 40) return '#06d6a0';
  return '#4da6ff';
}

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

const POSITION_ORDER = ['O Skill', 'D Skill', 'Corners', 'Linebackers', 'O Line', 'D Line', 'Kicker', 'Other'];

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

function getCustomGroup(position: string): string {
  const p = position.toUpperCase().trim();
  if (['QB', 'WR', 'RB', 'HB', 'FB', 'TE', 'SB'].includes(p)) return 'O Skill';
  if (['CB', 'DB'].includes(p)) return 'Corners';
  if (['S', 'SS', 'FS', 'SAF'].includes(p)) return 'D Skill';
  if (['LB', 'OLB', 'ILB', 'MLB', 'WILL', 'MIKE', 'SAM'].includes(p)) return 'Linebackers';
  if (['OL', 'C', 'OG', 'OT', 'LT', 'RT', 'LG', 'RG'].includes(p)) return 'O Line';
  if (['DL', 'DE', 'DT', 'NT', 'NG'].includes(p)) return 'D Line';
  if (['DCB', 'NICKEL', 'DIME'].includes(p)) return 'Corners';
  if (['K', 'P', 'LS', 'KR', 'PR'].includes(p)) return 'Kicker';
  return 'Other';
}

function calcACWRAsOf(history: { date: string; load: number }[], asOfDate: Date): number {
  const dayMs = 86400000;
  const asOfTs = asOfDate.getTime();
  const sessions = history.filter(s => parseActivityDate(s.date).getTime() <= asOfTs);
  const acute = sessions.filter(s => asOfTs - parseActivityDate(s.date).getTime() <= 7 * dayMs).reduce((sum, s) => sum + s.load, 0);
  const chronic = sessions.filter(s => asOfTs - parseActivityDate(s.date).getTime() <= 28 * dayMs).reduce((sum, s) => sum + s.load, 0) / 4;
  return chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : 0;
}


interface AthleteReadiness {
  id: string; name: string; position: string; positionGroup: string;
  acwr: number; acwrStatus: 'green' | 'yellow' | 'red';
  acuteLoad: number; chronicLoad: number;
  daysSinceLastSession: number; notSeenFlag: boolean;
}

interface DayData {
  date: string; label: string; teamAvgPL: number; teamAvgMetPower: number;
  athleteLoads: Record<string, number>;
  activityId: string; sessionName: string; isGame: boolean;
}



function ReadinessContent() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [athList, setAthList] = useState<{ id: string; name: string; position: string; positionGroup: string }[]>([]);
  const [loadHistories, setLoadHistories] = useState<Record<string, { date: string; load: number }[]>>({});
  const [days, setDays] = useState<DayData[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [avaOpen, setAvaOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [athRes, actRes] = await Promise.all([fetch('/api/athletes'), fetch('/api/activities')]);
      const athResult = await athRes.json();
      const actResult = await actRes.json();
      if (!athResult.success || !actResult.success) return;

      const list = (Array.isArray(athResult.data) ? athResult.data : []).map((a: Record<string, unknown>) => normalizeAthlete(a));
      setAthList(list);

      const activities = (actResult.data as Record<string, unknown>[]).map(normalizeActivity).slice(0, 40);

      const allSessionData: { date: string; activityId: string; sessionName: string; isGame: boolean; rows: Record<string, unknown>[] }[] = [];
      await Promise.all(activities.map(act =>
        fetch('/api/stats', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parameters: ['total_player_load', 'peak_meta_power'], filters: [{ name: 'activity_id', comparison: '=', values: [act.id] }], group_by: ['athlete'] }),
        }).then(r => r.json())
          .then(result => { allSessionData.push({ date: act.date, activityId: act.id, sessionName: act.name, isGame: act.isGame, rows: Array.isArray(result.data) ? result.data : [] }); })
          .catch(() => {})
      ));

      const byDate: Record<string, { loads: number[]; metPowers: number[]; athleteLoads: Record<string, number>; activityId: string; sessionName: string; isGame: boolean }> = {};
      const loadHistory: Record<string, { date: string; load: number }[]> = {};

      allSessionData.forEach(({ date, activityId, sessionName, isGame, rows }) => {
        if (!byDate[date]) byDate[date] = { loads: [], metPowers: [], athleteLoads: {}, activityId, sessionName, isGame };
        rows.forEach((row: Record<string, unknown>) => {
          const id = String(row.athlete_id ?? '');
          const metrics = rowToMetrics(row);
          const load = metrics.playerLoad ?? 0;
          const metPower = metrics.metabolicPower ?? 0;
          if (load > 0) {
            byDate[date].loads.push(load);
            byDate[date].athleteLoads[id] = (byDate[date].athleteLoads[id] ?? 0) + load;
            if (!loadHistory[id]) loadHistory[id] = [];
            loadHistory[id].push({ date, load });
          }
          if (metPower > 0) byDate[date].metPowers.push(metPower);
        });
      });

      setLoadHistories(loadHistory);

      const dayList: DayData[] = Object.entries(byDate)
        .sort(([a], [b]) => parseActivityDate(a).getTime() - parseActivityDate(b).getTime())
        .map(([date, { loads, metPowers, athleteLoads, activityId, sessionName, isGame }]) => {
          const d = parseActivityDate(date);
          return {
            date, sessionName, isGame, activityId, athleteLoads,
            label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            teamAvgPL: loads.length > 0 ? Math.round(loads.reduce((s, v) => s + v, 0) / loads.length * 10) / 10 : 0,
            teamAvgMetPower: metPowers.length > 0 ? Math.round(metPowers.reduce((s, v) => s + v, 0) / metPowers.length * 10) / 10 : 0,
          };
        });
      setDays(dayList);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setIsRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Computed athletes based on date range
  const refDate = dateTo ? new Date(dateTo + 'T23:59:59') : new Date();
  const fromDate = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
  const dayMs = 86400000;

  const computedAthletes: AthleteReadiness[] = athList.map(a => {
    const history = loadHistories[a.id] || [];
    const refTs = refDate.getTime();
    const fromTs = fromDate ? fromDate.getTime() : 0;
    const rangeHistory = history.filter(s => {
      const sTs = parseActivityDate(s.date).getTime();
      return sTs <= refTs && (fromTs === 0 || sTs >= fromTs);
    });
    const acute = history.filter(s => refTs - parseActivityDate(s.date).getTime() <= 7 * dayMs && parseActivityDate(s.date).getTime() <= refTs).reduce((sum, s) => sum + s.load, 0);
    const chronic = history.filter(s => refTs - parseActivityDate(s.date).getTime() <= 28 * dayMs && parseActivityDate(s.date).getTime() <= refTs).reduce((sum, s) => sum + s.load, 0) / 4;
    const acwr = chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : 0;
    const lastInRange = rangeHistory.sort((a, b) => parseActivityDate(b.date).getTime() - parseActivityDate(a.date).getTime())[0];
    const daysSince = lastInRange ? Math.floor((refTs - parseActivityDate(lastInRange.date).getTime()) / dayMs) : 999;
    return {
      id: a.id, name: a.name, position: a.position, positionGroup: a.positionGroup,
      acwr, acwrStatus: acwrStatus(acwr),
      acuteLoad: Math.round(acute * 10) / 10,
      chronicLoad: Math.round(chronic * 10) / 10,
      daysSinceLastSession: daysSince,
      notSeenFlag: daysSince >= 4,
    };
  });

  const filteredAthletes = computedAthletes;
  const underCount   = computedAthletes.filter(a => a.acwr > 0 && a.acwr < 0.8).length;
  const optimalCount = computedAthletes.filter(a => a.acwr >= 0.8 && a.acwr <= 1.3).length;
  const highCount    = computedAthletes.filter(a => a.acwr > 1.3).length;

  const statusOrder = { red: 0, yellow: 1, green: 2 };
  const displayList = [...filteredAthletes].sort((a, b) => {
    const orderDiff = statusOrder[a.acwrStatus] - statusOrder[b.acwrStatus];
    return orderDiff !== 0 ? orderDiff : b.acwr - a.acwr;
  });

  const filteredDays = days.filter(d => {
    const dMs = parseActivityDate(d.date).getTime();
    if (fromDate && dMs < fromDate.getTime()) return false;
    if (dMs > refDate.getTime()) return false;
    return true;
  });

  const seasonMax = Math.max(...days.map(d => d.teamAvgPL), 1);
  const avgAll = days.length > 0 ? days.reduce((s, d) => s + d.teamAvgPL, 0) / days.length : 0;

  if (loading) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} isRefreshing />
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
      </div>
    </div>
  );

  const selectStyle: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
  };

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} onRefresh={loadData} isRefreshing={isRefreshing} />
      <Ava isOpen={avaOpen} onClose={() => setAvaOpen(false)} />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '16px 12px' : '24px 16px', boxSizing: 'border-box', width: '100%' }}>

        {/* Header */}
        <div style={{ marginBottom: isMobile ? 12 : 20 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: isMobile ? 20 : 28, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1, marginBottom: 8 }}>
            Readiness & Timeline
          </h1>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(6, 1fr)', gap: isMobile ? 8 : 12, marginBottom: 14 }}>
          {[
            { label: 'Sessions', value: days.length.toString(), color: 'var(--accent)' },
            { label: 'Season Avg PL', value: avgAll > 0 ? avgAll.toFixed(1) : '—', color: 'var(--green)' },
            { label: 'Games', value: days.filter(d => d.isGame).length.toString(), color: 'white' },
            { label: 'Under-Training', value: underCount.toString(), color: '#4da6ff' },
            { label: 'Optimal', value: optimalCount.toString(), color: '#06d6a0' },
            { label: 'High Risk', value: highCount.toString(), color: '#ff3b3b' },
          ].map(item => (
            <div key={item.label}
              style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: isMobile ? '10px 12px' : '14px 16px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: isMobile ? 24 : 28, color: item.color, lineHeight: 1 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Season Timeline Bar Chart */}
        {days.length > 0 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: isMobile ? '14px 12px 10px' : '18px 20px 12px', marginBottom: 14, overflowX: 'auto' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, marginBottom: 2 }}>Season Timeline — Team Avg Player Load</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
              Season avg: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{avgAll.toFixed(1)} AU</span> · Click any bar to view session
            </div>
            <div style={{ display: 'flex', gap: isMobile ? 3 : 4, alignItems: 'flex-end', minHeight: isMobile ? 120 : 160, paddingBottom: 8 }}>
              {days.map(bar => {
                const h = seasonMax > 0 ? (bar.teamAvgPL / seasonMax) * (isMobile ? 90 : 130) : 0;
                const isHovered = hoveredBar === bar.activityId;
                const barColor = getBarColor(bar.teamAvgPL, seasonMax, bar.isGame);
                return (
                  <div key={bar.activityId}
                    style={{ flex: '0 0 auto', width: isMobile ? 18 : 26, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', position: 'relative' }}
                    onClick={() => router.push(`/sessions?session=${bar.activityId}`)}
                    onMouseEnter={() => setHoveredBar(bar.activityId)}
                    onMouseLeave={() => setHoveredBar(null)}>
                    {isHovered && !isMobile && (
                      <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', whiteSpace: 'nowrap', zIndex: 10, fontSize: 11, pointerEvents: 'none' }}>
                        <div style={{ fontWeight: 700 }}>{bar.sessionName}</div>
                        <div style={{ color: 'var(--muted)' }}>{bar.date} · Avg {bar.teamAvgPL.toFixed(1)} AU</div>
                        {bar.isGame && <div style={{ color: 'white', fontWeight: 700 }}>GAME</div>}
                      </div>
                    )}
                    <div style={{ width: '100%', height: `${Math.max(h, 3)}px`, background: isHovered ? 'white' : barColor, borderRadius: '3px 3px 0 0', transition: 'background 0.15s' }} />
                    {!isMobile && (
                      <div style={{ fontSize: 8, color: 'var(--muted)', textAlign: 'center', marginTop: 3, lineHeight: 1.2 }}>
                        {bar.label.split(' ')[1]}
                        {bar.isGame && <div style={{ color: 'white', fontWeight: 700 }}>G</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 10, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>% of Season Max</span>
              {[
                { color: '#ffffff', label: 'Game' },
                { color: '#ff3b3b', label: '≥90%' },
                { color: '#ff8c42', label: '75–89%' },
                { color: '#ffd166', label: '60–74%' },
                { color: '#06d6a0', label: '40–59%' },
                { color: '#4da6ff', label: '<40%' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 10, height: 14, background: item.color, borderRadius: '2px 2px 0 0', flexShrink: 0 }} />
                  <span style={{ fontSize: 9, color: 'var(--muted)' }}>{item.label}</span>
                </div>
              ))}
              {!isMobile && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--dim)' }}>Hover for details · Click to open session</span>}
            </div>
          </div>
        )}

        {/* ACWR History Table */}
        {filteredDays.length > 0 && displayList.length > 0 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: isMobile ? '12px 14px' : '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13 }}>
                  A:C Ratio by Date
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{displayList.length} athletes · {filteredDays.length} sessions</div>
              </div>
              {/* ACWR legend */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { label: 'Under (<0.8)',  color: '#4da6ff', bg: 'rgba(100,149,237,0.18)' },
                  { label: 'Optimal',       color: '#06d6a0', bg: 'rgba(0,230,118,0.18)' },
                  { label: 'Fair (1.3–1.5)',color: '#ffd166', bg: 'rgba(255,214,0,0.22)' },
                  { label: 'High (>1.5)',   color: '#ff3b3b', bg: 'rgba(255,23,68,0.28)' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: item.bg, border: `1px solid ${item.color}44` }} />
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: isMobile ? '60vh' : '75vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '9px 14px', textAlign: 'left', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', top: 0, left: 0, zIndex: 5, whiteSpace: 'nowrap', minWidth: 140 }}>Athlete</th>
                    <th style={{ padding: '9px 12px', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)', borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 3, whiteSpace: 'nowrap' }}>Current</th>
                    {filteredDays.slice().reverse().map(day => (
                      <th key={day.date} style={{ padding: '9px 10px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 10, color: 'var(--muted)', borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 3, whiteSpace: 'nowrap' }}>
                        {day.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const visibleDays = filteredDays.slice().reverse();
                    const sorted = [...displayList].sort((a, b) => b.acwr - a.acwr);
                    return sorted.map((ath, i) => {
                      const acwr = ath.acwr;
                      const currentStyle = acwrCellStyle(acwr);
                      const history = loadHistories[ath.id] || [];
                      return (
                        <tr key={ath.id}
                          style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.05)')}
                          onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}>
                          <td style={{ padding: '6px 14px', position: 'sticky', left: 0, background: '#0f1923', zIndex: 1, whiteSpace: 'nowrap', boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <button onClick={() => router.push(`/player?id=${ath.id}`)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 12, padding: 0, textAlign: 'left', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                {ath.name}
                              </button>
                              <InjuryFlag athleteId={ath.id} athleteName={ath.name} />
                            </div>
                            <span style={{ fontSize: 10, color: getPosColor(ath.position), fontWeight: 700 }}>{ath.position}</span>
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, background: currentStyle.background, color: currentStyle.color, cursor: 'pointer' }}
                            onClick={() => router.push(`/player?id=${ath.id}`)}>
                            {acwr > 0 ? acwr.toFixed(2) : '—'}
                          </td>
                          {visibleDays.map(day => {
                            const asOf = parseActivityDate(day.date);
                            const dayAcwr = calcACWRAsOf(history, asOf);
                            const hadSession = (day.athleteLoads[ath.id] ?? 0) > 0;
                            const style = hadSession ? acwrCellStyle(dayAcwr) : { background: 'transparent', color: 'var(--dim)' };
                            return (
                              <td key={day.date}
                                onClick={() => router.push(`/player?id=${ath.id}${hadSession && day.activityId ? `&session=${day.activityId}` : ''}`)}
                                style={{ padding: '6px 10px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: hadSession ? 600 : 400, cursor: 'pointer', ...style }}>
                                {hadSession && dayAcwr > 0 ? dayAcwr.toFixed(2) : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReadinessTimeline() {
  return <Suspense fallback={<div style={{ background: 'var(--bg)', minHeight: '100vh' }} />}><ReadinessContent /></Suspense>;
}
