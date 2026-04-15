'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { STATUS_COLORS, StoredInjuryRecord } from '@/lib/injuries';
import { getCurrentInjuryAsync, getInjuriesForAthlete, isInInjuryWindowAsync } from '@/lib/injuriesApi';

interface InjuryFlagProps {
  athleteId: string;
  athleteName: string;
  sessionDate?: string;
  size?: 'sm' | 'md';
}

export default function InjuryFlag({ athleteId, athleteName, sessionDate, size = 'sm' }: InjuryFlagProps) {
  const router = useRouter();
  const [current, setCurrent] = useState<StoredInjuryRecord | null>(null);
  const [historical, setHistorical] = useState<StoredInjuryRecord[]>([]);
  const [windowMatch, setWindowMatch] = useState<StoredInjuryRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [cur, all, win] = await Promise.all([
        getCurrentInjuryAsync(athleteName),
        getInjuriesForAthlete(athleteName),
        sessionDate ? isInInjuryWindowAsync(athleteName, sessionDate) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setCurrent(cur);
      setHistorical(all.filter(r => !r.isCurrent));
      setWindowMatch(win);
    }
    load();
    return () => { cancelled = true; };
  }, [athleteName, sessionDate]);

  if (!current && historical.length === 0 && !windowMatch) return null;

  const isActive = !!(current || windowMatch);
  const flagColor = isActive ? '#ff3b3b' : '#888';
  const iconSize = size === 'md' ? 14 : 12;

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 3 }}>
      <button
        onClick={e => {
          e.stopPropagation();
          router.push(`/player?id=${athleteId}`);
        }}
        onBlur={() => {}}
        title={isActive ? 'Currently injured — click to view player' : 'Past injury — click to view player'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'inline-flex', alignItems: 'center', lineHeight: 1, flexShrink: 0,
        }}>
        <svg width={iconSize} height={iconSize} viewBox="0 0 12 12" fill="none">
          <path d="M1 2.5L1 10L6 8L11 10V2.5L6 0.5L1 2.5Z" fill={flagColor} opacity={isActive ? 1 : 0.5} />
          <line x1="1" y1="2.5" x2="1" y2="11.5" stroke={flagColor} strokeWidth="1.5" strokeLinecap="round" opacity={isActive ? 1 : 0.5} />
        </svg>
      </button>
    </span>
  );
}

function InjuryCard({ record, onNavigate, isHistory = false }: { record: StoredInjuryRecord; onNavigate: () => void; isHistory?: boolean }) {
  const s = STATUS_COLORS[record.status];
  return (
    <button onClick={onNavigate} style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, borderRadius: 7, padding: '8px 10px', cursor: 'pointer', textAlign: 'left' }}>
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
