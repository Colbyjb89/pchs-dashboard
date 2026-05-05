'use client';
import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Ava from '@/components/Ava';
import { MetricKey, METRIC_CONFIG } from '@/lib/types';
import { ALL_SLUGS, rowToMetrics, normalizeAthlete, normalizeActivity, NormalizedActivity, parseActivityDate, weekStart } from '@/lib/data';
import InjuryFlag from '@/components/InjuryFlag';
import { getInjuryHistory, fuzzyMatchName } from '@/lib/injuries';



// ─── Color coding by % of personal best (same as player drill-down) ───────────
function getIntensityColor(val: number, personalMax: number): { color: string; label: string } {
  if (personalMax <= 0 || val <= 0) return { color: 'var(--text)', label: '—' };
  const pct = (val / personalMax) * 100;
  if (pct >= 90) return { color: '#ff3b3b', label: '~Max' };
  if (pct >= 75) return { color: '#ff8c42', label: 'High' };
  if (pct >= 60) return { color: '#ffd166', label: 'Mod-High' };
  if (pct >= 40) return { color: '#06d6a0', label: 'Moderate' };
  return               { color: '#4da6ff', label: 'Low' };
}

// Bar color for the Team Avg Player Load chart — matches readiness page exactly
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

// ─── Shared hover tooltip (matches Readiness / Player pages) ─────────────────
// Renders the bubble as position:fixed so it escapes every parent stacking
// context (cards, sticky headers, scroll wrappers) and floats above all.
// Visual: dark bg, colored border, bold colored title, white body, fontSize 10.
type TipPlacement =
  | 'below-left'
  | 'below-leftout'
  | 'above-left'
  | 'above-right'
  | 'above-leftout';

function HoverTip({
  title, body, color = 'var(--accent)', placement = 'above-left', width = 240,
  children,
}: {
  title?: string;
  body: React.ReactNode;
  color?: string;
  placement?: TipPlacement;
  width?: number;
  children: React.ReactNode;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Build a faded border color that works for hex, CSS vars, and keywords.
  const isHex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color);
  const borderColor = isHex
    ? `${color}55`
    : `color-mix(in srgb, ${color} 33%, transparent)`;

  const open = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    let top = 0;
    let left = 0;
    if (placement === 'below-left' || placement === 'below-leftout') {
      top = r.bottom + gap;
      left = placement === 'below-leftout' ? r.left : r.left;
    } else {
      top = r.top - gap;
      left = placement === 'above-right' ? r.right : r.left;
    }
    setCoords({ top, left });
  };
  const close = () => setCoords(null);

  const transform =
    placement === 'below-left'    ? 'translate(0, 0)' :
    placement === 'below-leftout' ? 'translate(-100%, 0)' :
    placement === 'above-left'    ? 'translate(0, -100%)' :
    placement === 'above-right'   ? 'translate(0, -100%)' :
    placement === 'above-leftout' ? 'translate(-100%, -100%)' :
    'translate(0, 0)';

  return (
    <div
      ref={wrapRef}
      style={{ display: 'inline-flex' }}
      onMouseEnter={open}
      onMouseLeave={close}>
      {children}
      {coords && (
        <div
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            transform,
            background: '#1a2540',
            border: `1px solid ${borderColor}`,
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 10,
            color: 'white',
            lineHeight: 1.5,
            width,
            zIndex: 9999,
            pointerEvents: 'none',
            boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
          }}>
          {title && (
            <strong style={{ color, display: 'block', marginBottom: 3, fontSize: 10 }}>
              {title}
            </strong>
          )}
          {body}
        </div>
      )}
    </div>
  );
}

// Reusable "?" trigger pill, color reacts on hover.
function HoverQuestion({ accent = 'var(--accent)', size = 14 }: { accent?: string; size?: number }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: hover ? accent : 'var(--dim)',
        color: hover ? 'white' : 'var(--muted)',
        fontSize: 8, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, cursor: 'help',
      }}>?</div>
  );
}

// Per-column bar wrapper. Owns hover state so the entire column (full chart
// height) is the hover hit-target — bars at low values become hard to hover
// otherwise. Hovering anywhere flips the bar to white and bubbles mouse events
// up to the surrounding HoverTip wrapper for the bubble itself.
function BarColumn({
  width, columnHeight, barHeight, color, dateLabel, onClick,
}: {
  width: number; columnHeight: number; barHeight: number; color: string; dateLabel: string; onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        flex: '0 0 auto',
        width,
        height: columnHeight,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        cursor: 'pointer',
      }}>
      <div style={{
        width: '100%',
        height: `${barHeight}px`,
        background: hover ? 'white' : color,
        borderRadius: '3px 3px 0 0',
        transition: 'background 0.1s',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 3,
      }}>
        <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 7, fontFamily: 'var(--font-mono)', color: 'var(--bg)', opacity: 0.7, whiteSpace: 'nowrap', lineHeight: 1, userSelect: 'none', fontWeight: 800 }}>
          {dateLabel}
        </span>
      </div>
    </div>
  );
}

// ─── Position color coding (matches By Position page) ────────────────────────
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
const OVERVIEW_KPIS: { key: MetricKey; label: string; unit: string; color: string }[] = [
  { key: 'playerLoad',           label: 'Player Load',   unit: 'AU',    color: '#1a6bff' },
  { key: 'playerLoadPerMin',     label: 'PL / Min',      unit: 'AU/min',color: '#00e676' },
  { key: 'truckStick',           label: 'Truck Stick',   unit: 'N-s',   color: '#ff6d00' },
  { key: 'maxVelocity',          label: 'Max Velocity',  unit: 'mph',   color: '#7c4dff' },
  { key: 'totalDistance',        label: 'Distance',       unit: 'yds',   color: '#00bcd4' },
  { key: 'maxAccel',             label: 'Max Accel',     unit: 'm/s²',  color: '#ff1744' },
  { key: 'velocityBand4Distance',label: 'HSY (VB4)',     unit: 'yds',   color: '#4da6ff' },
  { key: 'velocityBand7Efforts', label: 'VB7 Efforts',   unit: '',      color: '#ffd166' },
];

// Table columns
const COLUMNS: { key: MetricKey; label: string; unit: string; decimals: number }[] = [
  { key: 'playerLoad',           label: 'PL',         unit: 'AU',    decimals: 1 },
  { key: 'playerLoadPerMin',     label: 'PL/Min',     unit: '',      decimals: 2 },
  { key: 'totalDistance',        label: 'Distance',   unit: 'yds',   decimals: 0 },
  { key: 'maxVelocity',          label: 'Max Vel',    unit: 'mph',   decimals: 1 },
  { key: 'profileMaxVelocity',   label: 'Profile Max',unit: 'mph',   decimals: 1 },
  { key: 'maxVelocityPct',       label: '% Max Vel',  unit: '%',     decimals: 1 },
  { key: 'explosiveEfforts',     label: 'Explosive',  unit: '',      decimals: 0 },
  { key: 'maxAccel',             label: 'Max Acc',    unit: 'm/s²',  decimals: 2 },
  { key: 'accelDecelEfforts',    label: 'A+D Effs',   unit: '',      decimals: 0 },
  { key: 'truckStick',           label: 'Truck',      unit: 'N-s',   decimals: 0 },
  { key: 'velocityBand4Distance',label: 'HSY (VB4)',  unit: 'yds',   decimals: 0 },
  { key: 'velocityBand7Efforts', label: 'VB7 Effs',   unit: '',      decimals: 0 },
];

// Custom position order and mapping
const POSITION_ORDER = ['O Skill', 'D Skill', 'Corners', 'Linebackers', 'O Line', 'D Line', 'Kicker', 'Other'];

const POSITION_GROUP_COLOR: Record<string, string> = {
  'O Skill':     '#06d6a0',  // green
  'D Skill':     '#4da6ff',  // blue
  'Corners':     '#b388ff',  // light purple
  'Linebackers': '#ff6d00',  // orange
  'O Line':      '#ff8c42',  // light orange
  'D Line':      '#ff3b3b',  // red
  'Kicker':      '#90a4ae',  // grey
  'Other':       'var(--muted)',
};

// ─── Raw position grouping (matches Overview By Position page exactly) ───────
// Each position code (QB, RB, WR, etc.) gets its own group + color.
// Display order: O Skill → Safeties → Corners → LB → O Line → D Line → Specialists.
const POS_COLORS: Record<string, string> = {
  // O Skill
  QB: '#ffd166', RB: '#06d6a0', HB: '#06d6a0', FB: '#06d6a0',
  WR: '#4da6ff', SB: '#4da6ff', TE: '#b388ff',
  // O Line
  OL: '#ff8c42', C: '#ff8c42', OG: '#ff8c42', OT: '#ff8c42',
  LT: '#ff8c42', RT: '#ff8c42', LG: '#ff8c42', RG: '#ff8c42',
  // D Line
  DL: '#ff3b3b', DE: '#ff5252', DT: '#ff3b3b', NT: '#e53935', NG: '#e53935',
  // Linebackers
  LB: '#ff6d00', OLB: '#ff7a1a', ILB: '#ff6d00', MLB: '#ff8f00',
  WILL: '#ff6d00', MIKE: '#ff8f00', SAM: '#ff7a1a',
  // Secondary
  CB: '#b388ff', DB: '#9575cd', S: '#7e57c2', SS: '#673ab7', FS: '#5e35b1', SAF: '#7e57c2',
  NICKEL: '#b388ff', DIME: '#9575cd', DCB: '#b388ff',
  // Specialists
  K: '#90a4ae', P: '#78909c', LS: '#607d8b', KR: '#90a4ae', PR: '#78909c',
  ATH: '#64b5f6',
};
const POSITION_DISPLAY_ORDER = [
  'QB', 'RB', 'HB', 'FB', 'WR', 'SB', 'TE',
  'S', 'SS', 'FS', 'SAF',
  'CB', 'DB', 'NICKEL', 'DIME', 'DCB',
  'LB', 'OLB', 'ILB', 'MLB', 'WILL', 'MIKE', 'SAM',
  'OL', 'C', 'OG', 'OT', 'LT', 'RT', 'LG', 'RG',
  'DL', 'DE', 'DT', 'NT', 'NG',
  'K', 'P', 'LS', 'KR', 'PR',
];
function getRawPosColor(pos: string): string {
  const p = (pos || '').toUpperCase().trim();
  return POS_COLORS[p] || POS_COLORS.ATH;
}
function normalizeRawPos(pos: string): string {
  const p = (pos || '').toUpperCase().trim();
  return p || 'ATH';
}

function getCustomGroup(position: string): string {
  const p = position.toUpperCase().trim();
  // O Skill: QB, WR, RB, HB, FB, TE, SB
  if (['QB', 'WR', 'RB', 'HB', 'FB', 'TE', 'SB'].includes(p)) return 'O Skill';
  // D Skill: CB, DB, S, SS, FS, SAF
  if (['CB', 'DB'].includes(p)) return 'Corners';
  // Safety → D Skill
  if (['S', 'SS', 'FS', 'SAF'].includes(p)) return 'D Skill';
  // D Skill catch-all — DE, DT, NT, NG go to D Line
  // LB
  if (['LB', 'OLB', 'ILB', 'MLB', 'WILL', 'MIKE', 'SAM'].includes(p)) return 'Linebackers';
  // O Line
  if (['OL', 'C', 'OG', 'OT', 'LT', 'RT', 'LG', 'RG'].includes(p)) return 'O Line';
  // D Line
  if (['DL', 'DE', 'DT', 'NT', 'NG'].includes(p)) return 'D Line';
  // D Skill — any defensive back not already caught
  if (['DCB', 'NICKEL', 'DIME'].includes(p)) return 'Corners';
  // Kicker
  if (['K', 'P', 'LS', 'KR', 'PR'].includes(p)) return 'Kicker';
  return 'Other';
}

interface AthleteRow {
  id: string; name: string; position: string; positionGroup: string;
  metrics: Partial<Record<MetricKey, number>>;
}

