// Road Safety AI — Risk Analysis Agent (Core Scoring Engine)
// Implements the deterministic weighted risk formula:
//   risk_score = traffic×0.35 + road×0.25 + weather×0.2 + time×0.2
// Generates factors, precautions, and explanation — no hallucination

import type {
  TrafficData,
  RoadCondition,
  WeatherData,
  TimeFactors,
  RiskAnalysisResult,
  RiskFactor,
  SafetyPrecaution,
  RiskLevel,
  AgentResponse,
} from '@/lib/types';

export interface RiskBreakdown {
  traffic: number;
  road: number;
  weather: number;
  time: number;
}

// ─── Main Agent Class ─────────────────────────────────────────────────────────

export class RiskAnalysisAgent {
  run(
    traffic: TrafficData,
    roadCondition: RoadCondition,
    weather: WeatherData,
    timeFactors: TimeFactors,
    agentConfidences: { traffic: number; road: number; weather: number }
  ): AgentResponse<RiskAnalysisResult> {
    const start = Date.now();
    console.log('[Agent:Risk] Running deterministic risk analysis...');

    try {
      const { score, breakdown } = calculateRiskScore(traffic, roadCondition, weather, timeFactors);
      const riskLevel = scoreToLevel(score);
      const factors = buildFactors(traffic, roadCondition, weather, timeFactors, breakdown);
      const precautions = buildPrecautions(traffic, roadCondition, weather, timeFactors);
      const confidence = calculateConfidence(agentConfidences, traffic, roadCondition, weather);
      const explanation = buildFallbackExplanation(score, riskLevel, factors, traffic, weather);

      const result: RiskAnalysisResult = {
        risk_score: score,
        risk_level: riskLevel,
        confidence,
        factors: factors.slice(0, 6),
        precautions: precautions.slice(0, 6),
        explanation,
        timestamp: new Date().toISOString(),
      };

      const elapsed = Date.now() - start;
      console.log(
        `[Agent:Risk] ✓ Done in ${elapsed}ms — score: ${score}/100, level: ${riskLevel}, confidence: ${confidence}%`
      );

      return { success: true, data: result, confidence, processingTime: elapsed };
    } catch (err) {
      const elapsed = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : 'Risk analysis failed';
      console.error(`[Agent:Risk] ✗ Failed:`, errorMsg);
      return { success: false, error: errorMsg, confidence: 0, processingTime: elapsed };
    }
  }
}

// ─── Scoring Engine ───────────────────────────────────────────────────────────

