// ─── Catapult API Types ───────────────────────────────────────────────────────

export interface CatapultAthlete {
  id: string;
  first_name: string;
  last_name: string;
  position?: string;
  jersey?: string;
  active: boolean;
}

export interface CatapultActivity {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  duration: number; // minutes
  tags?: string[];
}

export interface CatapultMetrics {
  athlete_id: string;
  activity_id: string;
  player_load?: number;
  player_load_per_min?: number;
  total_distance?: number;
  max_vel?: number;
  max_vel_percentage?: number;
  profile_max_vel?: number;
  explosive_efforts?: number;
  max_accel?: number;
  max_decel?: number;
  accel_decel_efforts?: number;
  velocity_band4_distance?: number;
  velocity_band7_efforts?: number;
  metabolic_power?: number;
  dynamic_stress_load?: number;
  truck_stick?: number;
  duration_minutes?: number;
}

// ─── Dashboard Types ──────────────────────────────────────────────────────────

export interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  position: string;
  positionGroup: string;
  jersey?: string;
  active: boolean;
}

export interface Session {
  id: string;
  activityId: string;
  activityName: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  amPm: 'AM' | 'PM';
  isGame: boolean;
  opponent?: string;
  weather?: WeatherData;
}

export interface PlayerSessionMetrics {
  athleteId: string;
  athleteName: string;
  position: string;
  positionGroup: string;
  sessionId: string;
  date: string;
  // Core metrics
  playerLoad: number;
  playerLoadPerMin: number;
  truckStick: number;
  maxVelocity: number;
  maxVelocityPct: number;
  profileMaxVelocity: number;
  totalDistance: number;
  explosiveEfforts: number;
  maxAccel: number;
  maxDecel: number;
  accelDecelEfforts: number;
  velocityBand4Distance: number;
  velocityBand7Efforts: number;
  metabolicPower: number;
  dynamicStressLoad: number;
  durationMinutes: number;
  // Computed
  isPersonalBest: Partial<Record<MetricKey, boolean>>;
  injuryStatus?: InjuryStatus;
}

export type MetricKey =
  | 'playerLoad'
  | 'playerLoadPerMin'
  | 'truckStick'
  | 'maxVelocity'
  | 'maxVelocityPct'
  | 'profileMaxVelocity'
  | 'totalDistance'
  | 'explosiveEfforts'
  | 'maxAccel'
  | 'maxDecel'
  | 'accelDecelEfforts'
  | 'velocityBand4Distance'
  | 'velocityBand7Efforts'
  | 'metabolicPower'
  | 'dynamicStressLoad';

export interface MetricConfig {
  key: MetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  description: string;
  higherIsBetter: boolean;
  flagThreshold: number;
  flagDirection: 'above' | 'below' | 'both';
}

// ─── ACWR & Wellness ──────────────────────────────────────────────────────────

export interface ACWRData {
  athleteId: string;
  acuteLoad: number;   // current week PL
  chronicLoad: number; // 4-week rolling avg PL
  acwr: number;
  status: 'green' | 'yellow' | 'red';
  lastSeen: string; // date
  daysSinceLastSession: number;
  notSeenFlag: boolean;
}

export interface MonotonyData {
  weekStart: string;
  weeklyAvg: number;
  weeklyStd: number;
  monotony: number;
  strain: number;
}

export interface CumulativeFatigue {
  athleteId: string;
  last3DayLoad: number;
  isHigh: boolean;
}

// ─── Speed Bands ─────────────────────────────────────────────────────────────

export interface SpeedBandData {
  athleteId: string;
  athleteName: string;
  position: string;
  positionGroup: string;
  // Band 4 - HSY (70-90% max velo, yards)
  band4WeeklyYards: number;
  band4PersonalBestSession: number;
  band4TargetFloor: number;  // 1.2x best session
  band4TargetCeiling: number; // 1.6x best session
  band4Status: 'under' | 'on-track' | 'over';
  // Band 7 - Max Velo (90%+ count)
  band7WeeklyEfforts: number;
  band7ProfileMax: number;
  band7Threshold90: number; // 90% of profile max
  band7TargetMin: number; // 2
  band7TargetMax: number; // 5
  band7Status: 'under' | 'on-track' | 'over';
}

