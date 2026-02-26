import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EventCard } from "./EventCard";
import { DayTimetable } from "./DayTimetable";
import { WeekDayGrid } from "./WeekDayGrid";
import { WeekendSplitView } from "./WeekendSplitView";
import { ThirtyDayAgendaView } from "./ThirtyDayAgendaView";
import { Header } from "./Header";
import { FetchEventsButton } from "./FetchEventsButton";
import { Calendar, Grid3X3, CalendarDays, Music, Drama, Palette, Coffee, Cpu, Mic2, BookOpen, Baby, Globe, RefreshCw, Search, Film, ChevronDown } from "lucide-react";
import { getCategoryColor } from "@/utils/categoryColors";
import { cn } from "@/lib/utils";
import { getWeekendRange, startOfLocalDay } from "@/lib/dateViewRanges";
import { useDashboardLogic } from "@/hooks/useDashboardLogic";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as DatePickerCalendar } from "@/components/ui/calendar";

export const Dashboard = () => {
  const { state, actions, refs } = useDashboardLogic();
  const {
    preferences, events, savedEvents, activeCategory,
    transformedEventsByCategory, activeTab, selectedDate, selectedProviders,
    backgroundRefreshing, refreshStatusText, searchQuery,
    datePreset, fetcherReady, eventsForEventView, filteredCategoryCounts
  } = state;

  const {
    setActiveCategory, setActiveTab, setSelectedDate,
    setSearchQuery, setDatePreset, setFetcherReady,
    handleBackgroundRefreshing, handleSaveToCalendar, handleRemoveFromCalendar,
    handleAllEventsFetched, mapCategoryToBackend
  } = actions;

  const { fetchEventsRef } = refs;
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);

  // Track when events state changes
  useEffect(() => {
    console.log('🔍 Events state CHANGED:', events.length, events);
  }, [events]);

  const handleCategoryFilter = (category: string | null) => {
    setActiveCategory(category);
  };

  const handleDateClick = (date: Date) => {
    if (datePreset) return;
    setSelectedDate(date);
  };

  const calendarEvents = state.calendarEvents;
  const weekendRange = React.useMemo(() => getWeekendRange(new Date()), []);
  const nextSevenDays = React.useMemo(() => {
    if (datePreset !== 'week') return undefined;
    const start = startOfLocalDay(new Date());
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [datePreset]);

  const showDayTimetableInDateView = datePreset === 'today' || !!selectedDate;
  const showWeekendSplitInDateView = datePreset === 'weekend';
  const showThirtyDayAgendaInDateView = datePreset === '30d';
  const dateViewPresetLabel =
    selectedDate
      ? selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
      : datePreset === 'today'
        ? 'Today'
      : datePreset === 'week'
        ? 'Next 7 Days'
        : datePreset === 'weekend'
          ? 'This Weekend (Fri Evening + Sat + Sun)'
          : datePreset === '30d'
            ? 'Next 30 Days'
            : 'Calendar';
  const dateViewTitle = `Date View - ${dateViewPresetLabel}`;

  const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    'Music': Music, 'Theatre': Drama, 'Comedy': Mic2, 'Movies': Film, 'Art': Palette,
    'Food': Coffee, 'Tech': Cpu, 'Lectures': BookOpen, 'Kids': Baby, 'Desi': Globe
  };

  const totalEventCount = Object.values(filteredCategoryCounts).reduce((sum, count) => sum + count, 0);
  const hasAnyEvents = Object.values(transformedEventsByCategory).some((arr: any) => Array.isArray(arr) && arr.length > 0);

  return (
    <div className="min-h-screen">
      <Header 
        onOpenPreferences={() => {}}
        onNavigate={() => {}}
        currentPage="dashboard"
        totalEvents={eventsForEventView.length}
        aiCurationStatus="complete"
      />

      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-5xl mx-auto bg-white/90 backdrop-blur-lg p-6 sm:p-10 rounded-2xl shadow-2xl">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2 text-center">SF Bay Event Finder</h2>
          <p className="text-gray-500 mb-10 text-center">Select your interests and we'll handle the rest.</p>

          {backgroundRefreshing && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm text-blue-700 shadow-sm">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="font-medium">Refreshing venue data in the background&hellip;</span>
              {refreshStatusText && <span className="text-blue-500">({refreshStatusText})</span>}
            </div>
          )}

          <div className="mb-10 space-y-5">
            <div className="bg-gray-50 p-5 sm:p-6 rounded-2xl shadow-inner border border-gray-200">
              <div className="mb-4 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-indigo-50 p-3 shadow-sm">
                <div className="flex flex-wrap justify-center gap-2">
                  {['today', 'week', 'weekend', '30d'].map((preset) => (
                    <Button
                      key={preset}
                      variant="outline"
                      className={cn(
                        "min-h-12 rounded-xl border-2 px-5 text-lg font-semibold tracking-tight transition-all",
                        datePreset === preset
                          ? "border-indigo-600 bg-indigo-600 text-white shadow-[0_8px_18px_rgba(79,70,229,0.35)]"
                          : "border-slate-300 bg-white text-slate-800 hover:border-indigo-300 hover:bg-indigo-50"
                      )}
                      onClick={() => { setDatePreset(preset as any); setSelectedDate(null); }}
                    >
                      {preset === 'today' ? 'Today' : preset === 'week' ? 'Next 7 Days' : preset === 'weekend' ? 'This Weekend' : 'Next 30 Days'}
                    </Button>
                  ))}

                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "min-h-12 rounded-xl border-2 px-5 text-lg font-semibold tracking-tight transition-all border-slate-300 bg-white text-slate-800 hover:border-indigo-300 hover:bg-indigo-50",
                          selectedDate ? "border-indigo-600 bg-indigo-50 text-indigo-900" : ""
                        )}
                      >
                        <CalendarDays className="h-5 w-5 mr-2" />
                        {selectedDate
                          ? selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "Choose Specific Date"}
                        <ChevronDown className="h-4 w-4 ml-2 opacity-70" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="center">
                      <div className="p-3 border-b text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Pick A Specific Date
                      </div>
                      <DatePickerCalendar
                        mode="single"
                        selected={selectedDate ?? undefined}
                        onSelect={(date) => {
                          if (!date) return;
                          setSelectedDate(date);
                          setDatePreset(null);
                          setDatePickerOpen(false);
                        }}
                        initialFocus
                      />
                      {selectedDate && (
                        <div className="p-3 border-t flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedDate(null);
                              setDatePreset(null);
                              setDatePickerOpen(false);
                            }}
                          >
                            Clear Date
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="relative">
                  <Input
                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-400"
                    placeholder='Search events/venues (try: "de young", venue:fox, cat:art, -kids)'
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">&times;</button>}
                </div>
              </div>

              <FetchEventsButton
                location={preferences.location.address}
                preferences={{
                  categories: Object.keys(preferences.interests.categories).filter(cat => preferences.interests.categories[cat]),
                  timePreferences: preferences.filters.timePreferences,
                  customKeywords: preferences.interests.keywords,
                  aiInstructions: preferences.aiInstructions
                }}
                selectedProviders={selectedProviders}
                onBackgroundRefreshing={handleBackgroundRefreshing}
                fetchRef={fetchEventsRef}
                onFetcherReady={() => setFetcherReady(true)}
                autoMode
                onAllEventsFetched={handleAllEventsFetched}
              />

              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "w-full sm:w-[28rem] lg:w-[40%] rounded-2xl border whitespace-nowrap justify-start gap-3 h-14 px-5 text-slate-900",
                    activeCategory === null ? "bg-gradient-to-r from-rose-100 via-amber-100 to-sky-100 border-slate-200" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                  )}
                  onClick={() => handleCategoryFilter(null)}
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white/70"><Search className="h-5 w-5" /></span>
                  <span className="text-left leading-tight"><span className="block font-semibold text-slate-900">All</span><span className="block text-xs text-slate-700">{totalEventCount} events</span></span>
                </Button>
              </div>

              <div className="mt-2 w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {Object.keys(categoryIcons).map((catName) => {
                  const catKey = mapCategoryToBackend(catName);
                  const count = filteredCategoryCounts[catKey] || 0;
                  const selected = activeCategory === catKey;
                  const colors = getCategoryColor(catKey);
                  const Icon = categoryIcons[catName];
                  return (
                    <Button
                      key={catName}
                      size="sm"
                      className={cn("w-full rounded-2xl border whitespace-nowrap justify-start gap-3 h-14", colors.background, colors.border, colors.text, colors.hover, selected ? "border-2 shadow-sm" : "")}
                      onClick={() => handleCategoryFilter(catKey)}
                    >
                      <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl border", colors.border, "bg-white/50")}><Icon className={cn("h-6 w-6", colors.accent)} /></span>
                      <span className="text-left leading-tight"><span className="block font-semibold">{catName}</span><span className={cn("block text-xs", colors.accent)}>{count} events</span></span>
                    </Button>
                  );
                })}
              </div>

              <div className="mt-3 flex justify-center">
                <Button size="sm" className="w-full max-w-xl rounded-2xl border justify-center gap-3 h-14 bg-gray-100 text-gray-700" onClick={() => { setActiveCategory(null); setSelectedDate(null); setDatePreset('30d'); setSearchQuery(''); }}>
                  <RefreshCw className="h-5 w-5" /><span className="font-semibold">Reset Filters</span>
                </Button>
              </div>

              <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button variant="outline" className={cn("h-12 rounded-2xl font-semibold border", activeTab === 'events' ? "bg-violet-200/80 text-violet-900 border-violet-300" : "bg-violet-50 text-violet-700 border-violet-200")} onClick={() => setActiveTab('events')}><Grid3X3 className="w-4 h-4 mr-2" />Event View</Button>
                <Button variant="outline" className={cn("h-12 rounded-2xl font-semibold border", activeTab === 'date' ? "bg-emerald-200/80 text-emerald-900 border-emerald-300" : "bg-emerald-50 text-emerald-700 border-emerald-200")} onClick={() => setActiveTab('date')}><CalendarDays className="w-4 h-4 mr-2" />Date View</Button>
              </div>
            </div>
          </div>
        </div>

        {hasAnyEvents && (
          <div className="mt-12">
            {activeTab === 'date' ? (
              <div className="space-y-6">
                {showDayTimetableInDateView ? (
                  <DayTimetable events={calendarEvents} savedEvents={savedEvents} initialSelectedDay={selectedDate} title={dateViewTitle} renderMode="compact-table" onEventToggleSaved={(id) => savedEvents.find(s => s.id === id) ? handleRemoveFromCalendar(id) : handleSaveToCalendar(id)} />
                ) : showWeekendSplitInDateView ? (
                  <WeekendSplitView events={calendarEvents} savedEvents={savedEvents} title={dateViewTitle} friday={weekendRange.friday} saturday={weekendRange.saturday} sunday={weekendRange.sunday} onDateClick={handleDateClick} onEventToggleSaved={(id) => savedEvents.find(s => s.id === id) ? handleRemoveFromCalendar(id) : handleSaveToCalendar(id)} />
                ) : showThirtyDayAgendaInDateView ? (
                  <ThirtyDayAgendaView events={calendarEvents} savedEvents={savedEvents} title={dateViewTitle} onDateClick={handleDateClick} onEventToggleSaved={(id) => savedEvents.find(s => s.id === id) ? handleRemoveFromCalendar(id) : handleSaveToCalendar(id)} />
                ) : (
                  <WeekDayGrid events={calendarEvents} savedEvents={savedEvents} title={dateViewTitle} fixedDates={nextSevenDays} onEventToggleSaved={(id) => savedEvents.find(s => s.id === id) ? handleRemoveFromCalendar(id) : handleSaveToCalendar(id)} onDateClick={handleDateClick} />
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {(activeCategory || selectedDate || searchQuery.trim()) && (
                  <div className="bg-muted/50 rounded-lg p-4 mb-6 border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-medium">Active Filters:</h3>
                        {searchQuery.trim() && <Badge variant="secondary">Search: "{searchQuery.trim()}"</Badge>}
                        {activeCategory && <Badge variant="secondary">Category: {activeCategory}</Badge>}
                        {selectedDate && <Badge variant="secondary">Date: {selectedDate.toLocaleDateString()}</Badge>}
                        <span className="text-xs text-muted-foreground">({eventsForEventView.length} results)</span>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => { setActiveCategory(null); setSelectedDate(null); setSearchQuery(''); }}>Clear Filters</Button>
                    </div>
                  </div>
                )}
                {eventsForEventView.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12 border rounded-lg">No events match your current filters.<div className="mt-2 text-xs">Try a different date or clear filters.</div></div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {eventsForEventView.map(event => <EventCard key={event.id} event={event} onSaveToCalendar={handleSaveToCalendar} />)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {!hasAnyEvents && (
          <div className="mt-12 text-center p-12">
            <Calendar className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2 text-gray-700">No Events Yet</h3>
            <p className="text-gray-500">Events load automatically on startup and when filters change.</p>
          </div>
        )}
      </main>
    </div>
  );
};
