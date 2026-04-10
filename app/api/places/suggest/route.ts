import { NextResponse } from 'next/server';
import axios from 'axios';
import type { PlaceSuggestion } from '@/lib/types';
import { cache } from '@/lib/services/cache';

const OLA_BASE = 'https://api.olamaps.io';

function toSuggestion(result: Record<string, unknown>, index: number): PlaceSuggestion {
  const description =
    (result.description as string) ||
    (result.formatted_address as string) ||
    (result.name as string) ||
    'Unknown place';

  const primaryText =
    (result.name as string) ||
    description.split(',')[0] ||
    description;

  const secondaryText = description.includes(',')
    ? description.split(',').slice(1).join(',').trim()
    : undefined;

  const structured = result.structured_formatting as { main_text?: string; secondary_text?: string } | undefined;
  const geometry = result.geometry as { location?: { lat?: number; lng?: number } } | undefined;

  return {
    id: String(result.place_id || result.id || `${description}-${index}`),
    description,
    primaryText: structured?.main_text || primaryText,
    secondaryText: structured?.secondary_text || secondaryText,
    coordinates: geometry?.location?.lat && geometry?.location?.lng
      ? { lat: geometry.location.lat, lng: geometry.location.lng }
      : undefined,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  if (!query || query.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  const cacheKey = `places:suggest:${query.toLowerCase()}`;
  const cached = cache.get<PlaceSuggestion[]>(cacheKey);
  if (cached) {
    return NextResponse.json({ suggestions: cached });
  }

  const apiKey = process.env.OLA_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const response = await axios.get(`${OLA_BASE}/places/v1/autocomplete`, {
      params: {
        input: query,
        api_key: apiKey,
      },
      timeout: 8000,
    });

    const rawResults = (response.data?.predictions || []) as Array<Record<string, unknown>>;
    const suggestions = rawResults.slice(0, 6).map(toSuggestion);
    cache.set(cacheKey, suggestions, 2 * 60 * 1000);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.warn('[PlacesSuggest] Ola Maps request failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ suggestions: [] });
  }
}
