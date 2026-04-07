'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Ava from '@/components/Ava';
import { ALL_SLUGS, rowToMetrics, normalizeAthlete, normalizeActivity } from '@/lib/data';
import { METRIC_CONFIG, MetricKey } from '@/lib/types';

interface GameRow {
  id: string; name: string; date: string; durationMinutes: number; athleteCount: number;
  teamAvg: Partial<Record<MetricKey, number>>; teamMax: Partial<Record<MetricKey, number>>;
}

export default function GameDay() {
  const router = useRouter();
  const [games, setGames] = useState<GameRow[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [athleteStats, setAthleteStats] = useState<{ id: string; name: string; position: string; metrics: Partial<Record<MetricKey, number>> }[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('playerLoad');
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [avaOpen, setAvaOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadGames = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [actRes, athRes] = await Promise.all([fetch('/api/activities'), fetch('/api/athletes')]);
      const actResult = await actRes.json();
      const athResult = await athRes.json();
      if (!actResult.success) return;

      const athletes = athResult.success ? (Array.isArray(athResult.data) ? athResult.data : []).map((a: Record<string, unknown>) => normalizeAthlete(a)) : [];
      const athMap: Record<string, { position: string }> = {};
      athletes.forEach((a: { id: string; position: string }) => { athMap[a.id] = { position: a.position }; });

      const activities = (actResult.data as Record<string, unknown>[]).map(normalizeActivity);
      const gameSessions = activities.filter(a => a.isGame);

      if (gameSessions.length === 0) {
        setGames([]);
        setLoading(false);
        setIsRefreshing(false);
        return;
      }

      const gameRows = await Promise.all(gameSessions.map(async act => {
        const statsRes = await fetch('/api/stats', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parameters: ALL_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [act.id] }], group_by: ['athlete'] }),
        });
        const result = await statsRes.json();
        const rows: Record<string, unknown>[] = Array.isArray(result.data) ? result.data : [];
        const metricKeys = Object.keys(METRIC_CONFIG) as MetricKey[];
        const teamAvg: Partial<Record<MetricKey, number>> = {};
        const teamMax: Partial<Record<MetricKey, number>> = {};
        metricKeys.forEach(k => {
          const vals = rows.map((r: Record<string, unknown>) => rowToMetrics(r)[k] ?? 0).filter(v => v > 0);
          teamAvg[k] = vals.length > 0 ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : 0;
          teamMax[k] = vals.length > 0 ? Math.round(Math.max(...vals) * 10) / 10 : 0;
        });
        return { id: act.id, name: act.name, date: act.date, durationMinutes: act.durationMinutes, athleteCount: rows.length, teamAvg, teamMax };
      }));

      setGames(gameRows);
      if (gameRows[0]) setSelectedGameId(gameRows[0].id);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setIsRefreshing(false); }
  }, []);

  useEffect(() => { loadGames(); }, [loadGames]);

  useEffect(() => {
    if (!selectedGameId) return;
    setStatsLoading(true);
    fetch('/api/stats', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: ALL_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [selectedGameId] }], group_by: ['athlete'] }),
    }).then(r => r.json()).then(result => {
      const rows = (Array.isArray(result.data) ? result.data : []).map((row: Record<string, unknown>) => ({
        id: String(row.athlete_id ?? ''),
        name: String(row.athlete_name ?? 'Unknown'),
        position: String(row.position ?? ''),
        metrics: rowToMetrics(row),
      }));
      rows.sort((a: { metrics: Partial<Record<MetricKey, number>> }, b: { metrics: Partial<Record<MetricKey, number>> }) => (b.metrics[selectedMetric] ?? 0) - (a.metrics[selectedMetric] ?? 0));
      setAthleteStats(rows);
    }).catch(console.error).finally(() => setStatsLoading(false));
  }, [selectedGameId, selectedMetric]);

  const selectedGame = games.find(g => g.id === selectedGameId);
  const cfg = METRIC_CONFIG[selectedMetric];
  const maxVal = Math.max(...athleteStats.map(a => a.metrics[selectedMetric] ?? 0), 1);

  if (loading) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} isRefreshing />
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
      </div>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} onRefresh={loadGames} isRefreshing={isRefreshing} />
      <Ava isOpen={avaOpen} onClose={() => setAvaOpen(false)} />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Game Day</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Competition data · Sessions tagged as games</p>
        </div>

        {games.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px solid rgba(26,107,255,0.3)', borderRadius: 12, padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>◆</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, marginBottom: 8, letterSpacing: '0.04em' }}>No Game Sessions Found</div>
            <div style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
              Game sessions appear automatically when their name contains "vs.", "@", or "game". Tag sessions in Catapult OpenField and they will appear here.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>
            {/* Game list */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Games — {games.length}</div>
              {games.map(g => (
                <button key={g.id} onClick={() => setSelectedGameId(g.id)} style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '12px 16px', background: g.id === selectedGameId ? 'rgba(255,109,0,0.12)' : 'transparent', borderLeft: g.id === selectedGameId ? '3px solid var(--orange)' : '3px solid transparent', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{g.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{g.date} · {g.athleteCount} athletes</div>
                </button>
              ))}
            </div>

            {/* Game detail */}
            <div>
              {selectedGame && (
                <>
                  <div style={{ background: 'var(--card)', border: '1px solid rgba(255,109,0,0.3)', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, color: 'var(--orange)' }}>{selectedGame.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{selectedGame.date} · {selectedGame.durationMinutes} min · {selectedGame.athleteCount} athletes</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
                      {(['playerLoad', 'totalDistance', 'maxVelocity'] as MetricKey[]).map(k => (
                        <div key={k} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                          <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{METRIC_CONFIG[k].shortLabel} Avg</div>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color: 'var(--text)', marginTop: 2 }}>{(selectedGame.teamAvg[k] ?? 0).toFixed(1)}<span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 3 }}>{METRIC_CONFIG[k].unit}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                    <select value={selectedMetric} onChange={e => setSelectedMetric(e.target.value as MetricKey)} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
                      {Object.entries(METRIC_CONFIG).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                    </select>
                  </div>

                  {statsLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 52, borderRadius: 8 }} />)}</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {athleteStats.map((a, i) => {
                        const val = a.metrics[selectedMetric] ?? 0;
                        const barPct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                        return (
                          <div key={a.id} onClick={() => router.push(`/player?id=${a.id}`)}
                            style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--orange)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                              <div style={{ width: 22, height: 22, borderRadius: '50%', background: i < 3 ? 'var(--orange)' : 'var(--dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, color: 'white', flexShrink: 0 }}>{i + 1}</div>
                              <div style={{ flex: 1, fontWeight: 500, fontSize: 13 }}>{a.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{a.position}</div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{val > 0 ? val.toFixed(1) : '—'}<span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 3 }}>{cfg.unit}</span></div>
                            </div>
                            <div style={{ height: 4, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${barPct}%`, background: 'var(--orange)', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
