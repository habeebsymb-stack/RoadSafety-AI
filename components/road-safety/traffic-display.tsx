'use client';

import { Car, AlertCircle, Clock, Gauge, Navigation } from 'lucide-react';
import type { TrafficData } from '@/lib/types';

interface TrafficDisplayProps {
  traffic?: TrafficData;
  isLoading?: boolean;
  estimatedDuration?: string;
}

function calculateETA(duration?: string, delayMinutes?: number): string {
  if (!duration) return '--:--';
  
  const now = new Date();
  
  // Parse duration (e.g., "2h 30m" or "45 min")
  let totalMinutes = 0;
  const hourMatch = duration.match(/(\d+)\s*h/);
  const minMatch = duration.match(/(\d+)\s*m/);
  
  if (hourMatch) totalMinutes += parseInt(hourMatch[1]) * 60;
  if (minMatch) totalMinutes += parseInt(minMatch[1]);
  
  // Add delay
  if (delayMinutes) totalMinutes += delayMinutes;
  
  // Calculate ETA
  const eta = new Date(now.getTime() + totalMinutes * 60000);
  
  return eta.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
}

export function TrafficDisplay({ traffic, isLoading, estimatedDuration }: TrafficDisplayProps) {
  const eta = calculateETA(estimatedDuration, traffic?.delayMinutes);
  const getCongestionColor = (level?: TrafficData['congestionLevel']) => {
    switch (level) {
      case 'LOW':
        return 'text-risk-low bg-risk-low/20';
      case 'MODERATE':
        return 'text-chart-3 bg-chart-3/20';
      case 'HIGH':
        return 'text-risk-medium bg-risk-medium/20';
      case 'SEVERE':
        return 'text-risk-high bg-risk-high/20';
      default:
        return 'text-muted-foreground bg-muted';
    }
  };

  const getCongestionLabel = (level?: TrafficData['congestionLevel']) => {
    switch (level) {
      case 'LOW':
        return 'Light Traffic';
      case 'MODERATE':
        return 'Moderate Traffic';
      case 'HIGH':
        return 'Heavy Traffic';
      case 'SEVERE':
        return 'Severe Congestion';
      default:
        return 'No Data';
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-card rounded-lg border border-border animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-muted rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-3 w-32 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!traffic) {
    return (
      <div className="p-4 bg-card rounded-lg border border-border">
        <div className="flex items-center gap-4 text-muted-foreground">
          <Car className="w-8 h-8" />
          <div>
            <div className="text-sm font-medium">Traffic Data</div>
            <div className="text-xs">No data available</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-card rounded-lg border border-border">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${getCongestionColor(traffic.congestionLevel)}`}>
            <Car className="w-6 h-6" />
          </div>
          <div>
            <div className="text-lg font-semibold text-foreground">
              {getCongestionLabel(traffic.congestionLevel)}
            </div>
            <div className="text-sm text-muted-foreground">
              {traffic.source === 'TOMTOM_REALTIME' ? 'TomTom real-time traffic' : 'Current traffic status'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3">
          <div>
            <div className="text-xs text-muted-foreground">Congestion Score</div>
            <div className="text-sm font-semibold text-foreground">
              {traffic.congestionScore ?? 0}/100
            </div>
          </div>
          <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, Math.max(0, traffic.congestionScore ?? 0))}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg">
          <Gauge className="w-4 h-4 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground">Avg Speed</div>
            <div className="text-sm font-medium text-foreground">
              {traffic.averageSpeed} km/h
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg">
          <Gauge className="w-4 h-4 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground">Expected</div>
            <div className="text-sm font-medium text-foreground">
              {traffic.expectedSpeed} km/h
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground">Delay</div>
            <div className="text-sm font-medium text-foreground">
              +{traffic.delayMinutes} min
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg">
          <Navigation className="w-4 h-4 text-primary" />
          <div>
            <div className="text-xs text-muted-foreground">ETA</div>
            <div className="text-sm font-semibold text-primary">
              {eta}
            </div>
          </div>
        </div>
      </div>

      {traffic.incidents.length > 0 && (
        <div className="mt-3 p-2 bg-risk-high/10 border border-risk-high/20 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-risk-high mt-0.5" />
            <div>
              <div className="text-xs font-medium text-risk-high">
                {traffic.incidents.length} Incident(s) Reported
              </div>
              {traffic.incidents.map((incident, index) => (
                <div key={index} className="text-xs text-muted-foreground mt-1">
                  {incident.description}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
