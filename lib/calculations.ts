import { ACWRData, MonotonyData, CumulativeFatigue, PlayerSessionMetrics, SpeedBandData, AthleteFlag, MetricKey, METRIC_CONFIG } from './types';

// ─── ACWR Calculation ─────────────────────────────────────────────────────────

export function calculateACWR(
  athleteId: string,
  sessions: PlayerSessionMetrics[],
  notSeenDays: number = 4
): ACWRData {
  const now = new Date();
  const athleteSessions = sessions
    .filter(s => s.athleteId === athleteId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (athleteSessions.length === 0) {
    return {
      athleteId,
      acuteLoad: 0,
      chronicLoad: 0,
      acwr: 0,
      status: 'yellow',
      lastSeen: '',
      daysSinceLastSession: 999,
      notSeenFlag: true,
    };
  }

  // Acute load: current week (Sunday–Saturday)
  const weekStart = getWeekStart(now);
  const acuteSessions = athleteSessions.filter(s => new Date(s.date) >= weekStart);
  const acuteLoad = acuteSessions.reduce((sum, s) => sum + s.playerLoad, 0);

  // Chronic load: 4-week rolling average
  const fourWeeksAgo = new Date(now);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const chronicSessions = athleteSessions.filter(s => new Date(s.date) >= fourWeeksAgo);

  // Group by week and average
  const weeklyLoads: number[] = [];
  for (let i = 0; i < 4; i++) {
    const wStart = new Date(weekStart);
    wStart.setDate(wStart.getDate() - i * 7);
    const wEnd = new Date(wStart);
    wEnd.setDate(wEnd.getDate() + 7);
    const weekSessions = chronicSessions.filter(s => {
      const d = new Date(s.date);
      return d >= wStart && d < wEnd;
    });
    weeklyLoads.push(weekSessions.reduce((sum, s) => sum + s.playerLoad, 0));
  }
  const chronicLoad = weeklyLoads.reduce((a, b) => a + b, 0) / 4;

  const acwr = chronicLoad > 0 ? acuteLoad / chronicLoad : 0;

  let status: 'green' | 'yellow' | 'red';
  if (acwr >= 0.8 && acwr <= 1.3) status = 'green';
  else if (acwr >= 0.5 && acwr < 0.8) status = 'yellow';
  else status = 'red';

  const lastSeen = athleteSessions[0].date;
  const daysSinceLastSession = Math.floor(
    (now.getTime() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    athleteId,
    acuteLoad,
    chronicLoad,
    acwr: Math.round(acwr * 100) / 100,
    status,
    lastSeen,
    daysSinceLastSession,
    notSeenFlag: daysSinceLastSession >= notSeenDays,
  };
}

// ─── Monotony & Strain ────────────────────────────────────────────────────────

export function calculateMonotony(
  sessions: PlayerSessionMetrics[],
  weekStart: Date
): MonotonyData {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekSessions = sessions.filter(s => {
    const d = new Date(s.date);
    return d >= weekStart && d < weekEnd;
  });

  if (weekSessions.length === 0) {
    return { weekStart: weekStart.toISOString().split('T')[0], weeklyAvg: 0, weeklyStd: 0, monotony: 0, strain: 0 };
  }

  // Group by day and sum
  const dailyLoads: Record<string, number> = {};
  weekSessions.forEach(s => {
    dailyLoads[s.date] = (dailyLoads[s.date] || 0) + s.playerLoad;
  });

  const loads = Object.values(dailyLoads);
  const weeklyAvg = loads.reduce((a, b) => a + b, 0) / loads.length;

  const variance = loads.reduce((sum, l) => sum + Math.pow(l - weeklyAvg, 2), 0) / loads.length;
  const weeklyStd = Math.sqrt(variance);

  const monotony = weeklyStd > 0 ? weeklyAvg / weeklyStd : 0;
  const weeklyTotal = loads.reduce((a, b) => a + b, 0);
  const strain = weeklyTotal * monotony;

  return {
    weekStart: weekStart.toISOString().split('T')[0],
    weeklyAvg: Math.round(weeklyAvg * 10) / 10,
    weeklyStd: Math.round(weeklyStd * 10) / 10,
    monotony: Math.round(monotony * 100) / 100,
    strain: Math.round(strain * 10) / 10,
  };
}

// ─── Cumulative Fatigue (3-day rolling) ──────────────────────────────────────

export function calculateCumulativeFatigue(
  athleteId: string,
  sessions: PlayerSessionMetrics[]
): CumulativeFatigue {
  const now = new Date();
  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const recentSessions = sessions.filter(
    s => s.athleteId === athleteId && new Date(s.date) >= threeDaysAgo
  );

  const last3DayLoad = recentSessions.reduce((sum, s) => sum + s.playerLoad, 0);

  // High if above typical single session load * 3 (rough threshold)
  const allSessions = sessions.filter(s => s.athleteId === athleteId);
  const avgSessionLoad = allSessions.length > 0
    ? allSessions.reduce((sum, s) => sum + s.playerLoad, 0) / allSessions.length
    : 0;

  const isHigh = last3DayLoad > avgSessionLoad * 2.5;

  return { athleteId, last3DayLoad, isHigh };
}

// ─── Speed Band Calculations ──────────────────────────────────────────────────

export function calculateSpeedBands(
  athleteId: string,
  athleteName: string,
  position: string,
  positionGroup: string,
  sessions: PlayerSessionMetrics[]
): SpeedBandData {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekSessions = sessions.filter(s => {
    const d = new Date(s.date);
    return s.athleteId === athleteId && d >= weekStart && d < weekEnd;
  });

  const allSessions = sessions.filter(s => s.athleteId === athleteId);

  // Band 4 - HSY
  const band4WeeklyYards = weekSessions.reduce((sum, s) => sum + (s.velocityBand4Distance || 0), 0);
  const band4PersonalBestSession = Math.max(...allSessions.map(s => s.velocityBand4Distance || 0), 0);
  const band4TargetFloor = band4PersonalBestSession * 1.2;
  const band4TargetCeiling = band4PersonalBestSession * 1.6;

  let band4Status: 'under' | 'on-track' | 'over';
  if (band4WeeklyYards < band4TargetFloor) band4Status = 'under';
  else if (band4WeeklyYards > band4TargetCeiling) band4Status = 'over';
  else band4Status = 'on-track';

  // Band 7 - Max Velo efforts
  const band7WeeklyEfforts = weekSessions.reduce((sum, s) => sum + (s.velocityBand7Efforts || 0), 0);
  const band7ProfileMax = Math.max(...allSessions.map(s => s.profileMaxVelocity || 0), 0);
  const band7Threshold90 = band7ProfileMax * 0.9;

  let band7Status: 'under' | 'on-track' | 'over';
  if (band7WeeklyEfforts < 2) band7Status = 'under';
  else if (band7WeeklyEfforts > 5) band7Status = 'over';
  else band7Status = 'on-track';

  return {
    athleteId, athleteName, position, positionGroup,
    band4WeeklyYards, band4PersonalBestSession,
    band4TargetFloor: Math.round(band4TargetFloor),
    band4TargetCeiling: Math.round(band4TargetCeiling),
    band4Status,
    band7WeeklyEfforts, band7ProfileMax,
    band7Threshold90: Math.round(band7Threshold90 * 10) / 10,
    band7TargetMin: 2, band7TargetMax: 5, band7Status,
  };
}

// ─── Flag Detection ───────────────────────────────────────────────────────────

export function detectFlags(
  sessionMetrics: PlayerSessionMetrics[],
  allSessionMetrics: PlayerSessionMetrics[],
  session: { id: string; date: string },
  minSessions: number = 4
): AthleteFlag[] {
  const flags: AthleteFlag[] = [];

  // Group current session metrics by athlete
  const sessionAthletes = sessionMetrics;

  // For each athlete in this session
  for (const athlete of sessionAthletes) {
    const athleteHistory = allSessionMetrics.filter(
      s => s.athleteId === athlete.athleteId && s.sessionId !== session.id
    );

    if (athleteHistory.length < minSessions) continue;

    // Calculate session averages for context
    const sessionAvgs: Partial<Record<MetricKey, number>> = {};
    const metricKeys = Object.keys(METRIC_CONFIG) as MetricKey[];

    for (const key of metricKeys) {
      const vals = sessionMetrics.map(m => m[key] as number).filter(v => v > 0);
      if (vals.length > 0) {
        sessionAvgs[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
      }
    }

    // Check each metric against athlete history and session average
    for (const key of metricKeys) {
      const config = METRIC_CONFIG[key];
      const athleteHistoryVals = athleteHistory.map(s => s[key] as number).filter(v => v > 0);
      if (athleteHistoryVals.length < minSessions) continue;

      const athleteAvg = athleteHistoryVals.reduce((a, b) => a + b, 0) / athleteHistoryVals.length;
      const currentVal = athlete[key] as number;
      const sessionAvg = sessionAvgs[key] || 0;

      // Use the lower of athlete avg and session avg as baseline
      const baseline = Math.min(athleteAvg, sessionAvg > 0 ? sessionAvg : athleteAvg);
      if (baseline === 0) continue;

      const deviationPct = ((currentVal - baseline) / baseline) * 100;
      const { flagThreshold: threshold, flagDirection: direction } = config;

      let flagged = false;
      let dir: 'above' | 'below' = 'below';

      if ((direction === 'above' || direction === 'both') && deviationPct > threshold) {
        flagged = true; dir = 'above';
      }
      if ((direction === 'below' || direction === 'both') && deviationPct < -threshold) {
        flagged = true; dir = 'below';
      }

      if (flagged) {
        flags.push({
          athleteId: athlete.athleteId,
          athleteName: athlete.athleteName,
          position: athlete.position,
          positionGroup: athlete.positionGroup,
          flagType: 'metric-deviation',
          metric: key,
          value: currentVal,
          sessionAvg,
          deviationPct: Math.round(Math.abs(deviationPct)),
          direction: dir,
          sessionId: session.id,
          date: session.date,
          severity: Math.abs(deviationPct) > threshold * 2 ? 'critical' : 'warning',
          message: `${config.label} is ${Math.round(Math.abs(deviationPct))}% ${dir} session average (${currentVal.toFixed(1)} ${config.unit})`,
        });
      }
    }
  }

  return flags;
}

// ─── Personal Bests Detection ─────────────────────────────────────────────────

export function detectPersonalBests(
  currentMetrics: PlayerSessionMetrics,
  athleteHistory: PlayerSessionMetrics[]
): Partial<Record<MetricKey, boolean>> {
  const pbs: Partial<Record<MetricKey, boolean>> = {};
  const keys = Object.keys(METRIC_CONFIG) as MetricKey[];

  for (const key of keys) {
    const currentVal = currentMetrics[key] as number;
    if (!currentVal || currentVal <= 0) continue;

    const historicalMax = Math.max(...athleteHistory.map(s => (s[key] as number) || 0));
    if (currentVal > historicalMax) {
      pbs[key] = true;
    }
  }

  return pbs;
}

// ─── Heat Index Calculation ───────────────────────────────────────────────────

export function calculateHeatIndex(tempF: number, humidity: number): number {
  // Rothfusz regression equation (NOAA)
  if (tempF < 80) return tempF;

  const T = tempF;
  const R = humidity;

  let HI = -42.379 + 2.04901523 * T + 10.14333127 * R
    - 0.22475541 * T * R - 0.00683783 * T * T
    - 0.05481717 * R * R + 0.00122874 * T * T * R
    + 0.00085282 * T * R * R - 0.00000199 * T * T * R * R;

  // Adjustment for low humidity
  if (R < 13 && T >= 80 && T <= 112) {
    HI -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
  }

  return Math.round(HI);
}

// ─── Utility Functions ────────────────────────────────────────────────────────

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sunday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

export function getWeekLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${formatDateShort(weekStart)} – ${formatDateShort(end.toISOString().split('T')[0])}`;
}

export function roundTo(val: number, decimals: number = 1): number {
  return Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);
}
