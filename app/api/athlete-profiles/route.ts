import { NextResponse } from 'next/server';

const KV_URL   = process.env.injury_KV_REST_API_URL!;
const KV_TOKEN = process.env.injury_KV_REST_API_TOKEN!;
const KEY = 'athlete_profiles';

export interface AthleteProfile {
  athleteId: string;
  height: string;   // e.g. "6'2\""
  weight: string;   // e.g. "215 lbs"
  armLength: string; // e.g. "33\""
  handWidth: string; // e.g. "10\""
}

async function kvGet(): Promise<Record<string, AthleteProfile>> {
  try {
    const res = await fetch(`${KV_URL}/get/${KEY}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      cache: 'no-store',
    });
    const data = await res.json();
    if (!data.result) return {};
    const parsed = JSON.parse(data.result);
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch { return {}; }
}

async function kvSet(profiles: Record<string, AthleteProfile>): Promise<void> {
  await fetch(`${KV_URL}/set/${KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(profiles)),
  });
}

export async function GET() {
  const profiles = await kvGet();
  return NextResponse.json({ profiles });
}

export async function POST(req: Request) {
  try {
    const { athleteId, profile } = await req.json();
    if (!athleteId) return NextResponse.json({ error: 'athleteId required' }, { status: 400 });
    const profiles = await kvGet();
    profiles[athleteId] = { athleteId, ...profile };
    await kvSet(profiles);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
