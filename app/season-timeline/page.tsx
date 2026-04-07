'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Ava from '@/components/Ava';
import { ALL_SLUGS, rowToMetrics, normalizeActivity, parseActivityDate } from '@/lib/data';

const POSITION_GROUPS = ['All', 'Offensive Line', 'Skill', 'Defensive Line', 'Linebackers', 'Secondary', 'Special Teams'];

interface TimelineBar {
  sessionId: string; sessionName: string; date: string; dayOfWeek: string; amPm: string;
  avgLoad: number; maxLoad: number; isGame: boolean; athleteCount: number;
}

export default function SeasonTimeline() {
  const router = useRouter();
  const [bars, setBars] = useState<TimelineBar[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [loading, setLoading] = useState(true);
  const [avaOpen, setAvaOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const actRes = await fetch('/api/activities');
      const actResult = await actRes.json();
      if (!actResult.success) return;
      const activities = (actResult.data as Record<string, unknown>[]).map(normalizeActivity).slice(0, 40);

      // Fetch player load for all sessions
      const sessionData = await Promise.all(
        activities.map(act =>
          fetch('/api/stats', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parameters: ['total_player_load'], filters: [{ name: 'activity_id', comparison: '=', values: [act.id] }], group_by: ['athlete'] }),
          }).then(r => r.json()).then(result => {
            const rows: Record<string, unknown>[] = Array.isArray(result.data) ? result.data : [];
            const loads = rows.map((r: Record<string, unknown>) => (rowToMetrics(r).playerLoad ?? 0)).filter(v => v > 0);
            const avg = loads.length > 0 ? loads.reduce((s, v) => s + v, 0) / loads.length : 0;
            const max = loads.length > 0 ? Math.max(...loads) : 0;
            return { act, avg: Math.round(avg * 10) / 10, max: Math.round(max * 10) / 10, count: loads.length };
          }).catch(() => ({ act, avg: 0, max: 0, count: 0 }))
        )
      );

      const timeline: TimelineBar[] = sessionData.map(({ act, avg, max, count }) => {
        const d = parseActivityDate(act.date);
        return {
          sessionId: act.id,
          sessionName: act.name,
          date: act.date,
          dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'short' }),
          amPm: act.startTime ? (new Date(act.startTime * 1000).getHours() < 12 ? 'AM' : 'PM') : '',
          avgLoad: avg,
          maxLoad: max,
          isGame: act.isGame,
          athleteCount: count,
        };
      }).sort((a, b) => parseActivityDate(a.date).getTime() - parseActivityDate(b.date).getTime());

      setBars(timeline);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setIsRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const maxLoad = Math.max(...bars.map(b => b.avgLoad), 1);
  const avgAll = bars.length > 0 ? bars.reduce((s, b) => s + b.avgLoad, 0) / bars.length : 0;

  if (loading) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} isRefreshing />
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
      </div>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} onRefresh={loadData} isRefreshing={isRefreshing} />
      <Ava isOpen={avaOpen} onClose={() => setAvaOpen(false)} />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Season Timeline</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Player Load by session · {bars.length} sessions · Click any bar to view</p>
          </div>
          <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
            {POSITION_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Total Sessions', value: bars.length.toString(), color: 'var(--accent)' },
            { label: 'Season Avg PL', value: avgAll > 0 ? avgAll.toFixed(1) : '—', color: 'var(--green)' },
            { label: 'Games Tagged', value: bars.filter(b => b.isGame).length.toString(), color: 'var(--orange)' },
          ].map(item => (
            <div key={item.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 32, color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Timeline Chart */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', overflowX: 'auto' }}>
          {bars.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>No sessions loaded</div>
          ) : (
            <>
              {/* Average line reference */}
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
                Season avg: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{avgAll.toFixed(1)} AU</span> · Bars = team avg PL per session
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', minHeight: 200, paddingBottom: 8 }}>
                {bars.map(bar => {
                  const h = maxLoad > 0 ? (bar.avgLoad / maxLoad) * 160 : 0;
                  const isHovered = hoveredBar === bar.sessionId;
                  const barColor = bar.isGame ? 'var(--orange)' : bar.avgLoad > avgAll * 1.2 ? 'var(--red)' : bar.avgLoad > avgAll ? 'var(--green)' : 'var(--accent)';
                  return (
                    <div key={bar.sessionId} style={{ flex: '0 0 auto', width: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', position: 'relative' }}
                      onClick={() => router.push(`/sessions?session=${bar.sessionId}`)}
                      onMouseEnter={() => setHoveredBar(bar.sessionId)}
                      onMouseLeave={() => setHoveredBar(null)}>
                      {isHovered && (
                        <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', whiteSpace: 'nowrap', zIndex: 10, fontSize: 11 }}>
                          <div style={{ fontWeight: 600 }}>{bar.sessionName}</div>
                          <div style={{ color: 'var(--muted)' }}>{bar.date} · Avg {bar.avgLoad.toFixed(1)} AU</div>
                          <div style={{ color: 'var(--muted)' }}>{bar.athleteCount} athletes</div>
                        </div>
                      )}
                      <div style={{ width: '100%', height: `${Math.max(h, 3)}px`, background: isHovered ? 'white' : barColor, borderRadius: '3px 3px 0 0', minHeight: 3, transition: 'background 0.15s' }} />
                      <div style={{ fontSize: 8, color: 'var(--muted)', textAlign: 'center', marginTop: 4, lineHeight: 1.2 }}>
                        {bar.dayOfWeek}<br />{bar.date.split('/').slice(0, 2).join('/')}
                        {bar.isGame && <div style={{ color: 'var(--orange)', fontWeight: 700 }}>G</div>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Color band legend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bar Color</span>
                {[
                  { color: 'var(--orange)', label: 'Game', sub: 'Tagged as game' },
                  { color: 'var(--red)',    label: 'High Load', sub: '>120% of season avg' },
                  { color: 'var(--green)',  label: 'Above Avg', sub: '100–120% of season avg' },
                  { color: 'var(--accent)', label: 'Below Avg', sub: '<100% of season avg' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 12, height: 18, background: item.color, borderRadius: '3px 3px 0 0', opacity: 0.85, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{item.label}</div>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>{item.sub}</div>
                    </div>
                  </div>
                ))}
                <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--dim)' }}>Hover any bar for details · Click to open session</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
