import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const CATAPULT_TOKEN = process.env.CATAPULT_TOKEN || '';
const BASE_URL = process.env.CATAPULT_BASE_URL || 'https://connect-us.catapultsports.com';

async function fetchCatapultData(endpoint: string) {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers: { Authorization: `Bearer ${CATAPULT_TOKEN}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  if (!query) {
    return NextResponse.json({ error: 'No query provided' }, { status: 400 });
  }

  try {
    // Fetch recent data to give Ava context
    const [athletesData, activitiesData] = await Promise.all([
      fetchCatapultData('/api/v6/athletes/'),
      fetchCatapultData('/api/v6/activities/?limit=50'),
    ]);

    const context = `
You are Ava, the performance assistant for PCHS (Pell City High School) Football.
You have access to GPS performance data from Catapult OpenField.

Available athlete data:
${JSON.stringify(athletesData || {}, null, 2).substring(0, 2000)}

Recent activities:
${JSON.stringify(activitiesData || {}, null, 2).substring(0, 2000)}

Key metrics tracked: Player Load, PL/Min, Truck Stick (N-s), Max Velocity (mph), 
% of Max Velocity, Profile Max Velocity, Total Distance (yds), Explosive Efforts, 
Max Acceleration (m/s²), Max Deceleration (m/s²), A+D Efforts, 
Velocity Band 4 Distance (70-90% max velo, yds), Velocity Band 7 Efforts (90%+ count),
Metabolic Power (W/kg), Dynamic Stress Load (AU).

Answer in plain English. Be specific with numbers when available. If data is limited, 
say so honestly. Keep answers concise — 1-3 sentences for simple questions, 
a short paragraph for complex ones. Never make up numbers you don't have.
`.trim();

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: context,
        messages: [{ role: 'user', content: query }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Anthropic error:', err);
      return NextResponse.json({
        answer: 'I\'m having trouble connecting right now. Please try again in a moment.',
      });
    }

    const data = await res.json();
    const answer = data.content?.[0]?.text || 'No response generated.';

    return NextResponse.json({ answer });

  } catch (err) {
    console.error('Ava error:', err);
    return NextResponse.json({
      answer: 'Something went wrong. Please try again.',
    });
  }
}
