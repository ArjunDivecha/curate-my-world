/**
 * =============================================================================
 * SCRIPT NAME: WeeklyCalendar.tsx
 * =============================================================================
 * 
 * DESCRIPTION:
 * Weekly calendar view showing all events stacked below each date.
 * Simple, reliable implementation with proper event display.
 * 
 * VERSION: 2.0
 * LAST UPDATED: 2025-01-30
 * AUTHOR: Claude Code
 * =============================================================================
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar, Star, BookmarkCheck, Clock, MapPin } from "lucide-react";

interface Event {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  venue: {
    name: string;
    address: string;
    website?: string;
    mapUrl?: string;
  };
  personalRelevanceScore: number;
  categories: string[];
  ticketUrl?: string;
  eventUrl?: string;
}

interface WeeklyCalendarProps {
  events: Event[];
  savedEvents?: Event[];
  onEventClick: (eventId: string) => void;
  onDateClick?: (date: Date) => void;
  activeCategory?: string | null;
}

export const WeeklyCalendar = ({ events, savedEvents = [], onEventClick, onDateClick, activeCategory }: WeeklyCalendarProps) => {
  const [currentWeek, setCurrentWeek] = useState(new Date());

  // Debug logging
  console.log('🔍 WeeklyCalendar rendered with:', {
    eventsCount: events.length,
    savedEventsCount: savedEvents.length,
    events: events
  });

  const getWeekDates = (date: Date) => {
    const week = [];
    const startOfWeek = new Date(date);
    // Start from Sunday
    startOfWeek.setDate(date.getDate() - date.getDay());
    
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      week.push(day);
    }
    return week;
  };

  const weekDates = getWeekDates(currentWeek);

  const getEventsForDate = (date: Date) => {
    const targetDateString = date.toDateString();
    console.log(`🔍 Looking for events on: ${targetDateString}`);
    
    const dayEvents = events.filter(event => {
      try {
        if (!event.startDate) {
          console.warn(`Event "${event.title}" has no startDate`);
          return false;
        }

        const eventDate = new Date(event.startDate);
        
        // Validate the parsed date
        if (isNaN(eventDate.getTime())) {
          console.warn(`Event "${event.title}" has invalid startDate: ${event.startDate}`);
          return false;
        }
        
        const eventDateString = eventDate.toDateString();
        
        console.log(`📅 Event "${event.title}": ${eventDateString} vs ${targetDateString} (Raw: ${event.startDate})`);
        
        const matches = eventDateString === targetDateString;
        if (matches) {
          console.log(`✅ Match found for "${event.title}" on ${targetDateString}`);
        }
        
        return matches;
      } catch (error) {
        console.error(`❌ Error parsing date for event "${event.title}":`, error);
        return false;
      }
    });
    
    console.log(`📊 Found ${dayEvents.length} events for ${targetDateString}:`, dayEvents.map(e => e.title));
    return dayEvents;
  };

  const isEventSaved = (eventId: string) => {
    return savedEvents.some(savedEvent => savedEvent.id === eventId);
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentWeek);
    newDate.setDate(currentWeek.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentWeek(newDate);
  };

  const formatTime = (dateString: string) => {
    try {
      if (!dateString) return 'Time TBD';
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Time TBD';
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return 'Time TBD';
    }
  };

  const getRelevanceColor = (score: number) => {
    if (score >= 8) return "border-l-green-500 bg-green-50";
    if (score >= 6) return "border-l-blue-500 bg-blue-50";
    return "border-l-gray-500 bg-gray-50";
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Calendar View
              <span className="text-sm text-muted-foreground font-normal">
                ({events.length} events total)
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigateWeek('prev')}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium px-4">
                {weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - 
                {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <Button variant="outline" size="sm" onClick={() => navigateWeek('next')}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-4">
        {weekDates.map((date, index) => {
          const dayEvents = getEventsForDate(date);
          const isToday = date.toDateString() === new Date().toDateString();
          const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
          
          return (
            <Card key={index} className={`min-h-[300px] ${isToday ? 'ring-2 ring-primary' : ''}`}>
              <CardHeader className="pb-2">
                {onDateClick ? (
                  <button
                    type="button"
                    className="text-center cursor-pointer hover:bg-muted/50 rounded p-2 transition-colors w-full border-0 bg-transparent"
                    onClick={(e) => {
                      console.log('📅 Date clicked:', date.toDateString());
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('📞 Calling onDateClick handler');
                      onDateClick(date);
                    }}
                    title={`View all events for ${date.toLocaleDateString()}${activeCategory ? ` in ${activeCategory}` : ''}`}
                  >
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">
                      {dayName}
                    </div>
                    <div className={`text-lg font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                      {date.getDate()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Click to view
                    </div>
                  </button>
                ) : (
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">
                      {dayName}
                    </div>
                    <div className={`text-lg font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                      {date.getDate()}
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {dayEvents.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-8">
                      No events
                    </div>
                  ) : (
                    dayEvents.map((event) => {
                      const saved = isEventSaved(event.id);
                      return (
                        <div
                          key={event.id}
                          onClick={() => onEventClick(event.id)}
                          className={`border-l-4 pl-3 py-2 cursor-pointer hover:bg-muted/50 rounded-r transition-all duration-200 ${getRelevanceColor(event.personalRelevanceScore)} ${saved ? 'ring-1 ring-primary/30' : ''}`}
                        >
                          {/* Event Title */}
                          <div className="flex items-start justify-between mb-1">
                            <div className="text-xs font-medium text-foreground line-clamp-2 flex-1 pr-1">
                              {event.title}
                            </div>
                            {saved && (
                              <BookmarkCheck className="w-3 h-3 text-primary flex-shrink-0" />
                            )}
                          </div>
                          
                          {/* Time */}
                          <div className="flex items-center gap-1 mb-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {formatTime(event.startDate)}
                            </span>
                          </div>
                          
                          {/* Venue */}
                          <div className="flex items-center gap-1 mb-1">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground line-clamp-1">
                              {event.venue.name || 'Venue TBD'}
                            </span>
                          </div>
                          
                          {/* Score */}
                          <div className="flex items-center gap-1">
                            <Badge variant="secondary" className="text-xs px-1 py-0">
                              <Star className="w-2 h-2 mr-1" />
                              {event.personalRelevanceScore}/10
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {saved ? 'Saved' : 'Click to save'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      {/* Debug Info */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">
            <strong>Your Calendar:</strong> {events.length} saved events. 
            Current week: {weekDates[0].toDateString()} to {weekDates[6].toDateString()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
