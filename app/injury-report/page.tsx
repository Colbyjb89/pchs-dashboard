'use client';
import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import Ava from '@/components/Ava';
import { InjuryStatus, InjuryRecord } from '@/lib/types';
import { getCurrentInjuries, getLastUpdated, STATUS_COLORS } from '@/lib/injuries';

const STATUS_ORDER: InjuryStatus[] = ['As Tolerated', 'Limited', 'OUT', 'Full Go'];

export default function InjuryReport() {
  const [records, setRecords] = useState<InjuryRecord[]>([]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [avaOpen, setAvaOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setRecords(getCurrentInjuries());
    setLastUpdated(getLastUpdated());
    setLoaded(true);
  }, []);

  const grouped = STATUS_ORDER.reduce<Record<InjuryStatus, InjuryRecord[]>>((acc, status) => {
    acc[status] = records.filter(r => r.status === status);
    return acc;
  }, { 'OUT': [], 'Limited': [], 'As Tolerated': [], 'Full Go': [] });

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} />
      <Ava isOpen={avaOpen} onClose={() => setAvaOpen(false)} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Injury Report
            </h1>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Football athletes only
              {lastUpdated && <span style={{ marginLeft: 6 }}>· Updated {lastUpdated}</span>}
            </p>
          </div>
        </div>

        {/* No data state */}
        {loaded && records.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '2px dashed var(--border)', borderRadius: 12, padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✚</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, marginBottom: 8 }}>
              No Injury Data
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 360, margin: '0 auto', lineHeight: 1.6, marginBottom: 20 }}>
              Upload the AT injury report CSV via the Settings page. Only Football athletes will be shown here.
            </div>
            <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'white', borderRadius: 8, padding: '10px 20px', textDecoration: 'none', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
              ⚙ Go to Settings →
            </a>
          </div>
        ) : records.length > 0 ? (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
              {STATUS_ORDER.map(status => {
                const s = STATUS_COLORS[status];
                const count = grouped[status].length;
                return (
                  <div key={status} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 32, color: s.color, lineHeight: 1 }}>{count}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: s.color, marginTop: 4 }}>{status}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                      {status === 'OUT' ? 'Not available' : status === 'Limited' ? 'Modified activity' : status === 'As Tolerated' ? 'Activity as able' : 'Full participation'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Single table sorted by status */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13 }}>All FB Athletes — {records.length} records</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Sorted by status</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '9px 14px', textAlign: 'left', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 2 }}>Status</th>
                      <th style={{ padding: '9px 14px', textAlign: 'left', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Athlete</th>
                      <th style={{ padding: '9px 14px', textAlign: 'left', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Body Part</th>
                      <th style={{ padding: '9px 14px', textAlign: 'left', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Injury</th>
                      <th style={{ padding: '9px 14px', textAlign: 'left', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Date Reported</th>
                      <th style={{ padding: '9px 14px', textAlign: 'left', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Exp. Return</th>
                      <th style={{ padding: '9px 14px', textAlign: 'left', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STATUS_ORDER.filter(status => grouped[status].length > 0).map(status => {
                      const s = STATUS_COLORS[status];
                      const group = grouped[status];
                      return (
                        <>
                          {/* Status group header row */}
                          <tr key={`header-${status}`} style={{ background: s.bg, borderLeft: `3px solid ${s.color}` }}>
                            <td colSpan={7} style={{ padding: '6px 14px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: s.color, borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)' }}>
                              {status} — {group.length} athlete{group.length !== 1 ? 's' : ''}
                            </td>
                          </tr>
                          {/* Athlete rows */}
                          {group.map((r, i) => (
                            <tr key={`${status}-${i}`}
                              style={{ borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${s.color}`, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.05)')}
                              onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}>
                              <td style={{ padding: '9px 14px', position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700, color: s.color, fontFamily: 'var(--font-display)', whiteSpace: 'nowrap' }}>
                                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                                  {status}
                                </span>
                              </td>
                              <td style={{ padding: '9px 14px', fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--text)' }}>{r.name}</td>
                              <td style={{ padding: '9px 14px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{r.part}</td>
                              <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>{r.injury}</td>
                              <td style={{ padding: '9px 14px', color: 'var(--muted)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.dateReported}</td>
                              <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: 11, color: r.expectedReturn === 'TBD' ? '#ff8c42' : 'var(--text)', fontWeight: r.expectedReturn === 'TBD' ? 600 : 400 }}>
                                {r.expectedReturn}
                              </td>
                              <td style={{ padding: '9px 14px', color: 'var(--muted)', fontSize: 11, maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.info}</td>
                            </tr>
                          ))}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
