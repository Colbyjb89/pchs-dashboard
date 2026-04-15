import { NextResponse } from 'next/server';

const KV_URL   = process.env.injury_KV_REST_API_URL!;
const KV_TOKEN = process.env.injury_KV_REST_API_TOKEN!;
const KEY_IDS   = 'excluded_athletes';
const KEY_NAMES = 'excluded_athletes_names';

async function kvGet(): Promise<string[]> {
  try {
    const res = await fetch(`${KV_URL}/get/${KEY_IDS}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      cache: 'no-store',
    });
    const data = await res.json();
    if (!data.result) return [];
    const parsed = JSON.parse(data.result);
    const ids: string[] = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
    return Array.isArray(ids) ? ids : [];
  } catch { return []; }
}

async function kvGetNames(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${KV_URL}/get/${KEY_NAMES}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      cache: 'no-store',
    });
    const data = await res.json();
    if (!data.result) return {};
    const parsed = JSON.parse(data.result);
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch { return {}; }
}

async function kvSet(ids: string[]): Promise<void> {
  await fetch(`${KV_URL}/set/${KEY_IDS}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(ids)),
  });
}

async function kvSetNames(names: Record<string, string>): Promise<void> {
  await fetch(`${KV_URL}/set/${KEY_NAMES}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(names)),
  });
}

export async function GET() {
  const [ids, names] = await Promise.all([kvGet(), kvGetNames()]);
  return NextResponse.json({ ids, names });
}

export async function POST(req: Request) {
  try {
    const { ids, names } = await req.json();
    if (!Array.isArray(ids)) return NextResponse.json({ error: 'ids must be array' }, { status: 400 });
    await Promise.all([kvSet(ids), names ? kvSetNames(names) : Promise.resolve()]);
    return NextResponse.json({ ok: true, ids });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
