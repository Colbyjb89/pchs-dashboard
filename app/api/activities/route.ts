import { NextResponse } from 'next/server';
import { getActivities } from '@/lib/catapult';

export async function GET() {
  try {
    const raw = await getActivities();
    const activities = raw.map((a: any) => ({
      id: a.id,
      name: a.name,
      startTime: a.start_time,
      endTime: a.end_time,
      startTimeH: a.start_time_h ?? '',
      date: a.date ?? new Date(a.start_time * 1000).toLocaleDateString('en-US'),
      durationMinutes: a.end_time && a.start_time
        ? Math.round((a.end_time - a.start_time) / 60)
        : a.duration ?? 0,
      tags: a.tags ?? [],
    }));
    const sorted = activities.sort((a: any, b: any) => (b.startTime ?? 0) - (a.startTime ?? 0));
    return NextResponse.json({ success: true, data: sorted });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
