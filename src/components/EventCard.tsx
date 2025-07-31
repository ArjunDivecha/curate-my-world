import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MapPin, Clock, Star, Calendar, ExternalLink, Share2, Bookmark, ChevronDown } from "lucide-react";
import { cleanHtmlText } from "@/lib/utils";
import { saveToCalendar, validateEventForCalendar } from "@/lib/calendarUtils";
import { useToast } from "@/hooks/use-toast";

interface Event {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  venue: {
    name: string;
    address: string;
    website?: string;
    mapUrl?: string;
  };
  categories: string[];
  personalRelevanceScore: number;
  price: {
    type: 'free' | 'paid' | 'donation';
    amount?: string;
  };
  ticketUrl?: string;
  eventUrl?: string;
  aiReasoning: string;
}

interface EventCardProps {
  event: Event;
  onSaveToCalendar: (eventId: string) => void;
}

export const EventCard = ({ event, onSaveToCalendar }: EventCardProps) => {
  const { toast } = useToast();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const getRelevanceColor = (score: number) => {
    if (score >= 8) return "bg-primary text-primary-foreground";
    if (score >= 6) return "bg-accent text-accent-foreground";
    return "bg-secondary text-secondary-foreground";
  };

  const handleCalendarSave = (calendarType: 'google' | 'outlook' | 'apple' | 'download') => {
    // Convert event to calendar format
    const calendarEvent = {
      id: event.id,
      title: event.title,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate,
      venue: {
        name: event.venue.name,
        address: event.venue.address,
        website: event.venue.website
      },
      eventUrl: event.eventUrl,
      ticketUrl: event.ticketUrl
    };

    // Validate event data
    const validation = validateEventForCalendar(calendarEvent);
    if (!validation.valid) {
      toast({
        title: "Cannot Save to Calendar",
        description: validation.errors.join(', '),
        variant: "destructive",
      });
      return;
    }

    // Show warnings if any
    if (validation.warnings.length > 0) {
      console.warn('Calendar save warnings:', validation.warnings);
    }

    try {
      saveToCalendar(calendarEvent, calendarType);
      
      // Also call the original handler for internal state management
      onSaveToCalendar(event.id);
      
      toast({
        title: "Calendar Event Created",
        description: `"${event.title}" has been added to your ${calendarType === 'download' ? 'device' : calendarType} calendar.`,
      });
    } catch (error) {
      console.error('Calendar save error:', error);
      toast({
        title: "Calendar Save Failed",
        description: "There was an error saving to your calendar. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="group bg-gradient-card shadow-card hover:shadow-elegant transition-all duration-300 hover:-translate-y-1 animate-fade-in border-0">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors duration-300">
              {cleanHtmlText(event.title)}
            </h3>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(event.startDate)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{formatTime(event.startDate)}</span>
              </div>
            </div>
          </div>
          <Badge 
            className={`${getRelevanceColor(event.personalRelevanceScore)} ml-4 flex items-center gap-1`}
          >
            <Star className="w-3 h-3" />
            {event.personalRelevanceScore}/10
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {cleanHtmlText(event.description)}
        </p>

        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          {event.venue.website ? (
            <a 
              href={event.venue.website} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {cleanHtmlText(event.venue.name)}
            </a>
          ) : (
            <span className="text-sm text-muted-foreground">{cleanHtmlText(event.venue.name)}</span>
          )}
          {event.venue.mapUrl && (
            <a 
              href={event.venue.mapUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary"
            >
              📍 Map
            </a>
          )}
          <span className="text-xs text-muted-foreground">•</span>
          <Badge variant="outline" className="text-xs">
            {event.price.type === 'free' ? 'Free' : event.price.amount}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {event.categories.slice(0, 3).map((category) => (
            <Badge key={category} variant="secondary" className="text-xs">
              {category}
            </Badge>
          ))}
        </div>


        <div className="space-y-3">
          {/* External Links */}
          {(event.ticketUrl || event.eventUrl) && (
            <div className="flex flex-wrap gap-2">
              {event.ticketUrl && (
                <a 
                  href={event.ticketUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-block"
                >
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-xs hover:bg-accent hover:text-accent-foreground transition-all duration-300"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Get Tickets
                  </Button>
                </a>
              )}
              {event.eventUrl && (
                <a 
                  href={event.eventUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-block"
                >
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-xs hover:bg-accent hover:text-accent-foreground transition-all duration-300"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Event Page
                  </Button>
                </a>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  size="sm" 
                  className="w-full bg-gradient-primary hover:opacity-90 transition-all duration-300 shadow-elegant"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Save to Calendar
                  <ChevronDown className="w-3 h-3 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem 
                  onClick={() => handleCalendarSave('google')}
                  className="cursor-pointer"
                >
                  <div className="flex items-center">
                    <div className="w-4 h-4 rounded bg-blue-500 mr-2"></div>
                    Google Calendar
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleCalendarSave('outlook')}
                  className="cursor-pointer"
                >
                  <div className="flex items-center">
                    <div className="w-4 h-4 rounded bg-blue-600 mr-2"></div>
                    Outlook Calendar
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleCalendarSave('apple')}
                  className="cursor-pointer"
                >
                  <div className="flex items-center">
                    <div className="w-4 h-4 rounded bg-gray-800 mr-2"></div>
                    Apple Calendar
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleCalendarSave('download')}
                  className="cursor-pointer"
                >
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-2" />
                    Download .ics file
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};