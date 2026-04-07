import { NextResponse } from 'next/server';
const TOKEN = process.env.CATAPULT_TOKEN || '';
const BASE_URL = process.env.CATAPULT_BASE_URL || 'https://connect-us.catapultsports.com';
export async function GET() {
  const res = await fetch(`${BASE_URL}/api/v6/parameters/`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  const raw = await res.json();
  return NextResponse.json({ success: res.ok, status: res.status, data: raw });
}