export function calculateRiskScore(
  traffic: TrafficData,
  roadCondition: RoadCondition,
  weather: WeatherData,
  timeFactors: TimeFactors
): { score: number; breakdown: RiskBreakdown } {
  // ── Traffic risk (0–100) ──
  const congestionRisk: Record<TrafficData['congestionLevel'], number> = {
    LOW: 15,
    MODERATE: 40,
    HIGH: 70,
    SEVERE: 95,
  };
  const incidentPenalty = Math.min(traffic.incidents.length * 12, 20);
  const speedPenalty =
    traffic.expectedSpeed > 0
      ? Math.max(0, (1 - traffic.averageSpeed / traffic.expectedSpeed) * 20)
      : 0;
  const baseTrafficRisk =
    typeof traffic.congestionScore === 'number'
      ? Math.max(congestionRisk[traffic.congestionLevel], traffic.congestionScore)
      : congestionRisk[traffic.congestionLevel];
  const trafficRisk = Math.min(100, baseTrafficRisk + incidentPenalty + speedPenalty);

  // ── Road condition risk (0–100) ──
  const roadQualityRisk: Record<RoadCondition['quality'], number> = {
    GOOD: 10,
    FAIR: 35,
    POOR: 65,
    VERY_POOR: 90,
  };
  const hazardPenalty = roadCondition.hazards.reduce((sum, h) => {
    return sum + ({ LOW: 5, MEDIUM: 12, HIGH: 22 }[h.severity]);
  }, 0);
  const lightingPenalty: Record<RoadCondition['lightingCondition'], number> = {
    GOOD: 0,
    MODERATE: 15,
    POOR: 35,
  };
  // Invert infra score: low infra → high risk
  const infraPenalty = Math.max(0, (100 - roadCondition.infrastructureScore) * 0.15);
  const roadRisk = Math.min(
    100,
    roadQualityRisk[roadCondition.quality] + hazardPenalty + lightingPenalty[roadCondition.lightingCondition] + infraPenalty
  );

  // ── Weather risk (0–100) ──
  const weatherConditionRisk: Record<WeatherData['condition'], number> = {
    CLEAR: 5,
    CLOUDY: 15,
    RAIN: 45,
    HEAVY_RAIN: 75,
    FOG: 85,
    STORM: 95,
  };
  const visibilityPenalty = weather.visibility < 1 ? 40 : weather.visibility < 3 ? 25 : weather.visibility < 5 ? 12 : 0;
  const windPenalty = weather.windSpeed > 60 ? 30 : weather.windSpeed > 40 ? 18 : weather.windSpeed > 25 ? 8 : 0;
  const precipPenalty = weather.precipitation > 20 ? 10 : weather.precipitation > 5 ? 5 : 0;
  const weatherRisk = Math.min(100, weatherConditionRisk[weather.condition] + visibilityPenalty + windPenalty + precipPenalty);

  // ── Time risk (0–100) ──
  const timeOfDayRisk: Record<TimeFactors['timeOfDay'], number> = {
    MORNING_RUSH: 50,
    DAY: 20,
    EVENING_RUSH: 55,
    NIGHT: 40,
    LATE_NIGHT: 60,
  };
  const daylightBonus = timeFactors.daylight ? 0 : 25;
  const weekendBonus = timeFactors.isWeekend ? -10 : 0; // Weekends slightly safer
  const timeRisk = Math.min(100, Math.max(0, timeOfDayRisk[timeFactors.timeOfDay] + daylightBonus + weekendBonus));

  // ── Weighted final score (per spec) ──
  const finalScore = Math.round(
    trafficRisk * 0.35 +
    roadRisk * 0.25 +
    weatherRisk * 0.2 +
    timeRisk * 0.2
  );

  return {
    score: Math.min(100, Math.max(0, finalScore)),
    breakdown: {
      traffic: Math.round(trafficRisk),
      road: Math.round(roadRisk),
      weather: Math.round(weatherRisk),
      time: Math.round(timeRisk),
    },
  };
}

// ─── Level Mapping ────────────────────────────────────────────────────────────

function scoreToLevel(score: number): RiskLevel {
  if (score <= 33) return 'LOW';
  if (score <= 66) return 'MEDIUM';
  return 'HIGH';
}

// ─── Factor Generation ────────────────────────────────────────────────────────

