import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/utils/apiConfig";
import { getWeekendRange, parseEventDateLocalAware, sameLocalDay, startOfLocalDay } from "@/lib/dateViewRanges";
import { type ProviderStatSummary, type FetchEventsTriggerOptions } from "@/components/FetchEventsButton";
import { buildEventSearchMatcher } from "@/lib/eventSearch";

// Constants from original Dashboard
const LOCAL_EVENTS_CACHE_KEY = 'cmw_events_cache_v4';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface Preferences {
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

const personalizedPreferences: Preferences = {
  interests: {
    categories: {
      'Music': true, 'Theatre': true, 'Comedy': true, 'Movies': true, 'Art': true,
      'Food': true, 'Tech': true, 'Lectures': true, 'Kids': true, 'Desi': true
    },
    keywords: [
      'concerts', 'live music', 'jazz', 'classical', 'plays', 'musicals', 'broadway', 'opera',
      'stand-up', 'improv', 'comedy show', 'film', 'screening', 'cinema', 'museum', 'gallery', 'exhibition',
      'food festival', 'cooking class', 'wine tasting', 'tech meetup', 'hackathon', 'startup',
      'author talk', 'lecture', 'book signing', 'family', 'kids activities', 'children',
      'desi', 'indian', 'bollywood', 'bhangra', 'garba', 'dandiya', 'holi', 'diwali'
    ]
  },
  location: { address: 'San Francisco, CA' },
  filters: { timePreferences: ['Evening (5-9pm)', 'Weekend Events'] },
  aiInstructions: ''
};

const defaultProviderSelection: Record<string, boolean> = {
  ticketmaster: true,
  venue_scraper: true,
  whitelist: false,
};

export const useDashboardLogic = () => {
  const { toast } = useToast();

  // --- State ---
  const [preferences, setPreferences] = useState<Preferences>(personalizedPreferences);
  const [events, setEvents] = useState<any[]>([]);
  const [savedEvents, setSavedEvents] = useState<any[]>([]);
  const [eventsByCategory, setEventsByCategory] = useState<any>({});
  const [categoryStats, setCategoryStats] = useState<any>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [transformedEventsByCategory, setTransformedEventsByCategory] = useState<any>({});
  const [activeTab, setActiveTab] = useState<'events' | 'date'>('events');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<Record<string, boolean>>(defaultProviderSelection);
  const [providerDetails, setProviderDetails] = useState<ProviderStatSummary[]>([]);
  const [totalProcessingTime, setTotalProcessingTime] = useState<number>(0);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [refreshStatusText, setRefreshStatusText] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateQuery, setDateQuery] = useState('');
  const [datePreset, setDatePreset] = useState<null | 'today' | 'week' | 'weekend' | '30d'>('30d');
  const [fetcherReady, setFetcherReady] = useState(false);

  // --- Refs ---
  const refreshPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchEventsRef = useRef<((options?: FetchEventsTriggerOptions) => void) | null>(null);
  const hasTriggeredInitialAutoFetchRef = useRef(false);

  // --- Helpers ---
  const mapCategoryToBackend = (frontendCategory: string): string => {
    const categoryMap: Record<string, string> = {
      'Music': 'music', 'Theatre': 'theatre', 'Comedy': 'comedy', 'Movies': 'movies',
      'Art': 'art', 'Food': 'food', 'Tech': 'tech', 'Lectures': 'lectures',
      'Kids': 'kids', 'Desi': 'desi'
    };
    return categoryMap[frontendCategory] || frontendCategory.toLowerCase();
  };

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
      return { ...current, [providerKey]: enabled };
    });
  };

  const handleBackgroundRefreshing = useCallback((refreshing: boolean) => {
    setBackgroundRefreshing(refreshing);
    if (refreshPollRef.current) {
      clearInterval(refreshPollRef.current);
      refreshPollRef.current = null;
    }
    if (!refreshing) return;

    refreshPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/events/refresh-status`);
        const status = await res.json();
        if (typeof status?.message === 'string' && status.message.trim().length > 0) {
          setRefreshStatusText(status.message);
        } else if (typeof status?.ageHours === 'number') {
          setRefreshStatusText(`Cache age: ${status.ageHours}h`);
        } else {
          setRefreshStatusText(null);
        }
        if (!status.refreshing) {
          setBackgroundRefreshing(false);
          setRefreshStatusText(null);
          if (refreshPollRef.current) { clearInterval(refreshPollRef.current); refreshPollRef.current = null; }
          if (fetchEventsRef.current) { fetchEventsRef.current({ silent: true }); }
        }
      } catch { /* Ignore */ }
    }, 10_000);
  }, [toast]);

  // --- Effects ---
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
    } catch (err) { console.error('Cache restore failed', err); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/events/refresh-status`);
        const status = await res.json();
        if (cancelled) return;
        if (status?.refreshing) {
          if (status.message) setRefreshStatusText(status.message);
          handleBackgroundRefreshing(true);
        }
      } catch { /* Ignore */ }
    })();
    return () => { cancelled = true; };
  }, [handleBackgroundRefreshing]);

  // --- Memoized Derived Data ---
  const calendarEvents = useMemo(() => {
    if (!Object.keys(transformedEventsByCategory).length) return [];
    let evs: any[] = [];
    if (activeCategory === null) {
      evs = Object.values(transformedEventsByCategory).flat();
    } else if (activeCategory === 'technology') {
      evs = [...(transformedEventsByCategory['tech'] || []), ...(transformedEventsByCategory['technology'] || [])];
    } else {
      evs = transformedEventsByCategory[activeCategory] || [];
    }

    if (datePreset) {
      const start = startOfLocalDay(new Date());
      if (datePreset === 'today') {
        evs = evs.filter(e => { const d = parseEventDateLocalAware(e.startDate); return d && sameLocalDay(d, start); });
      } else if (datePreset === 'week') {
        const end = new Date(start); end.setDate(end.getDate() + 7);
        evs = evs.filter(e => { const d = parseEventDateLocalAware(e.startDate); return d && startOfLocalDay(d) >= start && startOfLocalDay(d) < end; });
      } else if (datePreset === '30d') {
        const end = new Date(start); end.setDate(end.getDate() + 30);
        evs = evs.filter(e => { const d = parseEventDateLocalAware(e.startDate); return d && startOfLocalDay(d) >= start && startOfLocalDay(d) < end; });
      } else if (datePreset === 'weekend') {
        const { windowStart, windowEnd } = getWeekendRange(start);
        evs = evs.filter(e => { const d = parseEventDateLocalAware(e.startDate); return d && d >= windowStart && d < windowEnd; });
      }
    }

    if (searchQuery.trim()) {
      const matcher = buildEventSearchMatcher(searchQuery);
      evs = evs
        .map((event) => ({ event, score: matcher.score(event) }))
        .filter((row) => row.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return String(a.event.startDate || '').localeCompare(String(b.event.startDate || ''));
        })
        .map((row) => row.event);
    }
    return evs;
  }, [activeCategory, transformedEventsByCategory, datePreset, searchQuery]);

  const eventsForEventView = useMemo(() => {
    let evs = calendarEvents;
    if (selectedDate) {
      const targetDay = startOfLocalDay(selectedDate);
      evs = evs.filter(e => { const d = parseEventDateLocalAware(e.startDate); return d && sameLocalDay(d, targetDay); });
    }
    return evs;
  }, [calendarEvents, selectedDate]);

  const filteredCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const todayStart = startOfLocalDay(new Date());
    const selectedDay = selectedDate ? startOfLocalDay(selectedDate) : null;
    const weekendWindow = datePreset === 'weekend' ? getWeekendRange(todayStart) : null;
    const searchMatcher = buildEventSearchMatcher(searchQuery);

    const matchesDate = (e: any) => {
      const d = parseEventDateLocalAware(e.startDate);
      if (!d) return false;
      if (selectedDay) return sameLocalDay(d, selectedDay);
      if (!datePreset) return true;
      if (datePreset === 'today') return sameLocalDay(d, todayStart);
      if (datePreset === 'week') { const end = new Date(todayStart); end.setDate(end.getDate() + 7); return startOfLocalDay(d) >= todayStart && startOfLocalDay(d) < end; }
      if (datePreset === '30d') { const end = new Date(todayStart); end.setDate(end.getDate() + 30); return startOfLocalDay(d) >= todayStart && startOfLocalDay(d) < end; }
      if (datePreset === 'weekend' && weekendWindow) return d >= weekendWindow.windowStart && d < weekendWindow.windowEnd;
      return true;
    };

    const matchesSearch = (e: any) => {
      if (!searchMatcher.hasQuery) return true;
      return searchMatcher.matches(e);
    };

    Object.entries(transformedEventsByCategory).forEach(([rawCat, catEvents]) => {
      const canonical = rawCat === 'technology' ? 'tech' : rawCat;
      const matchCount = (catEvents as any[]).filter(e => matchesDate(e) && matchesSearch(e)).length;
      counts[canonical] = (counts[canonical] || 0) + matchCount;
    });
    return counts;
  }, [transformedEventsByCategory, datePreset, selectedDate, searchQuery]);

  // --- Handlers ---
  const handleSaveToCalendar = (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    if (event && !savedEvents.find(s => s.id === eventId)) {
      setSavedEvents(prev => [...prev, event]);
      toast({ title: "Event Saved", description: `"${event.title}" has been added.` });
    }
  };

  const handleRemoveFromCalendar = (eventId: string) => {
    setSavedEvents(prev => prev.filter(e => e.id !== eventId));
    toast({ title: "Event Removed", description: "Event removed from calendar." });
  };

  const applyTypedDate = useCallback(() => {
    const raw = dateQuery.trim();
    if (!raw) { setSelectedDate(null); return; }
    let parsed: Date | null = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-').map(Number); parsed = new Date(y, m - 1, d);
    } else {
      const m = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
      if (m) {
        const mm = Number(m[1]), dd = Number(m[2]);
        let yyyy = m[3] ? Number(m[3]) : new Date().getFullYear();
        if (yyyy < 100) yyyy += 2000;
        parsed = new Date(yyyy, mm - 1, dd);
      }
    }
    if (!parsed || isNaN(parsed.getTime())) {
      toast({ title: "Invalid date", description: "Use MM/DD, MM/DD/YYYY, or YYYY-MM-DD.", variant: "destructive" });
      return;
    }
    setSelectedDate(parsed); setDatePreset(null);
  }, [dateQuery, toast]);

  const handleAllEventsFetched = (fetchedEventsByCategory: any, fetchedCategoryStats: any, fetchedProviderDetails: any) => {
    setEventsByCategory(fetchedEventsByCategory);
    setCategoryStats(fetchedCategoryStats);
    if (Array.isArray(fetchedProviderDetails)) setProviderDetails(fetchedProviderDetails);

    const newTransformed = Object.entries(fetchedEventsByCategory).reduce((acc, [cat, evs]) => {
      const canonical = cat === 'tech' ? 'technology' : cat;
      acc[cat] = (evs as any[]).map((e: any, idx: number) => {
        const normCats = Array.from(new Set([canonical, ...(Array.isArray(e.categories) ? e.categories : (e.category ? [e.category] : [])).filter(Boolean).map((v: string) => v.toLowerCase())])).filter(Boolean);
        const fmtDate = (dStr: any) => {
          if (!dStr) return '';
          if (dStr instanceof Date) return dStr.toISOString();
          const d = new Date(dStr);
          return isNaN(d.getTime()) ? '' : d.toISOString();
        };
        return {
          id: e.id || `event-${cat}-${idx}`,
          title: e.title || 'Untitled Event',
          description: e.description || 'No description available.',
          startDate: fmtDate(e.startDate),
          endDate: fmtDate(e.endDate || e.startDate),
          venue: { name: e.venue || 'Venue TBD', address: e.address || e.location || 'Location TBD', website: e.venueInfo?.website, mapUrl: e.venueInfo?.googleMapsUrl },
          category: canonical,
          categories: normCats,
          personalRelevanceScore: e.relevance || 8,
          price: e.priceRange ? { type: e.priceRange.min === 0 && e.priceRange.max === 0 ? 'free' : 'paid', amount: e.priceRange.min === 0 && e.priceRange.max === 0 ? undefined : `$${e.priceRange.min} - $${e.priceRange.max}` } : { type: 'free' },
          ticketUrl: e.ticketUrl || e.externalUrl,
          eventUrl: e.eventUrl || e.externalUrl,
          aiReasoning: e.aiReasoning || 'Curated sources.',
          imageUrl: e.imageUrl || null,
          source: e.source,
          sources: e.sources,
        };
      });
      return acc;
    }, {} as any);

    setTransformedEventsByCategory(newTransformed);
    try {
      localStorage.setItem(LOCAL_EVENTS_CACHE_KEY, JSON.stringify({ buckets: newTransformed, stats: fetchedCategoryStats, timestamp: Date.now() }));
    } catch (err) { console.error('Cache save failed', err); }
    setEvents(Object.values(newTransformed).flat());
  };

  return {
    state: {
      preferences, events, savedEvents, eventsByCategory, categoryStats, activeCategory,
      transformedEventsByCategory, activeTab, selectedDate, selectedProviders, providerDetails,
      totalProcessingTime, backgroundRefreshing, refreshStatusText, searchQuery, dateQuery,
      datePreset, fetcherReady, calendarEvents, eventsForEventView, filteredCategoryCounts
    },
    actions: {
      setPreferences, setEvents, setSavedEvents, setActiveCategory, setActiveTab, setSelectedDate,
      setSelectedProviders, setProviderDetails, setTotalProcessingTime, setBackgroundRefreshing,
      setRefreshStatusText, setSearchQuery, setDateQuery, setDatePreset, setFetcherReady,
      handleProviderToggle, handleBackgroundRefreshing, handleSaveToCalendar, handleRemoveFromCalendar,
      applyTypedDate, handleAllEventsFetched, mapCategoryToBackend
    },
    refs: { fetchEventsRef }
  };
};
