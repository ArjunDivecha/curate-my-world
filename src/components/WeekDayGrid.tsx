import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { cleanHtmlText } from "@/lib/utils";
import { getCategoryColor } from "@/utils/categoryColors";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, BookmarkCheck, ExternalLink } from "lucide-react";

interface Event {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  venue: { name: string; address: string };
  personalRelevanceScore: number;
  categories: string[];
  ticketUrl?: string;
  eventUrl?: string;
  source?: string;
}

interface WeekDayGridProps {
  events: Event[];
  savedEvents?: Event[];
  onEventToggleSaved: (eventId: string) => void;
  onDateClick?: (date: Date) => void;
  title?: string;
}

const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const sameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const getWeekDates = (anchor: Date) => {
  const week: Date[] = [];
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay()); // Sunday
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    week.push(day);
  }
  return week;
};

const formatTime = (dateString: string) => {
  try {
    if (!dateString) return "Time TBD";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "Time TBD";
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return "Time TBD";
  }
};

const openEventUrl = (event: Event) => {
  const url = event.eventUrl || event.ticketUrl;
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
};

const laneKeyForEvent = (event: Event) => {
  const raw = [event.source, ...(event.categories || [])]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  // Keep this aligned with backend bucket keys.
  const keys = ["music", "theatre", "comedy", "movies", "art", "food", "tech", "lectures", "kids"];
  for (const k of keys) {
    if (raw.includes(k)) return k;
  }
  // tolerate tech -> technology mismatch from older data
  if (raw.includes("technology")) return "tech";
  return (event.categories?.[0] || "music").toLowerCase();
};

export const WeekDayGrid = ({ events, savedEvents = [], onEventToggleSaved, onDateClick, title = "Week View" }: WeekDayGridProps) => {
  const [currentWeek, setCurrentWeek] = useState(() => startOfLocalDay(new Date()));
  const [moreDate, setMoreDate] = useState<Date | null>(null);

  const weekDates = useMemo(() => getWeekDates(currentWeek), [currentWeek]);

  const isEventSaved = (eventId: string) => savedEvents.some((e) => e.id === eventId);

  const eventsForDate = (date: Date) => {
    const day = startOfLocalDay(date);
    return events
      .filter((e) => {
        if (!e.startDate) return false;
        const d = new Date(e.startDate);
        if (isNaN(d.getTime())) return false;
        return sameLocalDay(d, day);
      })
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  };

  const moreEvents = useMemo(() => (moreDate ? eventsForDate(moreDate) : []), [moreDate, events]);

  const navigate = (dir: "prev" | "next") => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + (dir === "next" ? 7 : -7));
    setCurrentWeek(startOfLocalDay(d));
  };

  const weekLabel = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekDates[6].toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" }
  )}`;

  const MAX = 3;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              {title}
              <span className="text-sm text-muted-foreground font-normal">({events.length} events)</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate("prev")} aria-label="Previous week">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium px-2 sm:px-4">{weekLabel}</span>
              <Button variant="outline" size="sm" onClick={() => navigate("next")} aria-label="Next week">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
        {weekDates.map((date) => {
          const dayEvents = eventsForDate(date);
          const isToday = date.toDateString() === new Date().toDateString();
          const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
          return (
            <Card key={date.toISOString()} className={cn("overflow-hidden", isToday ? "ring-2 ring-primary" : "")}>
              <CardHeader className="pb-2">
                <button
                  type="button"
                  className="w-full text-left rounded-lg px-2 py-2 hover:bg-muted/40 transition"
                  onClick={() => onDateClick?.(date)}
                  title="Click to open this day in Event View"
                >
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{dayName}</div>
                  <div className={cn("text-lg font-semibold leading-tight", isToday ? "text-primary" : "text-foreground")}>{date.getDate()}</div>
                  <div className="text-[11px] text-muted-foreground">{dayEvents.length ? `${dayEvents.length} events` : "No events"}</div>
                </button>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <div className="space-y-2">
                  {dayEvents.slice(0, MAX).map((event) => {
                    const saved = isEventSaved(event.id);
                    const catKey = laneKeyForEvent(event);
                    const colors = getCategoryColor(catKey);
                    return (
                      <div
                        key={event.id}
                        className={cn(
                          "flex items-start gap-2 rounded-xl border px-2 py-2 bg-white/60",
                          colors.border,
                          "hover:bg-white transition cursor-pointer"
                        )}
                        onClick={() => openEventUrl(event)}
                        title="Click to open event"
                      >
                        <span className={cn("mt-1 inline-block h-2 w-2 rounded-full bg-current", colors.accent)} />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-foreground truncate">{cleanHtmlText(event.title)}</div>
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{formatTime(event.startDate)}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={cn(
                            "shrink-0 rounded-lg border px-2 py-1 text-[11px] bg-white/70 hover:bg-white transition",
                            saved ? "border-primary/40" : "border-slate-200"
                          )}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onEventToggleSaved(event.id);
                          }}
                          title={saved ? "Unsave" : "Save"}
                        >
                          {saved ? <BookmarkCheck className="h-4 w-4 text-primary" /> : <span>Save</span>}
                        </button>
                      </div>
                    );
                  })}

                  {dayEvents.length > MAX && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setMoreDate(date)}
                    >
                      + {dayEvents.length - MAX} more
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!moreDate} onOpenChange={(open) => (!open ? setMoreDate(null) : null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {moreDate
                ? moreDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })
                : "Events"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-auto pr-1">
            {moreEvents.map((event) => {
              const saved = isEventSaved(event.id);
              const catKey = laneKeyForEvent(event);
              const colors = getCategoryColor(catKey);
              return (
                <div key={event.id} className={cn("rounded-xl border p-3 bg-white", colors.border)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{cleanHtmlText(event.title)}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(event.startDate)}
                        </span>
                        <span className="truncate">{event.venue?.name}</span>
                      </div>
                      {event.categories?.[0] && (
                        <Badge variant="secondary" className={cn("mt-2", colors.background, colors.border, colors.text)}>
                          {event.categories[0]}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEventUrl(event)}>
                        <ExternalLink className="h-4 w-4" />
                        <span className="ml-2 hidden sm:inline">Open</span>
                      </Button>
                      <Button variant={saved ? "secondary" : "default"} size="sm" onClick={() => onEventToggleSaved(event.id)}>
                        {saved ? "Unsave" : "Save"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
