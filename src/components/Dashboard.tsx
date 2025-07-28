import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EventCard } from "./EventCard";
import { WeeklyCalendar } from "./WeeklyCalendar";
import { Header } from "./Header";
import { PreferencesModal } from "./PreferencesModal";
import { mockEvents } from "@/data/mockEvents";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Grid3X3, Brain, Sparkles, TrendingUp } from "lucide-react";

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
      'Music': 8,
      'Art': 9,
      'Technology': 7,
      'Food & Drink': 6
    },
    keywords: ['indie', 'experimental', 'gallery', 'coffee']
  },
  location: {
    address: 'Downtown District',
    radius: 15
  },
  filters: {
    timePreferences: ['Evening (5-9pm)', 'Weekend Events'],
    priceRange: [0, 50]
  },
  aiInstructions: 'I love discovering new indie music and experimental art. I prefer smaller, intimate venues where I can connect with artists and other attendees. I\'m interested in networking events for creative professionals.'
};

export const Dashboard = () => {
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'processing' | 'complete'>('complete');
  const [events] = useState(mockEvents);
  const { toast } = useToast();

  const handleSaveToCalendar = (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    toast({
      title: "Event Saved",
      description: `"${event?.title}" has been added to your calendar.`,
    });
  };

  const handleViewDetails = (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    toast({
      title: "Event Details",
      description: `Viewing details for "${event?.title}"`,
    });
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

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Header 
        onOpenPreferences={() => setPreferencesOpen(true)}
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

        {/* Main Content Tabs */}
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
              events={events}
              onEventClick={handleViewDetails}
            />
          </TabsContent>

          <TabsContent value="grid" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {events.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  onSaveToCalendar={handleSaveToCalendar}
                  onViewDetails={handleViewDetails}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
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