// ── Comparison types + constants ──────────────────────────────────────────────
type CompMode = 'week' | 'day';
interface CompAthleteRow {
  id: string; name: string; position: string; positionGroup: string;
  a: Partial<Record<MetricKey, number>>;
  b: Partial<Record<MetricKey, number>>;
}
interface WeekOption { ws: string; label: string; }
interface SessionOption { id: string; name: string; date: string; }
const COMP_KPI_KEYS: MetricKey[] = ['playerLoad', 'playerLoadPerMin', 'truckStick', 'maxVelocity', 'totalDistance', 'maxAccel', 'velocityBand4Distance', 'velocityBand7Efforts'];
const COMP_KPI_META: Record<string, { label: string; unit: string; color: string }> = {
  playerLoad:            { label: 'Player Load',  unit: 'AU',     color: '#1a6bff' },
  playerLoadPerMin:      { label: 'PL / Min',     unit: 'AU/min', color: '#00e676' },
  truckStick:            { label: 'Truck Stick',  unit: 'N-s',    color: '#ff6d00' },
  maxVelocity:           { label: 'Max Velocity', unit: 'mph',    color: '#7c4dff' },
  totalDistance:         { label: 'Distance',     unit: 'yds',    color: '#00bcd4' },
  maxAccel:              { label: 'Max Accel',    unit: 'm/s²',   color: '#ff1744' },
  velocityBand4Distance: { label: 'HSY (VB4)',    unit: 'yds',    color: '#4da6ff' },
  velocityBand7Efforts:  { label: 'VB7 Efforts',  unit: '',       color: '#ffd166' },
};
function compTAvg(rows: CompAthleteRow[], key: MetricKey, side: 'a' | 'b'): number {
  const vals = rows.map(r => r[side][key] ?? 0).filter(v => v > 0);
  return vals.length > 0 ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : 0;
}

// Compute session team avg for a set of rows + metric
function teamAvg(rows: AthleteRow[], key: MetricKey): number {
  const vals = rows.map(r => r.metrics[key] ?? 0).filter(v => v > 0);
  return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}

const KPI_DESCRIPTIONS: Record<string, string> = {
  playerLoad: 'Team average Player Load for this session. Player Load is a composite measure of mechanical stress based on accelerometer data.',
  playerLoadPerMin: 'Team average Player Load per minute — normalizes load by session duration, useful for comparing sessions of different lengths.',
  truckStick: 'Team average Truck Stick — measures peak impact force during contact events.',
  maxVelocity: 'Team average of each athlete\'s top speed reached during this session.',
  totalDistance: 'Team average total distance covered by each athlete during this session.',
  maxAccel: 'Team average of each athlete\'s peak acceleration reached during this session.',
  velocityBand4Distance: 'Team average High Speed Yards (VB4) — yardage covered above 70% of max velocity. Indicates volume of high-speed running stimulus across the team.',
  velocityBand7Efforts: 'Team average VB7 efforts — number of times each athlete exceeded 90% of max velocity. Indicates exposure to top-end sprint speed.',
};

// KPI comparison — desktop card
function SessionKPICard({ metricKey, label, unit, color, sessionAvg, histAvg, seasonBest, tipPlacement = 'above-right' }: {
  metricKey: MetricKey; label: string; unit: string; color: string;
  sessionAvg: number; histAvg: number; seasonBest: number;
  tipPlacement?: TipPlacement;
}) {
  const changePct = histAvg > 0 && sessionAvg > 0 ? ((sessionAvg - histAvg) / histAvg) * 100 : 0;
  const up = changePct >= 0;
  const noHistory = histAvg <= 0;

  // % color = same 5-band legend as KPI cards
  const pctColor = !noHistory && sessionAvg > 0
    ? changePct >= 15  ? '#ff3b3b'
    : changePct >= 5   ? '#ff8c42'
    : changePct >= -5  ? '#06d6a0'
    : changePct >= -15 ? '#ffd166'
    :                    '#4da6ff'
    : 'var(--muted)';

  // Value color = % of best-ever team session avg (same bands as table cells)
  // Fall back to histAvg if seasonBest not yet loaded
  const effectiveBest = seasonBest > 0 ? seasonBest : (histAvg > 0 ? histAvg * 1.15 : 0);
  const { color: valueColor } = getIntensityColor(sessionAvg, effectiveBest);

  // VB4 (yards) and VB7 (efforts) display as whole numbers — match the data table
  // and the Bands page. All other metrics use 1 decimal.
  const decimals = (metricKey === 'velocityBand4Distance' || metricKey === 'velocityBand7Efforts') ? 0 : 1;

  // ── Desktop card ─────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', borderTop: `2px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</div>
        <HoverTip
          title={`Team Avg — ${label}`}
          body={KPI_DESCRIPTIONS[metricKey] || 'Team average for this metric across all athletes in the session.'}
          color={color}
          placement={tipPlacement}
          width={220}>
          <HoverQuestion accent={color} size={14} />
        </HoverTip>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26, color: valueColor, lineHeight: 1, marginBottom: 4 }}>
        {sessionAvg > 0 ? sessionAvg.toFixed(decimals) : '—'}
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginLeft: 3 }}>{unit}</span>
      </div>
      <div style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 3 }}>Team Average</div>
      {!noHistory && sessionAvg > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: pctColor }}>
            {up ? '▲' : '▼'} {Math.abs(changePct).toFixed(1)}%
          </span>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>vs season avg {histAvg.toFixed(decimals)}</span>
        </div>
      ) : (
        <div style={{ fontSize: 10, color: 'var(--muted)' }}>No history yet</div>
      )}
    </div>
  );
}

