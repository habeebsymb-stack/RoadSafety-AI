'use client';

import { 
  Sun, 
  Cloud, 
  CloudRain, 
  CloudLightning, 
  CloudFog,
  Wind,
  Droplets,
  Eye,
  Thermometer 
} from 'lucide-react';
import type { WeatherData } from '@/lib/types';

interface WeatherDisplayProps {
  weather?: WeatherData;
  isLoading?: boolean;
}

export function WeatherDisplay({ weather, isLoading }: WeatherDisplayProps) {
  const getWeatherIcon = (condition?: WeatherData['condition']) => {
    const iconClass = "w-8 h-8";
    switch (condition) {
      case 'CLEAR':
        return <Sun className={`${iconClass} text-yellow-400`} />;
      case 'CLOUDY':
        return <Cloud className={`${iconClass} text-gray-400`} />;
      case 'RAIN':
        return <CloudRain className={`${iconClass} text-blue-400`} />;
      case 'HEAVY_RAIN':
        return <CloudRain className={`${iconClass} text-blue-600`} />;
      case 'FOG':
        return <CloudFog className={`${iconClass} text-gray-500`} />;
      case 'STORM':
        return <CloudLightning className={`${iconClass} text-yellow-500`} />;
      default:
        return <Cloud className={`${iconClass} text-muted-foreground`} />;
    }
  };

  const getWeatherRisk = (condition?: WeatherData['condition']) => {
    switch (condition) {
      case 'CLEAR':
      case 'CLOUDY':
        return { level: 'LOW', color: 'text-risk-low' };
      case 'RAIN':
        return { level: 'MEDIUM', color: 'text-risk-medium' };
      case 'HEAVY_RAIN':
      case 'FOG':
      case 'STORM':
        return { level: 'HIGH', color: 'text-risk-high' };
      default:
        return { level: '--', color: 'text-muted-foreground' };
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-card rounded-lg border border-border animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-muted rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-20 bg-muted rounded" />
            <div className="h-3 w-32 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="p-4 bg-card rounded-lg border border-border">
        <div className="flex items-center gap-4 text-muted-foreground">
          <Cloud className="w-8 h-8" />
          <div>
            <div className="text-sm font-medium">Weather Data</div>
            <div className="text-xs">No data available</div>
          </div>
        </div>
      </div>
    );
  }

  const risk = getWeatherRisk(weather.condition);

  return (
    <div className="p-4 bg-card rounded-lg border border-border">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {getWeatherIcon(weather.condition)}
          <div>
            <div className="text-lg font-semibold text-foreground">
              {weather.temperature}°C
            </div>
            <div className="text-sm text-muted-foreground capitalize">
              {weather.condition.toLowerCase().replace('_', ' ')}
            </div>
          </div>
        </div>
        <div className={`text-xs font-medium ${risk.color}`}>
          {risk.level} RISK
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg">
          <Eye className="w-4 h-4 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground">Visibility</div>
            <div className="text-sm font-medium text-foreground">{weather.visibility} km</div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg">
          <Wind className="w-4 h-4 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground">Wind</div>
            <div className="text-sm font-medium text-foreground">{weather.windSpeed} km/h</div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg">
          <Droplets className="w-4 h-4 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground">Humidity</div>
            <div className="text-sm font-medium text-foreground">{weather.humidity}%</div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg">
          <CloudRain className="w-4 h-4 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground">Precipitation</div>
            <div className="text-sm font-medium text-foreground">{weather.precipitation} mm</div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {weather.description}
      </p>
    </div>
  );
}
