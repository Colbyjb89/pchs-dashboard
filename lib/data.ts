// ─── Shared data helpers ──────────────────────────────────────────────────────
// All pages import from here. One place to change if Catapult API shifts.

import { MetricKey, getPositionGroup, METRIC_CONFIG } from './types';

export const SLUG_TO_KEY: Record<string, MetricKey> = {
  total_player_load:                  'playerLoad',
  player_load_per_minute:             'playerLoadPerMin',
  truck_stick:                        'truckStick',
  max_vel:                            'maxVelocity',
  percentage_max_velocity:            'maxVelocityPct',
  athlete_max_velocity:               'profileMaxVelocity',
  total_distance:                     'totalDistance',
  explosive_efforts:                  'explosiveEfforts',
  max_effort_acceleration:            'maxAccel',
  max_effort_deceleration:            'maxDecel',
  'accel&decel_efforts':              'accelDecelEfforts',
  velocity2_band4_total_distance:     'velocityBand4Distance',
  velocity2_band7_total_effort_count: 'velocityBand7Efforts',
  peak_meta_power:                    'metabolicPower',
};

export const ALL_SLUGS = Object.keys(SLUG_TO_KEY);

export const SPEED_SLUGS = [
  'velocity2_band4_total_distance',
  'velocity2_band7_total_effort_count',
  'athlete_max_velocity',
  'max_vel',
];

// Convert a raw Catapult stats row → typed metrics object
export function rowToMetrics(row: Record<string, unknown>): Partial<Record<MetricKey, number>> {
  const out: Partial<Record<MetricKey, number>> = {};
  for (const [slug, key] of Object.entries(SLUG_TO_KEY)) {
    const raw = row[slug];
    if (raw != null && !isNaN(Number(raw))) {
      // Catapult API returns all values in display units (mph, yards, AU) — no conversion needed
      out[key] = Math.round(Number(raw) * 10) / 10;
    }
  }
  return out;
}

export interface NormalizedAthlete {
  id: string;
  name: string;
  position: string;
  positionGroup: string;
}

export function normalizeAthlete(a: Record<string, unknown>): NormalizedAthlete {
  const pos = String(a.position || a.position_name || '');
  return {
    id: String(a.id),
    name: `${a.first_name || ''} ${a.last_name || ''}`.trim() || String(a.name || 'Unknown'),
    position: pos,
    positionGroup: getPositionGroup(pos),
  };
}

export interface NormalizedActivity {
  id: string;
  name: string;
  startTime: number; // unix seconds
  endTime: number;
  date: string;       // MM/DD/YYYY from API or derived
  durationMinutes: number;
  isGame: boolean;
}

export function normalizeActivity(a: Record<string, unknown>): NormalizedActivity {
  const st = Number(a.start_time ?? a.startTime ?? 0);
  const et = Number(a.end_time ?? a.endTime ?? 0);
  const dateStr = String(a.date ?? '');
  const name = String(a.name ?? '');
  return {
    id: String(a.id),
    name,
    startTime: st,
    endTime: et,
    date: dateStr || new Date(st * 1000).toLocaleDateString('en-US'),
    durationMinutes: et && st ? Math.round((et - st) / 60) : Number(a.durationMinutes ?? 0),
    isGame: /game|vs\.|@/i.test(name),
  };
}

// Parse MM/DD/YYYY → Date (noon local to avoid TZ issues)
export function parseActivityDate(dateStr: string): Date {
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]), 12, 0, 0);
  }
  return new Date(dateStr);
}

// ISO week start (Sunday)
export function weekStart(d: Date): string {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy.toISOString().split('T')[0];
}

// ACWR calculation from array of {date, load} sorted recent-first
export function calcACWR(sessions: { date: string; load: number }[]): {
  acwr: number; acuteLoad: number; chronicLoad: number; status: 'green' | 'yellow' | 'red';
} {
  const now = Date.now();
  const dayMs = 86400000;
  const acute = sessions
    .filter(s => now - parseActivityDate(s.date).getTime() <= 7 * dayMs)
    .reduce((sum, s) => sum + s.load, 0);
  const chronic = sessions
    .filter(s => now - parseActivityDate(s.date).getTime() <= 28 * dayMs)
    .reduce((sum, s) => sum + s.load, 0) / 4;
  const acwr = chronic > 0 ? acute / chronic : 0;
  const status = acwr >= 0.8 && acwr <= 1.3 ? 'green' : acwr >= 0.5 ? 'yellow' : 'red';
  return { acwr: Math.round(acwr * 100) / 100, acuteLoad: Math.round(acute * 10) / 10, chronicLoad: Math.round(chronic * 10) / 10, status };
}
