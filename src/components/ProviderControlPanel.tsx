import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { ProviderStatSummary } from "./FetchEventsButton";

interface ProviderMeta {
  key: string;
  label: string;
  description: string;
  costHint?: string;
}

interface ProviderControlPanelProps {
  selectedProviders: Record<string, boolean>;
  onToggleProvider: (providerKey: string, enabled: boolean) => void;
  providerDetails?: ProviderStatSummary[];
  isLoading?: boolean;
  totalProcessingTime?: number;
}

const PROVIDER_LIBRARY: ProviderMeta[] = [
  {
    key: "ticketmaster",
    label: "Ticketmaster",
    description: "Official Ticketmaster Discovery API — 1,600+ structured Bay Area events",
    costHint: "Free"
  },
  {
    key: "venue_scraper",
    label: "Venue Scraper",
    description: "Events scraped from 197 whitelisted venue calendars (daily refresh)",
    costHint: "Free"
  },
  {
    key: "whitelist",
    label: "Whitelist (Legacy)",
    description: "Legacy web search across trusted domains — may include listing pages",
    costHint: "Free"
  },
];

const formatSeconds = (ms: number | undefined) => {
  if (!ms || ms <= 0) return "–";
  return `${(ms / 1000).toFixed(1)}s`;
};

const formatCost = (cost: number | undefined) => {
  if (cost === undefined || cost === null) return "–";
  if (cost === 0) return "$0.000";
  return `$${cost.toFixed(3)}`;
};

const ProviderControlPanel: React.FC<ProviderControlPanelProps> = ({
  selectedProviders,
  onToggleProvider,
  providerDetails,
  isLoading,
  totalProcessingTime
}) => {
  const detailMap = useMemo(() => {
    const map: Record<string, ProviderStatSummary> = {};
    (providerDetails || []).forEach(detail => {
      map[detail.provider] = detail;
    });
    return map;
  }, [providerDetails]);

  const totals = useMemo(() => {
    const original = (providerDetails || []).reduce((sum, detail) => sum + (detail.originalCount || 0), 0);
    const unique = (providerDetails || []).reduce((sum, detail) => sum + (detail.survivedCount || 0), 0);
    // Use backend total processing time instead of summing individual provider times
    const timeMs = totalProcessingTime || 0;
    const cost = (providerDetails || []).reduce((sum, detail) => sum + (detail.cost || 0), 0);
    return {
      original,
      unique,
      timeMs,
      cost
    };
  }, [providerDetails, totalProcessingTime]);

  return (
    <Card className="w-full shadow-sm border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">Data Sources</CardTitle>
        <p className="text-sm text-muted-foreground">
          Toggle providers to control coverage, runtime, and cost. Stats refresh after each fetch.
        </p>
      </CardHeader>
      <Separator className="mx-6" />
      <CardContent className="pt-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          {PROVIDER_LIBRARY.map(meta => {
            const detail = detailMap[meta.key];
            const enabled = !!selectedProviders?.[meta.key];
            const status = detail?.success ? "Active" : detail && detail.originalCount > 0 ? "No uniques" : "Idle";
            return (
              <div
                key={meta.key}
                className="border border-border/60 rounded-lg p-4 bg-muted/20 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`provider-${meta.key}`}
                        checked={enabled}
                        disabled={isLoading}
                        onCheckedChange={(checked) => onToggleProvider(meta.key, checked)}
                      />
                      <Label htmlFor={`provider-${meta.key}`} className="font-semibold">
                        {meta.label}
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      {meta.description}
                    </p>
                    {meta.costHint && (
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        Cost hint: {meta.costHint}
                      </p>
                    )}
                  </div>
                  <Badge variant={detail?.success ? "default" : "secondary"} className="text-[11px]">
                    {status}
                  </Badge>
                </div>
                <div className="text-xs grid grid-cols-2 gap-y-1">
                  <span className="text-muted-foreground">Original</span>
                  <span className="font-medium text-right">{detail?.originalCount ?? 0}</span>
                  <span className="text-muted-foreground">Unique</span>
                  <span className="font-medium text-right">{detail?.survivedCount ?? 0}</span>
                  <span className="text-muted-foreground">Duplicates</span>
                  <span className="font-medium text-right">{detail?.duplicatesRemoved ?? 0}</span>
                  <span className="text-muted-foreground">Runtime</span>
                  <span className="font-medium text-right">{formatSeconds(detail?.processingTime)}</span>
                  <span className="text-muted-foreground">Cost</span>
                  <span className="font-medium text-right">{formatCost(detail?.cost)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <Separator />
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div>
            <span className="font-semibold text-foreground">Unique events:</span> {totals.unique}
          </div>
          <div>
            <span className="font-semibold text-foreground">Source total:</span> {totals.original}
          </div>
          <div>
            <span className="font-semibold text-foreground">Runtime:</span> {formatSeconds(totals.timeMs)}
          </div>
          <div>
            <span className="font-semibold text-foreground">Cost:</span> {formatCost(totals.cost)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export { ProviderControlPanel };
