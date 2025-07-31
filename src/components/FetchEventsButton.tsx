import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, MapPin, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiHealthChecker, ApiHealthStatus } from '@/utils/apiHealthCheck';

interface FetchEventsButtonProps {
  location?: string;
  preferences?: any;
  onEventsFetched?: (events: any[]) => void;
  className?: string;
}

// Configuration for the new Node.js API
const API_BASE_URL = 'http://localhost:8765/api';

export const FetchEventsButton: React.FC<FetchEventsButtonProps> = ({
  location = "San Francisco, CA",
  preferences = {},
  onEventsFetched,
  className
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<ApiHealthStatus | null>(null);
  const { toast } = useToast();

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
      console.log('🎭 Fetching events using new Node.js API for:', location);
      console.log('📍 Preferences:', preferences);
      console.log('🏥 Health Status:', currentHealth);
      
      // Get categories from preferences, default to theatre and music
      let categories = preferences.categories ? 
        Object.keys(preferences.categories).filter(cat => preferences.categories[cat] > 0) : 
        ['theatre', 'music'];
      
      // Ensure we always have at least some categories
      if (categories.length === 0) {
        categories = ['theatre', 'music'];
        console.log('🔧 No active categories found, using defaults:', categories);
      }
      
      console.log('🎯 Categories to fetch:', categories);

      // Fetch from our new Node.js API for each category
      const eventPromises = categories.slice(0, 3).map(async (category) => {
        const categoryName = category.toLowerCase();
        const url = `${API_BASE_URL}/events/${categoryName}?location=${encodeURIComponent(location)}&date_range=next 30 days`;
        
        console.log(`📡 Fetching ${categoryName} events from:`, url);
        console.log(`🌍 Frontend running on: ${window.location.origin}`);
        
        try {
          console.log(`🔍 Making request to: ${url}`);
          const response = await fetch(url);
          console.log(`📡 Response status: ${response.status} ${response.statusText}`);
          
          if (!response.ok) {
            console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
            return {
              category: categoryName,
              events: [],
              count: 0,
              success: false,
              error: `HTTP ${response.status}: ${response.statusText}`
            };
          }
          
          const data = await response.json();
          console.log(`📦 Response data:`, data);
          
          if (data.success && data.events) {
            const cacheStatus = data.cached ? ' (cached)' : ' (fresh)';
            console.log(`✅ ${categoryName}: ${data.events.length} events found${cacheStatus}`);
            return {
              category: categoryName,
              events: data.events,
              count: data.events.length,
              success: true,
              cached: data.cached || false
            };
          } else {
            console.warn(`⚠️ ${categoryName} failed:`, data.error || 'No events in response');
            return {
              category: categoryName,
              events: [],
              count: 0,
              success: false,
              error: data.error || 'No events in response'
            };
          }
        } catch (error) {
          console.error(`❌ ${categoryName} network error:`, error);
          return {
            category: categoryName,
            events: [],
            count: 0,
            success: false,
            error: error.message
          };
        }
      });

      // Wait for all category requests to complete
      const results = await Promise.all(eventPromises);
      
      // Calculate totals
      let totalEvents = 0;
      const messages = [];
      const allEvents = [];
      let cacheHits = 0;

      results.forEach(result => {
        if (result.success && result.count > 0) {
          totalEvents += result.count;
          allEvents.push(...result.events);
          if (result.cached) {
            cacheHits++;
            messages.push(`${result.count} ${result.category} events (cached)`);
          } else {
            messages.push(`${result.count} ${result.category} events`);
          }
        } else if (!result.success) {
          console.warn(`Failed to fetch ${result.category}:`, result.error);
        }
      });

      console.log(`🎉 Total events fetched: ${totalEvents}`);
      console.log('📊 Breakdown:', messages);

      // Convert API events to the format expected by the frontend
      console.log('🔍 Raw API event sample:', allEvents[0]);
      const transformedEvents = allEvents.map((event, index) => {
        console.log(`🔍 Transforming event ${index}:`, event);
        
        // Use actual event dates from API, fallback to reasonable defaults
        const startDate = event.startDate ? event.startDate : new Date().toISOString();
        const endDate = event.endDate ? event.endDate : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours later
        
        console.log(`📅 Event dates - Start: ${startDate}, End: ${endDate}`);
        
        return {
          id: `api_event_${Date.now()}_${index}`,
          title: event.title,
          description: event.description || '',
          startDate: startDate,
          endDate: endDate,
          venue: {
            name: event.venue || '',
            address: event.address || location,
            website: event.externalUrl || '',
            mapUrl: ''
          },
          categories: [event.category || 'Events'],
          personalRelevanceScore: 8, // Default score for API events
          price: event.priceRange ? {
            type: event.priceRange.min === 0 && event.priceRange.max === 0 ? "free" as const : "paid" as const,
            amount: event.priceRange.min === 0 && event.priceRange.max === 0 ? undefined : `$${event.priceRange.min || 0}-$${event.priceRange.max || 50}`
          } : { type: "free" as const },
          ticketUrl: event.externalUrl || '',
          eventUrl: event.externalUrl || '',
          aiReasoning: 'Event fetched from new Node.js API using proven Perplexity patterns'
        };
      });

      const successMessage = messages.length > 0 
        ? `Found ${totalEvents} events using new API! (${messages.join(', ')})`
        : `Found ${totalEvents} events using new API!`;

      const cacheInfo = cacheHits > 0 ? ` • ${cacheHits}/${results.length} from cache ⚡` : '';

      toast({
        title: "🎭 Events Updated with New API!",
        description: successMessage + cacheInfo,
      });

      // Pass events directly to parent component
      if (onEventsFetched && transformedEvents.length > 0) {
        onEventsFetched(transformedEvents);
      }

    } catch (error: any) {
      console.error('❌ Error fetching events with new API:', error);
      toast({
        title: "Error fetching events",
        description: error.message || "Failed to fetch events from new API. Make sure the API server is running on port 8765.",
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
    if (!healthStatus) return 'Fetch Events';
    if (healthStatus.isHealthy) return `Fetch Events (${healthStatus.api.sampleEventCount} available)`;
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
      disabled={isLoading || (healthStatus && !healthStatus.isHealthy)}
      className={getButtonClassName()}
      title={healthStatus ? `Backend: ${healthStatus.backend.reachable ? 'Connected' : 'Disconnected'} | API: ${healthStatus.api.functional ? 'Functional' : 'Failed'} | Last Check: ${healthStatus.lastChecked.toLocaleTimeString()}` : 'Checking connection...'}
    >
      {getButtonIcon()}
      {getButtonText()}
    </Button>
  );
};