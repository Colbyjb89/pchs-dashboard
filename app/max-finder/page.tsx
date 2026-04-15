'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Ava from '@/components/Ava';
import { METRIC_CONFIG, MetricKey } from '@/lib/types';
import { ALL_SLUGS, rowToMetrics, normalizeAthlete, normalizeActivity } from '@/lib/data';
import InjuryFlag from '@/components/InjuryFlag';

const POSITION_GROUPS = ['All', 'Offensive Line', 'Skill', 'Defensive Line', 'Linebackers', 'Secondary', 'Special Teams'];

function getIntensityColor(val: number, allVals: number[]): string {
  if (val <= 0 || allVals.length === 0) return 'var(--text)';
  const max = Math.max(...allVals);
  if (max <= 0) return 'var(--text)';
  const pct = (val / max) * 100;
  if (pct >= 90) return '#ff3b3b';
  if (pct >= 75) return '#ff8c42';
  if (pct >= 60) return '#ffd166';
  if (pct >= 40) return '#06d6a0';
  return '#4da6ff';
}

interface AthleteEntry {
  athleteId: string; athleteName: string; position: string; positionGroup: string;
  maxValue: number; avgValue: number; sessionCount: number;
  maxSessionName: string; maxDate: string; maxSessionId: string; isGame: boolean;
}

type SortMode = 'max' | 'avg' | 'sessions';


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

