import React, { useState, useEffect } from "react";
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
import SuggestedCategories from './SuggestedCategories';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Calendar, Grid3X3, CalendarDays, Mail, Github, Music, Drama, Palette, Coffee, Zap, GraduationCap, Search, Film, Brain, Eye, EyeOff, Cpu, Mic2, BookOpen, Baby } from "lucide-react";
import { getCategoryColor } from "@/utils/categoryColors";
import { ProviderControlPanel } from "./ProviderControlPanel";

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
  whitelist: true,
  serper: true,
  exa: true,
  ticketmaster: true,
  pplx: true,
};

export const Dashboard = () => {
  // Simple local cache to survive refresh/hot-reload
  const LOCAL_EVENTS_CACHE_KEY = 'cmw_events_cache_v1';
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

  const [currentPage, setCurrentPage] = useState('dashboard');
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [events, setEvents] = useState<any[]>([]);
  const [savedEvents, setSavedEvents] = useState<any[]>([]);
  const [eventsByCategory, setEventsByCategory] = useState<any>({});
  const [categoryStats, setCategoryStats] = useState<any>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [transformedEventsByCategory, setTransformedEventsByCategory] = useState<any>({});
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false); // Toggle for "Suggested for You"
  // Control which tab is visible to guarantee UI reflects filtered events
  const [activeTab, setActiveTab] = useState<'calendar' | 'grid'>('grid');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<Record<string, boolean>>(defaultProviderSelection);
  const [providerDetails, setProviderDetails] = useState<ProviderStatSummary[]>([]);
  const [totalProcessingTime, setTotalProcessingTime] = useState<number>(0);

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user, signIn, signUp, signInWithGoogle, signInWithGitHub } = useAuth();

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
      console.log(`🔍 Filtered to ${events.length} events for ${targetDateString} in category '${activeCategory || 'all'}'`);
    }
    
    return events;
  }, [activeCategory, transformedEventsByCategory, selectedDate]);

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


  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await signIn(email, password);
    if (!error) {
      setEmail('');
      setPassword('');
    }
    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await signUp(email, password);
    if (!error) {
      setEmail('');
      setPassword('');
    }
    setIsLoading(false);
  };

  // Show login form if user is not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <CalendarDays className="h-8 w-8 text-primary mr-2" />
              <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                Event Finder
              </h1>
            </div>
            <p className="text-muted-foreground">
              Discover amazing events tailored just for you
            </p>
          </div>

          <Card className="shadow-elegant">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl text-center">Welcome</CardTitle>
              <CardContent className="text-center text-muted-foreground">
                {isSignUp ? "Create your account to get started" : "Sign in to continue"}
              </CardContent>
            </CardHeader>
            <CardContent>
              <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isLoading}
                >
                  {isLoading ? (isSignUp ? "Creating account..." : "Signing in...") : (isSignUp ? "Create Account" : "Sign In")}
                </Button>
              </form>

              <div className="mt-4 text-center">
                <Button 
                  variant="link" 
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-sm"
                >
                  {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
                </Button>
              </div>

              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      Or continue with
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <Button 
                    variant="outline" 
                    onClick={signInWithGoogle}
                    disabled={isLoading}
                    className="w-full"
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Google
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={signInWithGitHub}
                    disabled={isLoading}
                    className="w-full"
                  >
                    <Github className="mr-2 h-4 w-4" />
                    GitHub
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground mt-6">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    );
  }

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

      <main className="container mx-auto p-4 sm:p-6 lg:p-8 mr-80">
        <div className="max-w-5xl mx-auto bg-white/90 backdrop-blur-lg p-6 sm:p-10 rounded-2xl shadow-2xl">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2 text-center">Curate Your Event Feed</h2>
          <p className="text-gray-500 mb-10 text-center">Select your interests and we'll handle the rest.</p>

          {/* AI Instructions & Location */}
          <div className="bg-gray-50 p-8 rounded-2xl shadow-inner mb-10 border border-gray-200">
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <Label htmlFor="ai-instructions" className="block text-lg font-semibold text-gray-700 mb-2">
                  AI Instructions
                </Label>
                <Textarea
                  id="ai-instructions"
                  rows={3}
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                  placeholder="e.g., 'Only show me events with live music.'"
                  value={preferences.aiInstructions}
                  onChange={(e) => {
                    try {
                      setPreferences(prev => ({
                        ...prev,
                        aiInstructions: e.target.value
                      }));
                    } catch (error) {
                      console.error('Error updating AI instructions:', error);
                      // Silently handle the error to prevent app crash
                    }
                  }}
                />
              </div>
              <div>
                <Label htmlFor="location" className="block text-lg font-semibold text-gray-700 mb-2">
                  Location
                </Label>
                <Input
                  id="location"
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                  value={preferences.location.address}
                  onChange={(e) => setPreferences(prev => ({
                    ...prev,
                    location: { address: e.target.value }
                  }))}
                />
              </div>
            </div>
          </div>

          {/* Category Filters */}
          <div className="mb-10 space-y-8">
            <h3 className="text-2xl font-bold text-gray-700">Filter by Category</h3>

            <ProviderControlPanel
              selectedProviders={selectedProviders}
              onToggleProvider={handleProviderToggle}
              providerDetails={providerDetails}
              totalProcessingTime={totalProcessingTime}
            />

            {/* Top Row - All, Fetch Events, Clear All */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-center gap-4">
              {/* "All" Button */}
              <Button
                onClick={() => handleCategoryFilter(null)}
                className={`w-full lg:w-auto flex items-center justify-center space-x-2 font-bold py-4 px-8 rounded-full transition hover:transform hover:-translate-y-0.5 hover:shadow-lg ${
                  activeCategory === null 
                    ? 'bg-gradient-primary text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Search className="w-5 h-5" />
                <span>All ({totalEventCount} events)</span>
              </Button>

              <FetchEventsButton
                location={preferences.location.address}
                preferences={{
                  categories: Object.keys(preferences.interests.categories).filter(cat => preferences.interests.categories[cat]),
                  timePreferences: preferences.filters.timePreferences,
                  customKeywords: preferences.interests.keywords,
                  aiInstructions: preferences.aiInstructions
                }}
                selectedProviders={selectedProviders}
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
                className="btn-primary w-full lg:w-auto flex items-center justify-center space-x-2 text-white font-bold py-4 px-8 rounded-full transition hover:transform hover:-translate-y-0.5 hover:shadow-lg"
              />
              
              {/* Toggle Suggestions Button */}
              <Button
                onClick={() => setShowSuggestions(!showSuggestions)}
                variant="outline"
                size="sm"
                className="flex items-center space-x-2"
                title={showSuggestions ? "Hide AI Suggestions" : "Show AI Suggestions"}
              >
                {showSuggestions ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <Brain className="w-4 h-4" />
                <span>{showSuggestions ? "Hide" : "Show"} Suggestions</span>
              </Button>
              
              {/* Clear All Button */}
              <Button
                onClick={() => {
                  // Clear all event-related state
                  setEvents([]);
                  setSavedEvents([]);
                  setEventsByCategory({});
                  setTransformedEventsByCategory({});
                  setCategoryStats({});
                  setActiveCategory(null);
                  setProviderDetails([]);
                  setTotalProcessingTime(0);
                  try { localStorage.removeItem(LOCAL_EVENTS_CACHE_KEY); } catch {}
                  toast({
                    title: "Events Cleared",
                    description: "All events have been cleared. Click 'Fetch Events' to get fresh events!",
                  });
                }}
                className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-gray-200 text-gray-600 font-bold py-4 px-8 rounded-full hover:bg-gray-300 transition"
              >
                <span>Clear All</span>
              </Button>
            </div>
            
            {/* First Row - 6 categories */}
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5 mb-5">
              {Object.keys(categoryIcons).slice(0, 6).map((category) => {
                const IconComponent = categoryIcons[category as keyof typeof categoryIcons];
                const categoryKey = mapCategoryToBackend(category);
                const stats = categoryStats[categoryKey] || { count: 0 };
                const isSelected = activeCategory === categoryKey;
                const categoryColors = getCategoryColor(category);

                return (
                  <div 
                    key={category}
                    className={`rounded-2xl p-4 text-center transition-all duration-300 cursor-pointer transform hover:scale-105 hover:shadow-lg ${
                      isSelected 
                        ? `${categoryColors.background} ${categoryColors.border} border-2 shadow-md` 
                        : `${categoryColors.background} ${categoryColors.border} border ${categoryColors.hover}`
                    }`}
                    onClick={() => handleCategoryFilter(categoryKey)}
                  >
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${categoryColors.background} ${categoryColors.border} border-2`}>
                      {IconComponent && <IconComponent className={`h-8 w-8 ${categoryColors.icon}`} />}
                    </div>
                    <p className={`font-semibold ${categoryColors.text}`}>{category}</p>
                    <p className={`text-sm ${categoryColors.accent}`}>{stats.count} events</p>
                  </div>
                );
              })}
            </div>
            
            {/* Second Row - 6 categories */}
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
              {Object.keys(categoryIcons).slice(6).map((category) => {
                const IconComponent = categoryIcons[category as keyof typeof categoryIcons];
                const categoryKey = mapCategoryToBackend(category);
                const stats = categoryStats[categoryKey] || { count: 0 };
                const isSelected = activeCategory === categoryKey;
                const categoryColors = getCategoryColor(category);

                return (
                  <div 
                    key={category}
                    className={`rounded-2xl p-4 text-center transition-all duration-300 cursor-pointer transform hover:scale-105 hover:shadow-lg ${
                      isSelected 
                        ? `${categoryColors.background} ${categoryColors.border} border-2 shadow-md` 
                        : `${categoryColors.background} ${categoryColors.border} border ${categoryColors.hover}`
                    }`}
                    onClick={() => handleCategoryFilter(categoryKey)}
                  >
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${categoryColors.background} ${categoryColors.border} border-2`}>
                      {IconComponent && <IconComponent className={`h-8 w-8 ${categoryColors.icon}`} />}
                    </div>
                    <p className={`font-semibold ${categoryColors.text}`}>{category}</p>
                    <p className={`text-sm ${categoryColors.accent}`}>{stats.count} events</p>
                  </div>
                );
              })}
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
                  onEventClick={(eventId) => {
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
                {(activeCategory || selectedDate) && (
                  <div className="bg-muted/50 rounded-lg p-4 mb-6 border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium">Active Filters:</h3>
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
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveCategory(null);
                          setSelectedDate(null);
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
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
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
              Click "Fetch Events" to discover amazing events using our Perplexity AI integration
            </p>
          </div>
        )}
      </main>
      
      {/* Suggested Categories Sidebar - Fixed Position (Conditional) */}
      {showSuggestions && (
        <SuggestedCategories
          onCategoryClick={(category) => {
            console.log('🎯 Suggested category clicked:', category);
            console.log('🗂️ Available transformed categories:', Object.keys(transformedEventsByCategory));
            console.log('📊 Transformed events per category:', Object.entries(transformedEventsByCategory).map(([key, events]) => `${key}: ${events.length}`));
            handleCategoryFilter(category);
          }}
          onEventClick={(eventId) => {
            console.log('📅 Suggested event clicked:', eventId);
            // Find and highlight the event in the main view
            const event = events.find(e => e.id === eventId);
            if (event) {
              // Scroll to event or show details
              console.log('Found event:', event.title);
            }
          }}
          eventsByCategory={transformedEventsByCategory}
        />
      )}
    </div>
  );
};