// ─── Session Calendar ─────────────────────────────────────────────────────────
function SessionCalendar({ activities, weekOptions, viewToggle, selectedId, selectedWeek, onSelectSession, onSelectWeek, inline = false }: {
  activities: NormalizedActivity[];
  weekOptions: { ws: string; label: string; actIds: string[] }[];
  viewToggle: 'daily' | 'weekly' | 'comparison';
  selectedId: string;
  selectedWeek: string;
  onSelectSession: (id: string) => void;
  onSelectWeek: (ws: string) => void;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click (popover mode only)
  useEffect(() => {
    if (!open || inline) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, inline]);

  // Build session date map: dateStr → activity[]
  const sessionMap: Record<string, NormalizedActivity[]> = {};
  activities.forEach(act => {
    if (!sessionMap[act.date]) sessionMap[act.date] = [];
    sessionMap[act.date].push(act);
  });

  // Build week start map for weekly mode
  const weekStartSet = new Set(weekOptions.map(w => w.ws));

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));

  // Group days into weeks for weekly mode
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const formatDate = (d: Date) => d.toLocaleDateString('en-US');
  const toWS = (d: Date) => {
    const copy = new Date(d);
    copy.setDate(copy.getDate() - copy.getDay());
    return copy.toISOString().split('T')[0];
  };

  const calendarContent = (
    <div>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '0 6px' }}>‹</button>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, color: 'var(--text)' }}>
          {calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </div>
        <button onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '0 6px' }}>›</button>
      </div>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 9, color: 'var(--muted)', padding: '2px 0' }}>{d}</div>
        ))}
      </div>
      {/* Calendar grid */}
      {viewToggle === 'weekly' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {weeks.map((week, wi) => {
            const firstDate = week.find(d => d);
            if (!firstDate) return null;
            const wsKey = toWS(firstDate);
            const weekOpt = weekOptions.find(w => w.ws === wsKey);
            const isSelected = selectedWeek === wsKey;
            const hasSession = weekOpt != null;
            return (
              <div key={wi}
                onClick={() => { if (weekOpt) { onSelectWeek(wsKey); if (!inline) setOpen(false); } }}
                style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderRadius: 6, background: isSelected ? 'rgba(26,107,255,0.2)' : hasSession ? 'rgba(26,107,255,0.06)' : 'transparent', border: isSelected ? '1px solid var(--accent)' : '1px solid transparent', cursor: hasSession ? 'pointer' : 'default', transition: 'all 0.1s' }}>
                {week.map((d, di) => {
                  const dateStr = d ? formatDate(d) : '';
                  const hasSess = d ? !!sessionMap[dateStr] : false;
                  return (
                    <div key={di} style={{ textAlign: 'center', padding: '5px 0', fontSize: 11, fontFamily: 'var(--font-mono)', color: !d ? 'transparent' : isSelected ? 'var(--accent)' : hasSess ? 'var(--text)' : 'var(--dim)', fontWeight: hasSess ? 700 : 400 }}>
                      {d?.getDate()}
                      {hasSess && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', margin: '1px auto 0' }} />}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {days.map((d, i) => {
            if (!d) return <div key={i} />;
            const dateStr = formatDate(d);
            const daySessions = sessionMap[dateStr] || [];
            const hasSess = daySessions.length > 0;
            const isSelected = daySessions.some(s => s.id === selectedId);
            return (
              <button key={i}
                onClick={() => {
                  if (!hasSess) return;
                  if (daySessions.length === 1) {
                    onSelectSession(daySessions[0].id);
                    if (!inline) setOpen(false);
                  } else {
                    const cur = daySessions.findIndex(s => s.id === selectedId);
                    const next = daySessions[(cur + 1) % daySessions.length];
                    onSelectSession(next.id);
                  }
                }}
                style={{ textAlign: 'center', padding: '5px 0', border: 'none', borderRadius: 6, background: isSelected ? 'var(--accent)' : 'transparent', cursor: hasSess ? 'pointer' : 'default', fontSize: 11, fontFamily: 'var(--font-mono)', color: isSelected ? 'white' : hasSess ? 'var(--text)' : 'var(--dim)', fontWeight: hasSess ? 700 : 400, transition: 'background 0.1s' }}>
                {d.getDate()}
                {hasSess && !isSelected && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', margin: '1px auto 0' }} />}
                {daySessions.length > 1 && <div style={{ fontSize: 7, color: isSelected ? 'rgba(255,255,255,0.8)' : 'var(--accent)', fontWeight: 800 }}>{daySessions.length}</div>}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 9, color: 'var(--muted)', fontStyle: 'italic', textAlign: 'center' }}>
        {viewToggle === 'weekly' ? 'Click a week row to select' : 'Dot = session · Number = multiple'}
      </div>
    </div>
  );

  if (inline) return <div>{calendarContent}</div>;

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {/* Calendar button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 38, borderRadius: 8, background: open ? 'var(--accent)' : 'var(--card)', border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer', transition: 'all 0.15s' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={open ? 'white' : 'var(--muted)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>
      {/* Popover */}
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          {calendarContent}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Team Avg Player Load Chart — used in the Comparison toggle
// Daily mode: one bar per session date (exact replica of readiness page chart)
// Weekly mode: one bar per week (each = avg of session bars in that week)
// Click bar → navigate to that session/week + switch toggle accordingly
// ─────────────────────────────────────────────────────────────────────────────
type TeamAvgPLChartProps = {
  mode: 'day' | 'week';
  bars: { activityId: string; date: string; sessionName: string; isGame: boolean; teamAvgPL: number }[];
  onClickDay: (activityId: string) => void;
  onClickWeek: (weekStartKey: string) => void;
};

function TeamAvgPLChart({ mode, bars, onClickDay, onClickWeek }: TeamAvgPLChartProps) {
  // Build the chart-ready array based on mode
  type ChartItem = { key: string; label: string; date: string; teamAvgPL: number; isGame: boolean; tooltipTitle: string; tooltipSub: string };
  const items: ChartItem[] = (() => {
    if (mode === 'day') {
      return bars.map(b => {
        const d = parseActivityDate(b.date);
        return {
          key: b.activityId,
          label: `${d.getMonth() + 1}/${d.getDate()}`,
          date: b.date,
          teamAvgPL: b.teamAvgPL,
          isGame: b.isGame,
          tooltipTitle: b.sessionName,
          tooltipSub: `${b.date} · Avg ${b.teamAvgPL.toFixed(1)} AU`,
        };
      });
    }
    // Weekly aggregation: bucket sessions by weekStart, average team-avg PL across sessions in that week
    const byWeek: Record<string, { wsKey: string; loads: number[]; firstDate: string }> = {};
    bars.forEach(b => {
      const ws = weekStart(parseActivityDate(b.date));
      if (!byWeek[ws]) byWeek[ws] = { wsKey: ws, loads: [], firstDate: b.date };
      byWeek[ws].loads.push(b.teamAvgPL);
    });
    return Object.values(byWeek)
      .sort((a, b) => parseActivityDate(b.firstDate).getTime() - parseActivityDate(a.firstDate).getTime())
      .map(w => {
        const avg = w.loads.reduce((s, v) => s + v, 0) / w.loads.length;
        const wsDate = parseActivityDate(w.wsKey);
        const wsEnd = new Date(wsDate); wsEnd.setDate(wsEnd.getDate() + 6);
        const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
        return {
          key: w.wsKey,
          label: fmt(wsDate),
          date: w.wsKey,
          teamAvgPL: avg,
          isGame: false,
          tooltipTitle: `Week of ${fmt(wsDate)} – ${fmt(wsEnd)}`,
          tooltipSub: `Avg ${avg.toFixed(1)} AU · ${w.loads.length} session${w.loads.length === 1 ? '' : 's'}`,
        };
      });
  })();

  const chartHeight = 130;
  const seasonMax = Math.max(...items.map(i => i.teamAvgPL), 1);
  const avgAll = items.length > 0 ? items.reduce((s, i) => s + i.teamAvgPL, 0) / items.length : 0;
  const avgLineY = seasonMax > 0 ? chartHeight - (avgAll / seasonMax) * chartHeight : 0;

  if (items.length === 0) return null;

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px 12px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15 }}>
          Team Avg Player Load — {mode === 'day' ? 'Daily History' : 'Weekly History'}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
        Season avg: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{avgAll.toFixed(1)} AU</span> · Click any bar to {mode === 'day' ? 'view that session' : 'view that week'}
      </div>

      {/* Scrollable chart area */}
      <div style={{ overflowX: 'auto', overflowY: 'visible', paddingBottom: 4, marginBottom: 10 }}>
        <div style={{ position: 'relative', display: 'flex', gap: 4, alignItems: 'flex-end', minHeight: chartHeight + 18, paddingTop: 8, width: 'max-content', minWidth: '100%' }}>
          {/* Dashed average line */}
          {avgAll > 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: avgLineY + 8, height: 0, borderTop: '1.5px dashed var(--accent)', pointerEvents: 'none', zIndex: 2 }}>
              <span style={{ position: 'absolute', right: 0, top: -16, fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700, background: 'var(--card)', padding: '0 4px' }}>
                AVG {avgAll.toFixed(0)}
              </span>
            </div>
          )}
          {items.map(it => {
            const h = seasonMax > 0 ? (it.teamAvgPL / seasonMax) * chartHeight : 0;
            const barColor = getBarColor(it.teamAvgPL, seasonMax, it.isGame);
            const titleColor = it.isGame ? 'var(--text)' : barColor;
            return (
              <HoverTip
                key={it.key}
                title={it.tooltipTitle}
                body={
                  <>
                    <div style={{ marginBottom: it.isGame ? 3 : 0 }}>{it.tooltipSub}</div>
                    {it.isGame && (
                      <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 9, letterSpacing: '0.08em' }}>GAME</div>
                    )}
                  </>
                }
                color={titleColor}
                placement="above-left"
                width={200}>
                <BarColumn
                  width={26}
                  columnHeight={chartHeight + 8}
                  barHeight={Math.max(h, 20)}
                  color={barColor}
                  dateLabel={it.label}
                  onClick={() => mode === 'day' ? onClickDay(it.key) : onClickWeek(it.key)}
                />
              </HoverTip>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>% of Season Max</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {[
            ...(mode === 'day' ? [{ color: '#ffffff', label: 'Game' }] : []),
            { color: '#ff3b3b', label: '≥90%' },
            { color: '#ff8c42', label: '75–89%' },
            { color: '#ffd166', label: '60–74%' },
            { color: '#06d6a0', label: '40–59%' },
            { color: '#4da6ff', label: '<40%' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 10, height: 14, background: item.color, borderRadius: '2px 2px 0 0', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.label}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
            <div style={{ width: 18, height: 0, borderTop: '1.5px dashed var(--accent)' }} />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Season avg</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // URL params:
  //   ?session=<activityId>          → land on Daily view, selected session
  //   ?view=weekly&week=<weekStart>  → land on Weekly view, selected week
  const initialView = (searchParams.get('view') === 'weekly' ? 'weekly' : 'daily') as 'daily' | 'weekly' | 'comparison';
  const initialWeek = searchParams.get('week') || '';
  const [activities, setActivities] = useState<NormalizedActivity[]>([]);
  const [selectedId, setSelectedId] = useState<string>(searchParams.get('session') || '');
  const [athleteRows, setAthleteRows] = useState<AthleteRow[]>([]);
  const [athleteMap, setAthleteMap] = useState<Record<string, { position: string; positionGroup: string }>>({});
  // Per-athlete all-time personal bests (for intensity color coding)
  const [personalBests, setPersonalBests] = useState<Record<string, Partial<Record<MetricKey, number>>>>({});
  // Historical session team avgs (excluding current session)
  const [historicalAvgs, setHistoricalAvgs] = useState<Partial<Record<MetricKey, number>>>({});
  // Best-ever team session avg per metric (used to color KPI values)
  const [seasonBestAvgs, setSeasonBestAvgs] = useState<Partial<Record<MetricKey, number>>>({});
  const [sortCol, setSortCol] = useState<MetricKey>('playerLoad');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [sessionHasMax, setSessionHasMax] = useState<Record<string, boolean>>({});
  // pbSessionsByAthlete[athleteId][metricKey] = Set of actIds that strictly set a new max chronologically
  const [pbSessionsByAthlete, setPbSessionsByAthlete] = useState<Record<string, Partial<Record<MetricKey, Set<string>>>>>({});
  // Per-session team-avg Player Load — used by the comparison chart
  const [chartBars, setChartBars] = useState<{ activityId: string; date: string; sessionName: string; isGame: boolean; teamAvgPL: number }[]>([]);
  const [avaOpen, setAvaOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewToggle, setViewToggle] = useState<'daily' | 'weekly' | 'comparison'>(initialView);
  const [weeklyRows, setWeeklyRows] = useState<AthleteRow[]>([]);
  const [weeklyAvgs, setWeeklyAvgs] = useState<Partial<Record<MetricKey, number>>>({});
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [athleteSearch, setAthleteSearch] = useState('');

  // ── Comparison state ────────────────────────────────────────────────────────
  const [compMode, setCompMode] = useState<CompMode>('week');
  const [compWeekOptions, setCompWeekOptions] = useState<WeekOption[]>([]);
  const [compWeekA, setCompWeekA] = useState('');
  const [compWeekB, setCompWeekB] = useState('');
  const [compSessionOptions, setCompSessionOptions] = useState<SessionOption[]>([]);
  const [compSessionA, setCompSessionA] = useState('');
  const [compSessionB, setCompSessionB] = useState('');
  const [compAthletes, setCompAthletes] = useState<CompAthleteRow[]>([]);
  const [compLabelA, setCompLabelA] = useState('Period A');
  const [compLabelB, setCompLabelB] = useState('Period B');
  const [compSortMetric, setCompSortMetric] = useState<MetricKey>('playerLoad');
  const [compSortDir, setCompSortDir] = useState<'desc' | 'asc'>('desc');
  const [compComparing, setCompComparing] = useState(false);
  const [compPersonalBests, setCompPersonalBests] = useState<Record<string, Partial<Record<MetricKey, number>>>>({});
  const [weekOptions, setWeekOptions] = useState<{ ws: string; label: string; actIds: string[] }[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(initialWeek);

  const loadBase = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [actRes, athRes] = await Promise.all([fetch('/api/activities'), fetch('/api/athletes')]);
      const actResult = await actRes.json();
      const athResult = await athRes.json();

      let acts: NormalizedActivity[] = [];
      if (actResult.success) {
        acts = (actResult.data as Record<string, unknown>[]).map(normalizeActivity);
        acts.sort((a, b) => b.startTime - a.startTime);
        setActivities(acts);
        if (!selectedId && acts[0]) setSelectedId(acts[0].id);

        // Build week options from activities
        const weekMap: Record<string, { label: string; actIds: string[] }> = {};
        acts.forEach(act => {
          const d = parseActivityDate(act.date);
          const ws = weekStart(d);
          if (!weekMap[ws]) {
            const start = new Date(ws + 'T12:00:00');
            const end = new Date(start); end.setDate(end.getDate() + 6);
            const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            weekMap[ws] = { label: `${fmt(start)} – ${fmt(end)}`, actIds: [] };
          }
          weekMap[ws].actIds.push(act.id);
        });
        const weeks = Object.entries(weekMap)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([ws, { label, actIds }]) => ({ ws, label, actIds }));
        setWeekOptions(weeks);
        // If URL provided a week but it's not in loaded data, fall back to first week.
        // If no URL week and nothing selected yet, default to first week.
        if (weeks[0]) {
          if (!selectedWeek) {
            setSelectedWeek(weeks[0].ws);
          } else if (!weeks.some(w => w.ws === selectedWeek)) {
            setSelectedWeek(weeks[0].ws);
          }
        }
      }

      if (athResult.success) {
        const raw = Array.isArray(athResult.data) ? athResult.data : [];
        const map: Record<string, { position: string; positionGroup: string }> = {};
        raw.forEach((a: Record<string, unknown>) => {
          const n = normalizeAthlete(a);
          map[n.id] = { position: n.position, positionGroup: n.positionGroup };
        });
        setAthleteMap(map);
      }

      // Fetch stats for ALL sessions to build personal bests + historical avgs
      if (acts.length > 1) {
        const allActs = acts;
        const allSessionStats = await Promise.all(
          allActs.map(act =>
            fetch('/api/stats', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ parameters: ALL_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [act.id] }], group_by: ['athlete'] }),
            }).then(r => r.json())
              .then(r => ({ actId: act.id, rows: Array.isArray(r.data) ? r.data : [] }))
              .catch(() => ({ actId: act.id, rows: [] }))
          )
        );

        // Build personal bests per athlete + track which session set each PB (chronological)
        const pbs: Record<string, Partial<Record<MetricKey, number>>> = {};
        const histSums: Partial<Record<MetricKey, number[]>> = {};

        // Metrics to exclude from new-max detection — these are profile/cumulative fields not session performance
        const EXCLUDE_FROM_MAX = new Set<MetricKey>(['profileMaxVelocity', 'maxVelocityPct']);

        // ─── Build per-session PB map (chronological pass) ──────────────────────
        // pbSetMap[athleteId][metricKey] = Set of actIds that set a NEW max
        // chronologically (strictly greater than all values seen in earlier sessions).
        const pbSetMap: Record<string, Partial<Record<MetricKey, Set<string>>>> = {};
        // Track running PB during chronological walk (separate from final "all-time" pbs).
        const runningPB: Record<string, Partial<Record<MetricKey, number>>> = {};

        // Build {actId → rows} lookup for ordered iteration.
        const statsByActId = new Map<string, Record<string, unknown>[]>();
        allSessionStats.forEach(({ actId, rows }) => statsByActId.set(actId, rows));

        // Walk activities in CHRONOLOGICAL order (oldest → newest) for true historical PBs.
        // `acts` is sorted desc by startTime (loadBase line 480), so reverse to get asc.
        const actsChrono = [...allActs].sort((a, b) => a.startTime - b.startTime);
        actsChrono.forEach(act => {
          const rows = statsByActId.get(act.id) ?? [];
          rows.forEach((row: Record<string, unknown>) => {
            const id = String(row.athlete_id ?? '');
            const metrics = rowToMetrics(row);
            if (!runningPB[id]) runningPB[id] = {};
            if (!pbSetMap[id]) pbSetMap[id] = {};
            // Seed maxVelocity floor with the athlete's Catapult profile max the first
            // time we see them. Profile max represents their all-time best (including
            // pre-season / untracked work), so a daily max only earns an asterisk if
            // it strictly exceeds that profile max — not just the in-season max.
            const profileMax = metrics.profileMaxVelocity ?? 0;
            if (profileMax > 0 && (runningPB[id].maxVelocity ?? 0) < profileMax) {
              runningPB[id].maxVelocity = profileMax;
            }
            Object.entries(metrics).forEach(([k, v]) => {
              const key = k as MetricKey;
              if (EXCLUDE_FROM_MAX.has(key)) return; // skip profile-level fields
              if (v == null || (v as number) <= 0) return;
              const prior = runningPB[id][key] ?? 0;
              if ((v as number) > prior) {
                // Strict new max — flag this session as the one that set it.
                runningPB[id][key] = v as number;
                if (!pbSetMap[id][key]) pbSetMap[id][key] = new Set<string>();
                pbSetMap[id][key]!.add(act.id);
              }
            });
          });
        });
        setPbSessionsByAthlete(pbSetMap);

        // Build "all-time" PBs (final values) for intensity color coding.
        Object.entries(runningPB).forEach(([id, metrics]) => {
          pbs[id] = { ...metrics };
        });

        // Build sessionHasMax: true if any athlete set a PB in that session
        const hasMax: Record<string, boolean> = {};
        Object.values(pbSetMap).forEach(metricMap => {
          Object.values(metricMap).forEach(actIdSet => {
            if (actIdSet) actIdSet.forEach(actId => { hasMax[actId] = true; });
          });
        });
        setSessionHasMax(hasMax);

        // Build historical team avgs + per-session team-avg PL for chart
        const chartData: { activityId: string; date: string; sessionName: string; isGame: boolean; teamAvgPL: number }[] = [];
        allSessionStats.forEach(({ actId, rows }) => {
          const act = allActs.find(a => a.id === actId);
          // Collect per-athlete daily totals — each row is one athlete in one session.
          // For chart: team avg PL = sum of per-athlete loads ÷ number of athletes that participated.
          const sessionLoads: number[] = [];
          const sessionVals: Partial<Record<MetricKey, number[]>> = {};
          rows.forEach((row: Record<string, unknown>) => {
            const metrics = rowToMetrics(row);
            const pl = metrics.playerLoad ?? 0;
            if (pl > 0) sessionLoads.push(pl);
            Object.entries(metrics).forEach(([k, v]) => {
              const key = k as MetricKey;
              if (!sessionVals[key]) sessionVals[key] = [];
              if (v != null && v > 0) sessionVals[key]!.push(v);
            });
          });
          if (act && sessionLoads.length > 0) {
            const teamAvgPL = sessionLoads.reduce((s, v) => s + v, 0) / sessionLoads.length;
            chartData.push({
              activityId: act.id,
              date: act.date,
              sessionName: act.name ?? 'Session',
              isGame: !!act.isGame,
              teamAvgPL,
            });
          }
          Object.entries(sessionVals).forEach(([k, vals]) => {
            const key = k as MetricKey;
            if (!histSums[key]) histSums[key] = [];
            if (vals && vals.length > 0) {
              const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
              histSums[key]!.push(avg);
            }
          });
        });
        // Sort chartData newest first — chart renders left-to-right so newest will be on the left
        chartData.sort((a, b) => parseActivityDate(b.date).getTime() - parseActivityDate(a.date).getTime());
        setChartBars(chartData);

        setPersonalBests(pbs);

        // Overall historical avg = avg of all session team avgs
        // Season best = highest single-session team avg ever
        const hAvgs: Partial<Record<MetricKey, number>> = {};
        const sBest: Partial<Record<MetricKey, number>> = {};
        Object.entries(histSums).forEach(([k, vals]) => {
          const key = k as MetricKey;
          if (vals && vals.length > 0) {
            hAvgs[key] = vals.reduce((s, v) => s + v, 0) / vals.length;
            sBest[key] = Math.max(...vals);
          }
        });
        setHistoricalAvgs(hAvgs);
        setSeasonBestAvgs(sBest);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setIsRefreshing(false); }
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  // Seed comparison options from activities once loaded
  useEffect(() => {
    if (!activities.length) return;
    const opts: SessionOption[] = activities.map(a => ({ id: a.id, name: a.name, date: a.date }));
    setCompSessionOptions(opts);
    if (!compSessionA && opts[0]) setCompSessionA(opts[0].id);
    if (!compSessionB && opts[1]) setCompSessionB(opts[1].id);
    // Week options for comparison
    const weekMap: Record<string, string> = {};
    activities.forEach(act => {
      const d = parseActivityDate(act.date);
      const ws = weekStart(d);
      if (!weekMap[ws]) {
        const start = new Date(ws + 'T12:00:00');
        const end = new Date(start); end.setDate(end.getDate() + 6);
        const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        weekMap[ws] = `${fmt(start)} – ${fmt(end)}`;
      }
    });
    const weeks = Object.entries(weekMap).sort(([a], [b]) => b.localeCompare(a)).map(([ws, label]) => ({ ws, label }));
    setCompWeekOptions(weeks);
    if (!compWeekA && weeks[0]) setCompWeekA(weeks[0].ws);
    if (!compWeekB && weeks[1]) setCompWeekB(weeks[1].ws);
  }, [activities]);

  const fetchCompPeriodStats = async (actIds: string[]): Promise<Record<string, Partial<Record<MetricKey, number[]>>>> => {
    const athMetrics: Record<string, Partial<Record<MetricKey, number[]>>> = {};
    await Promise.all(actIds.map(id =>
      fetch('/api/stats', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters: ALL_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [id] }], group_by: ['athlete'] }),
      }).then(r => r.json()).then(result => {
        (Array.isArray(result.data) ? result.data : []).forEach((row: Record<string, unknown>) => {
          const athId = String(row.athlete_id ?? '');
          const metrics = rowToMetrics(row);
          if (!athMetrics[athId]) athMetrics[athId] = {};
          Object.entries(metrics).forEach(([k, v]) => {
            const key = k as MetricKey;
            if (v != null && v > 0) {
              if (!athMetrics[athId][key]) athMetrics[athId][key] = [];
              athMetrics[athId][key]!.push(v);
            }
          });
        });
      }).catch(() => {})
    ));
    return athMetrics;
  };

  const avgCompMetrics = (raw: Partial<Record<MetricKey, number[]>>): Partial<Record<MetricKey, number>> => {
    const out: Partial<Record<MetricKey, number>> = {};
    Object.entries(raw).forEach(([k, vals]) => {
      if (vals && vals.length > 0) out[k as MetricKey] = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
    });
    return out;
  };

  const runComparison = useCallback(async () => {
    setCompComparing(true);
    try {
      const athRes = await fetch('/api/athletes');
      const athResult = await athRes.json();
      if (!athResult.success) return;
      const athList = (Array.isArray(athResult.data) ? athResult.data : []).map((a: Record<string, unknown>) => normalizeAthlete(a));

      let idsA: string[] = [];
      let idsB: string[] = [];
      let lA = 'Period A'; let lB = 'Period B';

      if (compMode === 'week') {
        idsA = activities.filter(a => weekStart(parseActivityDate(a.date)) === compWeekA).map(a => a.id);
        idsB = activities.filter(a => weekStart(parseActivityDate(a.date)) === compWeekB).map(a => a.id);
        lA = compWeekOptions.find(w => w.ws === compWeekA)?.label ?? compWeekA;
        lB = compWeekOptions.find(w => w.ws === compWeekB)?.label ?? compWeekB;
      } else {
        idsA = [compSessionA]; idsB = [compSessionB];
        const sA = compSessionOptions.find(s => s.id === compSessionA);
        const sB = compSessionOptions.find(s => s.id === compSessionB);
        lA = sA ? `${sA.name} · ${sA.date}` : 'Session A';
        lB = sB ? `${sB.name} · ${sB.date}` : 'Session B';
      }

      setCompLabelA(lA); setCompLabelB(lB);
      const [rawA, rawB] = await Promise.all([fetchCompPeriodStats(idsA), fetchCompPeriodStats(idsB)]);

      // Personal bests from recent 20 sessions
      const recentIds = activities.slice(0, 20).map(a => a.id);
      const allRaw = await fetchCompPeriodStats(recentIds);
      const pbs: Record<string, Partial<Record<MetricKey, number>>> = {};
      Object.entries(allRaw).forEach(([athId, metricArrays]) => {
        pbs[athId] = {};
        Object.entries(metricArrays).forEach(([k, vals]) => {
          if (vals && vals.length > 0) pbs[athId][k as MetricKey] = Math.max(...vals);
        });
      });
      setCompPersonalBests(pbs);

      const rows: CompAthleteRow[] = athList
        .map((a: { id: string; name: string; position: string; positionGroup: string }) => ({
          id: a.id, name: a.name, position: a.position, positionGroup: a.positionGroup,
          a: avgCompMetrics(rawA[a.id] ?? {}),
          b: avgCompMetrics(rawB[a.id] ?? {}),
        }))
        .filter((r: CompAthleteRow) => Object.keys(r.a).length > 0 || Object.keys(r.b).length > 0);
      setCompAthletes(rows);
    } catch (e) { console.error(e); }
    finally { setCompComparing(false); }
  }, [compMode, compWeekA, compWeekB, compSessionA, compSessionB, compWeekOptions, compSessionOptions, activities]);

  // Auto-run comparison when selections change and comparison tab is active
  useEffect(() => {
    if (viewToggle !== 'comparison') return;
    const ready = compMode === 'week' ? (compWeekA && compWeekB) : (compSessionA && compSessionB);
    if (ready && !loading) runComparison();
  }, [viewToggle, compMode, compWeekA, compWeekB, compSessionA, compSessionB, loading]);

  // Load weekly data when toggle is weekly or selectedWeek changes
  useEffect(() => {
    if (viewToggle !== 'weekly' || !selectedWeek || !weekOptions.length) return;
    const week = weekOptions.find(w => w.ws === selectedWeek);
    if (!week || !week.actIds.length) return;

    setWeeklyLoading(true);
    Promise.all(week.actIds.map(actId =>
      fetch('/api/stats', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters: ALL_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [actId] }], group_by: ['athlete'] }),
      }).then(r => r.json())
        .then(r => Array.isArray(r.data) ? r.data : [])
        .catch(() => [])
    )).then(allRows => {
      const athVals: Record<string, Partial<Record<MetricKey, number[]>>> = {};
      const athInfo: Record<string, { name: string; position: string; positionGroup: string }> = {};

      allRows.flat().forEach((row: Record<string, unknown>) => {
        const id = String(row.athlete_id ?? '');
        const info = athleteMap[id] || { position: '', positionGroup: '' };
        if (!athVals[id]) {
          athVals[id] = {};
          athInfo[id] = { name: String(row.athlete_name ?? 'Unknown'), ...info };
        }
        const metrics = rowToMetrics(row);
        Object.entries(metrics).forEach(([k, v]) => {
          const key = k as MetricKey;
          if (v != null && v > 0) {
            if (!athVals[id][key]) athVals[id][key] = [];
            athVals[id][key]!.push(v);
          }
        });
      });

      const rows: AthleteRow[] = Object.entries(athVals).map(([id, metricVals]) => {
        const avgMetrics: Partial<Record<MetricKey, number>> = {};
        Object.entries(metricVals).forEach(([k, vals]) => {
          if (vals && vals.length > 0)
            avgMetrics[k as MetricKey] = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
        });
        return { id, ...athInfo[id], metrics: avgMetrics };
      });

      setWeeklyRows(rows);

      const wAvgs: Partial<Record<MetricKey, number>> = {};
      OVERVIEW_KPIS.forEach(({ key }) => { wAvgs[key] = teamAvg(rows, key); });
      COLUMNS.forEach(({ key }) => { if (!wAvgs[key]) wAvgs[key] = teamAvg(rows, key); });
      setWeeklyAvgs(wAvgs);
    }).finally(() => setWeeklyLoading(false));
  }, [viewToggle, selectedWeek, weekOptions, athleteMap]);

  useEffect(() => {
    if (!selectedId) return;
    setStatsLoading(true);
    setAthleteRows([]);
    fetch('/api/stats', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: ALL_SLUGS, filters: [{ name: 'activity_id', comparison: '=', values: [selectedId] }], group_by: ['athlete'] }),
    }).then(r => r.json()).then(result => {
      const rows: AthleteRow[] = (Array.isArray(result.data) ? result.data : []).map((row: Record<string, unknown>) => {
        const id = String(row.athlete_id ?? '');
        const info = athleteMap[id] || { position: '', positionGroup: '' };
        return { id, name: String(row.athlete_name ?? 'Unknown'), position: info.position, positionGroup: info.positionGroup, metrics: rowToMetrics(row) };
      });
      setAthleteRows(rows);
    }).catch(console.error).finally(() => setStatsLoading(false));
  }, [selectedId, athleteMap]);

  const selectedActivity = activities.find(a => a.id === selectedId);

  // Group by raw position (matches Overview By Position page)
  const grouped: Record<string, AthleteRow[]> = {};
  athleteRows.forEach(r => {
    const g = normalizeRawPos(r.position);
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(r);
  });
  Object.keys(grouped).forEach(g => {
    grouped[g].sort((a, b) => {
      const av = a.metrics[sortCol] ?? 0;
      const bv = b.metrics[sortCol] ?? 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  });

  // Current session team avgs
  const sessionAvgs: Partial<Record<MetricKey, number>> = {};
  OVERVIEW_KPIS.forEach(({ key }) => { sessionAvgs[key] = teamAvg(athleteRows, key); });
  COLUMNS.forEach(({ key }) => { if (!sessionAvgs[key]) sessionAvgs[key] = teamAvg(athleteRows, key); });

  // Display vars — switch between daily and weekly
  const displayRows = viewToggle === 'weekly' ? weeklyRows : athleteRows;
  const displayAvgs = viewToggle === 'weekly' ? weeklyAvgs : sessionAvgs;
  const displayLoading = viewToggle === 'weekly' ? weeklyLoading : statsLoading;

  // Re-group display rows by raw position
  const displayGrouped: Record<string, AthleteRow[]> = {};
  displayRows.forEach(r => {
    const g = normalizeRawPos(r.position);
    if (!displayGrouped[g]) displayGrouped[g] = [];
    displayGrouped[g].push(r);
  });
  Object.keys(displayGrouped).forEach(g => {
    displayGrouped[g].sort((a, b) => {
      const av = a.metrics[sortCol] ?? 0;
      const bv = b.metrics[sortCol] ?? 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  });
  // Ordered list: positions present in display, in POSITION_DISPLAY_ORDER, then any extras
  const orderedDisplayPositions: string[] = [];
  POSITION_DISPLAY_ORDER.forEach(p => {
    if (displayGrouped[p]?.length) orderedDisplayPositions.push(p);
  });
  Object.keys(displayGrouped).forEach(p => {
    if (!orderedDisplayPositions.includes(p) && displayGrouped[p]?.length) orderedDisplayPositions.push(p);
  });
  const handleSort = (key: MetricKey) => {
    if (sortCol === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(key); setSortDir('desc'); }
  };

  // Helper: color band for a value vs personal max — matches getIntensityColor
  const pdfBandColor = (val: number, pb: number): string | null => {
    if (pb <= 0 || val <= 0) return null;
    const pct = (val / pb) * 100;
    if (pct >= 90) return '#d62828';   // ~Max — print-safe darker red
    if (pct >= 75) return '#e8590c';   // High — print-safe orange
    if (pct >= 60) return '#c79100';   // Mod — print-safe darker yellow
    if (pct >= 40) return '#1b8e5a';   // Avg — print-safe darker green
    return '#1565c0';                  // Low — print-safe darker blue
  };

  // ─── PDF Export — Daily / Weekly tables ────────────────────────────────────
  const handlePDFExportSession = () => {
    const win = window.open('', '_blank');
    if (!win) return;

    const isWeekly = viewToggle === 'weekly';
    const titleText = isWeekly
      ? (weekOptions.find(w => w.ws === selectedWeek)?.label ?? 'Week')
      : (selectedActivity?.name ?? 'Session');
    const subText = isWeekly
      ? `Weekly Averages · ${displayRows.length} athletes`
      : `${selectedActivity?.date ?? ''} · ${selectedActivity?.durationMinutes ?? 0} min · ${athleteRows.length} athletes`;

    // KPI cards
    const kpiCards = OVERVIEW_KPIS.map(({ key, label, unit, color }) => {
      const val = displayAvgs[key] ?? 0;
      const histAvg = historicalAvgs[key] ?? 0;
      const changePct = histAvg > 0 && val > 0 ? ((val - histAvg) / histAvg) * 100 : null;
      const arrow = changePct == null ? '' : changePct >= 0 ? '▲' : '▼';
      const pctColor = changePct == null ? '#777' : changePct >= 0 ? '#0a7d3b' : '#c84a14';
      // VB4 (yards) and VB7 (efforts) display as whole numbers; other metrics use 1 decimal.
      const decimals = (key === 'velocityBand4Distance' || key === 'velocityBand7Efforts') ? 0 : 1;
      return `
        <div class="kpi-card" style="border-top:3px solid ${color}">
          <div class="kpi-label">${label}</div>
          <div class="kpi-value" style="color:${color}">
            ${val > 0 ? val.toFixed(decimals) : '—'}<span class="unit">${unit}</span>
          </div>
          ${changePct != null ? `<div class="kpi-change" style="color:${pctColor}">${arrow} ${Math.abs(changePct).toFixed(1)}% vs season avg</div>` : '<div class="kpi-change">—</div>'}
        </div>
      `;
    }).join('');

    // Color-coded legend (matches live UI)
    const legendBands = [
      { label: '~Max ≥90%',  color: '#d62828' },
      { label: 'High 75–89%', color: '#e8590c' },
      { label: 'Mod 60–74%',  color: '#c79100' },
      { label: 'Avg 40–59%',  color: '#1b8e5a' },
      { label: 'Low <40%',    color: '#1565c0' },
    ];
    const legendHtml = `
      <div class="legend-bar">
        <span class="legend-title">% of Personal Best</span>
        ${legendBands.map(b => `<span class="legend-item"><span class="legend-dot" style="background:${b.color}"></span>${b.label}</span>`).join('')}
        ${!isWeekly ? '<span class="legend-item"><span class="legend-star">*</span>= New personal max set in this session</span>' : ''}
      </div>
    `;

    // Build grouped rows - by raw position (matches Overview By Position)
    const orderedPositionsForPDF: string[] = [];
    POSITION_DISPLAY_ORDER.forEach(p => { if (displayGrouped[p]?.length) orderedPositionsForPDF.push(p); });
    Object.keys(displayGrouped).forEach(p => { if (!orderedPositionsForPDF.includes(p) && displayGrouped[p]?.length) orderedPositionsForPDF.push(p); });

    // Render each position group as its OWN complete table.
    // Why: browsers honor `page-break-inside:avoid` on <table> much more reliably than on <tbody>/<tr>,
    // and each table's <thead> stays with it on overflow. Solves both: (1) groups don't split,
    // (2) metric column headers repeat at the top of any continuation page.
    // PDF-specific shorter labels (1-2 lines max) — only used in PDF, on-screen table unchanged
    const PDF_LABELS: Partial<Record<MetricKey, string>> = {
      playerLoad:            'PL (AU)',
      playerLoadPerMin:      'PL/MIN',
      totalDistance:         'DISTANCE',
      maxVelocity:           'MV (MPH)',
      profileMaxVelocity:    'PM/MV (MPH)',
      maxVelocityPct:        '% MV',
      explosiveEfforts:      'EXP',
      maxAccel:              'MAX ACC',
      accelDecelEfforts:     'A+D',
      truckStick:            'TRUCK (N-S)',
      velocityBand4Distance: 'HSY 70+',
      velocityBand7Efforts:  'MV 90+',
    };

    const metricHeaderRow = `<thead><tr>
        <th>PLAYER</th>
        <th>POS</th>
        ${COLUMNS.map(c => `<th class="num">${PDF_LABELS[c.key] ?? c.label}</th>`).join('')}
      </tr></thead>`;

    const positionTables = orderedPositionsForPDF.map(group => {
      const groupColor = getRawPosColor(group);
      const members = displayGrouped[group];
      const posAvg: Partial<Record<MetricKey, number>> = {};
      COLUMNS.forEach(c => { posAvg[c.key] = teamAvg(members, c.key); });

      // Position header row — black + bold text, colored left border for visual marker
      const groupHead = `<tr class="group-head" style="border-left:3px solid ${groupColor}">
        <td style="color:#000;font-weight:800">${group}</td>
        <td style="color:#000;font-weight:700">${members.length}</td>
        ${COLUMNS.map(c => {
          const v = posAvg[c.key] ?? 0;
          return `<td style="text-align:right;font-weight:800;color:#000">${v > 0 ? v.toFixed(c.decimals) : '—'}</td>`;
        }).join('')}
      </tr>`;

      const playerRows = members.map(row => {
        return `<tr>
          <td>${row.name}</td>
          <td><span class="pos-tag" style="background:${groupColor}22;color:${groupColor}">${row.position}</span></td>
          ${COLUMNS.map(c => {
            const v = row.metrics[c.key] ?? 0;
            const pb = personalBests[row.id]?.[c.key] ?? 0;
            const bandColor = pdfBandColor(v, pb);
            const cellStyle = bandColor
              ? `text-align:right;color:${bandColor};font-weight:700`
              : `text-align:right`;
            // Daily PDF only — star sessions where this athlete-metric set a strict new max chronologically
            const isNewMax = !isWeekly && !!selectedId &&
              !!pbSessionsByAthlete[row.id]?.[c.key]?.has(selectedId);
            const starHtml = isNewMax ? '<span class="pb-star">*</span>' : '';
            return `<td style="${cellStyle}">${v > 0 ? v.toFixed(c.decimals) : '—'}${starHtml}</td>`;
          }).join('')}
        </tr>`;
      }).join('');

      return `<table class="data-table">${metricHeaderRow}<tbody>${groupHead}${playerRows}</tbody></table>`;
    }).join('');

    win.document.write(`<!DOCTYPE html><html><head><title>${titleText} - Export</title>
    <style>
      @page{size:landscape;margin:0.4in}
      body{font-family:system-ui,sans-serif;padding:24px;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      h2{margin:0 0 4px;font-size:18px}
      p.sub{margin:0 0 16px;color:#555;font-size:11px}
      .kpi-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:8px;margin-bottom:14px}
      .kpi-card{border:1px solid #ddd;border-radius:6px;padding:10px;background:#fafafa;page-break-inside:avoid}
      .kpi-label{font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#666;margin-bottom:6px}
      .kpi-value{font-weight:900;font-size:20px;line-height:1;margin-bottom:4px}
      .kpi-value .unit{font-size:10px;font-weight:500;color:#777;margin-left:3px}
      .kpi-change{font-size:9px;font-weight:600}
      .legend-bar{display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:8px 12px;border:1px solid #ddd;border-radius:6px;background:#f8f8f8;margin-bottom:14px;font-size:10px;color:#333;page-break-inside:avoid}
      .legend-title{font-weight:800;text-transform:uppercase;letter-spacing:0.06em;font-size:9px;color:#666}
      .legend-item{display:inline-flex;align-items:center;gap:5px}
      .legend-dot{display:inline-block;width:8px;height:8px;border-radius:50%}
      .legend-star{display:inline-block;color:#000;font-weight:900;font-size:13px;margin-right:4px;line-height:1}
      /* Per-position table: each is independent so a position never splits across pages */
      .data-table{width:100%;border-collapse:collapse;font-size:10px;page-break-inside:avoid;break-inside:avoid;margin-bottom:0}
      .data-table + .data-table{margin-top:-1px} /* seamless visual continuity between groups */
      .data-table thead{display:table-header-group}
      .data-table th{padding:6px 8px;background:#f0f0f0;text-align:left;border-bottom:2px solid #ccc;border-top:1px solid #ccc;font-size:7px;letter-spacing:0.04em;text-transform:uppercase;color:#444}
      .data-table th.num{text-align:right}
      .data-table td{padding:4px 8px;border-bottom:1px solid #eee}
      .data-table tr{page-break-inside:avoid}
      .data-table tr.group-head td{background:#f6f6f6;border-top:1px solid #ccc;font-size:11px;padding:6px 8px}
      .pos-tag{font-weight:700;font-size:9px;padding:1px 5px;border-radius:3px;background:#eee;color:#444}
      .pb-star{color:#000 !important;font-weight:900;font-size:12px;margin-left:3px;line-height:1}
      @media print{
        body{padding:12px}
        .kpi-card{background:white}
        .data-table{page-break-inside:avoid !important;break-inside:avoid !important}
        .data-table thead{display:table-header-group !important}
      }
    </style>
    </head><body>
    <h2>${titleText}</h2>
    <p class="sub">${subText} · Exported ${new Date().toLocaleDateString()}</p>
    <div class="kpi-grid">${kpiCards}</div>
    ${legendHtml}
    ${positionTables}
    <script>window.onload=()=>{window.print();}<\/script>
    </body></html>`);
    win.document.close();
  };

  // ─── PDF Export — Comparison table ─────────────────────────────────────────
  const handlePDFExportComparison = () => {
    const win = window.open('', '_blank');
    if (!win) return;

    const titleText = `${compLabelA}  vs  ${compLabelB}`;
    const subText = compMode === 'week' ? 'Week vs Week comparison' : 'Day vs Day comparison';

    // KPI cards (compact A/B/Δ)
    const kpiCards = COMP_KPI_KEYS.map(key => {
      const meta = COMP_KPI_META[key];
      const aVal = compTAvg(compAthletes, key, 'a');
      const bVal = compTAvg(compAthletes, key, 'b');
      const changePct = bVal > 0 && aVal > 0 ? ((aVal - bVal) / bVal) * 100 : null;
      const arrow = changePct == null ? '' : changePct >= 0 ? '▲' : '▼';
      const pctColor = changePct == null ? '#777' : changePct >= 0 ? '#0a7d3b' : '#c84a14';
      // VB4 (yards) and VB7 (efforts) display as whole numbers; other metrics use 1 decimal.
      const decimals = (key === 'velocityBand4Distance' || key === 'velocityBand7Efforts') ? 0 : 1;
      return `
        <div class="kpi-card" style="border-top:3px solid ${meta.color}">
          <div class="kpi-label">${meta.label}</div>
          <div class="kpi-pair">
            <div class="kpi-side"><div class="side-label" style="color:${meta.color}">A</div><div class="side-val" style="color:${meta.color}">${aVal > 0 ? aVal.toFixed(decimals) : '—'}</div></div>
            <div class="kpi-side"><div class="side-label">B</div><div class="side-val">${bVal > 0 ? bVal.toFixed(decimals) : '—'}</div></div>
          </div>
          ${changePct != null ? `<div class="kpi-change" style="color:${pctColor}">${arrow} ${Math.abs(changePct).toFixed(1)}%</div>` : '<div class="kpi-change">—</div>'}
        </div>
      `;
    }).join('');

    // Group comparison athletes by raw position
    const compGrouped: Record<string, CompAthleteRow[]> = {};
    compAthletes.forEach(r => {
      const g = normalizeRawPos(r.position);
      if (!compGrouped[g]) compGrouped[g] = [];
      compGrouped[g].push(r);
    });
    const orderedCompPositionsForPDF: string[] = [];
    POSITION_DISPLAY_ORDER.forEach(p => { if (compGrouped[p]?.length) orderedCompPositionsForPDF.push(p); });
    Object.keys(compGrouped).forEach(p => { if (!orderedCompPositionsForPDF.includes(p) && compGrouped[p]?.length) orderedCompPositionsForPDF.push(p); });

    const tableRows = orderedCompPositionsForPDF.map(group => {
      const groupColor = getRawPosColor(group);
      const members = compGrouped[group];
      const groupHead = `<tr class="group-head" style="border-left:3px solid ${groupColor}">
        <td colspan="${COMP_KPI_KEYS.length * 3 + 2}" style="color:${groupColor};font-weight:800">${group} <span style="font-weight:600;color:#666">— ${members.length}</span></td>
      </tr>`;

      const playerRows = members.map(row => {
        const cells = COMP_KPI_KEYS.map(key => {
          const aVal = row.a[key] ?? 0;
          const bVal = row.b[key] ?? 0;
          const delta = bVal > 0 && aVal > 0 ? ((aVal - bVal) / bVal) * 100 : null;
          const arrow = delta == null ? '—' : delta >= 0 ? '▲' : '▼';
          const dColor = delta == null ? '#777' : delta >= 0 ? '#0a7d3b' : '#c84a14';
          // VB4 (yards) and VB7 (efforts) display as whole numbers; other metrics use 1 decimal.
          const decimals = (key === 'velocityBand4Distance' || key === 'velocityBand7Efforts') ? 0 : 1;
          return `<td style="text-align:right">${aVal > 0 ? aVal.toFixed(decimals) : '—'}</td>
                  <td style="text-align:right">${bVal > 0 ? bVal.toFixed(decimals) : '—'}</td>
                  <td style="text-align:right;color:${dColor};font-weight:700">${delta != null ? `${arrow}${Math.abs(delta).toFixed(0)}%` : '—'}</td>`;
        }).join('');
        return `<tr>
          <td>${row.name}</td>
          <td><span class="pos-tag" style="background:${groupColor}22;color:${groupColor}">${row.position}</span></td>
          ${cells}
        </tr>`;
      }).join('');

      return groupHead + playerRows;
    }).join('');

    win.document.write(`<!DOCTYPE html><html><head><title>Comparison Export</title>
    <style>
      body{font-family:system-ui,sans-serif;padding:24px;color:#111}
      h2{margin:0 0 4px;font-size:16px}
      p.sub{margin:0 0 16px;color:#555;font-size:11px}
      .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px}
      .kpi-card{border:1px solid #ddd;border-radius:6px;padding:10px 12px;background:#fafafa;page-break-inside:avoid}
      .kpi-label{font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#666;margin-bottom:6px}
      .kpi-pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px}
      .side-label{font-size:9px;font-weight:700;text-transform:uppercase;color:#777;margin-bottom:2px}
      .side-val{font-weight:900;font-size:16px;line-height:1}
      .kpi-change{font-size:10px;font-weight:700}
      table{width:100%;border-collapse:collapse;font-size:9.5px}
      th{padding:5px 6px;background:#f0f0f0;text-align:left;border-bottom:2px solid #ccc;font-size:9px;letter-spacing:0.04em;text-transform:uppercase;color:#444}
      th.num{text-align:right}
      th.metric-head{text-align:center;border-left:1px solid #ddd}
      td{padding:4px 6px;border-bottom:1px solid #eee}
      tr.group-head td{background:#f6f6f6;border-top:1px solid #ccc;font-size:10px;padding:6px 8px}
      .pos-tag{font-weight:700;font-size:9px;padding:1px 5px;border-radius:3px;background:#eee;color:#444}
      .ab-sub{background:#f7f7f7;font-size:8px;padding:3px 6px;color:#666;text-align:right;font-weight:700;text-transform:uppercase}
      @media print{body{padding:12px}.kpi-card{background:white}}
    </style>
    </head><body>
    <h2>${titleText}</h2>
    <p class="sub">${subText} · ${compAthletes.length} athletes · Exported ${new Date().toLocaleDateString()}</p>
    <div class="kpi-grid">${kpiCards}</div>
    <table>
      <thead>
        <tr>
          <th rowspan="2">Player</th>
          <th rowspan="2">Pos</th>
          ${COMP_KPI_KEYS.map(key => `<th class="metric-head" colspan="3">${COMP_KPI_META[key].label}</th>`).join('')}
        </tr>
        <tr>
          ${COMP_KPI_KEYS.map(() => `<th class="num">A</th><th class="num">B</th><th class="num">Δ%</th>`).join('')}
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    <script>window.onload=()=>{window.print();}<\/script>
    </body></html>`);
    win.document.close();
  };

  // PDF button shared style
  const pdfButtonStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '8px 14px', cursor: 'pointer',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12,
    color: 'var(--muted)', flexShrink: 0, transition: 'all 0.15s',
    height: 36, boxSizing: 'border-box',
  };

  const th: React.CSSProperties = {
    padding: '8px 10px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10,
    letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)',
    textAlign: 'right', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
    borderBottom: '1px solid var(--border)', background: 'var(--surface)',
  };
  const td: React.CSSProperties = {
    padding: '7px 10px', fontFamily: 'var(--font-mono)', fontSize: 12,
    textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
  };

  if (loading) return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} isRefreshing />
      <div style={{ padding: '24px 16px', maxWidth: 1400, margin: '0 auto' }}>
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 48, borderRadius: 8, marginBottom: 8 }} />)}
      </div>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      <Navigation onAvaOpen={() => setAvaOpen(true)} onRefresh={loadBase} isRefreshing={isRefreshing} />
      <Ava isOpen={avaOpen} onClose={() => setAvaOpen(false)} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px', boxSizing: 'border-box', width: '100%' }}>

        {/* Desktop toggle */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {(['daily', 'weekly', 'comparison'] as const).map(m => (
              <button key={m} onClick={() => setViewToggle(m)}
                style={{ padding: '7px 24px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', background: viewToggle === m ? 'var(--accent)' : 'transparent', color: viewToggle === m ? 'white' : 'var(--muted)', transition: 'all 0.15s' }}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {viewToggle === 'comparison' ? (
          /* ── Comparison UI ─────────────────────────────────────── */
          <>
            {/* Mode + Selectors */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 16, marginTop: 0 }}>
              <div style={{ display: 'flex', gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 12, width: 'fit-content' }}>
                {([['week', 'Week Range'], ['day', 'Day vs Day']] as [CompMode, string][]).map(([m, label]) => (
                  <button key={m} onClick={() => setCompMode(m)} style={{ flex: undefined, padding: '8px 20px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', background: compMode === m ? 'var(--accent)' : 'transparent', color: compMode === m ? 'white' : 'var(--muted)', transition: 'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-display)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{compMode === 'week' ? '⬤ Period A' : '⬤ Session A'}</div>
                  {compMode === 'week' ? (
                    <select value={compWeekA} onChange={e => setCompWeekA(e.target.value)} style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
                      {compWeekOptions.map(w => <option key={w.ws} value={w.ws}>{w.label}</option>)}
                    </select>
                  ) : (
                    <select value={compSessionA} onChange={e => setCompSessionA(e.target.value)} style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
                      {compSessionOptions.map(s => <option key={s.id} value={s.id}>{s.name}{` · ${s.date}`}</option>)}
                    </select>
                  )}
                </div>
                <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, color: 'var(--muted)', paddingTop: 20 }}>VS</div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{compMode === 'week' ? '○ Period B' : '○ Session B'}</div>
                  {compMode === 'week' ? (
                    <select value={compWeekB} onChange={e => setCompWeekB(e.target.value)} style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
                      {compWeekOptions.map(w => <option key={w.ws} value={w.ws}>{w.label}</option>)}
                    </select>
                  ) : (
                    <select value={compSessionB} onChange={e => setCompSessionB(e.target.value)} style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
                      {compSessionOptions.map(s => <option key={s.id} value={s.id}>{s.name}{` · ${s.date}`}</option>)}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Team Avg Player Load chart — daily history (Day vs Day) or weekly history (Week vs Week) */}
            {chartBars.length > 0 && (
              <TeamAvgPLChart
                mode={compMode === 'week' ? 'week' : 'day'}
                bars={chartBars}
                onClickDay={(actId) => {
                  setSelectedId(actId);
                  setViewToggle('daily');
                  router.push(`/sessions?session=${actId}`);
                }}
                onClickWeek={(wsKey) => {
                  setSelectedWeek(wsKey);
                  setViewToggle('weekly');
                  router.push(`/sessions?view=weekly&week=${wsKey}`);
                }}
              />
            )}

            {compComparing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
              </div>
            ) : compAthletes.length === 0 ? (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No data found for selected periods</div>
            ) : (
              <>
                {/* KPI Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                  {COMP_KPI_KEYS.map(key => {
                    const meta = COMP_KPI_META[key] || { label: METRIC_CONFIG[key]?.label, unit: METRIC_CONFIG[key]?.unit, color: 'var(--accent)' };
                    const aVal = compTAvg(compAthletes, key, 'a');
                    const bVal = compTAvg(compAthletes, key, 'b');
                    const changePct = bVal > 0 && aVal > 0 ? ((aVal - bVal) / bVal) * 100 : null;
                    const up = changePct != null && changePct >= 0;
                    // VB4 (yards) and VB7 (efforts) display as whole numbers; other metrics use 1 decimal.
                    const decimals = (key === 'velocityBand4Distance' || key === 'velocityBand7Efforts') ? 0 : 1;
                    return (
                      <div key={key} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${meta.color}`, borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>{meta.label}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                          <button
                            onClick={() => {
                              if (compMode === 'week') {
                                setSelectedWeek(compWeekA);
                                setViewToggle('weekly');
                                router.push(`/sessions?view=weekly&week=${compWeekA}`);
                              } else {
                                setSelectedId(compSessionA);
                                setViewToggle('daily');
                                router.push(`/sessions?session=${compSessionA}`);
                              }
                            }}
                            title={compMode === 'week' ? `Open ${compLabelA} in Weekly view` : `Open ${compLabelA} in Daily view`}
                            style={{ background: 'rgba(26,107,255,0.08)', border: '1px solid rgba(26,107,255,0.2)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(26,107,255,0.16)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(26,107,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(26,107,255,0.2)'; }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                              <div style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-display)', fontWeight: 900, lineHeight: 1 }}>A</div>
                              <div style={{ fontSize: 8, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{compLabelA}</div>
                            </div>
                            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, color: meta.color }}>{aVal > 0 ? aVal.toFixed(decimals) : '—'}<span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 2 }}>{meta.unit}</span></div>
                          </button>
                          <button
                            onClick={() => {
                              if (compMode === 'week') {
                                setSelectedWeek(compWeekB);
                                setViewToggle('weekly');
                                router.push(`/sessions?view=weekly&week=${compWeekB}`);
                              } else {
                                setSelectedId(compSessionB);
                                setViewToggle('daily');
                                router.push(`/sessions?session=${compSessionB}`);
                              }
                            }}
                            title={compMode === 'week' ? `Open ${compLabelB} in Weekly view` : `Open ${compLabelB} in Daily view`}
                            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                              <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 900, lineHeight: 1 }}>B</div>
                              <div style={{ fontSize: 8, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{compLabelB}</div>
                            </div>
                            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, color: 'var(--text)' }}>{bVal > 0 ? bVal.toFixed(decimals) : '—'}<span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 2 }}>{meta.unit}</span></div>
                          </button>
                        </div>
                        {changePct != null && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: up ? '#06d6a0' : '#ff8c42' }}>{up ? '▲' : '▼'} {Math.abs(changePct).toFixed(1)}%</span>
                            <span style={{ fontSize: 10, color: 'var(--muted)' }}>A vs B</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Athlete Table */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, marginBottom: 2 }}>Athlete Breakdown</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>% of personal best</span>
                        {[{ label: '~Max ≥90%', color: '#ff3b3b' }, { label: 'High 75–89%', color: '#ff8c42' }, { label: 'Mod 60–74%', color: '#ffd166' }, { label: 'Avg 40–59%', color: '#06d6a0' }, { label: 'Low <40%', color: '#4da6ff' }].map(item => (
                          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.color }} />
                            <span style={{ fontSize: 9, color: 'var(--muted)' }}>{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button onClick={handlePDFExportComparison}
                      style={pdfButtonStyle}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)'; }}>
                      ↓ PDF
                    </button>
                  </div>
                  {/* Search row — full width inside the table card */}
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--card)', position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="Search athletes..."
                      value={athleteSearch}
                      onChange={e => setAthleteSearch(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', height: 36, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 32px 0 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 12, outline: 'none' }}
                    />
                    {athleteSearch && (
                      <button
                        onClick={() => setAthleteSearch('')}
                        style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4 }}
                        aria-label="Clear search">×</button>
                    )}
                  </div>
                  <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '75vh' }}>
                    {(() => {
                      const q = athleteSearch.trim().toLowerCase();
                      const compFiltered = compAthletes.filter(a => !q || a.name.toLowerCase().includes(q));
                      // Group by raw position (matches Overview By Position page)
                      const compGrouped: Record<string, CompAthleteRow[]> = {};
                      compFiltered.forEach(r => {
                        const g = normalizeRawPos(r.position);
                        if (!compGrouped[g]) compGrouped[g] = [];
                        compGrouped[g].push(r);
                      });
                      // Sort within each group by selected metric
                      Object.keys(compGrouped).forEach(g => {
                        compGrouped[g].sort((x, y) => {
                          const av = x.a[compSortMetric] ?? 0; const bv = y.a[compSortMetric] ?? 0;
                          return compSortDir === 'desc' ? bv - av : av - bv;
                        });
                      });
                      // Ordered positions: present in display, ordered by POSITION_DISPLAY_ORDER
                      const orderedCompPositions: string[] = [];
                      POSITION_DISPLAY_ORDER.forEach(p => { if (compGrouped[p]?.length) orderedCompPositions.push(p); });
                      Object.keys(compGrouped).forEach(p => { if (!orderedCompPositions.includes(p) && compGrouped[p]?.length) orderedCompPositions.push(p); });
                      const compThStyle: React.CSSProperties = { padding: '9px 12px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', userSelect: 'none' };
                      // Navigate-on-click handler — A and B values switch toggle and select session/week
                      const navToA = () => {
                        if (compMode === 'week') {
                          setSelectedWeek(compWeekA);
                          setViewToggle('weekly');
                          router.push(`/sessions?view=weekly&week=${compWeekA}`);
                        } else {
                          setSelectedId(compSessionA);
                          setViewToggle('daily');
                          router.push(`/sessions?session=${compSessionA}`);
                        }
                      };
                      const navToB = () => {
                        if (compMode === 'week') {
                          setSelectedWeek(compWeekB);
                          setViewToggle('weekly');
                          router.push(`/sessions?view=weekly&week=${compWeekB}`);
                        } else {
                          setSelectedId(compSessionB);
                          setViewToggle('daily');
                          router.push(`/sessions?session=${compSessionB}`);
                        }
                      };
                      return (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 'auto' }}>
                          <thead>
                            <tr>
                              <th style={{ ...compThStyle, textAlign: 'left', position: 'sticky', top: 0, left: 0, background: 'var(--surface)', zIndex: 5, minWidth: 150 }}>Athlete</th>
                              {COMP_KPI_KEYS.map(key => {
                                const meta = COMP_KPI_META[key];
                                const isSort = compSortMetric === key;
                                return (
                                  <th key={`a-${key}`} colSpan={3} onClick={() => { if (compSortMetric === key) setCompSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setCompSortMetric(key); setCompSortDir('desc'); } }}
                                    style={{ ...compThStyle, textAlign: 'center', color: isSort ? 'var(--accent)' : 'var(--muted)', borderLeft: '2px solid var(--border)', position: 'sticky', top: 0, zIndex: 3 }}>
                                    {(meta?.label ?? METRIC_CONFIG[key]?.shortLabel)} {isSort ? (compSortDir === 'desc' ? '↓' : '↑') : ''}
                                  </th>
                                );
                              })}
                            </tr>
                            <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                              <th style={{ ...compThStyle, textAlign: 'left', position: 'sticky', top: 34, left: 0, background: 'var(--surface)', zIndex: 5 }} />
                              {COMP_KPI_KEYS.map(key => (
                                <React.Fragment key={key}>
                                  <th style={{ ...compThStyle, color: 'var(--accent)', borderLeft: '2px solid var(--border)', fontSize: 11, fontWeight: 800, position: 'sticky', top: 34, zIndex: 3 }}>A</th>
                                  <th style={{ ...compThStyle, fontSize: 11, fontWeight: 800, color: 'var(--text)', position: 'sticky', top: 34, zIndex: 3 }}>B</th>
                                  <th style={{ ...compThStyle, fontSize: 9, position: 'sticky', top: 34, zIndex: 3 }}>Δ%</th>
                                </React.Fragment>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {orderedCompPositions.map(group => {
                              const groupColor = getRawPosColor(group);
                              const members = compGrouped[group];
                              return (
                                <React.Fragment key={`comp-group-${group}`}>
                                  <tr style={{ background: 'var(--surface)' }}>
                                    <td colSpan={1 + COMP_KPI_KEYS.length * 3} style={{ padding: '6px 14px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: groupColor, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                                      {group} — {members.length}
                                    </td>
                                  </tr>
                                  {members.map((row, i) => (
                                    <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.05)')}
                                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}>
                                      <td style={{ padding: '9px 14px', position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1, whiteSpace: 'nowrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                          <button onClick={() => router.push(`/player?id=${row.id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 12, padding: 0, textAlign: 'left', fontFamily: 'inherit' }}>{row.name}</button>
                                          <InjuryFlag athleteId={row.id} athleteName={row.name} />
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{row.position}</div>
                                      </td>
                                      {COMP_KPI_KEYS.map(key => {
                                        const aVal = row.a[key] ?? 0; const bVal = row.b[key] ?? 0;
                                        const delta = bVal > 0 && aVal > 0 ? ((aVal - bVal) / bVal) * 100 : null;
                                        const up = delta != null && delta >= 0;
                                        const pb = compPersonalBests[row.id]?.[key] ?? 0;
                                        const aColor = pb > 0 && aVal > 0 ? (() => { const pct = (aVal/pb)*100; return pct>=90?'#ff3b3b':pct>=75?'#ff8c42':pct>=60?'#ffd166':pct>=40?'#06d6a0':'#4da6ff'; })() : 'var(--accent)';
                                        const bColor = pb > 0 && bVal > 0 ? (() => { const pct = (bVal/pb)*100; return pct>=90?'#ff3b3b':pct>=75?'#ff8c42':pct>=60?'#ffd166':pct>=40?'#06d6a0':'#4da6ff'; })() : 'var(--text)';
                                        // VB4 (yards) and VB7 (efforts) display as whole numbers; other metrics use 1 decimal.
                                        const decimals = (key === 'velocityBand4Distance' || key === 'velocityBand7Efforts') ? 0 : 1;
                                        return (
                                          <React.Fragment key={key}>
                                            <td onClick={navToA} title={`Open ${compLabelA}`} style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: aColor, whiteSpace: 'nowrap', borderLeft: '2px solid var(--border)', cursor: aVal > 0 ? 'pointer' : 'default' }}
                                              onMouseEnter={e => { if (aVal > 0) (e.currentTarget as HTMLTableCellElement).style.background = 'rgba(26,107,255,0.1)'; }}
                                              onMouseLeave={e => { (e.currentTarget as HTMLTableCellElement).style.background = 'transparent'; }}>
                                              {aVal > 0 ? aVal.toFixed(decimals) : '—'}
                                            </td>
                                            <td onClick={navToB} title={`Open ${compLabelB}`} style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: bColor, whiteSpace: 'nowrap', cursor: bVal > 0 ? 'pointer' : 'default' }}
                                              onMouseEnter={e => { if (bVal > 0) (e.currentTarget as HTMLTableCellElement).style.background = 'rgba(26,107,255,0.1)'; }}
                                              onMouseLeave={e => { (e.currentTarget as HTMLTableCellElement).style.background = 'transparent'; }}>
                                              {bVal > 0 ? bVal.toFixed(decimals) : '—'}
                                            </td>
                                            <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: delta == null ? 'var(--dim)' : up ? '#06d6a0' : '#ff8c42', whiteSpace: 'nowrap' }}>{delta != null ? (up ? '▲' : '▼') + Math.abs(delta).toFixed(0) + '%' : '—'}</td>
                                          </React.Fragment>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 14, alignItems: 'start' }}>

          {/* Session list */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', position: 'sticky', top: 16 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              {viewToggle === 'weekly' ? `Weeks (${weekOptions.length})` : `Sessions (${activities.length})`}
            </div>
            {/* Inline calendar */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <SessionCalendar
                activities={activities} weekOptions={weekOptions}
                viewToggle={viewToggle} selectedId={selectedId} selectedWeek={selectedWeek}
                onSelectSession={setSelectedId} onSelectWeek={setSelectedWeek}
                inline />
            </div>
            <div style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
              {viewToggle === 'weekly' ? weekOptions.map(w => (
                <button key={w.ws} onClick={() => setSelectedWeek(w.ws)} style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '10px 14px', background: w.ws === selectedWeek ? 'rgba(26,107,255,0.12)' : 'transparent', borderLeft: w.ws === selectedWeek ? '3px solid var(--accent)' : '3px solid transparent', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)', marginBottom: 1 }}>{w.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{w.actIds.length} session{w.actIds.length !== 1 ? 's' : ''}</div>
                </button>
              )) : activities.map(act => (
                <button key={act.id} onClick={() => setSelectedId(act.id)} style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '10px 14px', background: act.id === selectedId ? 'rgba(26,107,255,0.12)' : 'transparent', borderLeft: act.id === selectedId ? '3px solid var(--accent)' : '3px solid transparent', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)', marginBottom: 1 }}>{act.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 5 }}>
                    <span>{act.date}</span><span>·</span><span>{act.durationMinutes}min</span>
                    {act.isGame && <span style={{ color: 'var(--orange)', fontWeight: 700 }}>GAME</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Main content */}
          <div style={{ minWidth: 0, width: '100%' }}>
            {(viewToggle === 'weekly' ? selectedWeek : selectedActivity) && (
              <>
                {/* Team Avg Player Load chart — daily history (Daily toggle) or weekly history (Weekly toggle) */}
                {chartBars.length > 0 && (
                  <TeamAvgPLChart
                    mode={viewToggle === 'weekly' ? 'week' : 'day'}
                    bars={chartBars}
                    onClickDay={(actId) => {
                      setSelectedId(actId);
                      setViewToggle('daily');
                      router.push(`/sessions?session=${actId}`);
                    }}
                    onClickWeek={(wsKey) => {
                      setSelectedWeek(wsKey);
                      setViewToggle('weekly');
                      router.push(`/sessions?view=weekly&week=${wsKey}`);
                    }}
                  />
                )}
              <div style={{ marginBottom: 12 }}>
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, borderBottom: undefined }}>
                  <div style={{ padding: '16px 20px 12px' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {viewToggle === 'weekly'
                        ? (weekOptions.find(w => w.ws === selectedWeek)?.label ?? 'Week')
                        : selectedActivity?.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {viewToggle === 'weekly'
                        ? `${weekOptions.find(w => w.ws === selectedWeek)?.label ?? 'Week'} · Weekly averages · ${displayRows.length} athletes`
                        : `${selectedActivity?.date} · ${selectedActivity?.durationMinutes} min · ${athleteRows.length} athletes`}
                      {viewToggle === 'daily' && Object.keys(historicalAvgs).length > 0 && <span style={{ marginLeft: 8, color: 'var(--accent)' }}>· scored vs season avg</span>}
                    </div>
                  </div>

                  {/* KPI section */}
                  <div style={{ padding: '0 20px 16px', display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 10 }}>
                    {OVERVIEW_KPIS.map(({ key, label, unit, color }, idx) => (
                      <SessionKPICard key={key} metricKey={key} label={label} unit={unit} color={color}
                        sessionAvg={displayAvgs[key] ?? 0} histAvg={historicalAvgs[key] ?? 0}
                        seasonBest={seasonBestAvgs[key] ?? 0}
                        tipPlacement={idx >= 4 ? 'above-leftout' : 'above-right'} />
                    ))}
                  </div>

                  {/* Color legend */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 20px 16px', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>vs Season Avg</span>
                    {[{ label: '≥+15%', color: '#ff3b3b' }, { label: '+5–15%', color: '#ff8c42' }, { label: '±5%', color: '#06d6a0' }, { label: '-5–15%', color: '#ffd166' }, { label: '≤-15%', color: '#4da6ff' }].map(item => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: item.color }} />
                        <span style={{ fontSize: 9, color: 'var(--muted)' }}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </>
            )}

            {/* Table */}
            {displayLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...Array(8)].map((_, i) => <div key={i} className="skeleton" style={{ height: 40, borderRadius: 8 }} />)}
              </div>
            ) : displayRows.length === 0 ? (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                {selectedId ? 'No data for this session' : 'Select a session'}
              </div>
            ) : (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                {/* Title + Legend row inside the table card — PDF button anchored top-right */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, marginBottom: 2 }}>
                      {viewToggle === 'weekly' ? 'Weekly Averages' : 'Session Data'}
                      <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginLeft: 8 }}>{displayRows.length} athletes</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>% of personal best</span>
                      {[{ label: '~Max ≥90%', color: '#ff3b3b' }, { label: 'High 75–89%', color: '#ff8c42' }, { label: 'Mod 60–74%', color: '#ffd166' }, { label: 'Avg 40–59%', color: '#06d6a0' }, { label: 'Low <40%', color: '#4da6ff' }].map(item => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.color }} />
                          <span style={{ fontSize: 9, color: 'var(--muted)' }}>{item.label}</span>
                        </div>
                      ))}
                      {viewToggle === 'daily' && <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                          <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 800 }}>*</span>
                          <span style={{ fontSize: 9, color: 'var(--muted)' }}>= New max</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                            <path d="M1 2.5L1 10L6 8L11 10V2.5L6 0.5L1 2.5Z" fill="#ff3b3b" />
                            <line x1="1" y1="2.5" x2="1" y2="11.5" stroke="#ff3b3b" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                          <span style={{ fontSize: 9, color: 'var(--muted)' }}>= Active injury</span>
                        </div>
                      </>}
                    </div>
                  </div>
                  <button onClick={handlePDFExportSession}
                    style={pdfButtonStyle}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)'; }}>
                    ↓ PDF
                  </button>
                </div>
                {/* Search row — full width inside the table card */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--card)', position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search athletes..."
                    value={athleteSearch}
                    onChange={e => setAthleteSearch(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', height: 36, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 32px 0 12px', color: 'var(--text)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 12, outline: 'none' }}
                  />
                  {athleteSearch && (
                    <button
                      onClick={() => setAthleteSearch('')}
                      style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4 }}
                      aria-label="Clear search">×</button>
                  )}
                </div>
                <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '75vh' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 800 }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, textAlign: 'left', position: 'sticky', top: 0, left: 0, background: 'var(--surface)', zIndex: 5, minWidth: 150, width: 150 }}>Player</th>
                        <th style={{ ...th, textAlign: 'left', width: 46, minWidth: 46, background: 'var(--surface)', position: 'sticky', top: 0, left: 150, zIndex: 5 }}>Pos</th>
                        {COLUMNS.map(c => (
                          <th key={c.key} style={{ ...th, position: 'sticky', top: 0, color: sortCol === c.key ? 'var(--accent)' : 'var(--muted)', background: 'var(--surface)', zIndex: 3 }} onClick={() => handleSort(c.key)}>
                            {c.label} {sortCol === c.key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                            {c.unit && <div style={{ fontSize: 8, opacity: 0.6, fontWeight: 500 }}>{c.unit}</div>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orderedDisplayPositions.filter(g => {
                        if (!displayGrouped[g]?.length) return false;
                        if (!athleteSearch.trim()) return true;
                        const q = athleteSearch.toLowerCase();
                        return displayGrouped[g].some(r => r.name.toLowerCase().includes(q));
                      }).map(group => {
                        const groupColor = getRawPosColor(group);
                        const allMembers = displayGrouped[group];
                        const q = athleteSearch.trim().toLowerCase();
                        const filteredMembers = q ? allMembers.filter(r => r.name.toLowerCase().includes(q)) : allMembers;
                        // Position avg is still computed from ALL members, not filtered (keeps stats meaningful)
                        const posAvg: Partial<Record<MetricKey, number>> = {};
                        COLUMNS.forEach(c => { posAvg[c.key] = teamAvg(allMembers, c.key); });
                        return (
                        <>
                          <tr key={`group-${group}`} style={{ background: 'var(--surface)' }}>
                            <td colSpan={2} style={{ padding: '6px 14px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: groupColor, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', left: 0, width: 196, minWidth: 196, zIndex: 2 }}>
                              {group} — {q ? `${filteredMembers.length}/${allMembers.length}` : allMembers.length}
                            </td>
                            {COLUMNS.map(c => {
                              const avg = posAvg[c.key] ?? 0;
                              const teamA = displayAvgs[c.key] ?? 0;
                              const changePct = teamA > 0 && avg > 0 ? ((avg - teamA) / teamA) * 100 : 0;
                              const up = changePct >= 0;
                              return (
                                <td key={c.key} style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--surface)', padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: groupColor, whiteSpace: 'nowrap' }}>
                                  {avg > 0 ? avg.toFixed(c.decimals) : '—'}
                                  {teamA > 0 && avg > 0 && (
                                    <div style={{ fontSize: 8, color: up ? '#06d6a0' : '#ff8c42', marginTop: 1, fontWeight: 700 }}>
                                      {up ? '▲' : '▼'}{Math.abs(changePct).toFixed(0)}%
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                          {filteredMembers.map((row, i) => (
                            <tr key={row.id}
                              style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.05)')}
                              onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}>
                              <td style={{ ...td, textAlign: 'left', position: 'sticky', left: 0, background: '#0f1923', zIndex: 1, width: 150, minWidth: 150, overflow: 'visible' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <InjuryFlag athleteId={row.id} athleteName={row.name} sessionDate={selectedActivity?.date} />
                                  <button onClick={() => router.push(`/player?id=${row.id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 12, padding: 0, textAlign: 'left', fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 126 }}>
                                    {row.name}
                                  </button>
                                </div>
                              </td>
                              <td style={{ ...td, textAlign: 'left', position: 'sticky', left: 150, background: '#0f1923', zIndex: 1, color: getPosColor(row.position), fontSize: 11, fontWeight: 700, boxShadow: '2px 0 6px rgba(0,0,0,0.4)', width: 46, minWidth: 46 }}>{row.position}</td>
                              {COLUMNS.map(c => {
                                const val = row.metrics[c.key] ?? 0;
                                const pb = personalBests[row.id]?.[c.key] ?? 0;
                                const { color } = getIntensityColor(val, pb);
                                const isBold = pb > 0 && val > 0 && (val / pb) >= 0.75;
                                // Star ONLY if this exact session set a strict new max chronologically.
                                // Daily view only — Weekly aggregates are not session-level.
                                const isNewMax = viewToggle === 'daily' && !!selectedId &&
                                  !!pbSessionsByAthlete[row.id]?.[c.key]?.has(selectedId);
                                return (
                                  <td key={c.key}
                                    onClick={() => {
                                      const isBand = (['velocityBand4Distance', 'velocityBand7Efforts'] as MetricKey[]).includes(c.key);
                                      if (isBand) {
                                        // VB4 / VB7 cells deep-link into the consolidated /player page's
                                        // Bands view, scoped to the relevant week.
                                        // - Daily toggle: derive Sunday key from the selected session's date
                                        // - Weekly toggle: selectedWeek is already a Sunday key (YYYY-MM-DD)
                                        const wk = viewToggle === 'weekly'
                                          ? selectedWeek
                                          : (selectedActivity ? weekStart(parseActivityDate(selectedActivity.date)) : '');
                                        router.push(wk ? `/player?view=bands&week=${wk}` : '/player?view=bands');
                                      } else {
                                        router.push(`/player?id=${row.id}&session=${selectedId}`);
                                      }
                                    }}
                                    style={{ ...td, color, fontWeight: isBold ? 700 : 400, cursor: 'pointer', position: 'relative' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,107,255,0.1)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                    {val > 0 ? val.toFixed(c.decimals) : '—'}
                                    {isNewMax && <span style={{ color: 'var(--text)', fontWeight: 900, fontSize: 11, marginLeft: 2, lineHeight: 1 }}>*</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
        )} {/* end comparison ternary */}
      </div>
    </div>
  );
}

export default function Sessions() {
  return <Suspense fallback={<div style={{ background: 'var(--bg)', minHeight: '100vh' }} />}><SessionsContent /></Suspense>;
}