function buildFactors(
  traffic: TrafficData,
  road: RoadCondition,
  weather: WeatherData,
  time: TimeFactors,
  breakdown: RiskBreakdown
): RiskFactor[] {
  const factors: RiskFactor[] = [];

  // Traffic factors
  if (breakdown.traffic > 25) {
    factors.push({
      category: 'TRAFFIC',
      factor: `${traffic.congestionLevel.toLowerCase()} congestion`,
      impact: breakdown.traffic,
      description: `Avg speed ${traffic.averageSpeed} km/h vs expected ${traffic.expectedSpeed} km/h — delay: +${traffic.delayMinutes} min`,
    });
  }
  if (traffic.incidents.length > 0) {
    factors.push({
      category: 'TRAFFIC',
      factor: `${traffic.incidents.length} traffic incident(s)`,
      impact: Math.min(traffic.incidents.length * 15, 30),
      description: traffic.incidents.map(i => i.description).join('; '),
    });
  }

  // Road factors
  if (breakdown.road > 25) {
    factors.push({
      category: 'ROAD',
      factor: `${road.quality.toLowerCase().replace('_', ' ')} road quality`,
      impact: breakdown.road,
      description: `Infrastructure score: ${road.infrastructureScore}/100, Lighting: ${road.lightingCondition.toLowerCase()}`,
    });
  }
  if (road.hazards.length > 0) {
    factors.push({
      category: 'ROAD',
      factor: `${road.hazards.length} road hazard(s) detected`,
      impact: Math.min(road.hazards.length * 12, 36),
      description: road.hazards.map(h => `${h.type.replace(/_/g, ' ')} (${h.severity.toLowerCase()})`).join(', '),
    });
  }

  // Weather factors
  if (breakdown.weather > 20) {
    factors.push({
      category: 'WEATHER',
      factor: weather.condition.toLowerCase().replace(/_/g, ' '),
      impact: breakdown.weather,
      description: `${weather.description} | Visibility: ${weather.visibility}km, Wind: ${weather.windSpeed}km/h, Humidity: ${weather.humidity}%`,
    });
  }

  // Time factors
  if (breakdown.time > 30) {
    factors.push({
      category: 'TIME',
      factor: time.timeOfDay.toLowerCase().replace(/_/g, ' '),
      impact: breakdown.time,
      description: `${time.daylight ? 'Daylight' : 'Night driving'}, ${time.isWeekend ? 'weekend' : 'weekday'}`,
    });
  }

  // Sort by impact descending
  return factors.sort((a, b) => b.impact - a.impact);
}

// ─── Precaution Generation ────────────────────────────────────────────────────

function buildPrecautions(
  traffic: TrafficData,
  road: RoadCondition,
  weather: WeatherData,
  time: TimeFactors
): SafetyPrecaution[] {
  const precautions: SafetyPrecaution[] = [];

  // Weather precautions (highest priority)
  if (weather.condition === 'FOG' || weather.visibility < 2) {
    precautions.push({
      priority: 'HIGH',
      action: 'Use fog lights and drive at 30–40 km/h or below',
      reason: `Visibility is only ${weather.visibility}km — very limited forward view`,
    });
  }
  if (weather.condition === 'STORM') {
    precautions.push({
      priority: 'HIGH',
      action: 'Avoid travel if possible — storm conditions are dangerous',
      reason: 'Severe weather significantly increases accident probability',
    });
  }
  if (weather.condition === 'HEAVY_RAIN') {
    precautions.push({
      priority: 'HIGH',
      action: 'Reduce speed by 30–40%, avoid flooded roads',
      reason: 'Heavy rain drastically reduces braking performance and visibility',
    });
  }
  if (weather.condition === 'RAIN') {
    precautions.push({
      priority: 'MEDIUM',
      action: 'Reduce speed by 20% and maintain 3-second following distance',
      reason: 'Wet roads increase stopping distance by up to 2×',
    });
  }

  // Traffic precautions
  if (traffic.congestionLevel === 'SEVERE' || traffic.congestionLevel === 'HIGH') {
    precautions.push({
      priority: 'HIGH',
      action: 'Maintain at least 2-car-length gap in stop-and-go traffic',
      reason: 'Dense traffic increases rear-end collision risk significantly',
    });
  }
  if (traffic.incidents.length > 0) {
    precautions.push({
      priority: 'MEDIUM',
      action: 'Be alert for stationary vehicles and emergency personnel on route',
      reason: `${traffic.incidents.length} active incident(s) reported ahead`,
    });
  }

  // Road precautions
  if (road.hazards.some(h => h.type === 'POTHOLE')) {
    precautions.push({
      priority: 'MEDIUM',
      action: 'Watch for potholes, especially after rain — reduce speed on damaged sections',
      reason: 'Poor road surface can cause sudden loss of vehicle control',
    });
  }
  if (road.hazards.some(h => h.type === 'NARROW_ROAD')) {
    precautions.push({
      priority: 'MEDIUM',
      action: 'Move left and slow down on narrow sections — give way to oncoming vehicles',
      reason: 'Single-lane roads require extra caution at blind spots',
    });
  }
  if (road.hazards.some(h => h.type === 'PEDESTRIAN_ZONE')) {
    precautions.push({
      priority: 'HIGH',
      action: 'Slow to 30 km/h in pedestrian zones — prioritise walkers',
      reason: 'Route passes through pedestrian-heavy areas',
    });
  }
  if (road.hazards.some(h => h.type === 'ANIMAL_CROSSING')) {
    precautions.push({
      priority: 'MEDIUM',
      action: 'Watch for animals crossing the road — especially at dawn and dusk',
      reason: 'Animal crossings detected on this route',
    });
  }

  // Night / lighting precautions
  if (!time.daylight) {
    precautions.push({
      priority: 'MEDIUM',
      action: 'Ensure headlights and tail-lights are working — use high-beam on empty roads',
      reason: 'Night driving with poor lighting significantly increases accident risk',
    });
  }
  if (road.lightingCondition === 'POOR' && !time.daylight) {
    precautions.push({
      priority: 'HIGH',
      action: 'Drive at 40 km/h or below on poorly lit sections',
      reason: 'Poor street lighting combined with night conditions is very hazardous',
    });
  }

  // Rush hour
  if (time.timeOfDay === 'MORNING_RUSH' || time.timeOfDay === 'EVENING_RUSH') {
    precautions.push({
      priority: 'LOW',
      action: 'Keep a safe distance from two-wheelers and auto-rickshaws during peak hours',
      reason: 'Rush hour increases risk from lane changes and sudden braking',
    });
  }

  // Universal precaution — always included
  precautions.push({
    priority: 'LOW',
    action: 'Save emergency contacts (112, family) and share live location before departure',
    reason: 'Always be prepared for unexpected road incidents',
  });

  return precautions;
}

