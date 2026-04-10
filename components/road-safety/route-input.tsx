'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, ArrowRight, Shield, RotateCcw, Loader2, Locate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { PlaceSuggestion, Coordinates } from '@/lib/types';

interface RouteInputProps {
  onAnalyze: (
    origin: string,
    destination: string,
    preferSafest: boolean,
    originCoords?: Coordinates,
    destCoords?: Coordinates
  ) => void;
  isLoading: boolean;
}

const POPULAR_ROUTES = [
  { origin: 'Connaught Place, Delhi', destination: 'India Gate, Delhi' },
  { origin: 'Mumbai Central, Mumbai', destination: 'Bandra, Mumbai' },
  { origin: 'MG Road, Bangalore', destination: 'Whitefield, Bangalore' },
  { origin: 'Howrah Station, Kolkata', destination: 'Salt Lake, Kolkata' },
];

export function RouteInput({ onAnalyze, isLoading }: RouteInputProps) {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [originCoords, setOriginCoords] = useState<Coordinates | undefined>(undefined);
  const [destCoords, setDestCoords] = useState<Coordinates | undefined>(undefined);
  const [preferSafest, setPreferSafest] = useState(true);
  const [activeField, setActiveField] = useState<'origin' | 'destination' | null>(null);
  const [originSuggestions, setOriginSuggestions] = useState<PlaceSuggestion[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isOriginLoading, setIsOriginLoading] = useState(false);
  const [isDestinationLoading, setIsDestinationLoading] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (origin.trim() && destination.trim()) {
      onAnalyze(origin.trim(), destination.trim(), preferSafest, originCoords, destCoords);
    }
  };

  const handleQuickRoute = (route: { origin: string; destination: string }) => {
    setOrigin(route.origin);
    setDestination(route.destination);
    setOriginCoords(undefined);
    setDestCoords(undefined);
    onAnalyze(route.origin, route.destination, preferSafest, undefined, undefined);
  };

  const handleSwapLocations = () => {
    const temp = origin;
    const tempCoords = originCoords;
    setOrigin(destination);
    setOriginCoords(destCoords);
    setDestCoords(tempCoords);
    setOriginSuggestions(destinationSuggestions);
    setDestinationSuggestions(originSuggestions);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by this browser.');
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords: Coordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        // Reverse geocode to get address
        try {
          const response = await fetch(
            `/api/places/reverse-geocode?lat=${coords.lat}&lng=${coords.lng}`
          );
          const data = await response.json();
          if (data.address) {
            setOrigin(data.address);
            setOriginCoords(coords);
          } else {
            setOrigin(`Current Location (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
            setOriginCoords(coords);
          }
        } catch (error) {
          console.warn('Reverse geocoding failed:', error);
          setOrigin(`Current Location (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
          setOriginCoords(coords);
        }
        setIsGettingLocation(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert('Unable to get your current location. Please check your browser permissions.');
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    const query = activeField === 'origin' ? origin.trim() : destination.trim();

    if (!activeField || query.length < 3) {
      if (activeField === 'origin') setOriginSuggestions([]);
      if (activeField === 'destination') setDestinationSuggestions([]);
      setIsOriginLoading(false);
      setIsDestinationLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (activeField === 'origin') setIsOriginLoading(true);
      if (activeField === 'destination') setIsDestinationLoading(true);

      try {
        const response = await fetch(`/api/places/suggest?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        const suggestions: PlaceSuggestion[] = data.suggestions || [];

        if (activeField === 'origin') {
          setOriginSuggestions(suggestions);
        } else {
          setDestinationSuggestions(suggestions);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          if (activeField === 'origin') setOriginSuggestions([]);
          if (activeField === 'destination') setDestinationSuggestions([]);
        }
      } finally {
        if (activeField === 'origin') setIsOriginLoading(false);
        if (activeField === 'destination') setIsDestinationLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeField, origin, destination]);

  const applySuggestion = (field: 'origin' | 'destination', suggestion: PlaceSuggestion) => {
    if (field === 'origin') {
      setOrigin(suggestion.description);
      setOriginCoords(suggestion.coordinates);
      setOriginSuggestions([]);
    } else {
      setDestination(suggestion.description);
      setDestCoords(suggestion.coordinates);
      setDestinationSuggestions([]);
    }
    setActiveField(null);
  };

  const renderSuggestions = (field: 'origin' | 'destination') => {
    const suggestions = field === 'origin' ? originSuggestions : destinationSuggestions;
    const loading = field === 'origin' ? isOriginLoading : isDestinationLoading;
    const value = field === 'origin' ? origin : destination;

    if (activeField !== field) return null;
    if (!loading && value.trim().length < 3) return null;
    if (!loading && suggestions.length === 0) return null;

    return (
      <div className="absolute top-[calc(100%+0.5rem)] left-0 right-0 z-30 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
        {loading && (
          <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching Ola Maps
          </div>
        )}
        {!loading && suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => applySuggestion(field, suggestion)}
            className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-secondary/60 transition-colors"
          >
            <MapPin className="mt-0.5 h-4 w-4 text-primary" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground truncate">
                {suggestion.primaryText}
              </span>
              {suggestion.secondaryText && (
                <span className="block text-xs text-muted-foreground truncate">
                  {suggestion.secondaryText}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Origin & Destination Inputs */}
        <div className="relative">
          <div className="space-y-3">
            {/* Origin */}
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                <div className="w-3 h-3 rounded-full bg-primary border-2 border-primary-foreground" />
              </div>
              <Input
                type="text"
                placeholder="Enter starting point..."
                value={origin}
                onChange={(e) => {
                  setOrigin(e.target.value);
                  setOriginCoords(undefined);
                }}
                onFocus={() => setActiveField('origin')}
                onBlur={() => window.setTimeout(() => setActiveField((current) => (current === 'origin' ? null : current)), 120)}
                className="pl-10 pr-12 bg-secondary/50 border-border focus:border-primary h-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUseCurrentLocation}
                disabled={isGettingLocation}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                title="Use current location"
              >
                {isGettingLocation ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Locate className="h-4 w-4" />
                )}
              </Button>
              {renderSuggestions('origin')}
            </div>

            {/* Swap Button */}
            <div className="flex justify-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSwapLocations}
                className="h-8 w-8 p-0 rounded-full"
                disabled={!origin && !destination}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>

            {/* Destination */}
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                <div className="w-3 h-3 rounded-full bg-accent border-2 border-accent-foreground" />
              </div>
              <Input
                type="text"
                placeholder="Enter destination..."
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  setDestCoords(undefined);
                }}
                onFocus={() => setActiveField('destination')}
                onBlur={() => window.setTimeout(() => setActiveField((current) => (current === 'destination' ? null : current)), 120)}
                className="pl-10 bg-secondary/50 border-border focus:border-primary h-12"
              />
              {renderSuggestions('destination')}
            </div>
          </div>

          {/* Connector Line */}
          <div className="absolute left-[19px] top-[24px] w-0.5 h-[calc(100%-48px)] bg-border" />
        </div>

        {/* Safest Route Toggle */}
        <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <Label htmlFor="safest-route" className="text-sm cursor-pointer">
              Prefer safest route
            </Label>
          </div>
          <Switch
            id="safest-route"
            checked={preferSafest}
            onCheckedChange={setPreferSafest}
          />
        </div>

        {/* Analyze Button */}
        <Button
          type="submit"
          className="w-full h-12 text-base font-semibold"
          disabled={isLoading || !origin.trim() || !destination.trim()}
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
              Analyzing Route...
            </>
          ) : (
            <>
              <Navigation className="w-5 h-5 mr-2" />
              Analyze Safety
            </>
          )}
        </Button>
      </form>

      {/* Quick Routes */}
      <div className="pt-4 border-t border-border">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Popular Routes
        </div>
        <div className="grid grid-cols-1 gap-2">
          {POPULAR_ROUTES.map((route, index) => (
            <button
              key={index}
              onClick={() => handleQuickRoute(route)}
              disabled={isLoading}
              className="flex items-center gap-2 p-2 text-left text-sm rounded-lg bg-secondary/30 hover:bg-secondary/60 border border-transparent hover:border-border transition-colors disabled:opacity-50"
            >
              <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
              <span className="text-muted-foreground truncate max-w-[80px] sm:max-w-[120px]">{route.origin}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground truncate max-w-[80px] sm:max-w-[120px]">{route.destination}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
