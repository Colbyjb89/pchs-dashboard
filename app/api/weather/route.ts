import { NextRequest, NextResponse } from 'next/server';
import { calculateHeatIndex } from '@/lib/calculations';
import { WeatherData } from '@/lib/types';

const LAT = process.env.WEATHER_LAT || '33.5882';
const LON = process.env.WEATHER_LON || '-86.2852';
const HEAT_THRESHOLD = Number(process.env.HEAT_INDEX_THRESHOLD || '103');

// Weather.gov API — no key required
// Docs: https://www.weather.gov/documentation/services-web-api

async function getWeatherGovPoint() {
  const res = await fetch(`https://api.weather.gov/points/${LAT},${LON}`, {
    headers: { 'User-Agent': 'PCHS-Dashboard/1.0 (contact@pchsfootball.com)' },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Weather.gov points error: ${res.status}`);
  return res.json();
}

async function getForecast(forecastUrl: string) {
  const res = await fetch(forecastUrl, {
    headers: { 'User-Agent': 'PCHS-Dashboard/1.0' },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Weather.gov forecast error: ${res.status}`);
  return res.json();
}

async function getHourlyForecast(hourlyUrl: string) {
  const res = await fetch(hourlyUrl, {
    headers: { 'User-Agent': 'PCHS-Dashboard/1.0' },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Weather.gov hourly error: ${res.status}`);
  return res.json();
}

function mapCondition(shortForecast: string): WeatherData['condition'] {
  const f = shortForecast.toLowerCase();
  if (f.includes('thunderstorm') || f.includes('storm')) return 'storm';
  if (f.includes('rain') || f.includes('shower') || f.includes('drizzle')) return 'rain';
  if (f.includes('cloudy') && !f.includes('partly')) return 'cloudy';
  if (f.includes('partly') || f.includes('mostly cloudy')) return 'partly-cloudy';
  return 'sunny';
}

function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'current'; // 'current' | 'forecast' | 'tomorrow'

  try {
    const pointData = await getWeatherGovPoint();
    const { forecast: forecastUrl, forecastHourly } = pointData.properties;

    if (type === 'tomorrow') {
      const forecast = await getForecast(forecastUrl);
      const periods = forecast.properties.periods;

      // Find tomorrow's daytime period
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const tomorrowPeriod = periods.find((p: { startTime: string; isDaytime: boolean }) =>
        p.startTime.startsWith(tomorrowStr) && p.isDaytime
      ) || periods[2]; // fallback to index 2 (usually tomorrow)

      if (!tomorrowPeriod) {
        return NextResponse.json({ error: 'No forecast data for tomorrow' }, { status: 404 });
      }

      const tempF = tomorrowPeriod.temperatureUnit === 'F'
        ? tomorrowPeriod.temperature
        : celsiusToFahrenheit(tomorrowPeriod.temperature);

      const humidity = tomorrowPeriod.relativeHumidity?.value || 60;
      const heatIndex = calculateHeatIndex(tempF, humidity);

      const weather: WeatherData = {
        date: tomorrowStr,
        time: tomorrowPeriod.startTime,
        tempF,
        condition: mapCondition(tomorrowPeriod.shortForecast),
        humidity,
        heatIndex,
        isExcessiveHeat: heatIndex >= HEAT_THRESHOLD,
        description: tomorrowPeriod.shortForecast,
      };

      return NextResponse.json({ success: true, weather });
    }

    // Current / hourly
    const hourly = await getHourlyForecast(forecastHourly);
    const periods = hourly.properties.periods;
    const now = new Date();

    // Find closest period to now
    const currentPeriod = periods.find((p: { startTime: string; endTime: string }) => {
      const start = new Date(p.startTime);
      const end = new Date(p.endTime);
      return now >= start && now < end;
    }) || periods[0];

    const tempF = currentPeriod.temperatureUnit === 'F'
      ? currentPeriod.temperature
      : celsiusToFahrenheit(currentPeriod.temperature);

    const humidity = currentPeriod.relativeHumidity?.value || 60;
    const heatIndex = calculateHeatIndex(tempF, humidity);

    const weather: WeatherData = {
      date: now.toISOString().split('T')[0],
      time: currentPeriod.startTime,
      tempF,
      condition: mapCondition(currentPeriod.shortForecast),
      humidity,
      heatIndex,
      isExcessiveHeat: heatIndex >= HEAT_THRESHOLD,
      description: currentPeriod.shortForecast,
    };

    return NextResponse.json({ success: true, weather });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
