import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, MapPin, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiHealthChecker, ApiHealthStatus } from '@/utils/apiHealthCheck';

interface FetchEventsButtonProps {
  location?: string;
  preferences?: any;
  onEventsFetched?: (events: any[]) => void;
  onAllEventsFetched?: (eventsByCategory: any, categoryStats: any, providerDetails?: ProviderStatSummary[]) => void;
  onProviderDetails?: (details: ProviderStatSummary[], statsMap: ProviderStatsMap) => void;
  selectedProviders: Record<string, boolean>;
  className?: string;
}

export interface ProviderStatSummary {
  provider: string;
  label: string;
  requested: boolean;
  enabled: boolean;
  success: boolean;
  originalCount: number;
  survivedCount: number;
  duplicatesRemoved: number;
  processingTime: number;
  cost: number;
}

export type ProviderStatsMap = Record<string, ProviderStatSummary>;

// Configuration for the new Node.js API
const API_BASE_URL = 'http://localhost:8765/api';

export const FetchEventsButton: React.FC<FetchEventsButtonProps> = ({
  location = "San Francisco, CA",
  preferences = {},
  onEventsFetched,
  onAllEventsFetched,
  onProviderDetails,
  selectedProviders,
  className
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<ApiHealthStatus | null>(null);
  const { toast } = useToast();

  const activeProviderKeys = useMemo(
    () => Object.entries(selectedProviders || {})
      .filter(([, enabled]) => !!enabled)
      .map(([key]) => key),
    [selectedProviders]
  );
  const noProvidersSelected = activeProviderKeys.length === 0;

  // Subscribe to health status updates
  useEffect(() => {
    const unsubscribe = apiHealthChecker.subscribe(setHealthStatus);
    
    // Start monitoring on component mount
    apiHealthChecker.startMonitoring(30000); // Check every 30 seconds
    
    // Perform initial health check
    apiHealthChecker.forceCheck();
    
    return unsubscribe;
  }, []);

  const fetchRealEvents = async () => {
    setIsLoading(true);
    
    // Pre-flight health check
    const currentHealth = await apiHealthChecker.forceCheck();
    if (!currentHealth.isHealthy) {
      toast({
        title: "🚨 Backend Connection Issue",
        description: `Backend is ${currentHealth.backend.reachable ? 'reachable' : 'unreachable'}. API is ${currentHealth.api.functional ? 'functional' : 'not functional'}. Please wait for auto-recovery or check the console.`,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }
    
    try {
      if (noProvidersSelected) {
        toast({
          title: "Select a data source",
          description: "Turn on at least one provider before fetching events.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      console.log('🎭 Fetching ALL categories using all-categories endpoint for:', location);
      console.log('📍 Preferences:', preferences);
      console.log('🏥 Health Status:', currentHealth);
      console.log('🔌 Provider switches selected:', activeProviderKeys);
      
      const aiInstructions = preferences.aiInstructions?.trim();

      const url = new URL(`${API_BASE_URL}/events/all-categories`);
      url.searchParams.set('location', location);
      url.searchParams.set('date_range', 'next 30 days');
      url.searchParams.set('limit', '500');
      if (aiInstructions) {
        url.searchParams.set('custom_prompt', aiInstructions);
      }
      if (!noProvidersSelected) {
        url.searchParams.set('providers', activeProviderKeys.join(','));
      }
      
      if (aiInstructions) {
        console.log('🤖 Using AI Instructions for custom search:', aiInstructions);
      } else {
        console.log('📂 Using regular category-based search (no AI instructions)');
      }
      
      console.log(`📡 Fetching all categories from:`, url.toString());
      console.log(`🌍 Frontend running on: ${window.location.origin}`);
      
      console.log(`🔍 Making request to: ${url.toString()}`);
      const response = await fetch(url.toString());
      console.log(`📡 Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`📦 All categories response:`, data);
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch events from all categories');
      }
      
      const { eventsByCategory, categoryStats, totalEvents, processingTime, providerStats, providerDetails } = data;
      
      console.log(`🎉 Total events across all categories: ${totalEvents}`);
      console.log('📊 Category breakdown:', categoryStats);
      if (providerStats) {
        console.log('🧩 Provider contribution (post-dedup totals):');
        Object.entries(providerStats).forEach(([provider, stats]: any) => {
          console.log(`  - ${provider}: survived=${(stats as any).survivedCount} / original=${(stats as any).originalCount} (removed=${(stats as any).duplicatesRemoved})`);
        });
      }
      console.log('📋 Events by category:', eventsByCategory);
      
      if (totalEvents === 0) {
        toast({
          title: "No events found",
          description: "No events were found across all categories for this location. Try a different location or check back later.",
          variant: "destructive",
        });
        return;
      }

      // Create summary message
      const categoryBreakdown = Object.entries(categoryStats)
        .filter(([_, stats]: [string, any]) => stats.count > 0)
        .map(([category, stats]: [string, any]) => `${category}: ${stats.count}`)
        .join(', ');

      const successMessage = categoryBreakdown
        ? `Found ${totalEvents} events across all categories! (${categoryBreakdown})`
        : `Found ${totalEvents} events across all categories!`;

      toast({
        title: "🎭 All Categories Fetched!",
        description: successMessage + ` • Processing time: ${Math.round(processingTime/1000)}s`,
      });

      // Pass all events data to parent component for category filtering
      if (onAllEventsFetched) {
        onAllEventsFetched(eventsByCategory, categoryStats, providerDetails);
      }

      if (onProviderDetails) {
        onProviderDetails(providerDetails || [], providerStats || {});
      }
      
      // Also pass all events as a flat array for backward compatibility
      if (onEventsFetched) {
        const allEvents: any[] = [];
        Object.values(eventsByCategory).forEach((events: any) => {
          if (Array.isArray(events)) {
            allEvents.push(...events);
          }
        });
        
        // Transform events to match expected format
        const transformedEvents = allEvents.map((event: any) => {
          return {
            id: event.id,
            title: event.title,
            description: event.description || '',
            venue: event.venue,
            location: event.location,
            address: event.address || '',
            date: event.startDate,
            time: event.dateHuman || 'Time TBD',
            category: event.category,
            coordinates: event.venueInfo?.coordinates || getCoordinatesFromLocation(location),
            price: event.priceRange ? {
              type: event.priceRange.min === 0 && event.priceRange.max === 0 ? "free" as const : "paid" as const,
              amount: event.priceRange.min === 0 && event.priceRange.max === 0 ? undefined : `$${event.priceRange.min || 0}-$${event.priceRange.max || 50}`
            } : { type: "free" as const },
            ticketUrl: event.externalUrl || '',
            eventUrl: event.externalUrl || '',
            aiReasoning: 'Event fetched from all-categories endpoint with deduplication'
          };
        });
        
        onEventsFetched(transformedEvents);
      }

    } catch (error: any) {
      console.error('❌ Error fetching events with all-categories endpoint:', error);
      toast({
        title: "Error fetching events",
        description: error.message || "Failed to fetch events from all-categories endpoint. Make sure the API server is running on port 8765.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to get coordinates from location string
  const getCoordinatesFromLocation = (location: string) => {
    // Default coordinates for major cities
    const cityCoordinates: { [key: string]: { lat: number; lng: number } } = {
      'san francisco': { lat: 37.7749, lng: -122.4194 },
      'new york': { lat: 40.7128, lng: -74.0060 },
      'los angeles': { lat: 34.0522, lng: -118.2437 },
      'chicago': { lat: 41.8781, lng: -87.6298 },
      'miami': { lat: 25.7617, lng: -80.1918 },
      'seattle': { lat: 47.6062, lng: -122.3321 },
      'austin': { lat: 30.2672, lng: -97.7431 },
      'boston': { lat: 42.3601, lng: -71.0589 }
    };
    
    const city = location.toLowerCase().split(',')[0].trim();
    return cityCoordinates[city] || { lat: 37.7749, lng: -122.4194 }; // Default to SF
  };

  // Get appropriate icon and styling based on health status
  const getButtonIcon = () => {
    if (isLoading) return <RefreshCw className="w-4 h-4 mr-2 animate-spin" />;
    if (!healthStatus) return <MapPin className="w-4 h-4 mr-2" />;
    if (healthStatus.isHealthy) return <Wifi className="w-4 h-4 mr-2 text-green-400" />;
    if (healthStatus.consecutiveFailures > 3) return <WifiOff className="w-4 h-4 mr-2 text-red-400" />;
    return <AlertTriangle className="w-4 h-4 mr-2 text-yellow-400" />;
  };

  const getButtonText = () => {
    if (isLoading) return 'Fetching Events...';
    if (noProvidersSelected) return 'Select Providers';
    if (!healthStatus) return 'Fetch Events';
    if (healthStatus.isHealthy) return 'Fetch Events';
    if (healthStatus.consecutiveFailures > 3) return 'Backend Offline - Retrying...';
    return 'Connection Issues - Fetch Events';
  };

  const getButtonClassName = () => {
    const baseClass = className || "bg-primary hover:bg-primary/90 text-primary-foreground";
    if (!healthStatus) return baseClass;
    if (healthStatus.isHealthy) return baseClass;
    if (healthStatus.consecutiveFailures > 3) return "bg-red-600 hover:bg-red-700 text-white";
    return "bg-yellow-600 hover:bg-yellow-700 text-white";
  };

  return (
    <Button
      onClick={fetchRealEvents}
      disabled={isLoading || (healthStatus && !healthStatus.isHealthy) || noProvidersSelected}
      className={getButtonClassName()}
      title={healthStatus ? `Backend: ${healthStatus.backend.reachable ? 'Connected' : 'Disconnected'} | API: ${healthStatus.api.functional ? 'Functional' : 'Failed'} | Last Check: ${healthStatus.lastChecked ? healthStatus.lastChecked.toLocaleTimeString() : 'n/a'}` : 'Checking connection...'}
    >
      {getButtonIcon()}
      {getButtonText()}
    </Button>
  );
};
