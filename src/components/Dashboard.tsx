import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { EventCard } from "./EventCard";
import { WeeklyCalendar } from "./WeeklyCalendar";
import { Header } from "./Header";
import { FetchEventsButton } from "./FetchEventsButton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Calendar, Grid3X3, CalendarDays, Mail, Github, Music, Drama, Palette, Coffee, Zap, GraduationCap, Search, Film } from "lucide-react";

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

const defaultPreferences: Preferences = {
  interests: {
    categories: {
      'Music': true,
      'Theatre': true,
      'Art': true,
      'Food': true,
      'Tech': true,
      'Education': true,
      'Movies': true
    },
    keywords: []
  },
  location: {
    address: 'San Francisco, CA'
  },
  filters: {
    timePreferences: ['Morning (6-12pm)', 'Afternoon (12-5pm)', 'Evening (5-9pm)', 'Night (9pm+)', 'Weekend Events', 'Weekday Events']
  },
  aiInstructions: 'Show me all events in the area regardless of category, type, or style. I want to discover everything that\'s happening.'
};

export const Dashboard = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [events, setEvents] = useState<any[]>([]);
  const [savedEvents, setSavedEvents] = useState<any[]>([]);
  const [eventsByCategory, setEventsByCategory] = useState<any>({});
  const [categoryStats, setCategoryStats] = useState<any>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [transformedEventsByCategory, setTransformedEventsByCategory] = useState<any>({});

  // Debug: Log events state changes
  console.log('🔍 Dashboard render - events state:', events.length, events);
  console.log('🔍 Dashboard render - savedEvents state:', savedEvents.length, savedEvents);

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

  const handleCategoryFilter = (category: string | null) => {
    setActiveCategory(category);
    if (category === null) {
      // Show all TRANSFORMED events from all categories
      const allTransformedEvents = Object.values(transformedEventsByCategory).flat();
      setEvents(allTransformedEvents);
    } else {
      // Show TRANSFORMED events only from the selected category
      setEvents(transformedEventsByCategory[category] || []);
    }
  };


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

  const categoryIcons = {
    'Music': Music,
    'Theatre': Drama,
    'Art': Palette,
    'Food': Coffee,
    'Tech': Zap,
    'Education': GraduationCap,
    'Movies': Film
  };

  const timeSlots = [
    { label: 'Morning', description: '6am-12pm', value: 'Morning (6-12pm)' },
    { label: 'Afternoon', description: '12pm-5pm', value: 'Afternoon (12-5pm)' },
    { label: 'Evening', description: '5pm-9pm', value: 'Evening (5-9pm)' },
    { label: 'Night', description: '9pm+', value: 'Night (9pm+)' },
    { label: 'Weekends', description: 'Sat & Sun', value: 'Weekend Events' },
    { label: 'Weekdays', description: 'Mon-Fri', value: 'Weekday Events' }
  ];

  return (
    <div className="min-h-screen">
      <Header 
        onOpenPreferences={() => {}}
        onNavigate={setCurrentPage}
        currentPage={currentPage}
        totalEvents={events.length}
        aiCurationStatus="complete"
      />

      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
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
                  onChange={(e) => setPreferences(prev => ({
                    ...prev,
                    aiInstructions: e.target.value
                  }))}
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
          <div className="mb-10">
            <h3 className="text-2xl font-bold text-gray-700 mb-6">Filter by Category</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-8 gap-5">
              {/* "All" Category Button */}
              <div 
                key="all"
                className={`preference-card rounded-2xl p-4 text-center ${activeCategory === null ? 'selected' : ''}`}
                onClick={() => handleCategoryFilter(null)}
              >
                <div className="icon-bg w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="icon-svg h-8 w-8" />
                </div>
                <p className="font-semibold">All</p>
                <p className="text-sm text-gray-500">{Object.values(categoryStats).reduce((acc: number, cur: any) => acc + (cur.count || 0), 0)} events</p>
              </div>

              {Object.keys(categoryIcons).map((category) => {
                const IconComponent = categoryIcons[category as keyof typeof categoryIcons];
                const categoryKey = category.toLowerCase(); // Frontend now matches backend
                const stats = categoryStats[categoryKey] || { count: 0 };
                const isSelected = activeCategory === categoryKey;

                return (
                  <div 
                    key={category}
                    className={`preference-card rounded-2xl p-4 text-center ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleCategoryFilter(categoryKey)}
                  >
                    <div className="icon-bg w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      {IconComponent && <IconComponent className="icon-svg h-8 w-8" />}
                    </div>
                    <p className="font-semibold">{category}</p>
                    <p className="text-sm text-gray-500">{stats.count} events</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Time Preferences */}
          <div className="mb-12">
            <h3 className="text-2xl font-bold text-gray-700 mb-6">Time & Day</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
              {timeSlots.map((timeSlot) => {
                const isSelected = preferences.filters.timePreferences.includes(timeSlot.value);
                return (
                  <div 
                    key={timeSlot.value}
                    className={`preference-card rounded-2xl p-4 text-center ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      if (isSelected) {
                        setPreferences(prev => ({
                          ...prev,
                          filters: {
                            ...prev.filters,
                            timePreferences: prev.filters.timePreferences.filter(t => t !== timeSlot.value)
                          }
                        }));
                      } else {
                        setPreferences(prev => ({
                          ...prev,
                          filters: {
                            ...prev.filters,
                            timePreferences: [...prev.filters.timePreferences, timeSlot.value]
                          }
                        }));
                      }
                    }}
                  >
                    <p className="font-semibold text-lg">{timeSlot.label}</p>
                    <p className="text-gray-500 text-sm">{timeSlot.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <FetchEventsButton
              location={preferences.location.address}
              preferences={{
                categories: Object.keys(preferences.interests.categories).filter(cat => preferences.interests.categories[cat]),
                timePreferences: preferences.filters.timePreferences,
                customKeywords: preferences.interests.keywords
              }}
              onAllEventsFetched={(fetchedEventsByCategory, fetchedCategoryStats) => {
                console.log('✅ Received raw events by category:', fetchedEventsByCategory);
                setEventsByCategory(fetchedEventsByCategory); // Store raw data
                setCategoryStats(fetchedCategoryStats);

                // Transform events for each category and store them
                const newTransformedEventsByCategory = Object.entries(fetchedEventsByCategory).reduce((acc, [category, events]) => {
                  acc[category] = (events as any[]).map((event: any) => ({
                    id: event.id,
                    title: event.title,
                    description: event.description || 'No description available.',
                    startDate: event.startDate,
                    endDate: event.endDate || event.startDate,
                    venue: {
                      name: event.venue || 'Venue TBD',
                      address: event.address || event.location || 'Location TBD',
                      website: event.venueInfo?.website,
                      mapUrl: event.venueInfo?.googleMapsUrl,
                    },
                    categories: [event.category || 'General'],
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
                  }));
                  return acc;
                }, {} as any);

                setTransformedEventsByCategory(newTransformedEventsByCategory);

                // Combine all TRANSFORMED events for initial display
                const allTransformedEvents = Object.values(newTransformedEventsByCategory).flat();
                setEvents(allTransformedEvents);
                setActiveCategory(null); // Show 'All' events initially
              }}
              className="btn-primary w-full sm:w-auto flex items-center justify-center space-x-2 text-white font-bold py-3 px-8 rounded-full transition hover:transform hover:-translate-y-0.5 hover:shadow-lg"
            />
            <Button
              onClick={() => {
                setEvents([]);
                setSavedEvents([]);
                toast({
                  title: "Events Cleared",
                  description: "All events have been cleared. Click 'Fetch Events' to get fresh events!",
                });
              }}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-gray-200 text-gray-600 font-bold py-3 px-8 rounded-full hover:bg-gray-300 transition"
            >
              <span>Clear All</span>
            </Button>
          </div>
        </div>

        {/* Main Content - Show events if available */}
        {events.length > 0 && (
          <div className="mt-12">
            <Tabs defaultValue="calendar" className="space-y-6">
              <TabsList className="grid w-full grid-cols-2 bg-card shadow-card border-0">
                <TabsTrigger value="calendar" className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Weekly Calendar
                </TabsTrigger>
                <TabsTrigger value="grid" className="flex items-center gap-2">
                  <Grid3X3 className="w-4 h-4" />
                  Event Cards
                </TabsTrigger>
              </TabsList>

              <TabsContent value="calendar" className="space-y-6">
                {console.log('🔍 Dashboard: Passing events to WeeklyCalendar:', events.length, events)}
                <WeeklyCalendar 
                  events={events}
                  savedEvents={savedEvents}
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
                />
              </TabsContent>

              <TabsContent value="grid" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {events.map(event => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onSaveToCalendar={handleSaveToCalendar}
                    />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Empty state */}
        {events.length === 0 && (
          <div className="mt-12 text-center p-12">
            <Calendar className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2 text-gray-700">No Events Yet</h3>
            <p className="text-gray-500 mb-6">
              Click "Fetch Events" to discover amazing events using our Perplexity AI integration
            </p>
          </div>
        )}
      </main>
    </div>
  );
};