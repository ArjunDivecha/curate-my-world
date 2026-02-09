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
import { getApiBaseUrl } from "@/utils/apiConfig";

// Source badge styling helper
const getSourceBadgeStyle = (source: string): string => {
  const styles: Record<string, string> = {
    whitelist: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    serper: 'bg-blue-100 text-blue-700 border-blue-300',
    exa: 'bg-purple-100 text-purple-700 border-purple-300',
    exa_fast: 'bg-purple-100 text-purple-700 border-purple-300',
    ticketmaster: 'bg-red-100 text-red-700 border-red-300',
    pplx: 'bg-orange-100 text-orange-700 border-orange-300',
    pplx_search: 'bg-orange-100 text-orange-700 border-orange-300',
    perplexity: 'bg-amber-100 text-amber-700 border-amber-300',
    perplexity_api: 'bg-amber-100 text-amber-700 border-amber-300',
  };
  return styles[source?.toLowerCase()] || 'bg-gray-100 text-gray-700 border-gray-300';
};

// Source label helper
const getSourceLabel = (source: string): string => {
  const labels: Record<string, string> = {
    whitelist: '⭐ Whitelist',
    serper: 'Serper',
    exa: 'EXA',
    exa_fast: 'EXA',
    ticketmaster: 'Ticketmaster',
    pplx: 'PPLX',
    pplx_search: 'PPLX',
    perplexity: 'Perplexity',
    perplexity_api: 'Perplexity',
  };
  return labels[source?.toLowerCase()] || source;
};

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
  category?: string;
  categories: string[];
  personalRelevanceScore: number;
  price: {
    type: 'free' | 'paid' | 'donation';
    amount?: string;
  };
  ticketUrl?: string;
  eventUrl?: string;
  imageUrl?: string | null;
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
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (isHovering) {
      // Show preview after 300ms of hovering
      timeoutId = setTimeout(() => setShowPreview(true), 300);
    } else {
      // Hide preview immediately when not hovering
      setShowPreview(false);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isHovering]);

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Date TBD';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      console.warn('Invalid date in EventCard:', dateString);
      return 'Date TBD';
    }
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Whitelist/Blacklist helpers
  const domainAndPath = (url?: string) => {
    try {
      if (!url) return { domain: '', path: '' };
      const u = new URL(url);
      return { domain: u.hostname, path: u.pathname || '/' };
    } catch {
      return { domain: '', path: '' };
    }
  };

  const handleWhitelistDomain = async () => {
    const targetUrl = event.eventUrl || event.ticketUrl;
    const { domain } = domainAndPath(targetUrl);
    if (!domain) {
      toast({ title: 'No URL to whitelist', description: 'This event has no valid URL.' });
      return;
    }
    // Ask for category (optional)
    const category = window.prompt(`Category for ${domain}? (music, theatre, comedy, etc. or leave blank for 'all')`, event.categories[0] || 'all');
    try {
      const res = await fetch(`${getApiBaseUrl()}/lists/whitelist`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          domain, 
          category: category || 'all',
          name: event.venue?.name || domain 
        })
      });
      const data = await res.json();
      if (res.ok) toast({ title: '⭐ Whitelisted!', description: `${domain} added to whitelist. Events will be fetched from this site.` });
      else toast({ title: 'Whitelist failed', description: data.error || 'Unknown error', variant: 'destructive' });
    } catch (e: any) {
      toast({ title: 'Whitelist failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleBlacklistEvent = async () => {
    const targetUrl = event.eventUrl || event.ticketUrl;
    if (!window.confirm(`Blacklist this specific event: "${event.title}"?`)) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/lists/blacklist-event`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ title: event.title, url: targetUrl })
      });
      const data = await res.json();
      if (res.ok) toast({ title: '🚫 Event Blacklisted', description: `"${event.title}" will no longer appear.` });
      else toast({ title: 'Blacklist failed', description: data.error || 'Unknown error', variant: 'destructive' });
    } catch (e: any) {
      toast({ title: 'Blacklist failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleBlacklistDomain = async () => {
    const targetUrl = event.eventUrl || event.ticketUrl;
    const { domain } = domainAndPath(targetUrl);
    if (!domain) {
      toast({ title: 'No URL to blacklist', description: 'This event has no valid URL.' });
      return;
    }
    if (!window.confirm(`Blacklist ENTIRE domain ${domain}? No events from this site will ever appear.`)) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/lists/blacklist-site`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ domain, reason: 'Blocked via GUI' })
      });
      const data = await res.json();
      if (res.ok) toast({ title: '🚫 Domain Blacklisted', description: `${domain} is now blocked. No events from this site will appear.` });
      else toast({ title: 'Blacklist failed', description: data.error || 'Unknown error', variant: 'destructive' });
    } catch (e: any) {
      toast({ title: 'Blacklist failed', description: e.message, variant: 'destructive' });
    }
  };

  // Determine API base for preview endpoint
  // Use relative /api path - works in both dev (Vite proxy) and prod (same server)
  const API_BASE = getApiBaseUrl();

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
    <Card className={`group shadow-card sm:hover:shadow-elegant transition-all duration-300 sm:hover:-translate-y-1 animate-fade-in sm:h-full ${categoryColor.background} ${categoryColor.border} ${categoryColor.hover}`}>
      <CardContent className="p-4 sm:p-6 flex flex-col sm:h-full">
        {/* Header Section - Fixed Height */}
        <div className="mb-3 sm:mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-foreground mb-1.5 sm:mb-2 group-hover:text-primary transition-colors duration-300 line-clamp-2 min-h-0 sm:min-h-[3.5rem]">
            {cleanHtmlText(event.title)}
          </h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>{formatDate(event.startDate)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>{formatTime(event.startDate)}</span>
            </div>
          </div>

          {/* Whitelist / Blacklist controls - Only show in development */}
          {import.meta.env.MODE === 'development' && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Button size="sm" variant="outline" onClick={handleBlacklistEvent} className="hover:bg-red-50 hover:text-red-700 hover:border-red-300">🚫 Block Event</Button>
              <Button size="sm" variant="outline" onClick={handleBlacklistDomain} className="hover:bg-red-50 hover:text-red-700 hover:border-red-300">🚫 Block Site</Button>
            </div>
          )}
        </div>

        {/* Description Section - Fixed Height */}
        <div className="mb-3 sm:mb-4 min-h-0 sm:min-h-[2.5rem]">
          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
            {cleanHtmlText(event.description)}
          </p>
        </div>

        {/* Venue Section - Fixed Height */}
        <div className="mb-3 sm:mb-4 min-h-0 sm:min-h-[3rem]">
          <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground mb-1">
            <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="font-medium line-clamp-1">{event.venue.name}</span>
          </div>
          {event.venue.address && (
            <p className="text-[11px] sm:text-xs text-muted-foreground pl-5 line-clamp-1">
              {event.venue.address}
            </p>
          )}
        </div>

        {/* Categories & Source Section - Fixed Height */}
        <div className="mb-3 sm:mb-4 min-h-0 sm:min-h-[2rem]">
          <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
            {/* Source Badge */}
            {event.source && (
              <Badge 
                className={`text-[10px] sm:text-xs font-medium px-2 py-0.5 ${getSourceBadgeStyle(event.source)}`}
              >
                {getSourceLabel(event.source)}
              </Badge>
            )}
            {/* Category Badges */}
            {event.categories.slice(0, 3).map((category, idx) => {
              const badgeColor = getCategoryColor(category);
              return (
                <Badge 
                  key={category} 
                  className={`text-[10px] sm:text-xs px-2 py-0.5 ${idx >= 2 ? 'hidden sm:inline-flex' : ''} ${badgeColor.background} ${badgeColor.border} ${badgeColor.accent} border transition-colors`}
                >
                  {category}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Spacer to push buttons to bottom */}
        <div className="hidden sm:block flex-1" />

        {/* Action Section - Fixed at Bottom */}
        <div className="space-y-2 sm:space-y-3">
          {/* Primary actions row */}
          <div className="flex items-center gap-2">
            {(event.eventUrl || event.ticketUrl) && (
              <div 
                className="relative"
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={(e) => {
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
                    aria-label="Open event page"
                    variant="outline" 
                    size="sm"
                    className={`h-9 sm:h-10 px-3 transition-all duration-300 transform ${
                      isHovering 
                        ? 'bg-blue-500 text-white scale-105 shadow-xl border-2 border-blue-300' 
                        : 'hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span className="sr-only sm:not-sr-only sm:ml-2">Event Page</span>
                    {isHovering && (
                      <Eye className="hidden sm:inline-block w-3.5 h-3.5 ml-1 animate-pulse" />
                    )}
                  </Button>
                </a>
              </div>
            )}
          
          {/* Hover Preview Popup */}
          {showPreview && (event.eventUrl || event.ticketUrl) && (
            <div 
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-60 preview-popup"
              style={{ pointerEvents: 'auto' }}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
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
                    src={event.source === 'ticketmaster'
                      ? `${API_BASE}/preview/event?${new URLSearchParams({
                          title: event.title || '',
                          description: event.description || '',
                          imageUrl: event.imageUrl || '',
                          venue: event.venue?.name || '',
                          address: event.venue?.address || '',
                          date: event.startDate || '',
                          price: event.price?.amount || (event.price?.type === 'free' ? 'Free' : ''),
                          category: event.categories?.[0] || '',
                          ticketUrl: event.eventUrl || event.ticketUrl || '',
                          source: event.source || '',
                        }).toString()}`
                      : `${API_BASE}/preview?url=${encodeURIComponent(event.eventUrl || event.ticketUrl || '')}`
                    }
                    className="w-full h-full border-0"
                    title={`Preview of ${event.title}`}
                  />
                </div>
              </div>
            </div>
          )}
            
            {/* Save + Export */}
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
              className="flex-1 h-9 sm:h-10 bg-gradient-primary hover:opacity-90 transition-all duration-300 shadow-elegant text-sm"
            >
              <Bookmark className="w-4 h-4 mr-2" />
              <span className="sm:hidden">Save</span>
              <span className="hidden sm:inline">Save to Calendar</span>
            </Button>
            
            {/* Export to External Calendar Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="h-9 sm:h-10 px-3"
                  aria-label="Export to external calendar"
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
