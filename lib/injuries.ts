// ─── lib/injuries.ts ─────────────────────────────────────────────────────────
// Shared utility for injury data — read/write localStorage, fuzzy match, flags

import { InjuryRecord, InjuryStatus } from './types';

export interface StoredInjuryRecord extends InjuryRecord {
  uploadedAt: string;    // ISO timestamp of the upload batch
  uploadBatch: string;   // human-readable date of upload e.g. "Apr 6, 2026"
  isCurrent: boolean;    // true = in the most recent upload
}

const HISTORY_KEY = 'pchs_injury_history';
const CURRENT_KEY = 'pchs_injury_records';
const UPDATED_KEY = 'pchs_injury_updated';
const BATCH_KEY   = 'pchs_injury_batch';   // ISO of most recent upload batch

// ── Read ─────────────────────────────────────────────────────────────────────

export function getInjuryHistory(): StoredInjuryRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function getCurrentInjuries(): InjuryRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function getLastUpdated(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(UPDATED_KEY) || '';
}

// ── Write ─────────────────────────────────────────────────────────────────────

export function saveInjuryUpload(newRecords: InjuryRecord[]): void {
  if (typeof window === 'undefined') return;

  const now = new Date();
  const batchIso = now.toISOString();
  const batchLabel = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const dateStr = now.toLocaleString();

  // Load existing history
  const history = getInjuryHistory();

  // Mark all existing records as not current
  history.forEach(r => { r.isCurrent = false; });

  // For each new record, check if it already exists (same name + dateReported)
  // If yes, update it. If no, add it.
  newRecords.forEach(rec => {
    const existingIdx = history.findIndex(h =>
      normalizeNameForMatch(h.name) === normalizeNameForMatch(rec.name) &&
      h.dateReported === rec.dateReported
    );
    const stored: StoredInjuryRecord = {
      ...rec,
      uploadedAt: batchIso,
      uploadBatch: batchLabel,
      isCurrent: true,
    };
    if (existingIdx >= 0) {
      history[existingIdx] = stored;
    } else {
      history.push(stored);
    }
  });

  // Save history and current snapshot
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  localStorage.setItem(CURRENT_KEY, JSON.stringify(newRecords));
  localStorage.setItem(UPDATED_KEY, dateStr);
  localStorage.setItem(BATCH_KEY, batchIso);
}

export function clearAllInjuryData(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(CURRENT_KEY);
  localStorage.removeItem(UPDATED_KEY);
  localStorage.removeItem(BATCH_KEY);
}

// ── Name matching ─────────────────────────────────────────────────────────────

export function normalizeNameForMatch(name: string): string {
  // Handle "Last, First" → "first last" and "First Last" → "first last"
  const clean = name.toLowerCase().trim().replace(/[^a-z\s]/g, '');
  if (clean.includes(',')) {
    const [last, first] = clean.split(',').map(s => s.trim());
    return `${first} ${last}`;
  }
  return clean;
}

export function fuzzyMatchName(athleteName: string, injuryName: string): boolean {
  const a = normalizeNameForMatch(athleteName);
  const b = normalizeNameForMatch(injuryName);
  if (a === b) return true;
  // Check if all parts of one name appear in the other
  const aParts = a.split(' ').filter(Boolean);
  const bParts = b.split(' ').filter(Boolean);
  // Last name match + first initial match
  if (aParts.length >= 2 && bParts.length >= 2) {
    const aLast = aParts[aParts.length - 1];
    const bLast = bParts[bParts.length - 1];
    if (aLast === bLast && aParts[0][0] === bParts[0][0]) return true;
  }
  return false;
}

// ── Date utilities ────────────────────────────────────────────────────────────

function parseInjuryDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === 'TBD') return null;
  // Handle M-D-YY and M/D/YY formats
  const clean = dateStr.replace(/-/g, '/');
  const parts = clean.split('/');
  if (parts.length === 3) {
    const [m, d, y] = parts.map(Number);
    const year = y < 100 ? 2000 + y : y;
    return new Date(year, m - 1, d);
  }
  return null;
}

function parseCatapultDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  // MM/DD/YYYY or similar
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [m, d, y] = parts.map(Number);
    return new Date(y, m - 1, d);
  }
  return null;
}

// ── Core lookup functions ─────────────────────────────────────────────────────

export interface InjuryMatch {
  record: StoredInjuryRecord;
  isCurrent: boolean;
  isInWindow: boolean;  // session date falls within injury window
}

// Get ALL injury records for an athlete (current + history)
export function getAthleteInjuries(athleteName: string): StoredInjuryRecord[] {
  const history = getInjuryHistory();
  return history.filter(r => fuzzyMatchName(athleteName, r.name));
}

// Get current active injury for an athlete (in most recent upload)
export function getCurrentInjury(athleteName: string): StoredInjuryRecord | null {
  const injuries = getAthleteInjuries(athleteName);
  return injuries.find(r => r.isCurrent) ?? null;
}

// Check if a session date falls within any injury window for an athlete
export function isSessionInInjuryWindow(
  athleteName: string,
  sessionDateStr: string
): StoredInjuryRecord | null {
  const sessionDate = parseCatapultDate(sessionDateStr);
  if (!sessionDate) return null;

  const injuries = getAthleteInjuries(athleteName);

  for (const inj of injuries) {
    const start = parseInjuryDate(inj.dateReported);
    if (!start) continue;

    // End date: expectedReturn or open-ended if TBD
    const end = inj.expectedReturn === 'TBD' || !inj.expectedReturn
      ? new Date(9999, 0, 1)  // open-ended
      : parseInjuryDate(inj.expectedReturn);

    if (!end) continue;

    // Add 1-day buffer on each side for date format differences
    const startMs = start.getTime() - 86400000;
    const endMs = end.getTime() + 86400000;
    const sesMs = sessionDate.getTime();

    if (sesMs >= startMs && sesMs <= endMs) return inj;
  }

  return null;
}

// Status color helpers
export const STATUS_COLORS: Record<InjuryStatus, { color: string; bg: string; border: string }> = {
  'OUT':          { color: '#ff3b3b', bg: 'rgba(255,59,59,0.12)',   border: 'rgba(255,59,59,0.35)' },
  'Limited':      { color: '#ff8c42', bg: 'rgba(255,140,66,0.12)',  border: 'rgba(255,140,66,0.35)' },
  'As Tolerated': { color: '#ffd166', bg: 'rgba(255,209,102,0.12)', border: 'rgba(255,209,102,0.35)' },
  'Full Go':      { color: '#06d6a0', bg: 'rgba(6,214,160,0.12)',   border: 'rgba(6,214,160,0.35)' },
};
