import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EventCard } from "./EventCard";
import { DayTimetable } from "./DayTimetable";
import { WeekDayGrid } from "./WeekDayGrid";
import { WeekendSplitView } from "./WeekendSplitView";
import { ThirtyDayAgendaView } from "./ThirtyDayAgendaView";
import { Header } from "./Header";
import { FetchEventsButton, type ProviderStatSummary, type FetchEventsTriggerOptions } from "./FetchEventsButton";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Grid3X3, CalendarDays, Mail, Github, Music, Drama, Palette, Coffee, Zap, GraduationCap, Search, Film, Cpu, Mic2, BookOpen, Baby, Globe, RefreshCw } from "lucide-react";
import { getCategoryColor } from "@/utils/categoryColors";
import { API_BASE_URL } from "@/utils/apiConfig";
import { cn } from "@/lib/utils";
import { getWeekendRange, parseEventDateLocalAware, sameLocalDay, startOfLocalDay } from "@/lib/dateViewRanges";

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
// Current categories: music, theatre, comedy, movies, art, food, tech, lectures, kids, desi
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
      'Kids': true,
      'Desi': true
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
      'family', 'kids activities', 'children',
      'desi', 'indian', 'bollywood', 'bhangra', 'garba', 'dandiya', 'holi', 'diwali'
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
  const LOCAL_EVENTS_CACHE_KEY = 'cmw_events_cache_v4';
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
  const [activeTab, setActiveTab] = useState<'events' | 'date'>('events');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<Record<string, boolean>>(defaultProviderSelection);
  const [providerDetails, setProviderDetails] = useState<ProviderStatSummary[]>([]);
  const [totalProcessingTime, setTotalProcessingTime] = useState<number>(0);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [refreshStatusText, setRefreshStatusText] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');  // Local search within fetched events
  const [dateQuery, setDateQuery] = useState(''); // typed date filter (MM/DD or YYYY-MM-DD)
  const [datePreset, setDatePreset] = useState<null | 'today' | 'week' | 'weekend' | '30d'>(null);
  const [fetcherReady, setFetcherReady] = useState(false);
  const refreshPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchEventsRef = useRef<((options?: FetchEventsTriggerOptions) => void) | null>(null);
  const hasTriggeredInitialAutoFetchRef = useRef(false);

  // Category mapping: Frontend display names to backend API names
  // Current supported categories: music, theatre, comedy, movies, art, food, tech, lectures, kids, desi
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
      'Kids': 'kids',
      'Desi': 'desi'
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
          // Trigger a silent re-fetch programmatically after background refresh completes.
          if (fetchEventsRef.current) {
            fetchEventsRef.current({ silent: true });
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
      
    }
  };

  const handleDateClick = (date: Date) => {
    console.log('🎯 Date clicked:', date.toDateString(), 'Category:', activeCategory);
    
    setSelectedDate(date);
    setDatePreset(null);
    setDateQuery('');
    
    toast({
      title: "Date Selected",
      description: `Showing events for ${date.toLocaleDateString()}${activeCategory ? ` in ${activeCategory}` : ''}`,
    });
  };

  // Removed auto scroll-to-top on category change per user request

  // Base dataset for Day/Week/Event views (category + datePreset + search).
  // Note: selectedDate is intentionally NOT applied here, so Day/Week views remain usable.
  const calendarEvents = React.useMemo(() => {
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

    // Apply preset date range filter
    if (datePreset) {
      const start = startOfLocalDay(new Date());

      if (datePreset === 'today') {
        events = events.filter(event => {
          const d = parseEventDateLocalAware(event.startDate);
          return !!d && sameLocalDay(d, start);
        });
      } else if (datePreset === 'week') {
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        events = events.filter(event => {
          const d = parseEventDateLocalAware(event.startDate);
          if (!d) return false;
          const eventDay = startOfLocalDay(d);
          return eventDay >= start && eventDay < end;
        });
      } else if (datePreset === '30d') {
        const end = new Date(start);
        end.setDate(end.getDate() + 30);
        events = events.filter(event => {
          const d = parseEventDateLocalAware(event.startDate);
          if (!d) return false;
          const eventDay = startOfLocalDay(d);
          return eventDay >= start && eventDay < end;
        });
      } else if (datePreset === 'weekend') {
        // Weekend = Friday 5:00 PM through Monday 12:00 AM.
        const { windowStart, windowEnd } = getWeekendRange(start);
        events = events.filter(event => {
          const d = parseEventDateLocalAware(event.startDate);
          return !!d && d >= windowStart && d < windowEnd;
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
  }, [activeCategory, transformedEventsByCategory, datePreset, searchQuery]);

  // Event View dataset (calendarEvents + optional selectedDate).
  const eventsForEventView = React.useMemo(() => {
    let events = calendarEvents;
    if (selectedDate) {
      const targetDay = startOfLocalDay(selectedDate);
      events = events.filter((event: any) => {
        const eventDate = parseEventDateLocalAware(event.startDate);
        return !!eventDate && sameLocalDay(eventDate, targetDay);
      });
    }
    return events;
  }, [calendarEvents, selectedDate]);

  const weekendRange = React.useMemo(() => getWeekendRange(new Date()), [datePreset]);
  const nextSevenDays = React.useMemo(() => {
    if (datePreset !== 'week') return undefined;
    const start = startOfLocalDay(new Date());
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [datePreset]);
  const showDayTimetableInDateView = datePreset === 'today' || !!selectedDate;
  const showWeekendSplitInDateView = datePreset === 'weekend';
  const showThirtyDayAgendaInDateView = datePreset === '30d';
  const dateViewPresetLabel =
    selectedDate
      ? selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
      : datePreset === 'today'
        ? 'Today'
      : datePreset === 'week'
        ? 'Next 7 Days'
        : datePreset === 'weekend'
          ? 'This Weekend (Fri Evening + Sat + Sun)'
          : datePreset === '30d'
            ? 'Next 30 Days'
            : 'Calendar';
  const dateViewTitle = `Date View - ${dateViewPresetLabel}`;

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
  }, [dateQuery, toast]);

  const selectedProvidersSignature = React.useMemo(
    () =>
      Object.entries(selectedProviders)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, enabled]) => `${key}:${enabled ? 1 : 0}`)
        .join('|'),
    [selectedProviders]
  );
  const selectedDateSignature = selectedDate ? startOfLocalDay(selectedDate).toISOString() : '';

  // Auto-fetch once on load and re-fetch (debounced) when control context changes.
  useEffect(() => {
    if (!fetcherReady || !fetchEventsRef.current) return;
    const isInitialRun = !hasTriggeredInitialAutoFetchRef.current;
    const delayMs = isInitialRun ? 0 : 450;
    const timer = setTimeout(() => {
      fetchEventsRef.current?.({ silent: true });
      hasTriggeredInitialAutoFetchRef.current = true;
    }, delayMs);
    return () => clearTimeout(timer);
  }, [
    fetcherReady,
    activeTab,
    activeCategory,
    datePreset,
    selectedDateSignature,
    dateQuery,
    searchQuery,
    preferences.location.address,
    preferences.aiInstructions,
    selectedProvidersSignature,
  ]);

  useEffect(() => {
    console.log('🧭 Active category:', activeCategory, ' | eventsForEventView:', eventsForEventView.length, ' | buckets:', Object.keys(transformedEventsByCategory));
  }, [activeCategory, eventsForEventView, transformedEventsByCategory]);

  // Determine if any events are loaded at all (independent of active filters)
  const hasAnyEvents = React.useMemo(() => {
    try {
      return Object.values(transformedEventsByCategory).some((arr: any) => Array.isArray(arr) && arr.length > 0);
    } catch {
      return false;
    }
  }, [transformedEventsByCategory]);

  // Category icons for the category set (shown in the category boxes)
  const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    'Music': Music,
    'Theatre': Drama,
    'Comedy': Mic2,
    'Movies': Film,
    'Art': Palette,
    'Food': Coffee,
    'Tech': Cpu,
    'Lectures': BookOpen,
    'Kids': Baby,
    'Desi': Globe
  };


  const filteredCategoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    const todayStart = startOfLocalDay(new Date());
    const selectedDay = selectedDate ? startOfLocalDay(selectedDate) : null;
    const weekendWindow = datePreset === 'weekend' ? getWeekendRange(todayStart) : null;
    const normalizedSearch = searchQuery.toLowerCase().trim();

    const matchesDateFilter = (event: any) => {
      if (selectedDay) {
        const d = parseEventDateLocalAware(event.startDate);
        return !!d && sameLocalDay(d, selectedDay);
      }

      if (!datePreset) return true;

      const d = parseEventDateLocalAware(event.startDate);
      if (!d) return false;

      if (datePreset === 'today') {
        return sameLocalDay(d, todayStart);
      }

      if (datePreset === 'week') {
        const end = new Date(todayStart);
        end.setDate(end.getDate() + 7);
        const eventDay = startOfLocalDay(d);
        return eventDay >= todayStart && eventDay < end;
      }

      if (datePreset === '30d') {
        const end = new Date(todayStart);
        end.setDate(end.getDate() + 30);
        const eventDay = startOfLocalDay(d);
        return eventDay >= todayStart && eventDay < end;
      }

      if (datePreset === 'weekend' && weekendWindow) {
        return d >= weekendWindow.windowStart && d < weekendWindow.windowEnd;
      }

      return true;
    };

    const matchesSearchFilter = (event: any) => {
      if (!normalizedSearch) return true;
      const title = (event.title || '').toLowerCase();
      const desc = (event.description || '').toLowerCase();
      const venue = (event.venue?.name || '').toLowerCase();
      const address = (event.venue?.address || '').toLowerCase();
      return title.includes(normalizedSearch) || desc.includes(normalizedSearch) || venue.includes(normalizedSearch) || address.includes(normalizedSearch);
    };

    Object.entries(transformedEventsByCategory).forEach(([rawCategory, categoryEvents]) => {
      const canonicalCategory = rawCategory === 'technology' ? 'tech' : rawCategory;
      const matchedCount = (categoryEvents as any[]).filter((event) => matchesDateFilter(event) && matchesSearchFilter(event)).length;
      counts[canonicalCategory] = (counts[canonicalCategory] || 0) + matchedCount;
    });

    return counts;
  }, [transformedEventsByCategory, datePreset, selectedDate, searchQuery]);

  const totalEventCount = Object.values(filteredCategoryCounts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="min-h-screen">
      <Header 
        onOpenPreferences={() => {}}
        onNavigate={setCurrentPage}
        currentPage={currentPage}
        totalEvents={eventsForEventView.length}
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
                    Next 7 Days
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
                    onFetcherReady={() => setFetcherReady(true)}
                    autoMode
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
                        if (typeof dateStr === 'string') {
                          const dateOnlyMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?!T)/);
                          if (dateOnlyMatch) {
                            const year = Number(dateOnlyMatch[1]);
                            const month = Number(dateOnlyMatch[2]);
                            const day = Number(dateOnlyMatch[3]);
                            const localDate = new Date(year, month - 1, day, 12, 0, 0, 0);
                            if (!isNaN(localDate.getTime())) {
                              return localDate.toISOString();
                            }
                          }
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
                }}
                onProviderDetails={(details) => {
                  setProviderDetails(details);
                }}
                onProcessingTime={(timeMs) => {
                  setTotalProcessingTime(timeMs);
                }}
                  />

                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    Auto-refresh is on
                  </span>

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
                        description: "All events were cleared. Fresh events will auto-load.",
                      });
                    }}
                    className="w-full sm:w-auto bg-gray-200 text-gray-700 font-bold py-3 px-6 rounded-full hover:bg-gray-300 transition"
                  >
                    Clear
                  </Button>
                </div>
              </div>

              {/* Categories */}
              <div className="mt-4 w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                <Button
                  size="sm"
                  className={cn(
                    "w-full rounded-2xl border whitespace-nowrap justify-start gap-3 h-14",
                    activeCategory === null
                      ? "bg-gradient-to-r from-rose-100 via-amber-100 to-sky-100 text-slate-700 border-slate-200 shadow-[0_3px_0_0_rgba(148,163,184,0.35),0_10px_20px_rgba(148,163,184,0.18)]"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  )}
                  onClick={() => handleCategoryFilter(null)}
                >
                  <span className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-xl border",
                    activeCategory === null ? "bg-white/70 border-white/80" : "bg-white border-slate-200"
                  )}>
                    <Search className="h-5 w-5" />
                  </span>
                  <span className="text-left leading-tight">
                    <span className="block font-semibold">All</span>
                    <span className={cn("block text-xs", activeCategory === null ? "text-slate-500" : "text-slate-500")}>
                      {totalEventCount} events
                    </span>
                  </span>
                </Button>
                {Object.keys(categoryIcons).map((category) => {
                  const categoryKey = mapCategoryToBackend(category);
                  const count = filteredCategoryCounts[categoryKey] || 0;
                  const selected = activeCategory === categoryKey;
                  const colors = getCategoryColor(categoryKey);
                  const Icon = categoryIcons[category];
                  return (
                    <Button
                      key={category}
                      size="sm"
                      className={cn(
                        "w-full rounded-2xl border transition whitespace-nowrap justify-start gap-3 h-14",
                        colors.background,
                        colors.border,
                        colors.text,
                        colors.hover,
                        selected ? "border-2 shadow-sm" : ""
                      )}
                      onClick={() => handleCategoryFilter(categoryKey)}
                      title={`${category}: ${count} events`}
                    >
                      <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl border", colors.border, "bg-white/50")}>
                        <Icon className={cn("h-6 w-6", colors.accent)} />
                      </span>
                      <span className="text-left leading-tight">
                        <span className="block font-semibold">{category}</span>
                        <span className={cn("block text-xs", colors.accent)}>
                          {count} events
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </div>

              <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-12 rounded-2xl font-semibold border transition-all duration-150",
                    "shadow-[0_3px_0_0_rgba(148,163,184,0.35),0_10px_20px_rgba(148,163,184,0.18)]",
                    "active:translate-y-[1px] active:shadow-[0_2px_0_0_rgba(148,163,184,0.35),0_6px_12px_rgba(148,163,184,0.14)]",
                    activeTab === 'events'
                      ? "bg-violet-200/80 text-violet-900 border-violet-300 hover:bg-violet-200"
                      : "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
                  )}
                  onClick={() => setActiveTab('events')}
                >
                  <Grid3X3 className="w-4 h-4 mr-2" />
                  Event View
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-12 rounded-2xl font-semibold border transition-all duration-150",
                    "shadow-[0_3px_0_0_rgba(148,163,184,0.35),0_10px_20px_rgba(148,163,184,0.18)]",
                    "active:translate-y-[1px] active:shadow-[0_2px_0_0_rgba(148,163,184,0.35),0_6px_12px_rgba(148,163,184,0.14)]",
                    activeTab === 'date'
                      ? "bg-emerald-200/80 text-emerald-900 border-emerald-300 hover:bg-emerald-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                  )}
                  onClick={() => setActiveTab('date')}
                >
                  <CalendarDays className="w-4 h-4 mr-2" />
                  Date View
                </Button>
              </div>
            </div>
          </div>



        </div>

        {/* Main Content - Show calendar/grid once any events are loaded */}
        {hasAnyEvents && (
          <div className="mt-12">
            {activeTab === 'date' ? (
              <div className="space-y-6">
                {showDayTimetableInDateView ? (
                  <DayTimetable
                    key={`date-day-${datePreset ?? 'none'}-${selectedDate?.toISOString() ?? 'no-date'}`}
                    events={calendarEvents}
                    savedEvents={savedEvents}
                    initialSelectedDay={selectedDate}
                    title={dateViewTitle}
                    renderMode="compact-table"
                    onEventToggleSaved={(eventId) => {
                      const event = events.find(e => e.id === eventId);
                      if (!event) return;
                      const isSaved = savedEvents.find(savedEvent => savedEvent.id === eventId);
                      if (isSaved) {
                        if (confirm(`Remove "${event.title}" from your saved events?`)) {
                          handleRemoveFromCalendar(eventId);
                        }
                        return;
                      }
                      handleSaveToCalendar(eventId);
                    }}
                  />
                ) : showWeekendSplitInDateView ? (
                  <WeekendSplitView
                    key={`date-weekend-${weekendRange.friday.toISOString()}`}
                    events={calendarEvents}
                    savedEvents={savedEvents}
                    title={dateViewTitle}
                    friday={weekendRange.friday}
                    saturday={weekendRange.saturday}
                    sunday={weekendRange.sunday}
                    onDateClick={handleDateClick}
                    onEventToggleSaved={(eventId) => {
                      const event = events.find(e => e.id === eventId);
                      if (!event) return;
                      const isSaved = savedEvents.find(savedEvent => savedEvent.id === eventId);
                      if (isSaved) {
                        if (confirm(`Remove "${event.title}" from your saved events?`)) {
                          handleRemoveFromCalendar(eventId);
                        }
                        return;
                      }
                      handleSaveToCalendar(eventId);
                    }}
                  />
                ) : showThirtyDayAgendaInDateView ? (
                  <ThirtyDayAgendaView
                    key={`date-30d-${datePreset ?? 'none'}`}
                    events={calendarEvents}
                    savedEvents={savedEvents}
                    title={dateViewTitle}
                    onDateClick={handleDateClick}
                    onEventToggleSaved={(eventId) => {
                      const event = events.find(e => e.id === eventId);
                      if (!event) return;
                      const isSaved = savedEvents.find(savedEvent => savedEvent.id === eventId);
                      if (isSaved) {
                        if (confirm(`Remove "${event.title}" from your saved events?`)) {
                          handleRemoveFromCalendar(eventId);
                        }
                        return;
                      }
                      handleSaveToCalendar(eventId);
                    }}
                  />
                ) : (
                  <WeekDayGrid
                    key={`date-range-${datePreset ?? 'none'}`}
                    events={calendarEvents}
                    savedEvents={savedEvents}
                    title={dateViewTitle}
                    fixedDates={nextSevenDays}
                    onEventToggleSaved={(eventId) => {
                      const event = events.find(e => e.id === eventId);
                      if (!event) return;
                      const isSaved = savedEvents.find(savedEvent => savedEvent.id === eventId);
                      if (isSaved) {
                        if (confirm(`Remove "${event.title}" from your saved events?`)) {
                          handleRemoveFromCalendar(eventId);
                        }
                        return;
                      }
                      handleSaveToCalendar(eventId);
                    }}
                    onDateClick={handleDateClick}
                  />
                )}
              </div>
            ) : (
              <div key={`${activeCategory ?? 'all'}-${selectedDate?.toISOString() ?? 'no-date'}`} className="space-y-6">
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
                        <span className="text-xs text-muted-foreground">({eventsForEventView.length} results)</span>
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
                
                {eventsForEventView.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12 border rounded-lg">
                    No events match your current filters.
                    <div className="mt-2 text-xs">Try a different date or clear filters.</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {eventsForEventView.map(event => (
                      <EventCard
                        key={`${event.id}-${activeCategory ?? 'all'}-${selectedDate?.toISOString() ?? 'no-date'}`}
                        event={event}
                        onSaveToCalendar={handleSaveToCalendar}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty state when no events loaded yet */}
        {!hasAnyEvents && (
          <div className="mt-12 text-center p-12">
            <Calendar className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2 text-gray-700">No Events Yet</h3>
            <p className="text-gray-500 mb-6">
              Events load automatically on startup and when filters change.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};
