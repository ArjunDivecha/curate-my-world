import React from "react";
import { Button } from "@/components/ui/button";
import { Music, Drama, Palette, Coffee, Cpu, Mic2, BookOpen, Baby, Globe, Search, Film } from "lucide-react";
import { getCategoryColor } from "@/utils/categoryColors";
import { cn } from "@/lib/utils";

interface CategoryRailProps {
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  categoryCounts: Record<string, number>;
  totalCount: number;
}

export const CategoryRail = ({ activeCategory, onCategoryChange, categoryCounts, totalCount }: CategoryRailProps) => {
  const categories = [
    { name: 'Music', key: 'music', icon: Music },
    { name: 'Theatre', key: 'theatre', icon: Drama },
    { name: 'Comedy', key: 'comedy', icon: Mic2 },
    { name: 'Movies', key: 'movies', icon: Film },
    { name: 'Art', key: 'art', icon: Palette },
    { name: 'Food', key: 'food', icon: Coffee },
    { name: 'Tech', key: 'tech', icon: Cpu },
    { name: 'Lectures', key: 'lectures', icon: BookOpen },
    { name: 'Kids', key: 'kids', icon: Baby },
    { name: 'Desi', key: 'desi', icon: Globe }
  ];

  return (
    <div className="w-full py-4 border-b border-slate-100 bg-white/50 backdrop-blur-sm sticky top-0 z-30 overflow-hidden touch-pan-x">
      <div className="container mx-auto px-0 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 overflow-x-auto px-4 pb-2 no-scrollbar scroll-smooth overscroll-x-contain -webkit-overflow-scrolling-touch">
          <Button
            variant="ghost"
            className={cn(
              "rounded-full px-6 h-11 font-bold transition-all shrink-0 active:scale-95",
              activeCategory === null 
                ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
                : "bg-slate-50 text-slate-600 active:bg-slate-100"
            )}
            onClick={() => onCategoryChange(null)}
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              <span>All ({totalCount})</span>
            </div>
          </Button>

          {categories.map((cat) => {
            const count = categoryCounts[cat.key] || 0;
            const selected = activeCategory === cat.key;
            const colors = getCategoryColor(cat.key);
            const Icon = cat.icon;

            return (
              <Button
                key={cat.key}
                variant="ghost"
                className={cn(
                  "rounded-full px-6 h-11 font-bold transition-all shrink-0 border-none active:scale-95",
                  selected 
                    ? cn("shadow-lg", colors.background, colors.text, "shadow-current/20") 
                    : "bg-slate-50 text-slate-600 active:bg-slate-100"
                )}
                onClick={() => onCategoryChange(cat.key)}
              >
                <div className="flex items-center gap-2">
                  <Icon className={cn("w-4 h-4", selected ? colors.accent : "text-slate-400")} />
                  <span>{cat.name} ({count})</span>
                </div>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
