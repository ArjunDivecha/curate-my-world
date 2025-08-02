import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MapPin, Clock, Calendar, ExternalLink, Share2, Bookmark, Eye } from "lucide-react";
import { cleanHtmlText } from "@/lib/utils";
import { saveToCalendar, validateEventForCalendar } from "@/lib/calendarUtils";
import { useToast } from "@/hooks/use-toast";
import { getCategoryColor, getCategoryBadgeClasses } from "@/utils/categoryColors";

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
  source?: string;
  sources?: string[];
}

interface EventCardProps {
  event: Event;
  onSaveToCalendar: (eventId: string) => void;
}

export const EventCard = ({ event, onSaveToCalendar }: EventCardProps) => {
  const { toast } = useToast();
  const [isHovering, setIsHovering] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  // Get category colors for this event
  const categoryColor = getCategoryColor(event.categories);

  // Handle hover with delay for preview
  React.useEffect(() => {
    console.log('🔍 Hover state changed:', { isHovering, eventId: event.id });
    let timeoutId: NodeJS.Timeout;
    
    if (isHovering) {
      console.log('⏱️ Starting hover timer for preview...');
      // Show preview after 300ms of hovering (reduced for testing)
      timeoutId = setTimeout(() => {
        console.log('✅ Showing preview popup!');
        setShowPreview(true);
      }, 300);
    } else {
      console.log('❌ Hiding preview popup');
      // Hide preview immediately when not hovering
      setShowPreview(false);
    }
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isHovering]);

  // Debug logging for event data
  console.log('🎯 EventCard rendering:', {
    id: event.id,
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate,
    venue: event.venue
  });

  const formatDate = (dateString: string) => {
    console.log('📅 Formatting date:', dateString);
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      console.error('❌ Invalid date:', dateString);
      return 'Invalid Date';
    }
    const formatted = date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
    console.log('✅ Formatted date:', formatted);
    return formatted;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const handleExternalCalendarSave = (calendarType: 'google' | 'outlook' | 'apple' | 'download') => {
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
      
      toast({
        title: "Calendar Export Successful",
        description: `"${event.title}" has been exported to your ${calendarType === 'download' ? 'device' : calendarType} calendar.`,
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
    <Card className={`group shadow-card hover:shadow-elegant transition-all duration-300 hover:-translate-y-1 animate-fade-in h-full ${categoryColor.background} ${categoryColor.border} ${categoryColor.hover}`}>
      <CardContent className="p-6 h-full flex flex-col">
        {/* Header Section - Fixed Height */}
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors duration-300 line-clamp-2 min-h-[3.5rem]">
            {cleanHtmlText(event.title)}
          </h3>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
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

        {/* Description Section - Fixed Height */}
        <div className="mb-4 min-h-[2.5rem]">
          <p className="text-sm text-muted-foreground line-clamp-2">
            {cleanHtmlText(event.description)}
          </p>
        </div>

        {/* Venue Section - Fixed Height */}
        <div className="mb-4 min-h-[3rem]">
          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
            <MapPin className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium line-clamp-1">{event.venue.name}</span>
          </div>
          {event.venue.address && (
            <p className="text-xs text-muted-foreground pl-5 line-clamp-1">
              {event.venue.address}
            </p>
          )}
        </div>

        {/* Categories Section - Fixed Height */}
        <div className="mb-4 min-h-[2rem]">
          <div className="flex flex-wrap gap-2">
            {event.categories.slice(0, 3).map((category) => {
              const badgeColor = getCategoryColor(category);
              return (
                <Badge 
                  key={category} 
                  className={`text-xs ${badgeColor.background} ${badgeColor.border} ${badgeColor.accent} border transition-colors`}
                >
                  {category}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Spacer to push buttons to bottom */}
        <div className="flex-1"></div>

        {/* Action Section - Fixed at Bottom */}
        <div className="space-y-3">
          {/* External Links - Always reserve space for consistent card height */}
          <div className="flex flex-wrap gap-2 min-h-[2rem] items-start">
            {(event.eventUrl || event.ticketUrl) && (
              <div 
                className="relative"
                onMouseEnter={() => {
                  console.log('🐭 Mouse entered Event Page button area');
                  setIsHovering(true);
                }}
                onMouseLeave={(e) => {
                  console.log('🐭 Mouse left Event Page button area');
                  // Don't hide if mouse is moving to the popup area
                  const relatedTarget = e.relatedTarget as HTMLElement;
                  if (!relatedTarget || !relatedTarget.closest('.preview-popup')) {
                    setIsHovering(false);
                  }
                }}
              >
                {/* Event Page Button with Hover Preview */}
                <a 
                  href={event.eventUrl || event.ticketUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-block"
                  onClick={(e) => {
                    // Prevent navigation if preview is showing
                    if (showPreview) {
                      e.preventDefault();
                      setShowPreview(false);
                      setIsHovering(false);
                    }
                  }}
                >
                  <Button 
                    variant="outline" 
                    size="sm"
                    className={`text-xs transition-all duration-300 transform ${
                      isHovering 
                        ? 'bg-blue-500 text-white scale-110 shadow-xl border-2 border-blue-300' 
                        : 'hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Event Page
                    {isHovering && (
                      <Eye className="w-3 h-3 ml-1 animate-pulse" />
                    )}
                  </Button>
                </a>
              </div>
            )}
          </div>
          
          {/* Hover Preview Popup */}
          {showPreview && (event.eventUrl || event.ticketUrl) && (() => {
            console.log('🎆 POPUP RENDERING NOW!', { showPreview, hasUrl: !!(event.eventUrl || event.ticketUrl) });
            return true;
          })() && (
            <div 
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-60 preview-popup"
              style={{ pointerEvents: 'auto' }}
              onMouseEnter={() => {
                console.log('🐭 Mouse entered popup area');
                setIsHovering(true);
              }}
              onMouseLeave={() => {
                console.log('🐭 Mouse left popup area');
                setIsHovering(false);
              }}
              onClick={() => {
                setShowPreview(false);
                setIsHovering(false);
              }}
            >
              <div 
                className="bg-white rounded-xl shadow-2xl max-w-5xl max-h-[85vh] w-[95vw] overflow-hidden border-2 border-gray-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-purple-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Eye className="w-5 h-5 text-blue-600" />
                      <h3 className="font-semibold text-lg truncate text-gray-800">{cleanHtmlText(event.title)}</h3>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        setShowPreview(false);
                        setIsHovering(false);
                      }}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      ✕
                    </Button>
                  </div>
                  <p className="text-sm text-gray-600 mt-1 truncate">{event.eventUrl || event.ticketUrl}</p>
                </div>
                <div className="h-[70vh] bg-gray-50">
                  <iframe 
                    src={event.eventUrl || event.ticketUrl}
                    className="w-full h-full border-0"
                    title={`Preview of ${event.title}`}
                    sandbox="allow-scripts allow-same-origin allow-forms"
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex gap-2">
            {/* Save to Internal Calendar Button */}
            <Button 
              size="sm" 
              onClick={() => {
                onSaveToCalendar(event.id);
                toast({
                  title: "Event Saved",
                  description: `"${event.title}" has been added to your calendar.`,
                });
              }}
              className="flex-1 bg-gradient-primary hover:opacity-90 transition-all duration-300 shadow-elegant"
            >
              <Bookmark className="w-4 h-4 mr-2" />
              Save to Calendar
            </Button>
            
            {/* Export to External Calendar Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="px-3"
                >
                  <Share2 className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
                  Export to External Calendar
                </div>
                <DropdownMenuItem 
                  onClick={() => handleExternalCalendarSave('google')}
                  className="cursor-pointer"
                >
                  <div className="flex items-center">
                    <div className="w-4 h-4 rounded bg-blue-500 mr-2"></div>
                    Google Calendar
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleExternalCalendarSave('outlook')}
                  className="cursor-pointer"
                >
                  <div className="flex items-center">
                    <div className="w-4 h-4 rounded bg-blue-600 mr-2"></div>
                    Outlook Calendar
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleExternalCalendarSave('apple')}
                  className="cursor-pointer"
                >
                  <div className="flex items-center">
                    <div className="w-4 h-4 rounded bg-gray-800 mr-2"></div>
                    Apple Calendar
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleExternalCalendarSave('download')}
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