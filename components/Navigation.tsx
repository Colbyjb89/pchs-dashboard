'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const TABS = [
  { href: '/',                label: 'Overview',   icon: '◈' },
  { href: '/sessions',        label: 'Sessions',   icon: '▦' },
  { href: '/player',          label: 'Player',     icon: '◉' },
  { href: '/max-finder',      label: 'Max Finder', icon: '△' },
  { href: '/by-position',     label: 'Position',   icon: '⊞' },
  { href: '/readiness',       label: 'Readiness',  icon: '◎' },
  { href: '/speed-bands',     label: 'Bands',      icon: '»' },
  { href: '/week-over-week',  label: 'Comparison', icon: '⇄' },
  { href: '/season-timeline', label: 'Season',     icon: '∿' },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      {/* ── Header ─────────────────────────────────────────── */}
      <header
        style={{
          background: scrolled ? 'rgba(8,12,20,0.95)' : 'var(--bg)',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          transition: 'background 0.2s',
        }}
      >
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 52 }}>
            {/* Logo / Title */}
            <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32,
                background: 'var(--accent)',
                borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 14,
                color: 'white',
                letterSpacing: '-0.02em',
              }}>PC</div>
              <div>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 900,
                  fontSize: 16,
                  color: 'var(--text)',
                  letterSpacing: '0.04em',
                  lineHeight: 1,
                }}>PCHS FOOTBALL</div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 10,
                  color: 'var(--muted)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}>Performance Dashboard</div>
              </div>
            </Link>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Ava Search */}
            <button
              onClick={onAvaOpen}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '6px 12px',
                color: 'var(--muted)',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                cursor: 'pointer',
                transition: 'border-color 0.15s',
                minWidth: 160,
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <span style={{ color: 'var(--accent)', fontSize: 14 }}>✦</span>
              <span>Ask Ava...</span>
            </button>

            {/* Refresh */}
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              style={{
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--muted)',
                cursor: isRefreshing ? 'not-allowed' : 'pointer',
                fontSize: 16,
                transition: 'color 0.15s',
                animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
              }}
              title="Refresh data"
            >
              ↻
            </button>

            {/* Notification Bell */}
            <button
              style={{
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: briefCount > 0 ? 'var(--accent)' : 'var(--muted)',
                cursor: 'pointer',
                fontSize: 16,
                position: 'relative',
              }}
              title="Ava Daily Brief"
            >
              🔔
              {briefCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: 4, right: 4,
                  width: 8, height: 8,
                  background: 'var(--red)',
                  borderRadius: '50%',
                  animation: 'pulse-dot 2s infinite',
                }} />
              )}
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              style={{
                display: 'none',
                width: 36, height: 36,
                alignItems: 'center', justifyContent: 'center',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--muted)',
                cursor: 'pointer',
                fontSize: 18,
              }}
              className="mobile-menu-btn"
            >
              ☰
            </button>
          </div>
        </div>

        {/* ── Desktop Tab Nav ─────────────────────────────── */}
        <div
          style={{
            borderTop: '1px solid var(--border)',
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
          className="desktop-nav"
        >
          <div style={{
            display: 'flex',
            maxWidth: 1400,
            margin: '0 auto',
            padding: '0 16px',
          }}>
            {TABS.map(tab => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`nav-tab ${pathname === tab.href ? 'active' : ''}`}
                style={{ minWidth: 'fit-content', padding: '8px 16px' }}
              >
                <span style={{ fontSize: 14 }}>{tab.icon}</span>
                <span>{tab.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </header>

      {/* ── Mobile Bottom Nav ───────────────────────────── */}
      <nav style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        background: 'rgba(8,12,20,0.97)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--border)',
        zIndex: 50,
        display: 'none',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }} className="mobile-nav">
        <div style={{ display: 'flex', minWidth: 'max-content' }}>
          {TABS.map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`nav-tab ${pathname === tab.href ? 'active' : ''}`}
              style={{ minWidth: 64, padding: '6px 10px', fontSize: 9 }}
            >
              <span style={{ fontSize: 16 }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-nav  { display: block !important; }
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </>
  );
}
