'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  getCurrentInjury,
  getAthleteInjuries,
  isSessionInInjuryWindow,
  STATUS_COLORS,
  StoredInjuryRecord,
} from '@/lib/injuries';

interface InjuryFlagProps {
  athleteId: string;
  athleteName: string;
  sessionDate?: string;   // if provided, checks if this date is in injury window
  size?: 'sm' | 'md';
}

export default function InjuryFlag({ athleteId, athleteName, sessionDate, size = 'sm' }: InjuryFlagProps) {
  const router = useRouter();
  const [current, setCurrent] = useState<StoredInjuryRecord | null>(null);
  const [historical, setHistorical] = useState<StoredInjuryRecord[]>([]);
  const [windowMatch, setWindowMatch] = useState<StoredInjuryRecord | null>(null);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    const cur = getCurrentInjury(athleteName);
    const hist = getAthleteInjuries(athleteName).filter(r => !r.isCurrent);
    const win = sessionDate ? isSessionInInjuryWindow(athleteName, sessionDate) : null;
    setCurrent(cur);
    setHistorical(hist);
    setWindowMatch(win);
  }, [athleteName, sessionDate]);

  // Nothing to show
  if (!current && historical.length === 0 && !windowMatch) return null;

  const isActive = !!(current || windowMatch);
  const flagColor = isActive ? '#ff3b3b' : '#888';
  const iconSize = size === 'md' ? 14 : 12;

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 5 }}>
      <button
        onClick={e => {
          e.stopPropagation();
          if (isActive) {
            router.push(`/player?id=${athleteId}`);
          } else {
            setShowTip(v => !v);
          }
        }}
        onBlur={() => setTimeout(() => setShowTip(false), 150)}
        title={isActive ? 'Currently injured — click to view player' : 'Past injury history — click for details'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'inline-flex', alignItems: 'center', lineHeight: 1,
        }}>
        <svg width={iconSize} height={iconSize} viewBox="0 0 12 12" fill="none">
          <path d="M1 2.5L1 10L6 8L11 10V2.5L6 0.5L1 2.5Z" fill={flagColor} opacity={isActive ? 1 : 0.5} />
          <line x1="1" y1="2.5" x2="1" y2="11.5" stroke={flagColor} strokeWidth="1.5" strokeLinecap="round" opacity={isActive ? 1 : 0.5} />
        </svg>
      </button>

      {/* Tooltip */}
      {showTip && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 100,
            background: '#0f1926', border: '1px solid var(--border)', borderRadius: 10,
            padding: '12px 14px', width: 260, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
          {/* Current injury */}
          {current && (
            <div style={{ marginBottom: historical.length > 0 ? 10 : 0 }}>
              <div style={{ fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Current</div>
              <InjuryCard record={current} onNavigate={() => router.push(`/player?id=${athleteId}`)} />
            </div>
          )}

          {/* Window match (session falls in injury range) */}
          {windowMatch && !current && (
            <div style={{ marginBottom: historical.length > 0 ? 10 : 0 }}>
              <div style={{ fontSize: 9, color: '#ff8c42', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Session in Injury Window</div>
              <InjuryCard record={windowMatch} onNavigate={() => router.push(`/player?id=${athleteId}`)} />
            </div>
          )}

          {/* History */}
          {historical.length > 0 && (
            <div>
              {(current || windowMatch) && <div style={{ borderTop: '1px solid var(--border)', marginBottom: 8 }} />}
              <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>History</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {historical.slice(0, 5).map((r, i) => (
                  <InjuryCard key={i} record={r} onNavigate={() => router.push(`/injury-report`)} isHistory />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

function InjuryCard({ record, onNavigate, isHistory = false }: { record: StoredInjuryRecord; onNavigate: () => void; isHistory?: boolean }) {
  const s = STATUS_COLORS[record.status];
  return (
    <button
      onClick={onNavigate}
      style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, borderRadius: 7, padding: '8px 10px', cursor: 'pointer', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: s.color }}>{record.status}</span>
        <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{record.dateReported}</span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{record.part} — {record.injury}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>Return: {record.expectedReturn}</span>
        {isHistory && <span style={{ fontSize: 9, color: 'var(--dim)' }}>{record.uploadBatch}</span>}
      </div>
      {record.info && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, fontStyle: 'italic' }}>{record.info}</div>}
    </button>
  );
}
