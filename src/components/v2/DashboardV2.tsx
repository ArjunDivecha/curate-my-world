import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModernEventCard } from "./ModernEventCard";
import { CategoryRail } from "./CategoryRail";
import { CommandBar } from "./CommandBar";
import { DayTimetable } from "../DayTimetable";
import { WeekDayGrid } from "../WeekDayGrid";
import { WeekendSplitView } from "../WeekendSplitView";
import { ThirtyDayAgendaView } from "../ThirtyDayAgendaView";
import { Header } from "../Header";
import { FetchEventsButton } from "../FetchEventsButton";
import { Calendar, Grid3X3, CalendarDays, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { getWeekendRange, startOfLocalDay } from "@/lib/dateViewRanges";
import { useDashboardLogic } from "@/hooks/useDashboardLogic";

export const DashboardV2 = () => {
  const { state, actions, refs } = useDashboardLogic();
  const {
    preferences, savedEvents, activeCategory,
    transformedEventsByCategory, activeTab, selectedDate, selectedProviders,
    backgroundRefreshing, refreshStatusText, searchQuery, dateQuery,
    datePreset, eventsForEventView, filteredCategoryCounts
  } = state;

  const {
    setActiveCategory, setActiveTab, setSelectedDate,
    setSearchQuery, setDateQuery, setDatePreset, setFetcherReady,
    handleBackgroundRefreshing, handleSaveToCalendar, handleRemoveFromCalendar,
    applyTypedDate, handleAllEventsFetched, handleProviderToggle
  } = actions;

  const { fetchEventsRef } = refs;

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setDatePreset(null);
    setDateQuery('');
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
  const dateViewTitle = `Event Schedule`;
  const totalCount = Object.values(filteredCategoryCounts).reduce((sum, count) => sum + count, 0);
  const hasAnyEvents = Object.values(transformedEventsByCategory).some((arr: any) => Array.isArray(arr) && arr.length > 0);

  return (
    <div className="min-h-screen bg-[#F8F9FD] pb-[calc(2rem+env(safe-area-inset-bottom,24px))]">
      <Header 
        onOpenPreferences={() => {}}
        onNavigate={() => {}}
        currentPage="dashboard"
        totalEvents={eventsForEventView.length}
        aiCurationStatus="complete"
      />

      {/* Hero Section */}
      <div className="bg-white border-b border-slate-100 pt-8 md:pt-14 pb-12 md:pb-16 px-4">
        <div className="container mx-auto">
          <div className="max-w-4xl mx-auto text-center mb-10 md:mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] md:text-xs font-black uppercase tracking-[0.15em] mb-6 shadow-sm border border-indigo-100/50">
              <Sparkles className="w-3 h-3" />
              Discover SF Bay Area
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-slate-900 mb-6 tracking-tight leading-[1.1]">
              What's happening <span className="text-indigo-600">today?</span>
            </h1>
            <p className="text-base md:text-xl text-slate-500 font-bold max-w-2xl mx-auto leading-relaxed px-4">
              Your personalized guide to the best events in the Bay. Curated by AI, tailored for you.
            </p>
          </div>

          <CommandBar 
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            dateQuery={dateQuery}
            setDateQuery={setDateQuery}
            datePreset={datePreset}
            setDatePreset={setDatePreset}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            onApplyDate={applyTypedDate}
            location={preferences.location.address}
          />
        </div>
      </div>

      <CategoryRail 
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        categoryCounts={filteredCategoryCounts}
        totalCount={totalCount}
      />

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {backgroundRefreshing && (
          <div className="max-w-5xl mx-auto mb-10 flex items-center gap-4 rounded-[24px] border border-indigo-100 bg-white px-6 py-5 text-sm text-indigo-700 shadow-[0_4px_20px_rgba(79,70,229,0.08)]">
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
              <RefreshCw className="h-4 w-4 animate-spin text-indigo-500" />
            </div>
            <div className="flex flex-col">
              <span className="font-black uppercase tracking-widest text-[10px]">Registry Update</span>
              <span className="text-slate-500 font-bold">Refreshing venue data in background... {refreshStatusText && `(${refreshStatusText})`}</span>
            </div>
          </div>
        )}

        <div className="max-w-5xl mx-auto mb-12 flex items-center justify-between gap-4 bg-slate-100/50 p-1.5 rounded-[22px] border border-slate-200/50">
          <button 
            onClick={() => setActiveTab('events')}
            className={cn(
              "flex-1 md:flex-none px-8 py-3 rounded-[18px] text-[11px] font-black tracking-[0.1em] transition-all active:scale-[0.97]",
              activeTab === 'events' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-white/50"
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <Grid3X3 className="w-4 h-4" />
              <span>GRID</span>
            </div>
          </button>
          <button 
            onClick={() => setActiveTab('date')}
            className={cn(
              "flex-1 md:flex-none px-8 py-3 rounded-[18px] text-[11px] font-black tracking-[0.1em] transition-all active:scale-[0.97]",
              activeTab === 'date' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-white/50"
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <CalendarDays className="w-4 h-4" />
              <span>SCHEDULE</span>
            </div>
          </button>
        </div>

        {hasAnyEvents ? (
          <div className="max-w-7xl mx-auto">
            {activeTab === 'date' ? (
              <div className="bg-white rounded-[32px] p-4 md:p-8 shadow-[0_4px_30px_rgba(0,0,0,0.03)] border border-slate-100">
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
              <div className="space-y-12">
                {eventsForEventView.length === 0 ? (
                  <div className="text-center py-24 bg-white rounded-[40px] border-2 border-dashed border-slate-100 shadow-sm px-6">
                    <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-8">
                      <Search className="w-10 h-10 text-slate-200" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">No events found</h3>
                    <p className="text-slate-500 font-bold max-w-sm mx-auto leading-relaxed">Try adjusting your search terms or picking a different category to see more results.</p>
                    <Button variant="outline" className="mt-10 rounded-2xl font-black px-10 h-14 border-2 active:scale-95 transition-all" onClick={() => { setActiveCategory(null); setSelectedDate(null); setSearchQuery(''); setDatePreset(null); }}>
                      RESET ALL FILTERS
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
                    {eventsForEventView.map(event => (
                      <ModernEventCard 
                        key={event.id} 
                        event={event} 
                        onSaveToCalendar={handleSaveToCalendar}
                        isSaved={!!savedEvents.find(s => s.id === event.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto text-center py-32 bg-white rounded-[40px] shadow-[0_8px_40px_rgba(0,0,0,0.04)] border border-slate-100 px-6">
            <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-8">
              <Calendar className="w-12 h-12 text-indigo-400" />
            </div>
            <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight leading-tight">Curating your experience...</h3>
            <p className="text-slate-500 font-bold mb-12 max-w-xs mx-auto text-lg leading-relaxed">
              We're hand-picking the best local events just for you.
            </p>
            <div className="flex items-center justify-center gap-4">
              <div className="w-3 h-3 rounded-full bg-indigo-200 animate-bounce [animation-delay:-0.3s]" />
              <div className="w-3 h-3 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
              <div className="w-3 h-3 rounded-full bg-indigo-600 animate-bounce" />
            </div>
          </div>
        )}
      </main>

      {/* Persistence Toggle */}
      <div className="fixed bottom-6 right-6 z-50 mb-[env(safe-area-inset-bottom,0px)]">
        <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-700/50 rounded-full pl-5 pr-2 py-2 shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center gap-4 ring-1 ring-white/10">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">VERSION 2.0</span>
          <button 
            onClick={() => window.location.search = '?ui=v1'}
            className="h-10 px-6 rounded-full bg-white text-slate-900 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
          >
            CLASSIC
          </button>
        </div>
      </div>
    </div>
  );
};
