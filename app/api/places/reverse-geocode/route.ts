import { NextResponse } from 'next/server';
import axios from 'axios';

const OLA_BASE = 'https://api.olamaps.io';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');

  if (!lat || !lng) {
    return NextResponse.json({ error: 'Latitude and longitude are required' }, { status: 400 });
  }

  const apiKey = process.env.OLA_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OLA_MAPS_API_KEY not configured' }, { status: 500 });
  }

  try {
    // Use Ola Maps reverse geocoding
    const response = await axios.get(`${OLA_BASE}/places/v1/reverse-geocode`, {
      params: {
        latlng: `${lat},${lng}`,
        language: 'English',
        api_key: apiKey,
      },
      timeout: 8000,
    });

    const results = response.data?.results || response.data?.geocodingResults;
    if (results && results.length > 0) {
      const result = results[0];
      const address = result.formatted_address || result.name || 'Unknown location';
      return NextResponse.json({ address });
    }

    // Fallback: return coordinates as address
    return NextResponse.json({
      address: `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`
    });
  } catch (error) {
    console.warn('Reverse geocoding failed:', error);
    return NextResponse.json({
      address: `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`
    });
  }
}