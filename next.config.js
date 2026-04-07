/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    CATAPULT_TOKEN: process.env.CATAPULT_TOKEN,
    CATAPULT_BASE_URL: process.env.CATAPULT_BASE_URL,
    WEATHER_LAT: process.env.WEATHER_LAT,
    WEATHER_LON: process.env.WEATHER_LON,
    SETTINGS_PASSWORD: process.env.SETTINGS_PASSWORD,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
};

module.exports = nextConfig;