export default function MaxFinder() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('playerLoad');
  const [sortMode, setSortMode] = useState<SortMode>('max');
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [selectedAthlete, setSelectedAthlete] = useState('All');
  const [gamesOnly, setGamesOnly] = useState(false);
  const [entries, setEntries] = useState<AthleteEntry[]>([]);
  const [athletes, setAthletes] = useState<{ id: string; name: string }[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [loading, setLoading] = useState(false);
  const [avaOpen, setAvaOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setIsRefreshing(true);
    try {
      const [athRes, actRes] = await Promise.all([fetch('/api/athletes'), fetch('/api/activities')]);
      const athResult = await athRes.json();
      const actResult = await actRes.json();
      if (!athResult.success || !actResult.success) return;

      const athList = (Array.isArray(athResult.data) ? athResult.data : []).map((a: Record<string, unknown>) => normalizeAthlete(a));
      setAthletes(athList.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })));
      setTotalPlayers(athList.length);

      const athleteMap: Record<string, { position: string; positionGroup: string }> = {};
      athList.forEach((a: { id: string; position: string; positionGroup: string }) => {
        athleteMap[a.id] = { position: a.position, positionGroup: a.positionGroup };
      });

      const activities = (actResult.data as Record<string, unknown>[])
        .map(normalizeActivity)
        .filter(a => !gamesOnly || a.isGame)
        .slice(0, 30);
      setTotalSessions(activities.length);

      const allRows: { row: Record<string, unknown>; act: ReturnType<typeof normalizeActivity> }[] = [];
      await Promise.all(activities.map(act =>
        fetch('/api/stats', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parameters: ALL_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [act.id] }], group_by: ['athlete'] }),
        }).then(r => r.json()).then(result => {
          (Array.isArray(result.data) ? result.data : []).forEach((row: Record<string, unknown>) => {
            allRows.push({ row, act });
          });
        }).catch(() => {})
      ));

      const athStats: Record<string, {
        vals: number[]; maxVal: number; maxSessionName: string; maxDate: string;
        maxSessionId: string; isGame: boolean; name: string; position: string; positionGroup: string;
      }> = {};

      allRows.forEach(({ row, act }) => {
        const id = String(row.athlete_id ?? '');
        const metrics = rowToMetrics(row);
        const val = metrics[selectedMetric] ?? 0;
        const pl = metrics['playerLoad'] ?? 0;
        if (val <= 0) return;
        const info = athleteMap[id] || { position: '', positionGroup: '' };
        if (!athStats[id]) {
          athStats[id] = { vals: [], maxVal: 0, maxSessionName: '', maxDate: '', maxSessionId: '', isGame: false, name: String(row.athlete_name ?? 'Unknown'), position: info.position, positionGroup: info.positionGroup };
        }
        athStats[id].vals.push(val);
        if (val > athStats[id].maxVal) {
          athStats[id].maxVal = val;
          athStats[id].maxSessionName = act.name;
          athStats[id].maxDate = act.date;
          athStats[id].maxSessionId = act.id;
          athStats[id].isGame = act.isGame;
        }
      });

      const built: AthleteEntry[] = Object.entries(athStats).map(([id, s]) => {
        const avgVal = s.vals.length > 0 ? s.vals.reduce((a: number, b: number) => a + b, 0) / s.vals.length : 0;
        return {
          athleteId: id,
          athleteName: s.name,
          position: s.position,
          positionGroup: s.positionGroup,
          maxValue: Math.round(s.maxVal * 10) / 10,
          avgValue: Math.round(avgVal * 10) / 10,
          sessionCount: s.vals.length,
          maxSessionName: s.maxSessionName,
          maxDate: s.maxDate,
          maxSessionId: s.maxSessionId,
          isGame: s.isGame,
        };
      });

      setEntries(built);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setIsRefreshing(false); }
  }, [selectedMetric, gamesOnly]);

  useEffect(() => { loadData(); }, [loadData]);

  const cfg = METRIC_CONFIG[selectedMetric];

  let filtered = entries;
  if (selectedGroup !== 'All') filtered = filtered.filter(e => e.positionGroup === selectedGroup);
  if (selectedAthlete !== 'All') filtered = filtered.filter(e => e.athleteId === selectedAthlete);

  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === 'avg') return b.avgValue - a.avgValue;
    if (sortMode === 'sessions') return b.sessionCount - a.sessionCount;
    return b.maxValue - a.maxValue;
  });

  const allMaxVals = sorted.map(e => e.maxValue);

  // Format date nicely: MM/DD/YYYY → YYYY-MM-DD (Day)
  function formatPeakDate(dateStr: string): string {
    if (!dateStr) return '—';
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const d = new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
      const day = d.toLocaleDateString('en-US', { weekday: 'short' });
      return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')} (${day})`;
    }
    return dateStr;
  }

  const selectStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)',
    fontWeight: 700, fontSize: 13, width: '100%',
  };

  const thStyle: React.CSSProperties = {
    padding: '10px 14px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11,
    letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)',
    textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
  };

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} onRefresh={loadData} isRefreshing={isRefreshing} />
      <Ava isOpen={avaOpen} onClose={() => setAvaOpen(false)} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '16px 12px' : '20px 16px', boxSizing: 'border-box', width: '100%' }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: isMobile ? 20 : 26, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1 }}>Max Value Finder</h1>
          {!isMobile && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Peak performance across any metric, time window, or player group</p>}
        </div>

        {/* Controls */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: isMobile ? '12px 14px' : '16px 18px', marginBottom: 16 }}>
          {isMobile ? (
            /* Mobile: stacked filters */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Metric */}
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Metric</div>
                <select value={selectedMetric} onChange={e => setSelectedMetric(e.target.value as MetricKey)} style={selectStyle}>
                  {Object.entries(METRIC_CONFIG).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                </select>
              </div>
              {/* Sort + Position in a row */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Sort By</div>
                  <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {(['max', 'avg', 'sessions'] as SortMode[]).map(m => (
                      <button key={m} onClick={() => setSortMode(m)} style={{ flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', background: sortMode === m ? 'var(--accent)' : 'transparent', color: sortMode === m ? 'white' : 'var(--muted)' }}>
                        {m === 'sessions' ? 'Sess' : m === 'avg' ? 'Avg' : 'Max'}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Position</div>
                  <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} style={selectStyle}>
                    {POSITION_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              {/* Player + Games in a row */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Player</div>
                  <select value={selectedAthlete} onChange={e => setSelectedAthlete(e.target.value)} style={selectStyle}>
                    <option value="All">All Players</option>
                    {athletes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2, flexShrink: 0 }}>
                  <button onClick={() => setGamesOnly(v => !v)} style={{ width: 22, height: 22, borderRadius: 4, border: `2px solid ${gamesOnly ? 'var(--accent)' : 'var(--border)'}`, background: gamesOnly ? 'var(--accent)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, flexShrink: 0 }}>
                    {gamesOnly ? '✓' : ''}
                  </button>
                  <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>Games</span>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{totalSessions} sessions · {sorted.length} players</div>
            </div>
          ) : (
            /* Desktop: original layout */
            <>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Metric</div>
                  <select value={selectedMetric} onChange={e => setSelectedMetric(e.target.value as MetricKey)} style={selectStyle}>
                    {Object.entries(METRIC_CONFIG).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Sort By</div>
                  <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {(['max', 'avg', 'sessions'] as SortMode[]).map(m => (
                      <button key={m} onClick={() => setSortMode(m)} style={{ padding: '8px 18px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', background: sortMode === m ? 'var(--accent)' : 'transparent', color: sortMode === m ? 'white' : 'var(--muted)' }}>
                        {m === 'sessions' ? 'Sess' : m.charAt(0).toUpperCase() + m.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Position</div>
                  <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} style={selectStyle}>
                    {POSITION_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div style={{ flex: 2, minWidth: 180 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Player</div>
                  <select value={selectedAthlete} onChange={e => setSelectedAthlete(e.target.value)} style={selectStyle}>
                    <option value="All">All Players</option>
                    {athletes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
                  <button onClick={() => setGamesOnly(v => !v)} style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${gamesOnly ? 'var(--accent)' : 'var(--border)'}`, background: gamesOnly ? 'var(--accent)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, flexShrink: 0 }}>
                    {gamesOnly ? '✓' : ''}
                  </button>
                  <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap' }}>Games</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>{totalSessions} sessions · {sorted.length} players</div>
            </>
          )}
        </div>

        {/* Rankings */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...Array(10)].map((_, i) => <div key={i} className="skeleton" style={{ height: 44, borderRadius: 8 }} />)}
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No data found</div>
        ) : isMobile ? (
          /* Mobile: approved row list */
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13 }}>
              {cfg.label} Rankings <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400, marginLeft: 6 }}>{sorted.length} players</span>
            </div>
            {sorted.map((entry, i) => {
              const maxColor = getIntensityColor(entry.maxValue, allMaxVals);
              const rankColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
              const isTop3 = i < 3;
              const leader = allMaxVals[0] ?? 0;
              const behindPct = leader > 0 && i > 0 ? Math.round(((leader - entry.maxValue) / leader) * 100) : 0;
              return (
                <div key={entry.athleteId} style={{
                  position: 'relative',
                  padding: '10px 14px 10px 16px',
                  borderBottom: i < sorted.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  cursor: 'pointer',
                }} onClick={() => router.push(`/player?id=${entry.athleteId}`)}>
                  {/* Left color bar */}
                  <div style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, background: maxColor, borderRadius: '0 3px 3px 0', opacity: 0.7 }} />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    {/* Left: rank, name, position, peak date */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 12, color: isTop3 ? rankColors[i] : 'var(--muted)', flexShrink: 0, minWidth: 16 }}>{i + 1}</span>
                        <InjuryFlag athleteId={entry.athleteId} athleteName={entry.athleteName} />
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.athleteName}</span>
                        <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>({entry.position})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <span style={{ fontSize: 11, color: maxColor, fontWeight: 700 }}>{i === 0 ? 'Leader' : `${behindPct}% behind`}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>· {formatPeakDate(entry.maxDate)}</span>
                      </div>
                      <div style={{ height: 3, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${leader > 0 ? Math.round((entry.maxValue / leader) * 100) : 0}%`, background: maxColor, borderRadius: 2, transition: 'width 0.4s' }} />
                      </div>
                    </div>
                    {/* Right: max value + peak date */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color: maxColor, letterSpacing: '-0.02em', lineHeight: 1 }}>
                        {entry.maxValue > 0 ? entry.maxValue.toFixed(1) : '—'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{cfg.unit}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 1, opacity: 0.7 }}>{entry.maxDate}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop: sticky table */
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13 }}>Player Rankings — {cfg.label}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Click name or max → Player Drill-Down</div>
            </div>
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '75vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 36, textAlign: 'center', position: 'sticky', top: 0, zIndex: 3 }}>#</th>
                    <th style={{ ...thStyle, position: 'sticky', top: 0, left: 36, zIndex: 4, minWidth: 160 }}>Player</th>
                    <th style={{ ...thStyle, textAlign: 'right', position: 'sticky', top: 0, zIndex: 3, color: sortMode === 'max' ? 'var(--accent)' : 'var(--muted)' }}>Max</th>
                    <th style={{ ...thStyle, textAlign: 'right', position: 'sticky', top: 0, zIndex: 3, color: 'var(--muted)' }}>% Behind</th>
                    <th style={{ ...thStyle, textAlign: 'right', position: 'sticky', top: 0, zIndex: 3, color: sortMode === 'avg' ? 'var(--accent)' : 'var(--muted)' }}>Avg {cfg.label}</th>
                    <th style={{ ...thStyle, position: 'sticky', top: 0, zIndex: 3 }}>Context</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((entry, i) => {
                    const maxColor = getIntensityColor(entry.maxValue, allMaxVals);
                    const rankColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
                    const isTop3 = i < 3;
                    return (
                      <tr key={entry.athleteId}
                        style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}>
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 14, color: isTop3 ? rankColors[i] : 'var(--muted)', position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1 }}>{i + 1}</td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', position: 'sticky', left: 36, background: '#0f1923', zIndex: 1, boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <InjuryFlag athleteId={entry.athleteId} athleteName={entry.athleteName} />
                            <button onClick={() => router.push(`/player?id=${entry.athleteId}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.02em', textAlign: 'left' }}>{entry.athleteName}</button>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>({entry.position})</span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16, color: maxColor }}
                          onClick={() => router.push(`/player?id=${entry.athleteId}&session=${entry.maxSessionId}`)}>
                          {entry.maxValue > 0 ? entry.maxValue.toFixed(1) : '—'}
                          <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 3, fontWeight: 500 }}>{cfg.unit}</span>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: 12, color: i === 0 ? '#ffd700' : maxColor, fontWeight: 700 }}>
                          {i === 0 ? 'Leader' : `${Math.round(((allMaxVals[0] - entry.maxValue) / allMaxVals[0]) * 100)}%`}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{entry.avgValue > 0 ? entry.avgValue.toFixed(1) : '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {entry.isGame ? <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{entry.maxSessionName}</span> : <span style={{ color: 'var(--muted)' }}>Practice</span>}
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{formatPeakDate(entry.maxDate)}</div>
                        </td>
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