// ─── Injury Report ────────────────────────────────────────────────────────────

export type InjuryStatus = 'Full Go' | 'As Tolerated' | 'Limited' | 'OUT';

export interface InjuryRecord {
  name: string;
  part: string;
  injury: string;
  status: InjuryStatus;
  dateReported: string;
  info: string;
  expectedReturn: string;
  sport: string;
  athleteId?: string; // matched from roster
}

// ─── Weather ─────────────────────────────────────────────────────────────────

export interface WeatherData {
  date: string;
  time: string;
  tempF: number;
  condition: 'sunny' | 'partly-cloudy' | 'cloudy' | 'rain' | 'storm';
  humidity: number;
  heatIndex: number;
  isExcessiveHeat: boolean;
  description: string;
}

// ─── Flags ────────────────────────────────────────────────────────────────────

export interface AthleteFlag {
  athleteId: string;
  athleteName: string;
  position: string;
  positionGroup: string;
  flagType: 'metric-deviation' | 'not-seen' | 'acwr-red' | 'consecutive-load' | 'return-from-absence' | 'injury-conflict';
  metric?: MetricKey;
  value?: number;
  sessionAvg?: number;
  deviationPct?: number;
  direction?: 'above' | 'below';
  sessionId?: string;
  date: string;
  severity: 'warning' | 'critical';
  message: string;
}

// ─── Ava Briefing ─────────────────────────────────────────────────────────────

export interface AvaBriefing {
  generatedAt: string;
  items: AvaBriefingItem[];
  weatherForecast?: WeatherData;
}

export interface AvaBriefingItem {
  type: BriefingItemType;
  title: string;
  content: string;
  severity?: 'info' | 'warning' | 'critical';
  athletes?: string[];
}

export type BriefingItemType =
  | 'week-load-trend'
  | 'flagged-athletes'
  | 'acwr-red-zone'
  | 'new-personal-maxes'
  | 'not-seen'
  | 'position-group-health'
  | 'highest-loaded'
  | 'team-acwr-trend'
  | 'position-group-outlier'
  | 'week-in-review'
  | 'game-week-readiness'
  | 'consecutive-high-load'
  | 'return-from-absence'
  | 'practice-efficiency'
  | 'speed-band-summary'
  | 'weather'
  | 'injury-report';

// ─── Position Groups ──────────────────────────────────────────────────────────

export const POSITION_GROUPS: Record<string, string[]> = {
  'Offensive Line': ['OL', 'C', 'OG', 'OT', 'LT', 'RT', 'LG', 'RG'],
  'Skill': ['QB', 'RB', 'WR', 'TE', 'FB', 'HB', 'SB'],
  'Defensive Line': ['DL', 'DE', 'DT', 'NT', 'NG'],
  'Linebackers': ['LB', 'OLB', 'ILB', 'MLB', 'WILL', 'MIKE', 'SAM'],
  'Secondary': ['DB', 'CB', 'S', 'SS', 'FS', 'SAF'],
  'Special Teams': ['K', 'P', 'LS', 'KR', 'PR'],
};

