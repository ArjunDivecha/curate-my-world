import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Plus, Brain, MapPin, Clock, DollarSign } from "lucide-react";

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

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: Preferences;
  onSave: (preferences: Preferences) => void;
}

export const PreferencesModal = ({ isOpen, onClose, preferences, onSave }: PreferencesModalProps) => {
  const [localPreferences, setLocalPreferences] = useState<Preferences>(preferences);
  const [newKeyword, setNewKeyword] = useState("");

  const defaultCategories = [
    'Music', 'Art', 'Theatre', 'Food', 'Technology', 'Business',
    'Health & Wellness', 'Sports', 'Education', 'Comedy', 'Film', 'Literature',
    'Dance', 'Photography', 'Fashion', 'Gaming', 'Outdoor Activities'
  ];

  const timeSlots = [
    'Morning (6-12pm)', 'Afternoon (12-5pm)', 'Evening (5-9pm)', 'Late Night (9pm+)',
    'Weekday Events', 'Weekend Events'
  ];

  const handleCategoryWeight = (category: string, weight: number) => {
    setLocalPreferences(prev => ({
      ...prev,
      interests: {
        ...prev.interests,
        categories: {
          ...prev.interests.categories,
          [category]: weight
        }
      }
    }));
  };

  const addKeyword = () => {
    if (newKeyword.trim() && !localPreferences.interests.keywords.includes(newKeyword.trim())) {
      setLocalPreferences(prev => ({
        ...prev,
        interests: {
          ...prev.interests,
          keywords: [...prev.interests.keywords, newKeyword.trim()]
        }
      }));
      setNewKeyword("");
    }
  };

  const removeKeyword = (keyword: string) => {
    setLocalPreferences(prev => ({
      ...prev,
      interests: {
        ...prev.interests,
        keywords: prev.interests.keywords.filter(k => k !== keyword)
      }
    }));
  };

  const toggleTimePreference = (time: string) => {
    setLocalPreferences(prev => ({
      ...prev,
      filters: {
        ...prev.filters,
        timePreferences: prev.filters.timePreferences.includes(time)
          ? prev.filters.timePreferences.filter(t => t !== time)
          : [...prev.filters.timePreferences, time]
      }
    }));
  };

  const handleSave = () => {
    onSave(localPreferences);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            AI Curation Preferences
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* AI Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Brain className="w-4 h-4" />
                AI Curation Instructions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Tell the AI about your specific interests, what you're looking for, and any special considerations..."
                value={localPreferences.aiInstructions}
                onChange={(e) => setLocalPreferences(prev => ({
                  ...prev,
                  aiInstructions: e.target.value
                }))}
                className="min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Example: "I love indie music and art galleries, especially experimental installations. I prefer smaller venues and am interested in networking events for creative professionals."
              </p>
            </CardContent>
          </Card>

          {/* Location & Range */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Location Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Home Address or Preferred Area</Label>
                <Input
                  value={localPreferences.location.address}
                  onChange={(e) => setLocalPreferences(prev => ({
                    ...prev,
                    location: { ...prev.location, address: e.target.value }
                  }))}
                  placeholder="Enter your city or neighborhood"
                />
              </div>
              <div>
                <Label>Search Radius: {localPreferences.location.radius} miles</Label>
                <Slider
                  value={[localPreferences.location.radius]}
                  onValueChange={([value]) => setLocalPreferences(prev => ({
                    ...prev,
                    location: { ...prev.location, radius: value }
                  }))}
                  max={50}
                  min={1}
                  step={1}
                  className="mt-2"
                />
              </div>
            </CardContent>
          </Card>

          {/* Interest Categories */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Interest Categories</CardTitle>
              <p className="text-sm text-muted-foreground">
                Adjust weights to tell the AI how much you care about each category (0 = not interested, 10 = very interested)
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {defaultCategories.map(category => (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center gap-3 w-full">
                      <Label className="text-sm flex-1 whitespace-normal">{category}</Label>
                      <Badge variant="outline" className="shrink-0">
                        {localPreferences.interests.categories[category] || 0}/10
                      </Badge>
                    </div>
                    <Slider
                      value={[localPreferences.interests.categories[category] || 0]}
                      onValueChange={([value]) => handleCategoryWeight(category, value)}
                      max={10}
                      min={0}
                      step={1}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Custom Keywords */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Custom Keywords</CardTitle>
              <p className="text-sm text-muted-foreground">
                Add specific artists, venues, topics, or any keywords the AI should look for
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="Add a keyword..."
                  onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
                />
                <Button onClick={addKeyword} variant="outline">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {localPreferences.interests.keywords.map(keyword => (
                  <Badge key={keyword} variant="secondary" className="gap-1">
                    {keyword}
                    <X 
                      className="w-3 h-3 cursor-pointer hover:text-destructive" 
                      onClick={() => removeKeyword(keyword)}
                    />
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Time Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Time Preferences
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {timeSlots.map(time => (
                  <Button
                    key={time}
                    variant={localPreferences.filters.timePreferences.includes(time) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleTimePreference(time)}
                    className="justify-start"
                  >
                    {time}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Price Range */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Price Range
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label>Price Range</Label>
                  <Badge variant="outline">
                    ${localPreferences.filters.priceRange[0]} - ${localPreferences.filters.priceRange[1]}
                  </Badge>
                </div>
                <Slider
                  value={localPreferences.filters.priceRange}
                  onValueChange={(value) => setLocalPreferences(prev => ({
                    ...prev,
                    filters: { ...prev.filters, priceRange: value as [number, number] }
                  }))}
                  max={200}
                  min={0}
                  step={5}
                  className="mt-2"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-gradient-primary">
            Save Preferences
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};