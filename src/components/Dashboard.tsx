import React, { useState, useEffect, useRef, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EventCard } from "./EventCard";
import { WeeklyCalendar } from "./WeeklyCalendar";
import { Header } from "./Header";
import { FetchEventsButton, type ProviderStatSummary } from "./FetchEventsButton";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Grid3X3, CalendarDays, Mail, Github, Music, Drama, Palette, Coffee, Zap, GraduationCap, Search, Film, Cpu, Mic2, BookOpen, Baby, RefreshCw } from "lucide-react";
import { getCategoryColor } from "@/utils/categoryColors";
import { API_BASE_URL } from "@/utils/apiConfig";
import { cn } from "@/lib/utils";

interface Preferences {
  interests: {
    categories: { [key: string]: boolean };
    keywords: string[];
  };
  location: {
    address: string;
  };
  filters: {
    timePreferences: string[];
  };
  aiInstructions: string;
}

// Default preferences - all categories enabled
// Current categories: music, theatre, comedy, movies, art, food, tech, lectures, kids
const personalizedPreferences: Preferences = {
  interests: {
    categories: {
      'Music': true,
      'Theatre': true,
      'Comedy': true,
      'Movies': true,
      'Art': true,
      'Food': true,
      'Tech': true,
      'Lectures': true,
      'Kids': true
    },
    keywords: [
      'concerts', 'live music', 'jazz', 'classical',
      'plays', 'musicals', 'broadway', 'opera',
      'stand-up', 'improv', 'comedy show',
      'film', 'screening', 'cinema',
      'museum', 'gallery', 'exhibition',
      'food festival', 'cooking class', 'wine tasting',
      'tech meetup', 'hackathon', 'startup',
      'author talk', 'lecture', 'book signing',
      'family', 'kids activities', 'children'
    ]
  },
  location: {
    address: 'San Francisco, CA'  // Bay Area default
  },
  filters: {
    timePreferences: ['Evening (5-9pm)', 'Weekend Events']
  },
  aiInstructions: ''
};

// Use personalized preferences as default
const defaultPreferences: Preferences = personalizedPreferences;

const defaultProviderSelection: Record<string, boolean> = {
  ticketmaster: true,
  venue_scraper: true,
  whitelist: false,
};

