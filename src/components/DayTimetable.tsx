import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, cleanHtmlText } from "@/lib/utils";
import { parseEventDateLocalAware } from "@/lib/dateViewRanges";
import { getCategoryColor } from "@/utils/categoryColors";
import { CalendarDays, Clock, BookmarkCheck } from "lucide-react";

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

interface DayTimetableProps {
  events: Event[];
  savedEvents?: Event[];
  onEventToggleSaved: (eventId: string) => void;
  title?: string;
  initialSelectedDay?: Date | null;
  renderMode?: "timetable" | "compact-table";
}

const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const sameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

const fmtTime = (dateString: string) => {
  try {
    if (!dateString) return "Time TBD";
    const d = parseEventDateLocalAware(dateString);
    if (!d) return "Time TBD";
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
  const raw = [event.source, ...(event.categories || [])].filter(Boolean).map((s) => String(s).toLowerCase());
  const keys = ["music", "theatre", "comedy", "movies", "art", "food", "tech", "lectures", "kids", "desi"];
  for (const k of keys) {
    if (raw.includes(k)) return k;
  }
  if (raw.includes("technology")) return "tech";
  return (event.categories?.[0] || "music").toLowerCase();
};

const laneLabel: Record<string, string> = {
  music: "Music",
  theatre: "Theatre",
  comedy: "Comedy",
  movies: "Movies",
  art: "Art",
  food: "Food",
  tech: "Tech",
  lectures: "Lectures",
  kids: "Kids",
  desi: "Desi",
};

const LANE_ORDER = ["music", "theatre", "comedy", "movies", "art", "food", "tech", "lectures", "kids", "desi"];
const MAX_VISIBLE_OVERLAP_COLUMNS = 3;

interface LaneLayoutEvent {
  event: Event;
  top: number;
  height: number;
  columnIndex: number;
  columnsInGroup: number;
}

interface LaneOverflowMarker {
  id: string;
  top: number;
  hiddenEvents: number;
}

const computeLaneLayout = (
  laneEvents: Event[],
  timelineStartMin: number,
  pxPerMin: number
): { events: LaneLayoutEvent[]; overflowMarkers: LaneOverflowMarker[] } => {
  const prepared = laneEvents
    .map((event) => {
      const start = parseEventDateLocalAware(event.startDate);
      if (!start) return null;
      const startMin = minutesOfDay(start);
      let endMin = startMin + 60;
      if (event.endDate) {
        const en = parseEventDateLocalAware(event.endDate);
        if (en) {
          const maybe = minutesOfDay(en);
          if (maybe > startMin) endMin = maybe;
        }
      }
      return { event, startMin, endMin };
    })
    .filter((item): item is { event: Event; startMin: number; endMin: number } => !!item)
    .sort((a, b) => (a.startMin - b.startMin) || (a.endMin - b.endMin));

  const laidOut: LaneLayoutEvent[] = [];
  const overflowMarkers: LaneOverflowMarker[] = [];

  let groupItems: typeof prepared = [];
  let groupEndMin = -1;
  let groupStartMin = -1;

  const flushGroup = (groupIndex: number) => {
    if (!groupItems.length) return;

    const columnEndMins: number[] = [];
    const groupEventIndices: number[] = [];

    for (const item of groupItems) {
      let columnIndex = columnEndMins.findIndex((endMin) => endMin <= item.startMin);
      if (columnIndex === -1) {
        columnIndex = columnEndMins.length;
        columnEndMins.push(item.endMin);
      } else {
        columnEndMins[columnIndex] = item.endMin;
      }

      const top = (item.startMin - timelineStartMin) * pxPerMin;
      const height = Math.max(44, (item.endMin - item.startMin) * pxPerMin);
      laidOut.push({
        event: item.event,
        top,
        height,
        columnIndex,
        columnsInGroup: 1,
      });
      groupEventIndices.push(laidOut.length - 1);
    }

    const columnsInGroup = Math.max(1, columnEndMins.length);
    for (const idx of groupEventIndices) {
      laidOut[idx].columnsInGroup = columnsInGroup;
    }

    if (columnsInGroup > MAX_VISIBLE_OVERLAP_COLUMNS) {
      const hiddenEvents = groupEventIndices.reduce((count, idx) => (
        laidOut[idx].columnIndex >= MAX_VISIBLE_OVERLAP_COLUMNS ? count + 1 : count
      ), 0);

      if (hiddenEvents > 0) {
        overflowMarkers.push({
          id: `group-${groupIndex}`,
          top: Math.max(0, (groupStartMin - timelineStartMin) * pxPerMin + 4),
          hiddenEvents,
        });
      }
    }

    groupItems = [];
    groupEndMin = -1;
    groupStartMin = -1;
  };

  let groupIndex = 0;
  for (const item of prepared) {
    if (!groupItems.length) {
      groupItems.push(item);
      groupStartMin = item.startMin;
      groupEndMin = item.endMin;
      continue;
    }

    if (item.startMin < groupEndMin) {
      groupItems.push(item);
      groupEndMin = Math.max(groupEndMin, item.endMin);
    } else {
      flushGroup(groupIndex++);
      groupItems.push(item);
      groupStartMin = item.startMin;
      groupEndMin = item.endMin;
    }
  }
  flushGroup(groupIndex);

  return { events: laidOut, overflowMarkers };
};

export const DayTimetable = ({
  events,
  savedEvents = [],
  onEventToggleSaved,
  title = "Day View",
  initialSelectedDay = null,
  renderMode = "timetable",
}: DayTimetableProps) => {
  const [selectedDay, setSelectedDay] = useState(() =>
    initialSelectedDay && !isNaN(initialSelectedDay.getTime())
      ? startOfLocalDay(initialSelectedDay)
      : startOfLocalDay(new Date())
  );

  const isEventSaved = (eventId: string) => savedEvents.some((e) => e.id === eventId);

  const availableDates = useMemo(() => {
    const set = new Map<string, Date>();
    for (const e of events) {
      if (!e.startDate) continue;
      const d = parseEventDateLocalAware(e.startDate);
      if (!d) continue;
      const day = startOfLocalDay(d);
      set.set(day.toDateString(), day);
    }
    // Ensure "today" is present even if empty.
    const today = startOfLocalDay(new Date());
    set.set(today.toDateString(), today);
    if (initialSelectedDay && !isNaN(initialSelectedDay.getTime())) {
      const initial = startOfLocalDay(initialSelectedDay);
      set.set(initial.toDateString(), initial);
    }

    const arr = Array.from(set.values()).sort((a, b) => a.getTime() - b.getTime());
    // Limit to a reasonable horizon to keep the scroller usable.
    const maxItems = 90;
    const limited = arr.slice(0, maxItems);
    if (initialSelectedDay && !isNaN(initialSelectedDay.getTime())) {
      const initial = startOfLocalDay(initialSelectedDay);
      if (!limited.some((d) => sameLocalDay(d, initial))) {
        limited.push(initial);
        limited.sort((a, b) => a.getTime() - b.getTime());
      }
    }
    return limited;
  }, [events, initialSelectedDay]);

  // If the currently selected day isn't in the available list anymore (filters changed), fall back to today.
  React.useEffect(() => {
    const exists = availableDates.some((d) => sameLocalDay(d, selectedDay));
    if (!exists) setSelectedDay(startOfLocalDay(new Date()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableDates.map((d) => d.toDateString()).join("|")]);

  React.useEffect(() => {
    if (!initialSelectedDay || isNaN(initialSelectedDay.getTime())) return;
    setSelectedDay(startOfLocalDay(initialSelectedDay));
  }, [initialSelectedDay]);

  const dayEvents = useMemo(() => {
    return events
      .filter((e) => {
        if (!e.startDate) return false;
        const d = parseEventDateLocalAware(e.startDate);
        if (!d) return false;
        return sameLocalDay(d, selectedDay);
      })
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  }, [events, selectedDay]);

  const lanes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of dayEvents) {
      const k = laneKeyForEvent(e);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return LANE_ORDER.filter((k) => (counts.get(k) || 0) > 0).map((k) => ({ key: k, count: counts.get(k) || 0 }));
  }, [dayEvents]);

  const timeRange = useMemo(() => {
    if (!dayEvents.length) {
      return { startMin: 10 * 60, endMin: 22 * 60 };
    }

    let earliest = 24 * 60;
    let latest = 0;

    for (const e of dayEvents) {
      const s = parseEventDateLocalAware(e.startDate);
      if (!s) continue;
      const startMin = minutesOfDay(s);
      let endMin = startMin + 60;
      if (e.endDate) {
        const en = parseEventDateLocalAware(e.endDate);
        if (en) {
          const maybe = minutesOfDay(en);
          if (maybe > startMin) endMin = maybe;
        }
      }
      earliest = Math.min(earliest, startMin);
      latest = Math.max(latest, endMin);
    }

    // pad & clamp; align to hours for clean grid
    const pad = 60;
    const start = clamp(Math.floor((earliest - pad) / 60) * 60, 6 * 60, 22 * 60);
    const end = clamp(Math.ceil((latest + pad) / 60) * 60, start + 8 * 60, 23 * 60);
    return { startMin: start, endMin: end };
  }, [dayEvents]);

  const PX_PER_MIN = 1; // 60px per hour
  const totalMin = timeRange.endMin - timeRange.startMin;
  const timelineHeight = Math.max(480, totalMin * PX_PER_MIN);

  const hours = useMemo(() => {
    const out: number[] = [];
    for (let m = timeRange.startMin; m <= timeRange.endMin; m += 60) out.push(m);
    return out;
  }, [timeRange]);

  const eventsByLane = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const lane of LANE_ORDER) map.set(lane, []);
    for (const e of dayEvents) {
      const k = laneKeyForEvent(e);
      map.get(k)?.push(e);
    }
    return map;
  }, [dayEvents]);

  const laneLayouts = useMemo(() => {
    const map = new Map<string, { events: LaneLayoutEvent[]; overflowMarkers: LaneOverflowMarker[] }>();
    for (const lane of lanes) {
      map.set(
        lane.key,
        computeLaneLayout(eventsByLane.get(lane.key) || [], timeRange.startMin, PX_PER_MIN)
      );
    }
    return map;
  }, [lanes, eventsByLane, timeRange.startMin]);

  if (renderMode === "compact-table") {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              {title}
              <span className="text-sm text-muted-foreground font-normal">
                ({dayEvents.length} events on {selectedDay.toLocaleDateString()})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dayEvents.length === 0 ? (
              <div className="text-center text-muted-foreground py-10 border rounded-lg bg-white/60">
                No events on {selectedDay.toLocaleDateString()}.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-700">Time</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-700">Event</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-700">Category</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-700">Venue</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-700">Save</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayEvents.map((event) => {
                      const saved = isEventSaved(event.id);
                      const categoryKey = laneKeyForEvent(event);
                      const category = laneLabel[categoryKey] || (event.categories?.[0] ?? "Other");
                      return (
                        <tr key={event.id} className="border-b last:border-b-0 hover:bg-slate-50/70">
                          <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtTime(event.startDate)}</td>
                          <td className="px-4 py-3 min-w-[220px]">
                            <button
                              type="button"
                              className="text-left font-medium text-slate-900 hover:underline"
                              onClick={() => openEventUrl(event)}
                              title="Open event"
                            >
                              {cleanHtmlText(event.title)}
                            </button>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-700">{category}</td>
                          <td className="px-4 py-3 text-slate-700">{event.venue?.name || "Venue TBD"}</td>
                          <td className="px-4 py-3">
                            <Button
                              type="button"
                              variant={saved ? "secondary" : "outline"}
                              size="sm"
                              onClick={() => onEventToggleSaved(event.id)}
                            >
                              {saved ? "Saved" : "Save"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              {title}
              <span className="text-sm text-muted-foreground font-normal">
                ({dayEvents.length} events on {selectedDay.toLocaleDateString()})
              </span>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDay(startOfLocalDay(new Date()))}
              title="Jump to today"
            >
              Today
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Date scroller */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {availableDates.map((d) => {
              const selected = sameLocalDay(d, selectedDay);
              const isToday = sameLocalDay(d, startOfLocalDay(new Date()));
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => setSelectedDay(startOfLocalDay(d))}
                  className={cn(
                    "shrink-0 rounded-2xl border px-3 py-2 text-left min-w-[84px] transition",
                    selected ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 hover:bg-slate-50"
                  )}
                  title={d.toLocaleDateString()}
                >
                  <div className={cn("text-[11px] uppercase tracking-wide", selected ? "text-white/75" : "text-slate-500")}>
                    {d.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div className="text-lg font-semibold leading-tight">{d.getDate()}</div>
                  <div className={cn("text-[11px]", selected ? "text-white/75" : "text-slate-500")}>
                    {isToday ? "Today" : d.toLocaleDateString("en-US", { month: "short" })}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {dayEvents.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 border rounded-lg bg-white/60">
          No events on {selectedDay.toLocaleDateString()}.
        </div>
      ) : (
        <div className="rounded-2xl border bg-white/70 overflow-hidden">
          {/* Timetable */}
          <div className="flex">
            {/* Time column */}
            <div className="w-16 sm:w-20 border-r bg-white/70">
              <div className="h-12 border-b bg-white/80 flex items-center justify-end pr-2 text-xs text-muted-foreground">
                Time
              </div>
              <div style={{ height: timelineHeight }} className="relative">
                {hours.map((m) => {
                  const top = (m - timeRange.startMin) * PX_PER_MIN;
                  const h = Math.floor(m / 60);
                  const hh = h % 12 || 12;
                  const ap = h < 12 ? "AM" : "PM";
                  return (
                    <div key={m} style={{ top }} className="absolute left-0 right-0 h-[60px]">
                      <div className="h-full flex items-start justify-end pr-2 pt-1 text-[11px] text-slate-500">
                        {hh} {ap}
                      </div>
                      <div className="absolute left-0 right-0 bottom-0 h-px bg-slate-200/60" />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Lanes (horizontally scrollable) */}
            <div className="flex-1 overflow-x-auto">
              <div className="flex min-w-max">
                {lanes.map((lane) => {
                  const colors = getCategoryColor(lane.key);
                  const laneLayout = laneLayouts.get(lane.key) || { events: [], overflowMarkers: [] };
                  return (
                    <div key={lane.key} className="w-[260px] sm:w-[300px] border-r last:border-r-0">
                      <div className={cn("h-12 border-b bg-white/80 px-3 flex items-center justify-between")}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={cn("inline-block h-2 w-2 rounded-full bg-current", colors.accent)} />
                          <span className="font-semibold text-sm truncate">{laneLabel[lane.key] || lane.key}</span>
                        </div>
                        <Badge variant="secondary" className={cn(colors.background, colors.border, colors.text)}>
                          {lane.count}
                        </Badge>
                      </div>

                      <div className="relative bg-white/60" style={{ height: timelineHeight }}>
                        {/* grid lines */}
                        {hours.map((m) => {
                          const top = (m - timeRange.startMin) * PX_PER_MIN;
                          return <div key={m} style={{ top }} className="absolute left-0 right-0 h-px bg-slate-200/60" />;
                        })}

                        {laneLayout.events.map((layoutEvent) => {
                          const { event, top, height, columnIndex, columnsInGroup } = layoutEvent;
                          const visibleColumns = Math.min(columnsInGroup, MAX_VISIBLE_OVERLAP_COLUMNS);
                          if (columnIndex >= visibleColumns) return null;
                          const columnWidthPct = 100 / visibleColumns;
                          const left = `calc(${columnIndex * columnWidthPct}% + 4px)`;
                          const width = `calc(${columnWidthPct}% - 6px)`;
                          const saved = isEventSaved(event.id);
                          const compactCard = visibleColumns >= 3;

                          return (
                            <div
                              key={event.id}
                              className={cn(
                                "absolute rounded-xl border shadow-sm cursor-pointer overflow-hidden",
                                colors.border,
                                colors.background
                              )}
                              style={{ top, height, left, width, zIndex: 20 + columnIndex }}
                              onClick={() => openEventUrl(event)}
                              title="Tap to open event"
                            >
                              <div className={cn("absolute left-0 top-0 bottom-0 w-2 bg-current", colors.accent)} />
                              <div className="pl-4 pr-2 py-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className={cn("text-xs font-semibold", compactCard ? "line-clamp-1" : "line-clamp-2", colors.text)}>
                                      {cleanHtmlText(event.title)}
                                    </div>
                                    <div className={cn("mt-1 flex items-center gap-1 text-[11px]", colors.accent)}>
                                      <Clock className="h-3 w-3" />
                                      <span>{fmtTime(event.startDate)}</span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    className={cn(
                                      "shrink-0 rounded-lg border bg-white/70 hover:bg-white px-2 py-1 text-[11px]",
                                      compactCard ? "px-1.5 py-0.5 text-[10px]" : "",
                                      colors.text,
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

                                {(!compactCard || height >= 72) && (
                                  <div className={cn("mt-1 text-[11px] truncate", colors.accent)}>{event.venue?.name}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {laneLayout.overflowMarkers.map((marker) => (
                          <div key={marker.id} className="absolute right-2 z-40" style={{ top: marker.top }}>
                            <Badge className="bg-slate-900/85 text-white border-slate-700 text-[10px] px-1.5 py-0.5">
                              +{marker.hiddenEvents} overlaps
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* If filters result in events with no recognized categories */}
                {lanes.length === 0 && (
                  <div className="p-6 text-sm text-muted-foreground">No categorized events for this day.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
