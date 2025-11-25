import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Play, 
  Download, 
  Upload, 
  Copy, 
  Search, 
  RefreshCw, 
  Database,
  Code,
  FileText,
  Settings
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:8765/api';

interface ApiResponse {
  data: any;
  status: number;
  statusText: string;
  headers: any;
  timing: number;
  timestamp: string;
}

export const ApiTester: React.FC = () => {
  const [selectedApi, setSelectedApi] = useState<string>('');
  const [category, setCategory] = useState<string>('music');
  const [location, setLocation] = useState<string>('San Francisco, CA');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [showExistingPrompt, setShowExistingPrompt] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [jsonFilter, setJsonFilter] = useState<string>('');
  const { toast } = useToast();

  const apiSources = [
    { value: '', label: 'All Sources (Default)', description: 'Perplexity LLM, Exa, Serper, Ticketmaster, and PPLX' },
    { value: 'perplexity', label: 'Perplexity Only', description: 'AI-powered event discovery' },
    { value: 'exa', label: 'Exa Only', description: 'Web search for events' },
    { value: 'serper', label: 'Serper Only', description: 'Google search results' },
    { value: 'ticketmaster', label: 'Ticketmaster Only', description: 'Official event tickets and venues' },
    { value: 'compare', label: 'Compare Sources', description: 'Side-by-side comparison of sources' },
    { value: 'all-categories', label: 'All Categories', description: 'Fetch all event categories' }
  ];

  // Current supported categories
  const categories = [
    'music', 'theatre', 'comedy', 'movies', 'art', 'food', 'tech', 'lectures', 'kids'
  ];

  const getDefaultPrompt = (source: string, category: string): string => {
    const prompts: Record<string, string> = {
      'perplexity': `Find ${category} events in San Francisco, CA for 2025. Include event name, date, time, location, and description.`,
      'exa': `Web search for ${category} events in San Francisco, CA 2025. Find event websites and details.`,
      'serper': `Google search: "${category} events San Francisco CA 2025" - find event listings and information.`
    };
    return prompts[source] || `Find ${category} events in San Francisco, CA for 2025`;
  };

  const getExistingPrompt = (source: string, category: string): string => {
    // These are the actual prompts used by the backend
    const existingPrompts: Record<string, string> = {
      'perplexity': `You are an expert event curator for the San Francisco Bay Area. Find ${category} events happening in San Francisco, CA and surrounding Bay Area cities within the next 3 months. Focus on high-quality, engaging events that would appeal to tech professionals and creative individuals. Include specific details like venue names, exact dates/times, ticket prices, and event URLs when available. Prioritize events that are unique, educational, or networking-focused.`,
      'exa': `Search the web for ${category} events in San Francisco Bay Area happening in the next 3 months. Find official event pages, registration links, and detailed event information from reliable sources like Eventbrite, Meetup, Facebook Events, and venue websites.`,
      'serper': `Find ${category} events in San Francisco Bay Area for the next 3 months. Search for: "${category} events San Francisco Bay Area 2025" including Eventbrite, Meetup, Facebook Events, and official venue listings.`
    };
    return existingPrompts[source] || `Find ${category} events in San Francisco Bay Area for the next 3 months. Focus on high-quality events with specific venue details, dates, times, and registration information.`;
  };

  const callApi = async () => {

    setIsLoading(true);
    const startTime = Date.now();

    try {
      let url = '';
      let params = new URLSearchParams();
      
      // If a custom prompt is provided, we ignore the location parameter (per user rule)
      const customProvided = customPrompt.trim().length > 0;
      
      // Build URL based on selected API (always use selected source and category)
      if (selectedApi === 'all-categories') {
        url = `${API_BASE_URL}/events/all-categories`;
        // Only include location when no custom prompt is provided
        if (!customProvided) {
          params.append('location', location);
        } else {
          console.log('ℹ️ Custom prompt provided; ignoring location parameter.');
        }
        params.append('date_range', 'next 30 days');
        params.append('limit', '500');
      } else if (selectedApi === '') {
        // Default endpoint - all 5 sources
        url = `${API_BASE_URL}/events/${category}`;
        if (!customProvided) {
          params.append('location', location);
        } else {
          console.log('ℹ️ Custom prompt provided; ignoring location parameter.');
        }
      } else {
        url = `${API_BASE_URL}/events/${category}/${selectedApi}`;
        if (!customProvided) {
          params.append('location', location);
        } else {
          console.log('ℹ️ Custom prompt provided; ignoring location parameter.');
        }
      }

      // Add prompt - use custom if provided, otherwise use default
      const promptToUse = customPrompt.trim() || getExistingPrompt(selectedApi, category);
      if (promptToUse) {
        params.append('custom_prompt', promptToUse);
      }

      // Add cache buster to prevent browser caching
      params.append('_t', Date.now().toString());
      
      const fullUrl = `${url}?${params.toString()}`;
      console.log('🔍 API Test URL:', fullUrl);
      console.log('🔍 Custom Prompt:', customPrompt);
      console.log('🔍 Prompt to Use:', promptToUse);
      console.log('🔍 Full URL with params:', fullUrl);

      const response = await fetch(fullUrl);
      const endTime = Date.now();
      const timing = endTime - startTime;

      const data = await response.json();
      console.log('🔍 Response Data:', data);
      console.log('🔍 First Event Title:', data?.events?.[0]?.title);
      
      const apiResponse: ApiResponse = {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        timing,
        timestamp: new Date().toISOString()
      };

      setResponse(apiResponse);

      toast({
        title: response.ok ? "✅ API Call Successful" : "❌ API Call Failed",
        description: `${selectedApi} • ${timing}ms • ${response.status} ${response.statusText}`,
        variant: response.ok ? "default" : "destructive"
      });

    } catch (error: any) {
      const endTime = Date.now();
      const timing = endTime - startTime;
      
      const errorResponse: ApiResponse = {
        data: { error: error.message, stack: error.stack },
        status: 0,
        statusText: 'Network Error',
        headers: {},
        timing,
        timestamp: new Date().toISOString()
      };

      setResponse(errorResponse);

      toast({
        title: "❌ API Call Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const downloadJson = () => {
    if (!response) return;
    
    const dataStr = JSON.stringify(response, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `api-response-${selectedApi}-${category}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    if (!response) return;
    
    navigator.clipboard.writeText(JSON.stringify(response, null, 2));
    toast({
      title: "📋 Copied to Clipboard",
      description: "JSON response copied successfully"
    });
  };

  const uploadJsonFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target?.result as string);
        const uploadedResponse: ApiResponse = {
          data: jsonData,
          status: 200,
          statusText: 'Uploaded File',
          headers: { 'content-type': 'application/json' },
          timing: 0,
          timestamp: new Date().toISOString()
        };
        setResponse(uploadedResponse);
        toast({
          title: "📁 File Uploaded",
          description: "JSON file loaded successfully"
        });
      } catch (error) {
        toast({
          title: "❌ Invalid JSON",
          description: "Could not parse the uploaded file",
          variant: "destructive"
        });
      }
    };
    reader.readAsText(file);
  };

  const filteredJsonString = () => {
    if (!response) return '';
    
    let jsonStr = JSON.stringify(response.data, null, 2);
    
    if (searchTerm) {
      const regex = new RegExp(searchTerm, 'gi');
      jsonStr = jsonStr.replace(regex, `<mark>$&</mark>`);
    }
    
    return jsonStr;
  };

  const getEventCount = () => {
    if (!response?.data) return 0;
    
    if (response.data.totalEvents) return response.data.totalEvents;
    if (Array.isArray(response.data)) return response.data.length;
    if (response.data.events && Array.isArray(response.data.events)) return response.data.events.length;
    
    return 0;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Database className="w-6 h-6 text-blue-600" />
        <h1 className="text-3xl font-bold">API Testing Interface</h1>
        <Badge variant="outline">Backend Testing</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              API Configuration
            </CardTitle>
            <CardDescription>
              Configure API calls and modify prompts for testing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* API Source Selection */}
            <div>
              <Label htmlFor="api-source">API Source</Label>
              <select 
                id="api-source"
                value={selectedApi} 
                onChange={(e) => setSelectedApi(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {apiSources.map((api) => (
                  <option key={api.value} value={api.value}>
                    {api.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Selection */}
            {!['all-categories'].includes(selectedApi) && (
              <div>
                <Label htmlFor="category">Category</Label>
                <select 
                  id="category"
                  value={category} 
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Location Input */}
            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., San Francisco, CA"
              />
            </div>

            {/* Custom Prompt */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="custom-prompt">Custom Prompt (Optional)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const existingPrompt = getExistingPrompt(selectedApi, category);
                    setCustomPrompt(existingPrompt);
                  }}
                  className="text-xs"
                >
                  Load Backend Prompt
                </Button>
              </div>
              <Textarea
                id="custom-prompt"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder={getDefaultPrompt(selectedApi, category) || 'Enter custom prompt...'}
                rows={4}
              />
              {selectedApi && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                  <strong>Current Backend Prompt:</strong>
                  <div className="mt-1 text-gray-600 max-h-20 overflow-y-auto">
                    {getExistingPrompt(selectedApi, category)}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button 
                onClick={callApi} 
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {isLoading ? 'Calling API...' : 'Test API'}
              </Button>
              
              <Button variant="outline" onClick={() => setResponse(null)}>
                Clear
              </Button>
            </div>

            {/* File Operations */}
            <div className="flex gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={downloadJson} disabled={!response}>
                <Download className="w-4 h-4 mr-1" />
                Download
              </Button>
              
              <Button variant="outline" size="sm" onClick={copyToClipboard} disabled={!response}>
                <Copy className="w-4 h-4 mr-1" />
                Copy
              </Button>
              
              <label className="cursor-pointer">
                <Button variant="outline" size="sm" asChild>
                  <span>
                    <Upload className="w-4 h-4 mr-1" />
                    Upload
                  </span>
                </Button>
                <input
                  type="file"
                  accept=".json"
                  onChange={uploadJsonFile}
                  className="hidden"
                />
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Response Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="w-5 h-5" />
              API Response
              {response && (
                <Badge variant={response.status === 200 ? "default" : "destructive"}>
                  {response.status} • {response.timing}ms • {getEventCount()} events
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              View and analyze API responses with JSON formatting
            </CardDescription>
          </CardHeader>
          <CardContent>
            {response ? (
              <Tabs defaultValue="formatted" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="formatted">Formatted</TabsTrigger>
                  <TabsTrigger value="raw">Raw JSON</TabsTrigger>
                  <TabsTrigger value="metadata">Metadata</TabsTrigger>
                </TabsList>
                
                <TabsContent value="formatted" className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search in JSON..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="flex-1"
                    />
                    <Button variant="outline" size="sm">
                      <Search className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="bg-slate-50 rounded-lg p-4 max-h-96 overflow-auto">
                    <pre 
                      className="text-sm font-mono whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ 
                        __html: filteredJsonString() 
                      }}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="raw">
                  <div className="bg-slate-50 rounded-lg p-4 max-h-96 overflow-auto">
                    <pre className="text-sm font-mono whitespace-pre-wrap">
                      {JSON.stringify(response.data, null, 2)}
                    </pre>
                  </div>
                </TabsContent>
                
                <TabsContent value="metadata" className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <strong>Status:</strong> {response.status} {response.statusText}
                    </div>
                    <div>
                      <strong>Timing:</strong> {response.timing}ms
                    </div>
                    <div>
                      <strong>Timestamp:</strong> {new Date(response.timestamp).toLocaleString()}
                    </div>
                    <div>
                      <strong>Events Found:</strong> {getEventCount()}
                    </div>
                  </div>
                  
                  <div>
                    <strong>Response Headers:</strong>
                    <div className="bg-slate-50 rounded p-2 mt-1">
                      <pre className="text-xs">
                        {JSON.stringify(response.headers, null, 2)}
                      </pre>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No API response yet</p>
                <p className="text-sm">Configure and test an API call to see results</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
