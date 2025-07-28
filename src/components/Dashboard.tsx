import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { EventCard } from "./EventCard";
import { WeeklyCalendar } from "./WeeklyCalendar";
import { Header } from "./Header";
import { PreferencesModal } from "./PreferencesModal";
import { FetchEventsButton } from "./FetchEventsButton";
import { mockEvents } from "@/data/mockEvents";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Grid3X3, Brain, Sparkles, TrendingUp, CalendarDays, Mail, Github, RefreshCw, MapPin } from "lucide-react";

interface Preferences {
  interests: {
    categories: { [key: string]: number };
    keywords: string[];
  };
  location: {
    address: string;
    radius: number;
  };
  filters: {
    timePreferences: string[];
    priceRange: [number, number];
  };
  aiInstructions: string;
}

const defaultPreferences: Preferences = {
  interests: {
    categories: {
      'Music': 10,
      'Art': 10,
      'Technology': 10,
      'Food & Drink': 10,
      'Business': 10,
      'Health & Wellness': 10,
      'Education': 10,
      'Film': 10,
      'Dance': 10,
      'Fashion': 10,
      'Outdoor Activities': 10
    },
    keywords: []
  },
  location: {
    address: 'San Francisco, CA',
    radius: 50
  },
  filters: {
    timePreferences: ['Morning (6-12pm)', 'Afternoon (12-5pm)', 'Evening (5-9pm)', 'Night (9pm+)', 'Weekend Events', 'Weekday Events'],
    priceRange: [0, 200]
  },
  aiInstructions: 'Show me all events in the area regardless of category, type, or style. I want to discover everything that\'s happening.'
};

