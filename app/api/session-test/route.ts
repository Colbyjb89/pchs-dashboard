import { NextResponse } from 'next/server';

const TOKEN = process.env.CATAPULT_TOKEN || '';
const BASE_URL = process.env.CATAPULT_BASE_URL || 'https://connect-us.catapultsports.com';

export async function GET() {
  const actRes = await fetch(`${BASE_URL}/api/v6/activities/`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  const activities = await actRes.json();
  const arr = Array.isArray(activities) ? activities : (activities.data ?? []);
  const latest = arr.sort((a: any, b: any) => (b.start_time ?? 0) - (a.start_time ?? 0))[0];
  if (!latest) return NextResponse.json({ error: 'no activities' });

  const body = {
    parameters: ['total_player_load', 'max_vel', 'total_distance'],
    filters: [{ name: 'activity_id', comparison: '=', values: [latest.id] }],
    group_by: ['athlete'],
  };

  const statsRes = await fetch(`${BASE_URL}/api/v6/stats/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const raw = await statsRes.json();
  return NextResponse.json({ activity_id: latest.id, status: statsRes.status, sent_body: body, response: raw });
}
