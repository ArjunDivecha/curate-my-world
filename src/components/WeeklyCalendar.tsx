import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar, Star } from "lucide-react";

interface Event {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  venue: {
    name: string;
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
  onEventClick: (eventId: string) => void;
}

export const WeeklyCalendar = ({ events, onEventClick }: WeeklyCalendarProps) => {
  const [currentWeek, setCurrentWeek] = useState(new Date());

  const getWeekDates = (date: Date) => {
    const week = [];
    const startOfWeek = new Date(date);
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
    return events.filter(event => {
      const eventDate = new Date(event.startDate);
      return eventDate.toDateString() === date.toDateString();
    });
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentWeek);
    newDate.setDate(currentWeek.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentWeek(newDate);
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
    if (score >= 8) return "border-l-primary bg-primary/5";
    if (score >= 6) return "border-l-accent bg-accent/5";
    return "border-l-secondary bg-secondary/5";
  };

  return (
    <Card className="bg-gradient-card shadow-card border-0">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Weekly View
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigateWeek('prev')}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium px-4">
              {weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <Button variant="outline" size="sm" onClick={() => navigateWeek('next')}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2">
          {weekDates.map((date, index) => {
            const dayEvents = getEventsForDate(date);
            const isToday = date.toDateString() === new Date().toDateString();
            
            return (
              <div key={index} className={`border rounded-lg p-3 min-h-[200px] ${isToday ? 'bg-primary/5 border-primary/20' : 'bg-background border-border'}`}>
                <div className="text-center mb-3">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className={`text-lg font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                    {date.getDate()}
                  </div>
                </div>
                
                <div className="space-y-2">
                  {dayEvents.map((event) => (
                    <div
                      key={event.id}
                      onClick={() => onEventClick(event.id)}
                      className={`border-l-2 pl-2 py-1 cursor-pointer hover:bg-muted/50 rounded-r transition-all duration-200 ${getRelevanceColor(event.personalRelevanceScore)}`}
                    >
                      <div className="text-xs font-medium text-foreground line-clamp-2 mb-1">
                        {event.title}
                      </div>
                      <div className="text-xs text-muted-foreground mb-1">
                        {formatTime(event.startDate)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge className="text-xs px-1 py-0" variant="secondary">
                          <Star className="w-2 h-2 mr-1" />
                          {event.personalRelevanceScore}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {dayEvents.length === 0 && (
                    <div className="text-xs text-muted-foreground/50 text-center py-4">
                      No events
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};