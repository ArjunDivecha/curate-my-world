import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface FetchEventsButtonProps {
  location?: string;
  preferences?: any;
  onEventsFetched?: () => void;
}

export const FetchEventsButton: React.FC<FetchEventsButtonProps> = ({
  location = "San Francisco, CA",
  preferences = {},
  onEventsFetched
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchRealEvents = async () => {
    setIsLoading(true);
    try {
      console.log('Fetching real events for:', location);
      
      // Fetch from multiple sources in parallel
      const [braveResults, ticketmasterResults] = await Promise.allSettled([
        // Brave Search API (web scraping)
        supabase.functions.invoke('fetch-real-events', {
          body: {
            location,
            preferences
          }
        }),
        // Ticketmaster API (real events)
        supabase.functions.invoke('ticketmaster-collector', {
          body: {
            location,
            coordinates: getCoordinatesFromLocation(location),
            categories: preferences.categories || ['music', 'arts'],
            limit: 20
          }
        })
      ]);

      let totalEvents = 0;
      const messages = [];

      // Process Brave Search results
      if (braveResults.status === 'fulfilled' && !braveResults.value.error) {
        const braveData = braveResults.value.data;
        if (braveData.events) {
          totalEvents += braveData.events.length;
          messages.push(`${braveData.events.length} web events`);
        }
      }

      // Process Ticketmaster results
      if (ticketmasterResults.status === 'fulfilled' && !ticketmasterResults.value.error) {
        const tmData = ticketmasterResults.value.data;
        if (tmData.stats?.newEvents) {
          totalEvents += tmData.stats.newEvents;
          messages.push(`${tmData.stats.newEvents} Ticketmaster events`);
        }
      } else if (ticketmasterResults.status === 'rejected') {
        console.warn('Ticketmaster API failed:', ticketmasterResults.reason);
        messages.push('Ticketmaster unavailable');
      }

      const successMessage = messages.length > 0 
        ? `Found ${totalEvents} events (${messages.join(', ')})`
        : `Found ${totalEvents} events`;

      toast({
        title: "Events Updated!",
        description: successMessage,
      });

      // Trigger parent component to refresh events
      if (onEventsFetched) {
        onEventsFetched();
      }

    } catch (error: any) {
      console.error('Error fetching events:', error);
      toast({
        title: "Error fetching events",
        description: error.message || "Failed to fetch events. Please try again.",
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

  return (
    <Button
      onClick={fetchRealEvents}
      disabled={isLoading}
      className="bg-primary hover:bg-primary/90 text-primary-foreground"
    >
      {isLoading ? (
        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <MapPin className="w-4 h-4 mr-2" />
      )}
      {isLoading ? 'Fetching Events...' : 'Fetch Events'}
    </Button>
  );
};