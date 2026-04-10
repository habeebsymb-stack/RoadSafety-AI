// Road Safety AI — Gemini AI Explanation Service
// Uses Google Gemini to generate contextual safety explanations
// Fails gracefully — returns deterministic fallback if API is unavailable

import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  TrafficData,
  WeatherData,
  RoadCondition,
  TimeFactors,
  RiskAnalysisResult,
} from '@/lib/types';

// Lazy-initialize Gemini client (only if API key is set)
function getGeminiClient(): GoogleGenerativeAI | null {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[Gemini] GEMINI_API_KEY not set — AI explanations disabled');
    return null;
  }
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

export interface AIExplanation {
  explanation: string;
  topConcerns: string[];
  drivingTips: string[];
  suggestedQueries: string[];
  confidence_reasoning: string;
  aiEnhanced: boolean;
}

/**
 * Calls Gemini to generate a human-readable safety explanation.
 * Returns a deterministic fallback if Gemini is unavailable.
 */
export async function generateSafetyExplanation(
  origin: string,
  destination: string,
  riskResult: RiskAnalysisResult,
  traffic: TrafficData,
  weather: WeatherData,
  roadCondition: RoadCondition,
  timeFactors: TimeFactors
): Promise<AIExplanation> {
  const client = getGeminiClient();

  if (!client) {
    return buildFallback(riskResult, traffic, weather, roadCondition);
  }

  try {
    const model = client.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    });

    const prompt = buildPrompt(
      origin,
      destination,
      riskResult,
      traffic,
      weather,
      roadCondition,
      timeFactors
    );

    console.log('[Gemini] Requesting AI explanation...');
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Parse JSON from Gemini response (it's instructed to return JSON)
    const parsed = extractJSON(text);

    if (!parsed) {
      console.warn('[Gemini] Could not parse JSON from response, using fallback');
      return buildFallback(riskResult, traffic, weather, roadCondition);
    }

    console.log('[Gemini] ✓ AI explanation received');
    return {
      explanation: (parsed.explanation as string) || riskResult.explanation,
      topConcerns: (parsed.topConcerns as string[]) || [],
      drivingTips: (parsed.drivingTips as string[]) || [],
      suggestedQueries: (parsed.suggestedQueries as string[]) || buildSuggestedQueries(riskResult, traffic, weather, roadCondition),
      confidence_reasoning: (parsed.confidence_reasoning as string) || '',
      aiEnhanced: true,
    };
  } catch (err) {
    console.warn('[Gemini] API call failed:', err instanceof Error ? err.message : err);
    return buildFallback(riskResult, traffic, weather, roadCondition);
  }
}

function buildPrompt(
  origin: string,
  destination: string,
  risk: RiskAnalysisResult,
  traffic: TrafficData,
  weather: WeatherData,
  road: RoadCondition,
  time: TimeFactors
): string {
  return `You are an expert Indian road safety AI assistant. Analyze the following route and provide a structured safety report.

Route: ${origin} to ${destination}

Current Conditions:
- Traffic: ${traffic.congestionLevel} congestion (avg speed: ${traffic.averageSpeed} km/h vs expected ${traffic.expectedSpeed} km/h, delay: ${traffic.delayMinutes} mins)
- Traffic incidents: ${traffic.incidents.length > 0 ? traffic.incidents.map(i => i.description).join('; ') : 'None reported'}
- Road quality: ${road.quality}
- Road hazards: ${road.hazards.length > 0 ? road.hazards.map(h => `${h.type} (${h.severity})`).join(', ') : 'None detected'}
- Street lighting: ${road.lightingCondition}
- Infrastructure score: ${road.infrastructureScore}/100
- Weather: ${weather.condition} — ${weather.description}
- Visibility: ${weather.visibility} km
- Wind speed: ${weather.windSpeed} km/h
- Temperature: ${weather.temperature}°C
- Time of day: ${time.timeOfDay.replace(/_/g, ' ')}
- Daylight: ${time.daylight ? 'Yes' : 'No'}
- Weekend: ${time.isWeekend ? 'Yes' : 'No'}

Risk Score: ${risk.risk_score}/100 (Level: ${risk.risk_level})
Confidence: ${risk.confidence}%

Respond ONLY with a valid JSON object (no markdown, no explanation outside JSON):
{
  "explanation": "<2-3 sentence natural language explanation of overall route safety, mentioning specific conditions>",
  "topConcerns": ["<concern 1>", "<concern 2>", "<concern 3>"],
  "drivingTips": ["<actionable tip 1>", "<actionable tip 2>", "<actionable tip 3>", "<actionable tip 4>"],
  "suggestedQueries": ["<question the driver may ask about this route>", "<question about a detected hazard>", "<question about safer driving action>", "<question about weather or traffic impact>"],
  "confidence_reasoning": "<1 sentence explaining the confidence level>"
}

Guidelines:
- Be specific about Indian road conditions (two-wheelers, pedestrians, cattle, speed bumps)
- Never use absolute terms like "completely safe" — always note uncertainty
- Tips must be actionable (not generic)
- Consider the time of day and local context`;
}

