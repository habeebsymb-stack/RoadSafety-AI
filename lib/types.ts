// Road Safety AI - Type Definitions

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface PlaceSuggestion {
  id: string;
  description: string;
  primaryText: string;
  secondaryText?: string;
  coordinates?: Coordinates;
}

export interface Location {
  address: string;
  coordinates: Coordinates;
}

export interface RouteData {
  origin: Location;
  destination: Location;
  distance: string;
  duration: string;
  polyline: string;
  waypoints: Coordinates[];
  trafficDelayMinutes?: number; // TomTom-specific real-time traffic delay
}

export interface TrafficData {
  congestionLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
  congestionScore?: number; // 0-100, higher means more congestion
  averageSpeed: number;
  expectedSpeed: number;
  delayMinutes: number;
  incidents: TrafficIncident[];
  source?: 'TOMTOM_REALTIME' | 'ROUTE_TRAFFIC' | 'DERIVED' | 'HEURISTIC';
}

export interface TrafficIncident {
  type: 'ACCIDENT' | 'CONSTRUCTION' | 'ROAD_CLOSURE' | 'CONGESTION';
  location: Coordinates;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  source?: 'TOMTOM_REALTIME' | 'OLA_LIVE' | 'DERIVED' | 'HEURISTIC';
}

export interface RoadCondition {
  quality: 'GOOD' | 'FAIR' | 'POOR' | 'VERY_POOR';
  hazards: RoadHazard[];
  infrastructureScore: number; // 0-100
  lightingCondition: 'GOOD' | 'MODERATE' | 'POOR';
}

export interface RoadHazard {
  type: 'POTHOLE' | 'NARROW_ROAD' | 'SHARP_TURN' | 'STEEP_GRADIENT' | 'FLOODING' | 'CONSTRUCTION' | 'ANIMAL_CROSSING' | 'PEDESTRIAN_ZONE';
  location: Coordinates;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  reportedAt: string;
  description?: string;
  source?: 'OSM' | 'HEURISTIC' | 'USER_REPORT';
}

export interface WeatherData {
  condition: 'CLEAR' | 'CLOUDY' | 'RAIN' | 'HEAVY_RAIN' | 'FOG' | 'STORM';
  temperature: number;
  humidity: number;
  visibility: number; // in km
  windSpeed: number; // in km/h
  precipitation: number; // in mm
  description: string;
}

export interface TimeFactors {
  timeOfDay: 'MORNING_RUSH' | 'DAY' | 'EVENING_RUSH' | 'NIGHT' | 'LATE_NIGHT';
  isWeekend: boolean;
  isHoliday: boolean;
  daylight: boolean;
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskFactor {
  category: 'TRAFFIC' | 'ROAD' | 'WEATHER' | 'TIME';
  factor: string;
  impact: number; // 0-100
  description: string;
}

export interface SafetyPrecaution {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  action: string;
  reason: string;
}

export interface RiskAnalysisResult {
  risk_score: number; // 0-100
  risk_level: RiskLevel;
  confidence: number; // 0-100
  factors: RiskFactor[];
  precautions: SafetyPrecaution[];
  explanation: string;
  timestamp: string;
}

export interface SafetyAdvisorResult {
  explanation: string;
  topConcerns: string[];
  drivingTips: string[];
  suggestedQueries: string[];
  confidenceReasoning: string;
  aiEnhanced: boolean;
}

export interface AgentResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  confidence: number;
  processingTime: number;
}

export interface HazardReport {
  id: string;
  type: RoadHazard['type'];
  location: Coordinates;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  reportedBy: string;
  reportedAt: string;
  verified: boolean;
  upvotes: number;
}

export interface AnalysisRequest {
  origin: string;
  destination: string;
  preferSafestRoute: boolean;
}

export interface FullAnalysis {
  route: RouteData;
  traffic: TrafficData;
  roadCondition: RoadCondition;
  weather: WeatherData;
  timeFactors: TimeFactors;
  riskAnalysis: RiskAnalysisResult;
  safetyAdvisor?: SafetyAdvisorResult;
  suggestedQueries?: string[];
  warnings?: string[];
}
