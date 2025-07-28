import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Star, Calendar } from "lucide-react";

interface Event {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  venue: {
    name: string;
    address: string;
  };
  categories: string[];
  personalRelevanceScore: number;
  price: {
    type: 'free' | 'paid' | 'donation';
    amount?: string;
  };
  aiReasoning: string;
}

interface EventCardProps {
  event: Event;
  onSaveToCalendar: (eventId: string) => void;
  onViewDetails: (eventId: string) => void;
}

export const EventCard = ({ event, onSaveToCalendar, onViewDetails }: EventCardProps) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const getRelevanceColor = (score: number) => {
    if (score >= 8) return "bg-primary text-primary-foreground";
    if (score >= 6) return "bg-accent text-accent-foreground";
    return "bg-secondary text-secondary-foreground";
  };

  return (
    <Card className="group bg-gradient-card shadow-card hover:shadow-elegant transition-all duration-300 hover:-translate-y-1 animate-fade-in border-0">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors duration-300">
              {event.title}
            </h3>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
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
          <Badge 
            className={`${getRelevanceColor(event.personalRelevanceScore)} ml-4 flex items-center gap-1`}
          >
            <Star className="w-3 h-3" />
            {event.personalRelevanceScore}/10
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {event.description}
        </p>

        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{event.venue.name}</span>
          <span className="text-xs text-muted-foreground">•</span>
          <Badge variant="outline" className="text-xs">
            {event.price.type === 'free' ? 'Free' : event.price.amount}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {event.categories.slice(0, 3).map((category) => (
            <Badge key={category} variant="secondary" className="text-xs">
              {category}
            </Badge>
          ))}
        </div>

        <div className="bg-muted/50 rounded-lg p-3 mb-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">AI Insight:</span> {event.aiReasoning}
          </p>
        </div>

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => onViewDetails(event.id)}
            className="flex-1 hover:bg-primary hover:text-primary-foreground transition-all duration-300"
          >
            View Details
          </Button>
          <Button 
            size="sm" 
            onClick={() => onSaveToCalendar(event.id)}
            className="bg-gradient-primary hover:opacity-90 transition-all duration-300 shadow-elegant"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};