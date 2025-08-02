import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Brain, TrendingUp, ArrowRight, Info, DollarSign, Car, BarChart3 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SuggestedCategory {
  name: string;
  displayName: string;
  confidence: number;
  icon: React.ReactNode;
  reasoning: string;
  eventCount: number;
  color: string;
}

interface SuggestedCategoriesProps {
  onCategoryClick: (category: string) => void;
  onEventClick: (eventId: string) => void;
  eventsByCategory: Record<string, any[]>;
}

const SuggestedCategories: React.FC<SuggestedCategoriesProps> = ({
  onCategoryClick,
  onEventClick,
  eventsByCategory
}) => {
  // AI-derived personalized categories based on conversation analysis
  const suggestedCategories: SuggestedCategory[] = [
    {
      name: 'technology',
      displayName: 'Technology',
      confidence: 60,
      icon: <TrendingUp className="w-4 h-4" />,
      reasoning: 'You frequently discuss Python programming, data science, and machine learning in conversations',
      eventCount: 0,
      color: 'bg-blue-500'
    },
    {
      name: 'finance',
      displayName: 'Finance',
      confidence: 60,
      icon: <DollarSign className="w-4 h-4" />,
      reasoning: 'Strong interest in investment analysis, stock market trends, and financial modeling',
      eventCount: 0,
      color: 'bg-green-500'
    },
    {
      name: 'automotive',
      displayName: 'Automotive',
      confidence: 60,
      icon: <Car className="w-4 h-4" />,
      reasoning: 'Tesla ownership and electric vehicle technology discussions are prominent themes',
      eventCount: 0,
      color: 'bg-red-500'
    },
    {
      name: 'data-analysis',
      displayName: 'Data Analysis',
      confidence: 60,
      icon: <BarChart3 className="w-4 h-4" />,
      reasoning: 'Frequent mentions of data visualization, analytics, and business intelligence tools',
      eventCount: 0,
      color: 'bg-purple-500'
    }
  ];

  // Map frontend category names to backend category names
  const mapCategoryName = (frontendName: string): string => {
    const categoryMap: Record<string, string> = {
      'technology': 'technology', // Direct match
      'finance': 'finance',       // Direct match
      'automotive': 'automotive', // Direct match
      'data-analysis': 'data-analysis' // Direct match
    };
    return categoryMap[frontendName] || frontendName;
  };

  // Get event count for each category
  const getCategoryEventCount = (categoryName: string): number => {
    const mappedName = mapCategoryName(categoryName);
    const events = eventsByCategory[mappedName] || [];
    return events.length;
  };

  // Update categories with event counts
  const categoriesWithCounts = suggestedCategories.map(category => ({
    ...category,
    eventCount: getCategoryEventCount(category.name)
  }));

  return (
    <div className="fixed right-0 top-16 w-80 bg-white border-l border-gray-200 h-screen overflow-y-auto z-10 shadow-lg">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center space-x-2 mb-4">
          <Brain className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-bold text-gray-900">Suggested for You</h2>
        </div>
        
        <p className="text-sm text-gray-600 mb-6">
          Based on analysis of 1,563 conversations
        </p>

        {/* Suggested Categories */}
        <div className="space-y-4">
          {categoriesWithCounts.map((category) => (
            <Card key={category.name} className="border border-gray-200 hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className={`p-1.5 rounded-full ${category.color} text-white`}>
                      {category.icon}
                    </div>
                    <CardTitle className="text-sm font-semibold">
                      {category.displayName}
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {category.confidence}%
                    </Badge>
                  </div>
                  
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">{category.reasoning}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                {/* Event Count Display */}
                <div className="text-center py-2">
                  <p className="text-sm text-gray-600 mb-3">
                    {category.eventCount > 0 ? (
                      <span className="font-medium text-green-600">{category.eventCount} events available</span>
                    ) : (
                      <span className="text-gray-500">No events found</span>
                    )}
                  </p>
                </div>

                {/* AI Reasoning */}
                <div className="mb-4 p-2 bg-blue-50 rounded text-xs text-gray-600 italic">
                  "{category.reasoning.split(' ').slice(0, 12).join(' ')}..."
                </div>

                {/* Show Events Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onCategoryClick(category.name)}
                  className="w-full text-xs flex items-center justify-center space-x-1 hover:bg-gray-100"
                >
                  <span>Show Events</span>
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-6 p-3 bg-purple-50 rounded-lg">
          <div className="flex items-center space-x-2 mb-2">
            <Brain className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-900">AI Insights</span>
          </div>
          <p className="text-xs text-purple-700">
            These suggestions are based on your conversation patterns and interests. 
            Categories with higher confidence scores match your preferences more closely.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SuggestedCategories;