// ─── Confidence Calculation ───────────────────────────────────────────────────

function calculateConfidence(
  agentConfidences: { traffic: number; road: number; weather: number },
  traffic: TrafficData,
  road: RoadCondition,
  weather: WeatherData
): number {
  // Weighted average of agent confidences
  const baseConfidence =
    agentConfidences.traffic * 0.4 +
    agentConfidences.road * 0.35 +
    agentConfidences.weather * 0.25;

  // Boost for data richness
  let boost = 0;
  if (traffic.incidents.length > 0) boost += 3;
  if (road.hazards.length > 0) boost += 3;
  if (weather.visibility > 0) boost += 2;

  // Cap at 95 — never claim 100% confidence
  return Math.round(Math.min(95, Math.max(55, baseConfidence + boost)));
}

// ─── Fallback Explanation ─────────────────────────────────────────────────────

function buildFallbackExplanation(
  score: number,
  level: RiskLevel,
  factors: RiskFactor[],
  traffic: TrafficData,
  weather: WeatherData
): string {
  const levelDesc: Record<RiskLevel, string> = {
    LOW: 'relatively safe for travel',
    MEDIUM: 'moderately risky — drive carefully',
    HIGH: 'high-risk — extra vigilance required',
  };

  let msg = `This route is ${levelDesc[level]} with a risk score of ${score}/100. `;

  const topFactors = factors.slice(0, 2).map(f => f.factor);
  if (topFactors.length > 0) {
    msg += `Primary concerns: ${topFactors.join(' and ')}. `;
  }

  if (weather.condition === 'HEAVY_RAIN' || weather.condition === 'STORM') {
    msg += 'Adverse weather is the dominant hazard — reduce speed significantly. ';
  } else if (traffic.congestionLevel === 'SEVERE') {
    msg += 'Severe congestion is the main concern — allow extra time and maintain safe gaps. ';
  } else if (level === 'LOW') {
    msg += 'Conditions appear favorable — maintain standard safe driving practices.';
  }

  return msg.trim();
}
