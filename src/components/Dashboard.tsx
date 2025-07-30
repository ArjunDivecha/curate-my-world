import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Calendar, Grid3X3, Brain, Sparkles, TrendingUp, CalendarDays, Mail, Github } from "lucide-react";

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
      'Outdoor Activities': 10,
      'Theatre': 10
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
  const [events, setEvents] = useState<any[]>([]);
  const [savedEvents, setSavedEvents] = useState<any[]>([]);
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

  const getWeeklyStats = () => {
    const thisWeek = events.filter(event => {
      const eventDate = new Date(event.startDate);
      const today = new Date();
      const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      return eventDate >= today && eventDate <= weekFromNow;
    });

    const avgScore = thisWeek.length > 0 ? 
      thisWeek.reduce((sum, event) => sum + event.personalRelevanceScore, 0) / thisWeek.length : 0;
    
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
            onEventsFetched={(fetchedEvents) => {
              console.log(`✅ Received ${fetchedEvents.length} events from API, displaying directly`);
              setEvents(fetchedEvents);
            }}
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
            variant="outline"
            className="text-destructive hover:text-destructive"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Clear Events
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
                  Events are fetched live from the Perplexity AI API using proven patterns. 
                  The system prioritizes current events with networking opportunities and creative communities. 
                  High relevance scores indicate strong alignment with your preferences.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content - Show events if available */}
        {events.length > 0 && (
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

        {/* Empty state */}
        {events.length === 0 && (
          <Card className="text-center p-12">
            <CardContent>
              <Calendar className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Events Yet</h3>
              <p className="text-muted-foreground mb-6">
                Click "Fetch Events" to discover amazing events using our Perplexity AI integration
              </p>
            </CardContent>
          </Card>
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