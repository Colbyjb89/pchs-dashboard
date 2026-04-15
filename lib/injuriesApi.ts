// lib/injuriesApi.ts
// Client-side helper — reads/writes injury data via API (device-agnostic)

import { InjuryRecord, InjuryStatus } from './types';
import { StoredInjuryRecord, fuzzyMatchName } from './injuries';

export interface InjuryPayload {
  records: StoredInjuryRecord[];
  uploadedAt: string | null;
  uploadLabel: string | null;
}

// ── Fetch all records from API ────────────────────────────────────────────────
let _cache: InjuryPayload | null = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000; // 1 min

export async function fetchInjuries(): Promise<InjuryPayload> {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  try {
    const res = await fetch('/api/injuries', { cache: 'no-store' });
    const json = await res.json();
    if (json.success) {
      // Defensive: handle if data is an array or stringified JSON
      let data = json.data;
      if (Array.isArray(data)) data = data[0];
      if (typeof data === 'string') data = JSON.parse(data);
      if (!data || !Array.isArray(data.records)) data = { records: [], uploadedAt: null, uploadLabel: null };
      _cache = data;
      _cacheTime = now;
      return data;
    }
  } catch {}
  return { records: [], uploadedAt: null, uploadLabel: null };
}

export function invalidateCache() {
  _cache = null;
  _cacheTime = 0;
}

// ── Upload records to API ─────────────────────────────────────────────────────
export async function uploadInjuries(records: InjuryRecord[]): Promise<{ success: boolean; count: number; error?: string }> {
  const now = new Date();
  const stored: StoredInjuryRecord[] = records.map(r => ({
    ...r,
    uploadedAt: now.toISOString(),
    uploadBatch: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    isCurrent: true,
  }));
  try {
    const res = await fetch('/api/injuries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: stored }),
    });
    const json = await res.json();
    invalidateCache();
    return json;
  } catch (err) {
    return { success: false, count: 0, error: String(err) };
  }
}

// ── Lookup helpers (async, mirror injuries.ts API) ────────────────────────────

export async function getInjuriesForAthlete(athleteName: string): Promise<StoredInjuryRecord[]> {
  const { records } = await fetchInjuries();
  return records.filter(r => fuzzyMatchName(r.name, athleteName));
}

export async function getCurrentInjuryAsync(athleteName: string): Promise<StoredInjuryRecord | null> {
  const all = await getInjuriesForAthlete(athleteName);
  return all.find(r => r.isCurrent) ?? null;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === 'TBD') return null;
  const clean = dateStr.replace(/-/g, '/');
  const parts = clean.split('/');
  if (parts.length === 3) {
    const [m, d, y] = parts.map(Number);
    return new Date(y < 100 ? 2000 + y : y, m - 1, d);
  }
  return null;
}

function parseCatapultDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [m, d, y] = parts.map(Number);
    return new Date(y, m - 1, d);
  }
  return null;
}

export async function isInInjuryWindowAsync(
  athleteName: string,
  sessionDateStr: string
): Promise<StoredInjuryRecord | null> {
  const sessionDate = parseCatapultDate(sessionDateStr);
  if (!sessionDate) return null;
  const injuries = await getInjuriesForAthlete(athleteName);
  for (const inj of injuries) {
    const start = parseDate(inj.dateReported);
    if (!start) continue;
    const end = inj.expectedReturn === 'TBD' || !inj.expectedReturn
      ? new Date(9999, 0, 1)
      : parseDate(inj.expectedReturn);
    if (!end) continue;
    if (sessionDate.getTime() >= start.getTime() - 86400000 &&
        sessionDate.getTime() <= end.getTime() + 86400000) return inj;
  }
  return null;
}
