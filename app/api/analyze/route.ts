// Road Safety AI - /api/analyze Route Handler
// Entry point for the LangGraph three-agent analysis pipeline.

import { NextResponse } from 'next/server';
import { runLangGraphAnalysis } from '@/lib/agents/langgraph';
import { logRiskAnalysis, saveRouteHistory } from '@/lib/services/mongodb';

const recentRequests = new Map<string, number>();
const DEBOUNCE_MS = 2000;

type AnalyzeBody = {
  origin?: string;
  destination?: string;
  preferSafest?: boolean;
  preferSafestRoute?: boolean;
  originCoords?: { lat: number; lng: number };
  destCoords?: { lat: number; lng: number };
};

function areCoordsTooClose(
  originCoords?: { lat: number; lng: number },
  destCoords?: { lat: number; lng: number }
): boolean {
  if (!originCoords || !destCoords) return false;

  const distanceMeters = Math.sqrt(
    Math.pow(originCoords.lat - destCoords.lat, 2) +
      Math.pow(originCoords.lng - destCoords.lng, 2)
  ) * 111000;

  return distanceMeters < 100;
}

function markRecentRequest(requestKey: string): boolean {
  const lastRequest = recentRequests.get(requestKey);
  if (lastRequest && Date.now() - lastRequest < DEBOUNCE_MS) {
    return false;
  }

  recentRequests.set(requestKey, Date.now());

  if (recentRequests.size > 100) {
    const threshold = Date.now() - DEBOUNCE_MS * 10;
    for (const [key, ts] of recentRequests.entries()) {
      if (ts < threshold) recentRequests.delete(key);
    }
  }

  return true;
}

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    let body: AnalyzeBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const originClean = body.origin?.trim();
    const destinationClean = body.destination?.trim();
    const preferSafest = body.preferSafest ?? body.preferSafestRoute ?? true;

    if (!originClean || !destinationClean) {
      return NextResponse.json(
        { success: false, error: 'Origin and destination are required' },
        { status: 400 }
      );
    }

    if (originClean.toLowerCase() === destinationClean.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Origin and destination cannot be the same location' },
        { status: 400 }
      );
    }

    if (areCoordsTooClose(body.originCoords, body.destCoords)) {
      return NextResponse.json(
        { success: false, error: 'Origin and destination are too close to each other' },
        { status: 400 }
      );
    }

    const requestKey = [
      originClean.toLowerCase(),
      destinationClean.toLowerCase(),
      body.originCoords ? `${body.originCoords.lat.toFixed(5)},${body.originCoords.lng.toFixed(5)}` : 'text',
      body.destCoords ? `${body.destCoords.lat.toFixed(5)},${body.destCoords.lng.toFixed(5)}` : 'text',
    ].join(':');

    if (!markRecentRequest(requestKey)) {
      return NextResponse.json(
        { success: false, error: 'Please wait a moment before analyzing the same route again' },
        { status: 429 }
      );
    }

    console.log(`\n[API] POST /api/analyze - "${originClean}" -> "${destinationClean}" (prefer safest: ${preferSafest})`);
    if (body.originCoords || body.destCoords) {
      console.log(`[API] Using pre-resolved coordinates: origin=${JSON.stringify(body.originCoords)} dest=${JSON.stringify(body.destCoords)}`);
    }

    let analysis;
    try {
      analysis = await runLangGraphAnalysis(
        originClean,
        destinationClean,
        body.originCoords,
        body.destCoords,
        preferSafest
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Route analysis failed';
      console.error('[API] Analysis pipeline error:', msg);

      const isUserError =
        msg.toLowerCase().includes('could not resolve route') ||
        msg.toLowerCase().includes('no geocoding result');

      return NextResponse.json(
        {
          success: false,
          error: isUserError
            ? msg
            : 'Unable to complete route analysis. Please try again in a moment.',
        },
        { status: isUserError ? 400 : 500 }
      );
    }

    logRiskAnalysis(originClean, destinationClean, analysis);
    saveRouteHistory(
      originClean,
      destinationClean,
      analysis.riskAnalysis.risk_level,
      analysis.riskAnalysis.risk_score
    );

    const processingTime = Date.now() - startTime;
    console.log(`[API] Response ready in ${processingTime}ms - score: ${analysis.riskAnalysis.risk_score}, level: ${analysis.riskAnalysis.risk_level}`);

    return NextResponse.json({
      success: true,
      data: analysis,
      processingTime,
      meta: {
        origin: originClean,
        destination: destinationClean,
        preferSafest,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    const processingTime = Date.now() - startTime;
    console.error('[API] Unhandled error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred. Please try again.',
        processingTime,
      },
      { status: 500 }
    );
  }
}
