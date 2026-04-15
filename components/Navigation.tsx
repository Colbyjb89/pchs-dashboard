'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const TABS = [
  { href: '/',                label: 'Overview',   icon: '◈' },
  { href: '/sessions',        label: 'Sessions',   icon: '▦' },
  { href: '/player',          label: 'Player',     icon: '◉' },

  { href: '/readiness',       label: 'Readiness',  icon: '◎' },
  { href: '/speed-bands',     label: 'Bands',      icon: '»' },

  { href: '/injury-report',   label: 'Injury',     icon: '✚' },
  { href: '/settings',        label: 'Settings',   icon: '⚙' },
];

interface Props {
  briefCount?: number;
  onAvaOpen?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function Navigation({ briefCount = 0, onAvaOpen, onRefresh, isRefreshing }: Props) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <header style={{
        background: scrolled ? 'rgba(8,12,20,0.95)' : 'var(--bg)',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        transition: 'background 0.2s',
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 48 }}>

            {/* Logo */}
            <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{
                width: 30, height: 30, background: 'var(--accent)', borderRadius: 7,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 13, color: 'white',
              }}>PC</div>
              <div className="nav-title-text">
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 15, color: 'var(--text)', letterSpacing: '0.04em', lineHeight: 1 }}>PCHS FOOTBALL</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Performance Dashboard</div>
              </div>
            </Link>

            <div style={{ flex: 1 }} />

            {/* Ava button — icon-only on mobile */}
            <button onClick={onAvaOpen} className="ava-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '6px 10px', color: 'var(--muted)',
                fontFamily: 'var(--font-body)', fontSize: 13, cursor: 'pointer',
              }}>
              <span style={{ color: 'var(--accent)', fontSize: 14, flexShrink: 0 }}>✦</span>
              <span className="ava-label">Ask Ava...</span>
            </button>

            {/* Refresh */}
            <button onClick={onRefresh} disabled={isRefreshing} title="Refresh data"
              style={{
                width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--muted)', cursor: isRefreshing ? 'not-allowed' : 'pointer', fontSize: 16,
                animation: isRefreshing ? 'spin 1s linear infinite' : 'none', flexShrink: 0,
              }}>↻</button>

            {/* Bell */}
            <button title="Ava Daily Brief"
              style={{
                width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                color: briefCount > 0 ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer',
                fontSize: 15, position: 'relative', flexShrink: 0,
              }}>
              🔔
              {briefCount > 0 && (
                <span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, background: 'var(--red)', borderRadius: '50%' }} />
              )}
            </button>
          </div>
        </div>

        {/* Desktop tab nav */}
        <div className="desktop-nav" style={{ borderTop: '1px solid var(--border)', overflowX: 'auto', scrollbarWidth: 'none' }}>
          <div style={{ display: 'flex', maxWidth: 1400, margin: '0 auto', padding: '0 12px' }}>
            {TABS.map(tab => (
              <Link key={tab.href} href={tab.href}
                className={`nav-tab ${pathname === tab.href ? 'active' : ''}`}
                style={{ minWidth: 'fit-content', padding: '8px 14px' }}>
                <span style={{ fontSize: 13 }}>{tab.icon}</span>
                <span>{tab.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </header>

      {/* Mobile bottom nav — horizontally scrollable */}
      <nav className="mobile-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'rgba(8,12,20,0.97)', backdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--border)', zIndex: 50,
        display: 'none', overflowX: 'auto', scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        <div style={{ display: 'flex', minWidth: 'max-content', padding: '0 4px 8px' }}>
          {TABS.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`nav-tab ${pathname === tab.href ? 'active' : ''}`}
              style={{ minWidth: 56, padding: '8px 8px', fontSize: 9, flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: 21 }}>{tab.icon}</span>
              <span style={{ fontSize: 9, marginTop: 3 }}>{tab.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-nav  { display: block !important; }
          .nav-title-text { display: none; }
          .ava-label { display: none; }
          .ava-btn { min-width: unset !important; padding: 6px 8px !important; }
          body { padding-bottom: calc(90px + env(safe-area-inset-bottom)) !important; }
        }
      `}</style>
    </>
  );
}
