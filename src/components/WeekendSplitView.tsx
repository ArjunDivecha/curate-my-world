import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, cleanHtmlText } from "@/lib/utils";
import { getCategoryColor } from "@/utils/categoryColors";
import { CalendarDays, Clock, BookmarkCheck, ExternalLink } from "lucide-react";
import { parseEventDateLocalAware, sameLocalDay } from "@/lib/dateViewRanges";

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

interface WeekendSplitViewProps {
  events: Event[];
  savedEvents?: Event[];
  onEventToggleSaved: (eventId: string) => void;
  title?: string;
  friday: Date;
  saturday: Date;
  sunday: Date;
  onDateClick?: (date: Date) => void;
}

const laneKeyForEvent = (event: Event) => {
  const raw = [event.source, ...(event.categories || [])]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  const keys = ["music", "theatre", "comedy", "movies", "art", "food", "tech", "lectures", "kids", "desi", "dance", "lgbtq"];
  for (const key of keys) {
    if (raw.includes(key)) return key;
  }
  if (raw.includes("technology")) return "tech";
  return (event.categories?.[0] || "music").toLowerCase();
};

const formatTime = (dateString: string) => {
  try {
    if (!dateString) return "Time TBD";
    const parsed = parseEventDateLocalAware(dateString);
    if (!parsed || isNaN(parsed.getTime())) return "Time TBD";
    return parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return "Time TBD";
  }
};

const openEventUrl = (event: Event) => {
  const url = event.eventUrl || event.ticketUrl;
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
};

export const WeekendSplitView = ({
  events,
  savedEvents = [],
  onEventToggleSaved,
  title = "Weekend View",
  friday,
  saturday,
  sunday,
  onDateClick,
}: WeekendSplitViewProps) => {
  const isSaved = (eventId: string) => savedEvents.some((event) => event.id === eventId);

  const columns = useMemo(() => {
    const fridayEvents: Event[] = [];
    const saturdayEvents: Event[] = [];
    const sundayEvents: Event[] = [];

    for (const event of events) {
      if (!event.startDate) continue;
      const date = parseEventDateLocalAware(event.startDate);
      if (!date || isNaN(date.getTime())) continue;

      if (sameLocalDay(date, friday)) {
        if (date.getHours() >= 17) fridayEvents.push(event);
        continue;
      }
      if (sameLocalDay(date, saturday)) {
        saturdayEvents.push(event);
        continue;
      }
      if (sameLocalDay(date, sunday)) {
        sundayEvents.push(event);
      }
    }

    const byStartDate = (a: Event, b: Event) => String(a.startDate).localeCompare(String(b.startDate));
    fridayEvents.sort(byStartDate);
    saturdayEvents.sort(byStartDate);
    sundayEvents.sort(byStartDate);

    return [
      { key: "fri", label: "Fri Evening", date: friday, events: fridayEvents },
      { key: "sat", label: "Saturday", date: saturday, events: saturdayEvents },
      { key: "sun", label: "Sunday", date: sunday, events: sundayEvents },
    ];
  }, [events, friday, saturday, sunday]);

  const total = columns.reduce((sum, column) => sum + column.events.length, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            {title}
            <span className="text-sm text-muted-foreground font-normal">({total} events)</span>
          </CardTitle>
        </CardHeader>
      </Card>

      {total === 0 ? (
        <div className="text-center text-muted-foreground py-12 border rounded-lg bg-white/60">
          No events found for Fri evening through Sunday.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {columns.map((column) => (
            <Card key={column.key} className="overflow-hidden">
              <CardHeader className="pb-3">
                <button
                  type="button"
                  className="w-full rounded-lg text-left px-1 py-1 hover:bg-muted/40 transition"
                  onClick={() => onDateClick?.(column.date)}
                  title="Open this day in Event View"
                >
                  <div className="text-sm font-semibold">{column.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {column.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </button>
                <Badge variant="secondary">{column.events.length} events</Badge>
              </CardHeader>
              <CardContent className="pt-0">
                {column.events.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-2">No events.</div>
                ) : (
                  <div className="space-y-2">
                    {column.events.map((event) => {
                      const category = laneKeyForEvent(event);
                      const colors = getCategoryColor(category);
                      const saved = isSaved(event.id);
                      return (
                        <div
                          key={event.id}
                          className={cn(
                            "rounded-xl border px-3 py-2 cursor-pointer transition",
                            colors.background,
                            colors.border,
                            colors.text,
                            colors.hover
                          )}
                          onClick={() => openEventUrl(event)}
                          title="Open event details"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className={cn("text-xs font-semibold truncate", colors.text)}>{cleanHtmlText(event.title)}</div>
                              <div className={cn("mt-1 flex items-center gap-1 text-[11px]", colors.accent)}>
                                <Clock className="h-3 w-3" />
                                <span>{formatTime(event.startDate)}</span>
                              </div>
                              <div className={cn("text-[11px] truncate mt-1", colors.accent)}>{event.venue?.name}</div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={cn("h-7 px-2 bg-white/70 border-white/70 hover:bg-white", colors.text)}
                                onClick={(eventClick) => {
                                  eventClick.preventDefault();
                                  eventClick.stopPropagation();
                                  openEventUrl(event);
                                }}
                                title="Open event page"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={cn("h-7 px-2 bg-white/70 border-white/70 hover:bg-white", colors.text, saved ? "border-primary/40" : "")}
                                onClick={(eventClick) => {
                                  eventClick.preventDefault();
                                  eventClick.stopPropagation();
                                  onEventToggleSaved(event.id);
                                }}
                                title={saved ? "Unsave" : "Save"}
                              >
                                {saved ? <BookmarkCheck className="h-3.5 w-3.5 text-primary" /> : <span>Save</span>}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
