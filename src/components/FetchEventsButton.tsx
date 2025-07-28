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
      
      const { data, error } = await supabase.functions.invoke('fetch-real-events', {
        body: {
          location,
          preferences
        }
      });

      if (error) {
        throw error;
      }

      console.log('Events fetched successfully:', data);

      toast({
        title: "Events Updated!",
        description: data.message || `Found ${data.events?.length || 0} events`,
      });

      // Trigger parent component to refresh events
      if (onEventsFetched) {
        onEventsFetched();
      }

    } catch (error: any) {
      console.error('Error fetching events:', error);
      toast({
        title: "Error fetching events",
        description: error.message || "Failed to fetch real events. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
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
      {isLoading ? 'Fetching Events...' : 'Fetch Real Events'}
    </Button>
  );
};