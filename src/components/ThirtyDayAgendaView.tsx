import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, cleanHtmlText } from "@/lib/utils";
import { parseEventDateLocalAware } from "@/lib/dateViewRanges";
import { getCategoryColor } from "@/utils/categoryColors";
import { CalendarDays, Clock, BookmarkCheck, ExternalLink } from "lucide-react";

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

interface ThirtyDayAgendaViewProps {
  events: Event[];
  savedEvents?: Event[];
  onEventToggleSaved: (eventId: string) => void;
  title?: string;
  onDateClick?: (date: Date) => void;
}

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

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

const laneKeyForEvent = (event: Event) => {
  const raw = [event.source, ...(event.categories || [])]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  const keys = ["music", "theatre", "comedy", "movies", "art", "food", "tech", "lectures", "kids"];
  for (const key of keys) {
    if (raw.includes(key)) return key;
  }
  if (raw.includes("technology")) return "tech";
  return (event.categories?.[0] || "music").toLowerCase();
};

export const ThirtyDayAgendaView = ({
  events,
  savedEvents = [],
  onEventToggleSaved,
  title = "Next 30 Days",
  onDateClick,
}: ThirtyDayAgendaViewProps) => {
  const isSaved = (eventId: string) => savedEvents.some((event) => event.id === eventId);

  const sections = useMemo(() => {
    const map = new Map<string, { date: Date; events: Event[] }>();
    for (const event of events) {
      if (!event.startDate) continue;
      const parsed = parseEventDateLocalAware(event.startDate);
      if (!parsed || isNaN(parsed.getTime())) continue;
      const day = startOfLocalDay(parsed);
      const key = day.toDateString();
      if (!map.has(key)) map.set(key, { date: day, events: [] });
      map.get(key)?.events.push(event);
    }

    const rows = Array.from(map.values())
      .map((entry) => ({
        ...entry,
        events: entry.events.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate))),
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return rows;
  }, [events]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            {title}
            <span className="text-sm text-muted-foreground font-normal">({events.length} events)</span>
          </CardTitle>
        </CardHeader>
      </Card>

      {sections.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 border rounded-lg bg-white/60">
          No events found in this 30-day range.
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => (
            <Card key={section.date.toISOString()} className="overflow-hidden">
              <CardHeader className="pb-3">
                <button
                  type="button"
                  className="w-full rounded-lg text-left px-1 py-1 hover:bg-muted/40 transition"
                  onClick={() => onDateClick?.(section.date)}
                  title="Open this day in Event View"
                >
                  <div className="text-sm font-semibold">
                    {section.date.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </button>
                <Badge variant="secondary">{section.events.length} events</Badge>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {section.events.map((event) => {
                  const category = laneKeyForEvent(event);
                  const colors = getCategoryColor(category);
                  const saved = isSaved(event.id);
                  return (
                    <div
                      key={event.id}
                      className={cn("rounded-xl border px-3 py-2 transition", colors.background, colors.border, colors.text, colors.hover)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          className="min-w-0 text-left"
                          onClick={() => openEventUrl(event)}
                          title="Open event details"
                        >
                          <div className={cn("text-sm font-semibold truncate", colors.text)}>{cleanHtmlText(event.title)}</div>
                          <div className={cn("mt-1 flex flex-wrap items-center gap-2 text-xs", colors.accent)}>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatTime(event.startDate)}
                            </span>
                            <span className="truncate">{event.venue?.name}</span>
                          </div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn("h-8 px-2 bg-white/70 border-white/70 hover:bg-white", colors.text)}
                            onClick={() => openEventUrl(event)}
                            title="Open event page"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn("h-8 px-2 bg-white/70 border-white/70 hover:bg-white", colors.text, saved ? "border-primary/40" : "")}
                            onClick={() => onEventToggleSaved(event.id)}
                            title={saved ? "Unsave" : "Save"}
                          >
                            {saved ? <BookmarkCheck className="h-3.5 w-3.5 text-primary" /> : <span>Save</span>}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
