'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Clock, 
  MapPin, 
  Trash2, 
  ChevronRight,
  History,
  AlertTriangle,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import type { RiskLevel } from '@/lib/types';

interface RouteHistoryItem {
  id: string;
  origin: string;
  destination: string;
  riskLevel: RiskLevel;
  score: number;
  timestamp: number;
}

interface RouteHistoryProps {
  onSelectRoute: (origin: string, destination: string) => void;
}

const STORAGE_KEY = 'road-safety-ai-history';

export function RouteHistory({ onSelectRoute }: RouteHistoryProps) {
  const [history, setHistory] = useState<RouteHistoryItem[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Load history from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch {
        // Invalid data, reset
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Save to localStorage when history changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  const addToHistory = (item: Omit<RouteHistoryItem, 'id' | 'timestamp'>) => {
    const newItem: RouteHistoryItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
    };
    
    setHistory(prev => {
      // Remove duplicate routes
      const filtered = prev.filter(
        h => !(h.origin === item.origin && h.destination === item.destination)
      );
      // Keep only last 10 routes
      return [newItem, ...filtered].slice(0, 10);
    });
  };

  const removeFromHistory = (id: string) => {
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  const clearHistory = () => {
    setHistory([]);
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getRiskIcon = (level: RiskLevel) => {
    switch (level) {
      case 'LOW':
        return <CheckCircle className="w-4 h-4 text-risk-low" />;
      case 'MEDIUM':
        return <AlertCircle className="w-4 h-4 text-risk-medium" />;
      case 'HIGH':
        return <AlertTriangle className="w-4 h-4 text-risk-high" />;
    }
  };

  const getRiskColor = (level: RiskLevel) => {
    switch (level) {
      case 'LOW': return 'text-risk-low';
      case 'MEDIUM': return 'text-risk-medium';
      case 'HIGH': return 'text-risk-high';
    }
  };

  // Expose addToHistory for parent component
  useEffect(() => {
    (window as unknown as Record<string, unknown>).addRouteToHistory = addToHistory;
    return () => {
      delete (window as unknown as Record<string, unknown>).addRouteToHistory;
    };
  }, []);

  if (history.length === 0) {
    return null;
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            Recent Routes
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {history.length > 3 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? 'Show less' : `Show all (${history.length})`}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
              onClick={clearHistory}
            >
              Clear
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className={isExpanded ? 'h-[300px]' : 'h-auto'}>
          <div className="space-y-2">
            {(isExpanded ? history : history.slice(0, 3)).map((item) => (
              <div
                key={item.id}
                className="group flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
                onClick={() => onSelectRoute(item.origin, item.destination)}
              >
                <div className="flex-shrink-0">
                  {getRiskIcon(item.riskLevel)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5 text-sm">
                    <span className="font-medium text-foreground truncate">{item.origin}</span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium text-foreground truncate">{item.destination}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={`text-xs font-medium ${getRiskColor(item.riskLevel)}`}>
                      Score: {item.score}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTime(item.timestamp)}
                    </span>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromHistory(item.id);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Helper function to add route to history from anywhere
export function addRouteToHistory(
  origin: string,
  destination: string,
  riskLevel: RiskLevel,
  score: number
) {
  const fn = (window as unknown as Record<string, unknown>).addRouteToHistory as
    | ((item: Omit<RouteHistoryItem, 'id' | 'timestamp'>) => void)
    | undefined;
  
  if (fn) {
    fn({ origin, destination, riskLevel, score });
  }
}
