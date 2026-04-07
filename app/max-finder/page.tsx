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

export default function MaxFinder() {
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
        if ((athStats[id] as any).plVals == null) (athStats[id] as any).plVals = [];
        if (pl > 0) (athStats[id] as any).plVals.push(pl);
        if (val > athStats[id].maxVal) {
          athStats[id].maxVal = val;
          athStats[id].maxSessionName = act.name;
          athStats[id].maxDate = act.date;
          athStats[id].maxSessionId = act.id;
          athStats[id].isGame = act.isGame;
        }
      });

      const built: AthleteEntry[] = Object.entries(athStats).map(([id, s]) => {
        const plVals: number[] = (s as any).plVals ?? [];
        const avgPL = plVals.length > 0 ? plVals.reduce((a: number, b: number) => a + b, 0) / plVals.length : 0;
        return {
          athleteId: id,
          athleteName: s.name,
          position: s.position,
          positionGroup: s.positionGroup,
          maxValue: Math.round(s.maxVal * 10) / 10,
          avgValue: Math.round(avgPL * 10) / 10,
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

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Max Value Finder</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Peak performance across any metric, time window, or player group</p>
        </div>

        {/* Controls */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
          {/* Row 1: Metric + Sort */}
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

          {/* Row 2: Filters */}
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

          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
            {totalSessions} sessions · {sorted.length} players
          </div>
        </div>

        {/* Rankings table */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...Array(10)].map((_, i) => <div key={i} className="skeleton" style={{ height: 44, borderRadius: 8 }} />)}
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No data found</div>
        ) : (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13 }}>
                Player Rankings — {cfg.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Click name or max → Player Drill-Down</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 36, textAlign: 'center' }}>#</th>
                    <th style={{ ...thStyle }}>Player</th>
                    <th style={{ ...thStyle, textAlign: 'right', color: sortMode === 'max' ? 'var(--accent)' : 'var(--muted)' }}>Max</th>
                    <th style={{ ...thStyle, textAlign: 'right', color: sortMode === 'avg' ? 'var(--accent)' : 'var(--muted)' }}>Avg PL</th>
                    <th style={{ ...thStyle, textAlign: 'right', color: sortMode === 'sessions' ? 'var(--accent)' : 'var(--muted)' }}>Sessions</th>
                    <th style={{ ...thStyle }}>Peak Date</th>
                    <th style={{ ...thStyle }}>Context</th>
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

                        {/* Rank */}
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 14, color: isTop3 ? rankColors[i] : 'var(--muted)' }}>
                          {i + 1}
                        </td>

                        {/* Player name */}
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button onClick={() => router.push(`/player?id=${entry.athleteId}`)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.02em', textAlign: 'left' }}>
                              {entry.athleteName}
                            </button>
                            <InjuryFlag athleteId={entry.athleteId} athleteName={entry.athleteName} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, fontFamily: 'inherit' }}>({entry.position})</span>
                        </td>

                        {/* Max */}
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16, color: maxColor, whiteSpace: 'nowrap', cursor: 'pointer' }}
                          onClick={() => router.push(`/player?id=${entry.athleteId}&session=${entry.maxSessionId}`)}>
                          {entry.maxValue > 0 ? entry.maxValue.toFixed(1) : '—'}
                          <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 3, fontWeight: 500 }}>{cfg.unit}</span>
                        </td>

                        {/* Avg */}
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {entry.avgValue > 0 ? entry.avgValue.toFixed(1) : '—'}
                        </td>

                        {/* Sessions */}
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {entry.sessionCount}
                        </td>

                        {/* Peak Date */}
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {formatPeakDate(entry.maxDate)}
                        </td>

                        {/* Context */}
                        <td style={{ padding: '10px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {entry.isGame
                            ? <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{entry.maxSessionName}</span>
                            : <span style={{ color: 'var(--muted)' }}>Practice</span>}
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