function extractJSON(text: string): Record<string, unknown> | null {
  try {
    // Try direct parse first
    return JSON.parse(text.trim());
  } catch {
    // Extract from markdown code block if present
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }

    // Try to find JSON object pattern
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }

    return null;
  }
}

/**
 * Deterministic fallback — built from actual risk data, no AI required.
 * Ensures the app always returns meaningful output even without Gemini.
 */
function buildFallback(
  risk: RiskAnalysisResult,
  traffic: TrafficData,
  weather: WeatherData,
  road: RoadCondition
): AIExplanation {
  const levelDescriptions = {
    LOW: 'relatively safe for travel with favorable conditions',
    MEDIUM: 'moderately risky — drive with heightened caution',
    HIGH: 'high-risk — consider delaying or choosing an alternative if possible',
  };

  const topFactors = risk.factors.slice(0, 3).map(f => f.factor);

  const explanation = `This route is ${levelDescriptions[risk.risk_level]}, scoring ${risk.risk_score}/100. ${
    topFactors.length > 0
      ? `Primary risk factors: ${topFactors.join(', ')}.`
      : 'No major risk factors identified.'
  } ${
    risk.risk_level === 'HIGH'
      ? 'Exercise extreme caution and follow all precautions listed.'
      : risk.risk_level === 'MEDIUM'
      ? 'Stay alert and follow recommended precautions.'
      : 'Conditions appear favorable — standard safe driving applies.'
  }`;

  return {
    explanation,
    topConcerns: risk.factors.slice(0, 3).map(f => `${f.factor}: ${f.description}`),
    drivingTips: risk.precautions.slice(0, 4).map(p => p.action),
    suggestedQueries: buildSuggestedQueries(risk, traffic, weather, road),
    confidence_reasoning: `Confidence is ${risk.confidence}% based on available real-time data from traffic and weather sources.`,
    aiEnhanced: false,
  };
}

function buildSuggestedQueries(
  risk: RiskAnalysisResult,
  traffic: TrafficData,
  weather: WeatherData,
  road: RoadCondition
): string[] {
  const queries = [
    `Why is this route marked ${risk.risk_level.toLowerCase()} risk?`,
    'Which part of the route needs the most caution?',
  ];

  if (road.hazards.length > 0) {
    queries.push(`How should I handle ${road.hazards[0].type.toLowerCase().replace(/_/g, ' ')} on this route?`);
  }

  if (traffic.congestionLevel === 'HIGH' || traffic.congestionLevel === 'SEVERE') {
    queries.push('How should I drive through the congested sections?');
  }

  if (weather.condition !== 'CLEAR') {
    queries.push(`How does ${weather.condition.toLowerCase().replace(/_/g, ' ')} affect this trip?`);
  }

  queries.push('What precautions should I take before starting?');
  return queries.slice(0, 5);
}