export function getPositionGroup(position: string): string {
  for (const [group, positions] of Object.entries(POSITION_GROUPS)) {
    if (positions.includes(position?.toUpperCase())) return group;
  }
  return 'Other';
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface DashboardSettings {
  seasonStartDate: string;
  weekStartDay: 0 | 1; // 0=Sunday, 1=Monday
  defaultMetric: MetricKey;
  acwrGreenMin: number;
  acwrGreenMax: number;
  acwrYellowMin: number;
  notSeenDays: number;
  minSessionsBeforeFlag: number;
  heatIndexThreshold: number;
  weatherLocation: string;
  weatherLat: number;
  weatherLon: number;
  briefingTime: string; // "19:00"
  briefingEmailSubject: string;
  briefingEmails: string[];
  briefingToggles: Record<BriefingItemType, boolean>;
  flagThresholds: Record<MetricKey, { threshold: number; direction: 'above' | 'below' | 'both' }>;
  inactivePlayers: string[];
}

export const DEFAULT_SETTINGS: DashboardSettings = {
  seasonStartDate: '2026-01-01',
  weekStartDay: 0,
  defaultMetric: 'playerLoad',
  acwrGreenMin: 0.8,
  acwrGreenMax: 1.3,
  acwrYellowMin: 0.5,
  notSeenDays: 4,
  minSessionsBeforeFlag: 4,
  heatIndexThreshold: 103,
  weatherLocation: 'Pell City, AL',
  weatherLat: 33.5882,
  weatherLon: -86.2852,
  briefingTime: '19:00',
  briefingEmailSubject: 'PCHS Football — Daily Performance Brief',
  briefingEmails: [],
  briefingToggles: {
    'week-load-trend': true,
    'flagged-athletes': true,
    'acwr-red-zone': true,
    'new-personal-maxes': true,
    'not-seen': true,
    'position-group-health': true,
    'highest-loaded': true,
    'team-acwr-trend': true,
    'position-group-outlier': true,
    'week-in-review': true,
    'game-week-readiness': true,
    'consecutive-high-load': true,
    'return-from-absence': true,
    'practice-efficiency': true,
    'speed-band-summary': true,
    'weather': true,
    'injury-report': true,
  },
  flagThresholds: {
    playerLoad: { threshold: 15, direction: 'below' },
    playerLoadPerMin: { threshold: 10, direction: 'both' },
    truckStick: { threshold: 30, direction: 'above' },
    maxVelocity: { threshold: 10, direction: 'below' },
    maxVelocityPct: { threshold: 10, direction: 'below' },
    profileMaxVelocity: { threshold: 10, direction: 'below' },
    totalDistance: { threshold: 15, direction: 'below' },
    explosiveEfforts: { threshold: 25, direction: 'both' },
    maxAccel: { threshold: 20, direction: 'above' },
    maxDecel: { threshold: 20, direction: 'above' },
    accelDecelEfforts: { threshold: 25, direction: 'both' },
    velocityBand4Distance: { threshold: 15, direction: 'below' },
    velocityBand7Efforts: { threshold: 25, direction: 'both' },
    metabolicPower: { threshold: 15, direction: 'below' },
    dynamicStressLoad: { threshold: 20, direction: 'above' },
  },
  inactivePlayers: [],
};

export const METRIC_CONFIG: Record<MetricKey, MetricConfig> = {
  playerLoad: {
    key: 'playerLoad', label: 'Player Load', shortLabel: 'PL', unit: 'AU',
    description: 'A measure of the total physical stress placed on an athlete during a session, calculated from accelerations in all directions. Higher = more physical demand.',
    higherIsBetter: false, flagThreshold: 15, flagDirection: 'below',
  },
  playerLoadPerMin: {
    key: 'playerLoadPerMin', label: 'Player Load / Min', shortLabel: 'PL/Min', unit: 'AU/min',
    description: 'Player Load divided by session length. Measures intensity rather than volume — useful for comparing sessions of different lengths.',
    higherIsBetter: false, flagThreshold: 10, flagDirection: 'both',
  },
  truckStick: {
    key: 'truckStick', label: 'Truck Stick', shortLabel: 'Truck', unit: 'N-s',
    description: 'Measures the force of physical contacts and collisions in newton-seconds. Higher values indicate more aggressive or frequent contact load.',
    higherIsBetter: false, flagThreshold: 30, flagDirection: 'above',
  },
  maxVelocity: {
    key: 'maxVelocity', label: 'Max Velocity', shortLabel: 'Max Velo', unit: 'mph',
    description: 'The fastest speed the athlete reached during this session.',
    higherIsBetter: true, flagThreshold: 10, flagDirection: 'below',
  },
  maxVelocityPct: {
    key: 'maxVelocityPct', label: '% of Max Velocity', shortLabel: '% Max Velo', unit: '%',
    description: 'How close the athlete came to their all-time top speed in this session. 90%+ means they were working at near-maximum effort.',
    higherIsBetter: true, flagThreshold: 10, flagDirection: 'below',
  },
  profileMaxVelocity: {
    key: 'profileMaxVelocity', label: 'Profile Max Velocity', shortLabel: 'Profile Max', unit: 'mph',
    description: "The athlete's all-time top speed on record. Used as their personal benchmark for velocity comparisons.",
    higherIsBetter: true, flagThreshold: 10, flagDirection: 'below',
  },
  totalDistance: {
    key: 'totalDistance', label: 'Total Distance', shortLabel: 'Distance', unit: 'yds',
    description: 'Total yards covered during the session across all movement speeds.',
    higherIsBetter: true, flagThreshold: 15, flagDirection: 'below',
  },
  explosiveEfforts: {
    key: 'explosiveEfforts', label: 'Explosive Efforts', shortLabel: 'Explosive', unit: 'efforts',
    description: 'The number of rapid accelerations or high-intensity bursts the athlete produced during the session.',
    higherIsBetter: true, flagThreshold: 25, flagDirection: 'both',
  },
  maxAccel: {
    key: 'maxAccel', label: 'Max Acceleration', shortLabel: 'Max Accel', unit: 'm/s²',
    description: 'The highest rate of speed increase recorded. High values indicate explosive burst capability — but spikes above norm can signal strain risk.',
    higherIsBetter: true, flagThreshold: 20, flagDirection: 'above',
  },
  maxDecel: {
    key: 'maxDecel', label: 'Max Deceleration', shortLabel: 'Max Decel', unit: 'm/s²',
    description: 'The highest rate of speed decrease recorded. High deceleration loads are associated with hamstring and knee stress.',
    higherIsBetter: false, flagThreshold: 20, flagDirection: 'above',
  },
  accelDecelEfforts: {
    key: 'accelDecelEfforts', label: 'A+D Efforts', shortLabel: 'A+D', unit: 'efforts',
    description: 'Combined count of significant acceleration and deceleration events. Reflects total explosive demand on the athlete.',
    higherIsBetter: true, flagThreshold: 25, flagDirection: 'both',
  },
  velocityBand4Distance: {
    key: 'velocityBand4Distance', label: 'VB4 Distance (HSY)', shortLabel: 'HSY', unit: 'yds',
    description: 'Total yards covered at 70–90% of the athlete\'s max velocity. Represents high-speed running volume for the session.',
    higherIsBetter: true, flagThreshold: 15, flagDirection: 'below',
  },
  velocityBand7Efforts: {
    key: 'velocityBand7Efforts', label: 'VB7 Efforts (Max Velo)', shortLabel: 'VB7', unit: 'efforts',
    description: 'Number of times the athlete reached 90% or more of their all-time top speed. Tracks near-maximum sprint exposure.',
    higherIsBetter: true, flagThreshold: 25, flagDirection: 'both',
  },
  metabolicPower: {
    key: 'metabolicPower', label: 'Metabolic Power', shortLabel: 'Met Power', unit: 'W/kg',
    description: 'Estimates the energy the athlete expended per kilogram of body weight per second, accounting for both speed and acceleration. More complete than distance alone for football movements.',
    higherIsBetter: true, flagThreshold: 15, flagDirection: 'below',
  },
  dynamicStressLoad: {
    key: 'dynamicStressLoad', label: 'Dynamic Stress Load', shortLabel: 'DSL', unit: 'AU',
    description: 'Quantifies the mechanical stress placed on muscles and connective tissue from acceleration and deceleration forces. A key indicator of soft tissue injury risk, particularly hamstrings and hip flexors.',
    higherIsBetter: false, flagThreshold: 20, flagDirection: 'above',
  },
};