export const Dashboard = () => {
  // Simple local cache to survive refresh/hot-reload
  const LOCAL_EVENTS_CACHE_KEY = 'cmw_events_cache_v3';
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

  const [currentPage, setCurrentPage] = useState('dashboard');
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [events, setEvents] = useState<any[]>([]);
  const [savedEvents, setSavedEvents] = useState<any[]>([]);
  const [eventsByCategory, setEventsByCategory] = useState<any>({});
  const [categoryStats, setCategoryStats] = useState<any>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [transformedEventsByCategory, setTransformedEventsByCategory] = useState<any>({});
  // Control which tab is visible to guarantee UI reflects filtered events
  const [activeTab, setActiveTab] = useState<'calendar' | 'grid'>('grid');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<Record<string, boolean>>(defaultProviderSelection);
  const [providerDetails, setProviderDetails] = useState<ProviderStatSummary[]>([]);
  const [totalProcessingTime, setTotalProcessingTime] = useState<number>(0);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [refreshStatusText, setRefreshStatusText] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');  // Local search within fetched events
  const [dateQuery, setDateQuery] = useState(''); // typed date filter (MM/DD or YYYY-MM-DD)
  const [datePreset, setDatePreset] = useState<null | 'today' | 'week' | 'weekend' | '30d'>(null);
  const refreshPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchEventsRef = useRef<(() => void) | null>(null);

  // Category mapping: Frontend display names to backend API names
  // Current supported categories: music, theatre, comedy, movies, art, food, tech, lectures, kids
  const mapCategoryToBackend = (frontendCategory: string): string => {
    const categoryMap: Record<string, string> = {
      'Music': 'music',
      'Theatre': 'theatre',
      'Comedy': 'comedy',
      'Movies': 'movies',
      'Art': 'art',
      'Food': 'food',
      'Tech': 'tech',
      'Lectures': 'lectures',
      'Kids': 'kids'
    };
    return categoryMap[frontendCategory] || frontendCategory.toLowerCase();
  };

  // Debug: Log events state changes (moved to useEffect to avoid render loops)

  // Track when events state changes
  useEffect(() => {
    console.log('🔍 Events state CHANGED:', events.length, events);
  }, [events]);

  useEffect(() => {
    console.log('🔍 SavedEvents state CHANGED:', savedEvents.length, savedEvents);
  }, [savedEvents]);
  const { toast } = useToast();

  const handleProviderToggle = (providerKey: string, enabled: boolean) => {
    setSelectedProviders(prev => {
      const current = { ...defaultProviderSelection, ...prev };
      const currentlyEnabled = Object.entries(current).filter(([, value]) => value);
      if (!enabled && currentlyEnabled.length === 1 && currentlyEnabled[0]?.[0] === providerKey) {
        toast({
          title: "Keep at least one source",
          description: "Select at least one provider before fetching events.",
          variant: "destructive"
        });
        return current;
      }
      return {
        ...current,
        [providerKey]: enabled
      };
    });
  };

  useEffect(() => {
    if (!providerDetails?.length) return;
    setSelectedProviders(prev => {
      let changed = false;
      const next = { ...defaultProviderSelection, ...prev };
      providerDetails.forEach(detail => {
        if (!(detail.provider in next)) {
          next[detail.provider] = detail.requested ?? detail.enabled ?? false;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [providerDetails]);

  // Poll for background refresh completion, then auto-refetch
  const handleBackgroundRefreshing = useCallback((refreshing: boolean) => {
    setBackgroundRefreshing(refreshing);

    // Clear any existing poll
    if (refreshPollRef.current) {
      clearInterval(refreshPollRef.current);
      refreshPollRef.current = null;
    }

    if (!refreshing) return;

    // Start polling the lightweight status endpoint every 10s
    refreshPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/events/refresh-status`);
        const status = await res.json();

        // Optional extra UI context (non-breaking; backend may omit these fields).
        if (typeof status?.message === 'string' && status.message.trim().length > 0) {
          setRefreshStatusText(status.message);
        } else if (typeof status?.ageHours === 'number') {
          setRefreshStatusText(`Cache age: ${status.ageHours}h`);
        } else {
          setRefreshStatusText(null);
        }

        if (!status.refreshing) {
          // Scrape finished — stop polling and auto-refetch
          setBackgroundRefreshing(false);
          setRefreshStatusText(null);
          if (refreshPollRef.current) {
            clearInterval(refreshPollRef.current);
            refreshPollRef.current = null;
          }
          // Trigger a silent re-fetch by clicking the FetchEventsButton programmatically
          if (fetchEventsRef.current) {
            fetchEventsRef.current();
          }
        }
      } catch {
        // Ignore polling errors — keep trying
      }
    }, 10_000);
  }, []);

  // If a refresh is already running (e.g., daily scheduled job), show the banner and start polling.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/events/refresh-status`);
        const status = await res.json();
        if (cancelled) return;

        if (status?.refreshing) {
          if (typeof status?.message === 'string' && status.message.trim().length > 0) {
            setRefreshStatusText(status.message);
          } else if (typeof status?.ageHours === 'number') {
            setRefreshStatusText(`Cache age: ${status.ageHours}h`);
          }
          handleBackgroundRefreshing(true);
        }
      } catch {
        // Ignore errors (offline / transient)
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handleBackgroundRefreshing]);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (refreshPollRef.current) {
        clearInterval(refreshPollRef.current);
      }
    };
  }, []);

  const handleSaveToCalendar = (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    if (event) {
      // Add to saved events if not already saved
      if (!savedEvents.find(savedEvent => savedEvent.id === eventId)) {
        setSavedEvents(prev => [...prev, event]);
        toast({
          title: "Event Saved",
          description: `"${event.title}" has been added to your calendar.`,
        });
      } else {
        toast({
          title: "Already Saved",
          description: `"${event.title}" is already in your calendar.`,
        });
      }
    }
  };

  const handleRemoveFromCalendar = (eventId: string) => {
    const event = savedEvents.find(e => e.id === eventId);
    if (event) {
      setSavedEvents(prev => prev.filter(e => e.id !== eventId));
      toast({
        title: "Event Removed",
        description: `"${event.title}" has been removed from your calendar.`,
      });
    }
  };

  // Restore from local cache on load
  useEffect(() => {
    try {
      const cached = localStorage.getItem(LOCAL_EVENTS_CACHE_KEY);
      if (!cached) return;
      const data = JSON.parse(cached);
      if (!data || !data.buckets) return;
      const isFresh = Date.now() - (data.timestamp || 0) < CACHE_TTL_MS;
      if (!isFresh) return;
      setTransformedEventsByCategory(data.buckets);
      setCategoryStats(data.stats || {});
      const allEvents = Object.values(data.buckets).flat();
      setEvents(allEvents);
      setActiveCategory(null);
      setActiveTab('grid');
      console.log('♻️ Restored events from cache:', allEvents.length);
    } catch (err) {
      console.error('Cache restore failed', err);
    }
  }, []);

  const handleCategoryFilter = (category: string | null) => {
    console.log('🎯 handleCategoryFilter called with category:', category);
    console.log('🗂️ Available categories in transformedEventsByCategory:', Object.keys(transformedEventsByCategory));
    console.log('📊 Events per category:', Object.entries(transformedEventsByCategory).map(([key, events]) => `${key}: ${events.length}`));
    
    setActiveCategory(category);
    setSelectedDate(null); // Clear date filter when category changes
    if (category === null) {
      // Show all TRANSFORMED events from all categories
      const allTransformedEvents = Object.values(transformedEventsByCategory).flat();
      console.log('🌐 Showing all events, total count:', allTransformedEvents.length);
      setActiveTab('grid');
    } else {
      // Handle category consolidation - combine related categories
      let categoryEvents: any[] = [];
      
      if (category === 'technology') {
        // Combine both 'technology' and 'tech' events
        const techEvents = transformedEventsByCategory['tech'] || [];
        const technologyEvents = transformedEventsByCategory['technology'] || [];
        categoryEvents = [...techEvents, ...technologyEvents];
        console.log(`📂 Combining 'tech' (${techEvents.length}) + 'technology' (${technologyEvents.length}) = ${categoryEvents.length} events`);
      } else {
        // Show TRANSFORMED events only from the selected category
        categoryEvents = transformedEventsByCategory[category] || [];
        console.log(`📂 Showing events for category '${category}', count:`, categoryEvents.length);
        console.log('🔍 First few events in this category:', categoryEvents.slice(0, 3).map(e => ({title: e.title, categories: e.categories})));
        console.log(`🔍 Category '${category}' events:`, categoryEvents.slice(0, 2).map(e => e.title));
      }
      
      setActiveTab('grid');
    }
  };

  const handleDateClick = (date: Date) => {
    console.log('🎯 Date clicked:', date.toDateString(), 'Category:', activeCategory);
    
    setSelectedDate(date);
    setDatePreset(null);
    setDateQuery('');
    setActiveTab('grid'); // Switch to grid view to show the filtered events
    
    toast({
      title: "Date Selected",
      description: `Showing events for ${date.toLocaleDateString()}${activeCategory ? ` in ${activeCategory}` : ''}`,
    });
  };

  // Removed auto scroll-to-top on category change per user request

  // Compute displayed events from source-of-truth buckets to avoid any state overrides
  const displayedEvents = React.useMemo(() => {
    // Derive strictly from buckets + activeCategory
    if (!Object.keys(transformedEventsByCategory).length) return [] as any[];

    let events: any[] = [];

    if (activeCategory === null) {
      events = Object.values(transformedEventsByCategory).flat();
    } else if (activeCategory === 'technology') {
      const techEvents = transformedEventsByCategory['tech'] || [];
      const technologyEvents = transformedEventsByCategory['technology'] || [];
      events = [...techEvents, ...technologyEvents];
    } else {
      events = transformedEventsByCategory[activeCategory] || [];
    }

    // Apply date filter if selected
    if (selectedDate) {
      const targetDateString = selectedDate.toDateString();
      events = events.filter(event => {
        try {
          if (!event.startDate) return false;
          const eventDate = new Date(event.startDate);
          if (isNaN(eventDate.getTime())) return false;
          return eventDate.toDateString() === targetDateString;
        } catch {
          return false;
        }
      });
    }

    // Apply preset date range filter (mutually exclusive with selectedDate)
    if (!selectedDate && datePreset) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let end: Date | null = null;

      if (datePreset === 'today') {
        end = new Date(start);
        end.setDate(end.getDate() + 1);
      } else if (datePreset === 'week') {
        end = new Date(start);
        end.setDate(end.getDate() + 7);
      } else if (datePreset === '30d') {
        end = new Date(start);
        end.setDate(end.getDate() + 30);
      } else if (datePreset === 'weekend') {
        // Next Saturday 00:00 through Monday 00:00
        const day = start.getDay(); // 0 Sun ... 6 Sat
        const daysUntilSat = (6 - day + 7) % 7;
        const sat = new Date(start);
        sat.setDate(sat.getDate() + daysUntilSat);
        const mon = new Date(sat);
        mon.setDate(mon.getDate() + 2);
        // If today is Sat/Sun, treat "this weekend" as current weekend
        if (day === 6) {
          end = new Date(start);
          end.setDate(end.getDate() + 2);
        } else if (day === 0) {
          const monday = new Date(start);
          monday.setDate(monday.getDate() + 1);
          end = monday;
        } else {
          // upcoming weekend
          events = events.filter(event => {
            try {
              if (!event.startDate) return false;
              const d = new Date(event.startDate);
              if (isNaN(d.getTime())) return false;
              return d >= sat && d < mon;
            } catch {
              return false;
            }
          });
          end = null;
        }
      }

      if (end) {
        events = events.filter(event => {
          try {
            if (!event.startDate) return false;
            const d = new Date(event.startDate);
            if (isNaN(d.getTime())) return false;
            return d >= start && d < end!;
          } catch {
            return false;
          }
        });
      }
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      events = events.filter(event => {
        const title = (event.title || '').toLowerCase();
        const desc = (event.description || '').toLowerCase();
        const venue = (event.venue?.name || '').toLowerCase();
        const address = (event.venue?.address || '').toLowerCase();
        return title.includes(q) || desc.includes(q) || venue.includes(q) || address.includes(q);
      });
    }

    return events;
  }, [activeCategory, transformedEventsByCategory, selectedDate, datePreset, searchQuery]);

  const applyTypedDate = useCallback(() => {
    const raw = dateQuery.trim();
    if (!raw) {
      setSelectedDate(null);
      return;
    }

    let parsed: Date | null = null;
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-').map(Number);
      parsed = new Date(y, (m || 1) - 1, d || 1);
    } else {
      // MM/DD or MM/DD/YYYY
      const m = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
      if (m) {
        const mm = Number(m[1]);
        const dd = Number(m[2]);
        let yyyy = m[3] ? Number(m[3]) : new Date().getFullYear();
        if (yyyy < 100) yyyy += 2000;
        parsed = new Date(yyyy, (mm || 1) - 1, dd || 1);
      }
    }

    if (!parsed || isNaN(parsed.getTime())) {
      toast({
        title: "Invalid date",
        description: "Use MM/DD, MM/DD/YYYY, or YYYY-MM-DD.",
        variant: "destructive"
      });
      return;
    }

    setSelectedDate(parsed);
    setDatePreset(null);
    setActiveTab('grid');
  }, [dateQuery, toast]);

  useEffect(() => {
    console.log('🧭 Active category:', activeCategory, ' | displayedEvents:', displayedEvents.length, ' | buckets:', Object.keys(transformedEventsByCategory));
  }, [activeCategory, displayedEvents, transformedEventsByCategory]);

  // Determine if any events are loaded at all (independent of active filters)
  const hasAnyEvents = React.useMemo(() => {
    try {
      return Object.values(transformedEventsByCategory).some((arr: any) => Array.isArray(arr) && arr.length > 0);
    } catch {
      return false;
    }
  }, [transformedEventsByCategory]);

  // Category icons for the new category set
  const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    'Music': Music,
    'Theatre': Drama,
    'Comedy': Mic2,
    'Movies': Film,
    'Art': Palette,
    'Food': Coffee,
    'Tech': Zap,
    'Lectures': BookOpen,
    'Kids': Baby
  };


  // Calculate total event count for the "All" category
  const totalEventCount = Object.values(categoryStats).reduce((acc: number, cur: unknown) => {
    const stat = cur as { count?: number };
    return acc + (stat?.count || 0);
  }, 0);

  return (
    <div className="min-h-screen">
      <Header 
        onOpenPreferences={() => {}}
        onNavigate={setCurrentPage}
        currentPage={currentPage}
        totalEvents={displayedEvents.length}
        aiCurationStatus="complete"
      />

      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-5xl mx-auto bg-white/90 backdrop-blur-lg p-6 sm:p-10 rounded-2xl shadow-2xl">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2 text-center">SF Bay Event Finder</h2>
          <p className="text-gray-500 mb-10 text-center">Select your interests and we'll handle the rest.</p>

          {/* Background Refresh Indicator */}
          {backgroundRefreshing && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm text-blue-700 shadow-sm">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="font-medium">Refreshing venue data in the background&hellip;</span>
              <span className="text-blue-500">Events will update automatically when ready.</span>
              {refreshStatusText && (
                <span className="text-blue-500">({refreshStatusText})</span>
              )}
            </div>
          )}

          {/* Compact Control Surface (Option A-inspired) */}
          <div className="mb-10 space-y-5">
            <div className="bg-gray-50 p-5 sm:p-6 rounded-2xl shadow-inner border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="relative">
                  <Input
                    id="event-search"
                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                    placeholder="Search: title, venue, 'ai conference', 'festival'..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label="Clear search"
                    >
                      &times;
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Input
                    id="event-date"
                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                    placeholder="Date (MM/DD or YYYY-MM-DD)"
                    value={dateQuery}
                    onChange={(e) => setDateQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') applyTypedDate();
                    }}
                    onBlur={() => {
                      // Only apply if user typed something; avoid surprising clears
                      if (dateQuery.trim()) applyTypedDate();
                    }}
                  />
                  {(selectedDate || dateQuery.trim()) && (
                    <button
                      onClick={() => {
                        setDateQuery('');
                        setSelectedDate(null);
                        setDatePreset(null);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label="Clear date"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(datePreset === 'today' ? 'bg-indigo-50 border-indigo-200' : '')}
                    onClick={() => {
                      setDatePreset('today');
                      setSelectedDate(null);
                      setDateQuery('');
                    }}
                  >
                    Today
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(datePreset === 'week' ? 'bg-indigo-50 border-indigo-200' : '')}
                    onClick={() => {
                      setDatePreset('week');
                      setSelectedDate(null);
                      setDateQuery('');
                    }}
                  >
                    This Week
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(datePreset === 'weekend' ? 'bg-indigo-50 border-indigo-200' : '')}
                    onClick={() => {
                      setDatePreset('weekend');
                      setSelectedDate(null);
                      setDateQuery('');
                    }}
                  >
                    This Weekend
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(datePreset === '30d' ? 'bg-indigo-50 border-indigo-200' : '')}
                    onClick={() => {
                      setDatePreset('30d');
                      setSelectedDate(null);
                      setDateQuery('');
                    }}
                  >
                    Next 30 Days
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <FetchEventsButton
                    location={preferences.location.address}
                    preferences={{
                      categories: Object.keys(preferences.interests.categories).filter(cat => preferences.interests.categories[cat]),
                      timePreferences: preferences.filters.timePreferences,
                      customKeywords: preferences.interests.keywords,
                      aiInstructions: preferences.aiInstructions
                    }}
                    selectedProviders={selectedProviders}
                    onBackgroundRefreshing={handleBackgroundRefreshing}
                    fetchRef={fetchEventsRef}
                    onAllEventsFetched={(fetchedEventsByCategory, fetchedCategoryStats, fetchedProviderDetails) => {
                  console.log('✅ Received raw events by category:', fetchedEventsByCategory);
                  console.log('🔑 Raw category keys:', Object.keys(fetchedEventsByCategory));
                  setEventsByCategory(fetchedEventsByCategory);
                  setCategoryStats(fetchedCategoryStats);
                  if (Array.isArray(fetchedProviderDetails)) {
                    setProviderDetails(fetchedProviderDetails);
                  }

                  // Transform events for each category and store them
                  const newTransformedEventsByCategory = Object.entries(fetchedEventsByCategory).reduce((acc, [category, events]) => {
                    console.log(`🔄 Transforming category '${category}' with ${events.length} events`);
                    const canonicalCategory = category === 'tech' ? 'technology' : category;
                    acc[category] = (events as any[]).map((event: any, index: number) => {
                      const originalCategoryValues: string[] = Array.isArray(event?.categories)
                        ? event.categories
                        : (event?.category ? [event.category] : []);
                      const normalizedCategories = Array.from(new Set([
                        canonicalCategory,
                        ...originalCategoryValues
                          .filter(Boolean)
                          .map((value: string) => value.toLowerCase())
                      ])).filter(Boolean);
                      // Debug logging for date issues
                      console.log(`🔍 Event ${index} in ${category}:`, {
                        id: event.id,
                        title: event.title,
                        startDate: event.startDate,
                        endDate: event.endDate,
                        rawEvent: event
                      });
                      
                      // Ensure dates are properly formatted
                      const formatEventDate = (dateStr: string | Date) => {
                        // Do NOT default to now; missing/invalid dates should be omitted from calendar filtering
                        if (!dateStr) return '';
                        if (dateStr instanceof Date) {
                          const iso = dateStr.toISOString();
                          return iso;
                        }
                        // Try to parse the date string robustly; if invalid, return empty
                        const parsed = new Date(dateStr);
                        if (isNaN(parsed.getTime())) return '';
                        return parsed.toISOString();
                      };
                      
                      return {
                        id: event.id || `event-${category}-${index}`,
                        title: event.title || 'Untitled Event',
                        description: event.description || 'No description available.',
                        startDate: formatEventDate(event.startDate),
                        endDate: formatEventDate(event.endDate || event.startDate),
                        venue: {
                          name: event.venue || 'Venue TBD',
                          address: event.address || event.location || 'Location TBD',
                          website: event.venueInfo?.website,
                          mapUrl: event.venueInfo?.googleMapsUrl,
                        },
                        category: canonicalCategory,
                        categories: normalizedCategories,
                        personalRelevanceScore: event.relevance || 8,
                        price: event.priceRange ? {
                          type: event.priceRange.min === 0 && event.priceRange.max === 0 ? 'free' : 'paid',
                          amount: event.priceRange.min === 0 && event.priceRange.max === 0 ? undefined : `$${event.priceRange.min || '??'} - $${event.priceRange.max || '??'}`,
                        } : { type: 'free' },
                        ticketUrl: event.ticketUrl || event.externalUrl,
                        eventUrl: event.eventUrl || event.externalUrl,
                        aiReasoning: event.aiReasoning || 'Fetched from curated sources.',
                        imageUrl: event.imageUrl || null,
                        source: event.source,
                        sources: event.sources,
                      };
                    });
                    return acc;
                  }, {} as any);

                  console.log('🎉 Final transformed categories:', Object.keys(newTransformedEventsByCategory));
                  console.log('📊 Final events per category:', Object.entries(newTransformedEventsByCategory).map(([key, events]) => `${key}: ${events.length}`));
                  setTransformedEventsByCategory(newTransformedEventsByCategory);

                  // Persist to cache for refresh-survival
                  try {
                    localStorage.setItem(LOCAL_EVENTS_CACHE_KEY, JSON.stringify({
                      buckets: newTransformedEventsByCategory,
                      stats: fetchedCategoryStats,
                      timestamp: Date.now()
                    }));
                  } catch (err) {
                    console.error('Cache save failed', err);
                  }

                  // Combine all TRANSFORMED events for initial display
                  const allTransformedEvents = Object.values(newTransformedEventsByCategory).flat();
                  console.log('🌍 Total transformed events for display:', allTransformedEvents.length);
                  setEvents(allTransformedEvents);
                  setActiveCategory(null); // Show 'All' events initially
                }}
                onProviderDetails={(details) => {
                  setProviderDetails(details);
                }}
                onProcessingTime={(timeMs) => {
                  setTotalProcessingTime(timeMs);
                }}
                    className="btn-primary w-full sm:w-auto flex items-center justify-center space-x-2 text-white font-bold py-3 px-6 rounded-full transition hover:transform hover:-translate-y-0.5 hover:shadow-lg"
                  />

                  <Button
                    onClick={() => {
                      // Clear all event-related state
                      setEvents([]);
                      setSavedEvents([]);
                      setEventsByCategory({});
                      setTransformedEventsByCategory({});
                      setCategoryStats({});
                      setActiveCategory(null);
                      setSelectedDate(null);
                      setDatePreset(null);
                      setDateQuery('');
                      setSearchQuery('');
                      setProviderDetails([]);
                      setTotalProcessingTime(0);
                      try { localStorage.removeItem(LOCAL_EVENTS_CACHE_KEY); } catch {}
                      toast({
                        title: "Events Cleared",
                        description: "All events have been cleared. Click 'Fetch Events' to get fresh events!",
                      });
                    }}
                    className="w-full sm:w-auto bg-gray-200 text-gray-700 font-bold py-3 px-6 rounded-full hover:bg-gray-300 transition"
                  >
                    Clear
                  </Button>
                </div>
              </div>

              {/* Categories (evenly distributed across width) */}
              <div className="mt-4 w-full grid grid-cols-5 gap-2">
                <Button
                  size="sm"
                  className={cn(
                    "w-full rounded-full border whitespace-nowrap",
                    activeCategory === null
                      ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                      : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50"
                  )}
                  onClick={() => handleCategoryFilter(null)}
                >
                  All ({totalEventCount})
                </Button>
                {Object.keys(categoryIcons).map((category) => {
                  const categoryKey = mapCategoryToBackend(category);
                  const stats = categoryStats[categoryKey] || { count: 0 };
                  const selected = activeCategory === categoryKey;
                  const colors = getCategoryColor(categoryKey);
                  return (
                    <Button
                      key={category}
                      size="sm"
                      className={cn(
                        "w-full rounded-full border transition whitespace-nowrap",
                        colors.background,
                        colors.border,
                        colors.text,
                        colors.hover,
                        selected ? "border-2 shadow-sm" : ""
                      )}
                      onClick={() => handleCategoryFilter(categoryKey)}
                      title={`${category}: ${stats.count} events`}
                    >
                      <span className="font-semibold">{category}</span>
                      <span className={cn("ml-1", colors.accent)}>({stats.count})</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>



        </div>

        {/* Main Content - Show calendar/grid once any events are loaded */}
        {hasAnyEvents && (
          <div className="mt-12">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'calendar' | 'grid')} className="space-y-6">
              <TabsList className="grid w-full grid-cols-2 bg-transparent shadow-none border-0 gap-2">
                <TabsTrigger
                  value="calendar"
                  className="flex items-center gap-2 bg-blue-50 text-blue-700 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                >
                  <Calendar className="w-4 h-4" />
                  Calendar View
                </TabsTrigger>
                <TabsTrigger
                  value="grid"
                  className="flex items-center gap-2 bg-purple-50 text-purple-700 data-[state=active]:bg-purple-600 data-[state=active]:text-white"
                >
                  <Grid3X3 className="w-4 h-4" />
                  Event View
                </TabsTrigger>
              </TabsList>

              <TabsContent value="calendar" className="space-y-6">
                <WeeklyCalendar
                  // Show the full set of currently displayed events in calendar view
                  events={displayedEvents}
                  // Still pass savedEvents so we can highlight saved items
                  savedEvents={savedEvents}
                  activeCategory={activeCategory}
                  onEventToggleSaved={(eventId) => {
                    const event = events.find(e => e.id === eventId);
                    if (event) {
                      const isSaved = savedEvents.find(savedEvent => savedEvent.id === eventId);
                      if (isSaved) {
                        // Show confirmation for deletion
                        if (confirm(`Remove "${event.title}" from your saved events?`)) {
                          handleRemoveFromCalendar(eventId);
                        }
                      } else {
                        // Save the event
                        handleSaveToCalendar(eventId);
                      }
                    }
                  }}
                  onDateClick={handleDateClick}
                />
              </TabsContent>

              <TabsContent key={`${activeCategory ?? 'all'}-${selectedDate?.toISOString() ?? 'no-date'}`} value="grid" className="space-y-6">
                {/* Filter Status Display */}
                {(activeCategory || selectedDate || searchQuery.trim()) && (
                  <div className="bg-muted/50 rounded-lg p-4 mb-6 border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-medium">Active Filters:</h3>
                        {searchQuery.trim() && (
                          <Badge variant="secondary">
                            Search: "{searchQuery.trim()}"
                          </Badge>
                        )}
                        {activeCategory && (
                          <Badge variant="secondary">
                            Category: {activeCategory}
                          </Badge>
                        )}
                        {selectedDate && (
                          <Badge variant="secondary">
                            Date: {selectedDate.toLocaleDateString()}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">({displayedEvents.length} results)</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveCategory(null);
                          setSelectedDate(null);
                          setSearchQuery('');
                        }}
                      >
                        Clear Filters
                      </Button>
                    </div>
                  </div>
                )}
                
                {displayedEvents.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12 border rounded-lg">
                    No events match your current filters.
                    <div className="mt-2 text-xs">Try a different date or clear filters.</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {displayedEvents.map(event => (
                      <EventCard
                        key={`${event.id}-${activeCategory ?? 'all'}-${selectedDate?.toISOString() ?? 'no-date'}`}
                        event={event}
                        onSaveToCalendar={handleSaveToCalendar}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Empty state when no events loaded yet */}
        {!hasAnyEvents && (
          <div className="mt-12 text-center p-12">
            <Calendar className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2 text-gray-700">No Events Yet</h3>
            <p className="text-gray-500 mb-6">
              Click "Fetch Events" to discover amazing Bay Area events from Ticketmaster and local venues
            </p>
          </div>
        )}
      </main>
    </div>
  );
};
