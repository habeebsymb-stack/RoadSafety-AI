// Road Safety AI — MongoDB Logging Service
// Optional: only activates if MONGODB_URI is set in .env.local
// All writes are fire-and-forget (non-blocking) to avoid latency impact

import type { FullAnalysis } from '@/lib/types';

let clientPromise: Promise<import('mongodb').MongoClient> | null = null;

function getClientPromise() {
  if (!process.env.MONGODB_URI) return null;
  if (clientPromise) return clientPromise;

  // Lazy-load MongoDB to avoid import errors when URI not set
  const { MongoClient } = require('mongodb') as typeof import('mongodb');
  const client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  clientPromise = client.connect();
  return clientPromise;
}

async function getDB() {
  const promise = getClientPromise();
  if (!promise) return null;
  try {
    const client = await promise;
    return client.db('roadsafety_ai');
  } catch (err) {
    console.warn('[MongoDB] Connection failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Log a completed risk analysis to the risk_logs collection.
 * Non-blocking — errors are logged but not thrown.
 */
export function logRiskAnalysis(
  origin: string,
  destination: string,
  analysis: FullAnalysis
): void {
  // Fire and forget
  getDB()
    .then(db => {
      if (!db) return;
      return db.collection('risk_logs').insertOne({
        origin,
        destination,
        timestamp: new Date(),
        risk_score: analysis.riskAnalysis.risk_score,
        risk_level: analysis.riskAnalysis.risk_level,
        confidence: analysis.riskAnalysis.confidence,
        weather_condition: analysis.weather.condition,
        traffic_level: analysis.traffic.congestionLevel,
        road_quality: analysis.roadCondition.quality,
        processing_factors: analysis.riskAnalysis.factors.length,
      });
    })
    .then(() => {
      console.log('[MongoDB] ✓ Risk log saved');
    })
    .catch(err => {
      console.warn('[MongoDB] Failed to save risk log:', err instanceof Error ? err.message : err);
    });
}

/**
 * Save a route to the routes_history collection.
 * Non-blocking — errors are logged but not thrown.
 */
export function saveRouteHistory(
  origin: string,
  destination: string,
  riskLevel: string,
  riskScore: number
): void {
  getDB()
    .then(db => {
      if (!db) return;
      return db.collection('routes_history').insertOne({
        origin,
        destination,
        riskLevel,
        riskScore,
        searchedAt: new Date(),
      });
    })
    .then(() => {
      console.log('[MongoDB] ✓ Route history saved');
    })
    .catch(err => {
      console.warn('[MongoDB] Failed to save route history:', err instanceof Error ? err.message : err);
    });
}

/**
 * Save a user-reported hazard to the reports collection.
 * Non-blocking — errors are logged but not thrown.
 */
export function saveHazardReport(report: {
  type: string;
  location: { lat: number; lng: number };
  description: string;
  severity: string;
}): void {
  getDB()
    .then(db => {
      if (!db) return;
      return db.collection('reports').insertOne({
        ...report,
        reportedAt: new Date(),
        verified: false,
        upvotes: 0,
      });
    })
    .catch(err => {
      console.warn('[MongoDB] Failed to save hazard report:', err instanceof Error ? err.message : err);
    });
}