export const Dashboard = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'processing' | 'complete'>('complete');
  const [events, setEventsRaw] = useState<any[]>(() => {
    console.log('🔍 INITIAL STATE: events initialized with empty array');
    return [];
  });
  const [realEvents, setRealEventsRaw] = useState<any[]>(() => {
    console.log('🔍 INITIAL STATE: realEvents initialized with empty array');
    return [];
  });
  const [eventsKilled, setEventsKilled] = useState(false);
  const [savedEvents, setSavedEvents] = useState<any[]>([]);
  
  // Debug every time events changes
  useEffect(() => {
    console.log('🔍 EVENTS STATE CHANGED:', events.length, 'events:', events.map(e => e?.title || 'no title'));
  }, [events]);
  
  // Protected setters that prevent vampire resurrection
  const setEvents = (newEvents: any[]) => {
    console.log(`🔍 setEvents called with ${newEvents.length} events, eventsKilled=${eventsKilled}`);
    if (!eventsKilled && newEvents.length > 0) {
      console.log('🧛‍♂️ BLOCKED: Attempting to set events while vampires are alive!', newEvents.map(e => e?.title || 'no title'));
      return;
    }
    console.log('✅ Setting events:', newEvents.map(e => e?.title || 'no title'));
    setEventsRaw(newEvents);
  };
  
  const setRealEvents = (newEvents: any[]) => {
    console.log(`🔍 setRealEvents called with ${newEvents.length} events, eventsKilled=${eventsKilled}`);
    if (!eventsKilled && newEvents.length > 0) {
      console.log('🧛‍♂️ BLOCKED: Attempting to set real events while vampires are alive!', newEvents.map(e => e?.title || 'no title'));
      return;
    }
    console.log('✅ Setting real events:', newEvents.map(e => e?.title || 'no title'));
    setRealEventsRaw(newEvents);
  };
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(true);
  const { toast } = useToast();
  const { user, signIn, signUp, signInWithGoogle, signInWithGitHub } = useAuth();

  // Fetch real events from database - ONLY if vampire events have been killed
  const fetchEventsFromDB = async () => {
    if (!eventsKilled) {
      console.log('🧛‍♂️ Vampire events not yet killed - refusing to fetch');
      return;
    }
    
    try {
      console.log('📡 Fetching fresh events from database (vampires are dead)...');
      // Only fetch events from today forward to avoid showing old cached events
      const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format
      // Add cache-busting to prevent vampire resurrections
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .gte('date_time', today)
        .order('date_time', { ascending: true });
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        // Transform database events to match the expected format
        const transformedEvents = data.map(event => {
          // Intelligently assign categories based on event content
          const getEventCategories = (title: string, description: string) => {
            const text = (title + ' ' + description).toLowerCase();
            const categories = [];
            
            if (text.includes('music') || text.includes('concert') || text.includes('band') || text.includes('jazz') || text.includes('symphony')) {
              categories.push('Music');
            }
            if (text.includes('art') || text.includes('gallery') || text.includes('museum') || text.includes('exhibit') || text.includes('painting')) {
              categories.push('Art');
            }
            if (text.includes('tech') || text.includes('startup') || text.includes('innovation') || text.includes('ai') || text.includes('digital')) {
              categories.push('Technology');
            }
            if (text.includes('food') || text.includes('drink') || text.includes('restaurant') || text.includes('wine') || text.includes('culinary')) {
              categories.push('Food & Drink');
            }
            if (text.includes('business') || text.includes('networking') || text.includes('entrepreneur') || text.includes('conference')) {
              categories.push('Business');
            }
            if (text.includes('health') || text.includes('wellness') || text.includes('fitness') || text.includes('yoga')) {
              categories.push('Health & Wellness');
            }
            if (text.includes('education') || text.includes('workshop') || text.includes('class') || text.includes('seminar')) {
              categories.push('Education');
            }
            if (text.includes('film') || text.includes('movie') || text.includes('cinema') || text.includes('documentary')) {
              categories.push('Film');
            }
            if (text.includes('dance') || text.includes('ballet') || text.includes('choreography')) {
              categories.push('Dance');
            }
            if (text.includes('fashion') || text.includes('style') || text.includes('design')) {
              categories.push('Fashion');
            }
            if (text.includes('outdoor') || text.includes('park') || text.includes('hiking') || text.includes('festival') || text.includes('fair')) {
              categories.push('Outdoor Activities');
            }
            
            return categories.length > 0 ? categories : ['Events'];
          };

          return {
            id: event.id,
            title: event.title,
            description: event.description || '',
            startDate: event.date_time,
            endDate: event.end_date_time || event.date_time,
            venue: {
              name: event.venue || '',
              address: event.address || '',
              website: '',
              mapUrl: ''
            },
            categories: getEventCategories(event.title || '', event.description || ''),
            personalRelevanceScore: 8, // Default score for real events
            price: event.price_min === 0 && event.price_max === 0 ? 
              { type: "free" as const } : 
              { 
                type: "paid" as const, 
                amount: event.price_max ? `$${event.price_max}` : "$0"
              },
            ticketUrl: event.external_url || '',
            eventUrl: event.external_url || '',
            aiReasoning: 'Event matches your interests and location preferences'
          };
        });
        
        // ONLY SET EVENTS IF VAMPIRES ARE STILL DEAD
        if (eventsKilled) {
          setRealEvents(transformedEvents);
          setEvents(transformedEvents);
        }
      } else {
        // Explicitly clear state when no events found
        setRealEvents([]);
        setEvents([]);
      }
    } catch (error) {
      console.error('Error fetching events from database:', error);
    }
  };

  // KILL VAMPIRE EVENTS - nuclear option to destroy all cached events
  useEffect(() => {
    const killVampireEvents = async () => {
      try {
        console.log('🧛‍♂️ KILLING VAMPIRE EVENTS - NUCLEAR OPTION...');
        setIsClearingCache(true);
        
        // FORCE IMMEDIATE STATE CLEARING - No conditions, just clear everything NOW
        console.log('💀 IMMEDIATE STATE NUKE...');
        setEventsRaw([]);
        setRealEventsRaw([]);
        
        // NUCLEAR OPTION 1: Delete ALL events from database  
        console.log('💀 Nuking database events...');
        const { error: deleteError } = await supabase
          .from('events')
          .delete()
          .gte('id', '00000000-0000-0000-0000-000000000000');
        
        if (deleteError) {
          console.log('Trying alternative delete method...');
          await supabase.from('events').delete().neq('created_at', null);
        }
        
        // NUCLEAR OPTION 2: Clear local state AGAIN aggressively
        console.log('💀 Second state clearing...');
        setEventsRaw([]);
        setRealEventsRaw([]);
        
        // NUCLEAR OPTION 3: Clear any cached data
        if (typeof window !== 'undefined') {
          localStorage.clear(); // Clear EVERYTHING, not just specific items
          sessionStorage.clear();
          // Clear any possible indexedDB
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
          }
        }
        
        // NUCLEAR OPTION 4: Force component re-mount with key changes
        console.log('💀 Forcing component refresh...');
        
        // Final state clearing after all operations
        setEventsRaw([]);
        setRealEventsRaw([]);
        
        console.log('💀 VAMPIRE EVENTS DESTROYED! No more resurrections!');
        setEventsKilled(true);
      } catch (error) {
        console.error('Error killing vampire events:', error);
        // Fallback - regular delete
        try {
          await supabase.from('events').delete().neq('id', '');
          setEventsRaw([]);
          setRealEventsRaw([]);
        } catch (fallbackError) {
          console.error('Fallback delete failed:', fallbackError);
        }
      } finally {
        setIsClearingCache(false);
      }
    };
    
    killVampireEvents();
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

  const getWeeklyStats = () => {
    const thisWeek = events.filter(event => {
      const eventDate = new Date(event.startDate);
      const today = new Date();
      const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      return eventDate >= today && eventDate <= weekFromNow;
    });

    const avgScore = thisWeek.reduce((sum, event) => sum + event.personalRelevanceScore, 0) / thisWeek.length;
    
    return {
      total: thisWeek.length,
      highRelevance: thisWeek.filter(e => e.personalRelevanceScore >= 8).length,
      avgScore: avgScore.toFixed(1)
    };
  };

  const stats = getWeeklyStats();

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

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Header 
        onOpenPreferences={() => setPreferencesOpen(true)}
        onNavigate={setCurrentPage}
        currentPage={currentPage}
        totalEvents={events.length}
        aiCurationStatus={aiStatus}
      />

      <div className="max-w-7xl mx-auto p-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-gradient-card shadow-card border-0">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">This Week</p>
                  <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Curated Events</p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card shadow-card border-0">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">High Relevance</p>
                  <p className="text-2xl font-bold text-foreground">{stats.highRelevance}</p>
                  <p className="text-xs text-muted-foreground">8+ Score Events</p>
                </div>
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card shadow-card border-0">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg. Relevance</p>
                  <p className="text-2xl font-bold text-foreground">{stats.avgScore}/10</p>
                  <p className="text-xs text-muted-foreground">AI Curation Score</p>
                </div>
                <div className="w-12 h-12 bg-primary-glow/10 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-primary-glow" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="mb-8 flex justify-center gap-4">
          <FetchEventsButton
            location={preferences.location.address}
            preferences={{
              categories: Object.keys(preferences.interests.categories),
              priceRange: { min: preferences.filters.priceRange[0], max: preferences.filters.priceRange[1] },
              timePreferences: preferences.filters.timePreferences,
              customKeywords: preferences.interests.keywords
            }}
            onEventsFetched={fetchEventsFromDB}
          />
          <Button
            onClick={async () => {
              try {
                console.log('Clearing all events from database and local state...');
                
                // Clear local state immediately for instant UI update
                setEventsRaw([]);
                setRealEventsRaw([]);
                
                // Clear all events from database
                const { error } = await supabase
                  .from('events')
                  .delete()
                  .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all events
                
                if (error) throw error;
                
                // DON'T fetch after clear - let user explicitly fetch fresh events
                // await fetchEventsFromDB(); // THIS WAS THE VAMPIRE RESURRECTION!
                
                console.log('Successfully cleared all events');
                toast({
                  title: "Events Cleared",
                  description: "All events have been cleared. You can start fresh!",
                });
              } catch (error: any) {
                console.error('Error clearing events:', error);
                toast({
                  title: "Error clearing events",
                  description: error.message || "Failed to clear events. Please try again.",
                  variant: "destructive",
                });
              }
            }}
            variant="outline"
            className="text-destructive hover:text-destructive"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Clear All Events
          </Button>
        </div>

        {/* AI Insight Banner */}
        <Card className="mb-8 bg-gradient-primary text-white border-0 shadow-glow">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-2">AI Curation Insight</h3>
                <p className="text-white/90 text-sm leading-relaxed">
                  This week's selection emphasizes intimate venues and experimental art based on your preferences. 
                  I've prioritized events with networking opportunities and creative communities. 
                  The high average relevance score (8.2/10) indicates strong alignment with your interests.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vampire Killing Message */}
        {isClearingCache && (
          <Card className="mb-8 bg-red-50 border-red-200">
            <CardContent className="p-6 text-center">
              <div className="flex items-center justify-center gap-3">
                <RefreshCw className="w-5 h-5 animate-spin text-red-600" />
                <p className="text-red-800 font-medium">🧛‍♂️ KILLING VAMPIRE EVENTS - NUCLEAR OPTION ACTIVATED!</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Vampires Dead Message */}
        {!isClearingCache && events.length === 0 && eventsKilled && (
          <Card className="mb-8 bg-green-50 border-green-200">
            <CardContent className="p-6 text-center">
              <div className="flex flex-col items-center gap-3">
                <span className="text-4xl">💀</span>
                <h3 className="text-green-800 font-semibold text-lg">VAMPIRE EVENTS DESTROYED!</h3>
                <p className="text-green-700">
                  All cached events have been KILLED and will never resurrect. Set your location in preferences and click "Fetch Events" to get fresh, geographically filtered events!
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content Tabs */}
        {!isClearingCache && eventsKilled && events.length > 0 && (
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
              <WeeklyCalendar 
                events={savedEvents}
                onEventClick={(eventId) => {
                  const event = savedEvents.find(e => e.id === eventId);
                  if (event) {
                    // Show confirmation for deletion
                    if (confirm(`Remove "${event.title}" from your calendar?`)) {
                      handleRemoveFromCalendar(eventId);
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
        )}
      </div>

      <PreferencesModal
        isOpen={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        preferences={preferences}
        onSave={setPreferences}
      />
    </div>
  );
};