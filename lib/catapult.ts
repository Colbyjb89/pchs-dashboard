const BASE_URL = process.env.CATAPULT_BASE_URL || 'https://connect-us.catapultsports.com';
const TOKEN = process.env.CATAPULT_TOKEN || '';

const headers = () => ({
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
});

export const SLUGS = {
  playerLoad: 'total_player_load',
  playerLoadPerMin: 'player_load_per_minute',
  truckStick: 'truck_stick',
  maxVelocity: 'max_vel',
  pctMaxVelocity: 'percentage_max_velocity',
  profileMaxVelocity: 'athlete_max_velocity',
  totalDistance: 'total_distance',
  explosiveEfforts: 'explosive_efforts',
  maxAcceleration: 'max_effort_acceleration',
  maxDeceleration: 'max_effort_deceleration',
  accelDecelEfforts: 'accel&decel_efforts',
  vb4Distance: 'velocity2_band4_total_distance',
  vb7Efforts: 'velocity2_band7_total_effort_count',
  peakMetaPower: 'peak_meta_power',
  totalDuration: 'total_duration',
  totalAccelerationLoad: 'total_acceleration_load',
};

export const ALL_METRIC_SLUGS = Object.values(SLUGS);

// m/s to mph
export const toMph = (ms: number) => Math.round(ms * 2.23694 * 10) / 10;

async function post(path: string, body: object) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Catapult ${res.status}: ${await res.text()}`);
  return res.json();
}

async function get(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Catapult ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getAthletes() {
  const data = await get('/api/v6/athletes/');
  return Array.isArray(data) ? data : (data.data ?? []);
}

export async function getActivities() {
  const data = await get('/api/v6/activities/');
  return Array.isArray(data) ? data : (data.data ?? []);
}

// Per-athlete stats for one session
export async function getSessionStats(activityId: string) {
  return post('/api/v6/stats/', {
    parameters: ALL_METRIC_SLUGS,
    filters: [{ name: 'activity_id', comparison: '=', values: [activityId] }],
    group_by: ['athlete'],
  });
}

// Per-athlete all-time totals (for Team Overview maxes)
export async function getTeamStats() {
  return post('/api/v6/stats/', {
    parameters: ALL_METRIC_SLUGS,
    group_by: ['athlete'],
  });
}

// Per-session breakdown for one athlete (Player Drill-Down history)
export async function getAthleteHistory(athleteId: string) {
  return post('/api/v6/stats/', {
    parameters: ALL_METRIC_SLUGS,
    filters: [{ name: 'athlete_id', comparison: '=', values: [athleteId] }],
    group_by: ['activity'],
  });
}
