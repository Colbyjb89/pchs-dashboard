import { NextRequest, NextResponse } from 'next/server';

const REDIS_URL = process.env.injury_KV_REST_API_URL!;
const REDIS_TOKEN = process.env.injury_KV_REST_API_TOKEN!;
const KEY = 'pchs_injuries';

async function redisGet() {
  const res = await fetch(`${REDIS_URL}/get/${KEY}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    cache: 'no-store',
  });
  const json = await res.json();
  if (!json.result) return null;
  // result may be a string (already JSON) — parse it
  const val = typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
  return val;
}

async function redisSet(value: unknown) {
  // Use GET-style set: /set/KEY/VALUE
  const encoded = encodeURIComponent(JSON.stringify(value));
  await fetch(`${REDIS_URL}/set/${KEY}/${encoded}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
}

async function redisDel() {
  await fetch(`${REDIS_URL}/del/${KEY}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
}

export async function GET() {
  try {
    const data = await redisGet();
    return NextResponse.json({
      success: true,
      data: data ?? { records: [], uploadedAt: null, uploadLabel: null },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const now = new Date();
    const payload = {
      records: body.records,
      uploadedAt: now.toISOString(),
      uploadLabel: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    };
    await redisSet(payload);
    return NextResponse.json({ success: true, count: body.records.length });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await redisDel();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) });
  }
}
