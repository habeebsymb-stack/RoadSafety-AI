'use client';

import { useEffect, useRef, useState } from 'react';
import type { RouteData, RoadCondition, RiskLevel } from '@/lib/types';

interface MapViewProps {
  route?: RouteData;
  roadCondition?: RoadCondition;
  riskLevel?: RiskLevel;
  isLoading?: boolean;
}

export function MapView({ route, roadCondition, riskLevel, isLoading }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Simulated map with SVG visualization
  const riskColors = {
    LOW: 'rgb(34, 197, 94)',
    MEDIUM: 'rgb(234, 179, 8)',
    HIGH: 'rgb(239, 68, 68)',
  };

  const routeColor = riskLevel ? riskColors[riskLevel] : 'rgb(59, 130, 246)';

  useEffect(() => {
    // Simulate map loading
    const timer = setTimeout(() => setMapLoaded(true), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div 
      ref={mapRef}
      className="relative w-full h-full min-h-[400px] bg-secondary/50 rounded-lg overflow-hidden"
    >
      {/* Map Background Pattern */}
      <div className="absolute inset-0 opacity-20">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-border"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Map Visualization */}
      <svg 
        viewBox="0 0 400 300" 
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* City blocks representation */}
        <g className="opacity-30">
          {[...Array(12)].map((_, i) => (
            <rect
              key={i}
              x={30 + (i % 4) * 90}
              y={30 + Math.floor(i / 4) * 80}
              width={70}
              height={60}
              rx={4}
              className="fill-muted stroke-border"
              strokeWidth={1}
            />
          ))}
        </g>

        {/* Roads */}
        <g className="stroke-muted-foreground/30" strokeWidth={2}>
          <line x1="20" y1="100" x2="380" y2="100" />
          <line x1="20" y1="180" x2="380" y2="180" />
          <line x1="120" y1="20" x2="120" y2="280" />
          <line x1="280" y1="20" x2="280" y2="280" />
        </g>

        {/* Route path */}
        {route && mapLoaded && (
          <g>
            {/* Route shadow */}
            <path
              d="M 60 250 Q 120 200 180 150 T 340 60"
              fill="none"
              stroke={routeColor}
              strokeWidth={8}
              strokeLinecap="round"
              opacity={0.3}
              className="animate-pulse"
            />
            {/* Main route */}
            <path
              d="M 60 250 Q 120 200 180 150 T 340 60"
              fill="none"
              stroke={routeColor}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={isLoading ? "10 5" : "none"}
              className={isLoading ? "animate-[dash_1s_linear_infinite]" : ""}
            />
          </g>
        )}

        {/* Hazard markers */}
        {roadCondition?.hazards.map((hazard, index) => {
          const positions = [
            { x: 100, y: 220 },
            { x: 180, y: 150 },
            { x: 260, y: 100 },
            { x: 320, y: 80 },
          ];
          const pos = positions[index % positions.length];
          const severityColors = {
            LOW: '#22c55e',
            MEDIUM: '#eab308',
            HIGH: '#ef4444',
          };
          
          return (
            <g key={index} transform={`translate(${pos.x}, ${pos.y})`}>
              <circle
                r={12}
                fill={severityColors[hazard.severity]}
                opacity={0.2}
                className="animate-ping"
              />
              <circle
                r={8}
                fill={severityColors[hazard.severity]}
              />
              <text
                y={1}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-white text-[8px] font-bold"
              >
                !
              </text>
            </g>
          );
        })}

        {/* Origin marker */}
        {route && (
          <g transform="translate(60, 250)">
            <circle r={12} className="fill-primary" />
            <circle r={6} className="fill-background" />
            <text
              y={-20}
              textAnchor="middle"
              className="fill-foreground text-[10px] font-medium"
            >
              Start
            </text>
          </g>
        )}

        {/* Destination marker */}
        {route && (
          <g transform="translate(340, 60)">
            <circle r={12} className="fill-accent" />
            <path
              d="M 0 -6 L 4 6 L 0 3 L -4 6 Z"
              className="fill-accent-foreground"
            />
            <text
              y={-20}
              textAnchor="middle"
              className="fill-foreground text-[10px] font-medium"
            >
              End
            </text>
          </g>
        )}

        {/* Loading state overlay */}
        {isLoading && (
          <g>
            <rect
              x="0"
              y="0"
              width="400"
              height="300"
              fill="currentColor"
              className="text-background"
              opacity={0.5}
            />
            <g transform="translate(200, 150)">
              <circle
                r={20}
                fill="none"
                className="stroke-primary"
                strokeWidth={3}
                strokeDasharray="80 40"
              >
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0"
                  to="360"
                  dur="1s"
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          </g>
        )}

        {/* Empty state */}
        {!route && !isLoading && (
          <g transform="translate(200, 150)">
            <circle r={40} className="fill-muted" opacity={0.5} />
            <path
              d="M -15 -10 L 0 -20 L 15 -10 L 15 10 L 0 20 L -15 10 Z"
              className="fill-muted-foreground"
              opacity={0.5}
            />
            <text
              y={50}
              textAnchor="middle"
              className="fill-muted-foreground text-[12px]"
            >
              Enter route to analyze
            </text>
          </g>
        )}
      </svg>

      {/* Map Legend */}
      {route && (
        <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm rounded-lg p-3 border border-border">
          <div className="text-xs font-medium text-foreground mb-2">Legend</div>
          <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-muted-foreground">Start Point</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-accent" />
              <span className="text-muted-foreground">Destination</span>
            </div>
            {roadCondition && roadCondition.hazards.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-risk-medium" />
                <span className="text-muted-foreground">Hazard Zone</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Route Info Overlay */}
      {route && !isLoading && (
        <div className="absolute top-4 right-4 bg-card/90 backdrop-blur-sm rounded-lg p-3 border border-border">
          <div className="text-xs text-muted-foreground">Distance</div>
          <div className="text-sm font-semibold text-foreground">{route.distance}</div>
          <div className="text-xs text-muted-foreground mt-2">Est. Duration</div>
          <div className="text-sm font-semibold text-foreground">{route.duration}</div>
        </div>
      )}
    </div>
  );
}
