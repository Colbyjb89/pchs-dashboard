import { NextRequest, NextResponse } from 'next/server';
const TOKEN = process.env.CATAPULT_TOKEN || '';
const BASE_URL = process.env.CATAPULT_BASE_URL || 'https://connect-us.catapultsports.com';
export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${BASE_URL}/api/v6/stats/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await res.json();
  return NextResponse.json({ success: res.ok, status: res.status, data: raw });
}
