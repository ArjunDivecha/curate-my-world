import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Settings, Calendar, Sparkles, Home, Search, Bookmark, User } from "lucide-react";

interface HeaderProps {
  onOpenPreferences: () => void;
  onNavigate: (page: string) => void;
  currentPage: string;
  totalEvents: number;
  aiCurationStatus: 'idle' | 'processing' | 'complete';
}

export const Header = ({ onOpenPreferences, onNavigate, currentPage, totalEvents, aiCurationStatus }: HeaderProps) => {
  const getStatusBadge = () => {
    switch (aiCurationStatus) {
      case 'processing':
        return (
          <Badge className="bg-accent text-accent-foreground animate-pulse-glow">
            <Brain className="w-3 h-3 mr-1" />
            AI Curating...
          </Badge>
        );
      case 'complete':
        return (
          <Badge className="bg-primary text-primary-foreground">
            <Sparkles className="w-3 h-3 mr-1" />
            {totalEvents} Events Curated
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Calendar className="w-3 h-3 mr-1" />
            Ready
          </Badge>
        );
    }
  };

  const navigationItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'saved', label: 'Saved Events', icon: Bookmark },
    { id: 'profile', label: 'Profile', icon: User }
  ];

  return (
    <header className="bg-gradient-subtle border-b border-border/50 shadow-card">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-primary rounded-xl flex items-center justify-center shadow-glow">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">EventFinder</h1>
                <p className="text-sm text-muted-foreground">AI-Curated Local Events</p>
              </div>
            </div>
            
            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.id}
                    variant={currentPage === item.id ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => onNavigate(item.id)}
                    className="flex items-center gap-2 hover:bg-primary hover:text-primary-foreground transition-all duration-300"
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Button>
                );
              })}
            </nav>
            
            {getStatusBadge()}
          </div>
          
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onOpenPreferences}
              className="hover:bg-primary hover:text-primary-foreground transition-all duration-300"
            >
              <Settings className="w-4 h-4 mr-2" />
              Preferences
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};