import { NextResponse } from 'next/server';

const TOKEN = process.env.CATAPULT_TOKEN || '';
const KV_URL   = process.env.injury_KV_REST_API_URL!;
const KV_TOKEN = process.env.injury_KV_REST_API_TOKEN!;

async function getExcludedIds(): Promise<Set<string>> {
  try {
    const res = await fetch(`${KV_URL}/get/excluded_athletes`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      cache: 'no-store',
    });
    const data = await res.json();
    if (!data.result) return new Set();
    const parsed = JSON.parse(data.result);
    const ids: string[] = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
    return new Set(Array.isArray(ids) ? ids : []);
  } catch { return new Set(); }
}

// We'll try multiple possible base URLs for the Catapult Connect API
const POSSIBLE_BASE_URLS = [
  'https://connect-us.catapultsports.com',
  'https://backend-us.openfield.catapultsports.com',
  'https://openfield.catapultsports.com',
];

async function tryFetch(path: string) {
  for (const base of POSSIBLE_BASE_URLS) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      if (res.ok) {
        const data = await res.json();
        return { success: true, data, baseUrl: base, status: res.status };
      }

      // Return status info even for non-ok
      const text = await res.text();
      console.log(`[${base}] Status ${res.status}: ${text.substring(0, 200)}`);
    } catch (err) {
      console.log(`[${base}] Network error: ${err}`);
    }
  }
  return { success: false, error: 'All base URLs failed' };
}

export async function GET() {
  try {
    const excludedIds = await getExcludedIds();

    const applyExclusion = (athletes: Record<string, unknown>[]) => {
      const seen = new Map<string, Record<string, unknown>>();
      athletes.forEach((a: Record<string, unknown>) => {
        const name = (String(a.first_name || '') + ' ' + String(a.last_name || '')).trim().toLowerCase();
        if (!seen.has(name)) {
          seen.set(name, a);
        } else {
          const existing = seen.get(name)!;
          const existingScore = Object.values(existing).filter(v => v != null && v !== '').length;
          const newScore = Object.values(a).filter(v => v != null && v !== '').length;
          if (newScore > existingScore) seen.set(name, a);
        }
      });
      return Array.from(seen.values()).filter(a => {
        const id = String(a.id ?? a.athlete_id ?? '');
        return !excludedIds.has(id);
      });
    };
    // Try athletes endpoint
    const result = await tryFetch('/api/v6/athletes/');

    if (result.success) {
      const athletes = Array.isArray(result.data) ? result.data : [];
      return NextResponse.json({
        success: true,
        baseUrl: result.baseUrl,
        data: applyExclusion(athletes),
      });
    }

    const result2 = await tryFetch('/api/v6/athletes');
    if (result2.success) {
      const athletes2 = Array.isArray(result2.data) ? result2.data : [];
      return NextResponse.json({
        success: true,
        baseUrl: result2.baseUrl,
        data: applyExclusion(athletes2),
      });
    }

    // Try parameters endpoint to discover available data
    const result3 = await tryFetch('/api/v6/parameters/');
    if (result3.success) {
      return NextResponse.json({
        success: true,
        note: 'Athletes endpoint failed but parameters worked — check endpoint structure',
        baseUrl: result3.baseUrl,
        parameters: result3.data,
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Could not connect to Catapult API',
      triedUrls: POSSIBLE_BASE_URLS,
      tokenProvided: TOKEN.length > 0,
      tokenPrefix: TOKEN.substring(0, 20) + '...',
    }, { status: 502 });

  } catch (err) {
    return NextResponse.json({
      success: false,
      error: String(err),
    }, { status: 500 });
  }
}
