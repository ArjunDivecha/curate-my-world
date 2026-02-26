import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Search, MapPin, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Drawer, DrawerContent, DrawerTrigger, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

interface CommandBarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  dateQuery: string;
  setDateQuery: (q: string) => void;
  datePreset: string | null;
  setDatePreset: (p: any) => void;
  selectedDate: Date | null;
  setSelectedDate: (d: Date | null) => void;
  onApplyDate: () => void;
  location: string;
}

export const CommandBar = ({
  searchQuery, setSearchQuery, 
  dateQuery, setDateQuery, 
  datePreset, setDatePreset,
  selectedDate, setSelectedDate,
  onApplyDate, location
}: CommandBarProps) => {
  const isMobile = useIsMobile();

  const presets = [
    { label: 'Today', id: 'today' },
    { label: 'Next 7 Days', id: 'week' },
    { label: 'This Weekend', id: 'weekend' },
    { label: 'Next 30 Days', id: '30d' }
  ];

  const DateContent = () => (
    <div className="p-4 bg-white">
      <div className="grid grid-cols-2 gap-2 mb-6">
        {presets.map(p => (
          <Button 
            key={p.id} 
            variant="ghost" 
            className={cn(
              "rounded-xl h-12 font-bold justify-start px-4 text-sm active:scale-95 transition-transform",
              datePreset === p.id ? "bg-indigo-50 text-indigo-700 active:bg-indigo-100" : "bg-slate-50 hover:bg-slate-100"
            )}
            onClick={() => { setDatePreset(p.id); setSelectedDate(null); }}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="border-t pt-6">
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em] mb-4 px-2">Pick a specific date</p>
        <div className="flex justify-center bg-slate-50/50 rounded-3xl p-2 border border-slate-100">
          <CalendarPicker
            mode="single"
            selected={selectedDate || undefined}
            onSelect={(d) => { if (d) { setSelectedDate(d); setDatePreset(null); } }}
            className="rounded-3xl"
          />
        </div>
      </div>
      {isMobile && (
        <DrawerClose asChild>
          <Button className="w-full mt-8 h-14 rounded-2xl bg-slate-900 text-white font-black text-sm active:scale-[0.98] transition-all">
            DONE
          </Button>
        </DrawerClose>
      )}
    </div>
  );

  return (
    <div className="w-full bg-white rounded-[32px] md:rounded-full shadow-[0_8px_40px_rgba(0,0,0,0.06)] border border-slate-100 p-2 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-1">
        {/* Search Input */}
        <div className="flex-1 flex items-center px-5 py-3 md:py-2 gap-4 min-w-0 group border-b md:border-b-0 border-slate-50">
          <Search className="w-5 h-5 text-slate-400 shrink-0 group-focus-within:text-indigo-500 transition-colors" />
          <div className="flex-1 relative">
            <Input 
              className="border-none bg-transparent shadow-none focus-visible:ring-0 p-0 text-slate-800 font-bold placeholder:text-slate-400 h-10 text-base"
              placeholder='Search events or venues (e.g. "de young", venue:fox, -kids)'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-400 active:scale-90 transition-transform">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="hidden md:block w-px h-10 bg-slate-100 shrink-0 mx-1" />

        {/* Date Selector */}
        {isMobile ? (
          <Drawer>
            <DrawerTrigger asChild>
              <button className="flex items-center px-5 py-4 gap-4 active:bg-slate-50 transition-colors rounded-2xl group text-left border-b md:border-b-0 border-slate-50">
                <Calendar className="w-5 h-5 text-slate-400 shrink-0 group-active:text-indigo-500 transition-colors" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-1.5">When</p>
                  <p className="text-slate-800 font-black truncate leading-none h-4">
                    {selectedDate ? selectedDate.toLocaleDateString() : (presets.find(p => p.id === datePreset)?.label || 'Add dates')}
                  </p>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
            </DrawerTrigger>
            <DrawerContent className="rounded-t-[32px] px-2 pb-[env(safe-area-inset-bottom,24px)]">
              <div className="mx-auto w-12 h-1.5 rounded-full bg-slate-200 mt-3 mb-2" />
              <DrawerHeader className="px-6 text-left">
                <DrawerTitle className="text-2xl font-black text-slate-900 tracking-tight">Select Date</DrawerTitle>
              </DrawerHeader>
              <DateContent />
            </DrawerContent>
          </Drawer>
        ) : (
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex-none w-64 flex items-center px-5 py-3 gap-4 hover:bg-slate-50 transition-colors rounded-full group text-left overflow-hidden">
                <Calendar className="w-5 h-5 text-slate-400 shrink-0 group-hover:text-indigo-500 transition-colors" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-1.5">When</p>
                  <p className="text-slate-800 font-black truncate leading-none h-4">
                    {selectedDate ? selectedDate.toLocaleDateString() : (presets.find(p => p.id === datePreset)?.label || 'Add dates')}
                  </p>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[360px] p-0 rounded-[32px] shadow-2xl border-slate-100 mt-4 overflow-hidden" align="center">
              <DateContent />
            </PopoverContent>
          </Popover>
        )}

        <div className="hidden md:block w-px h-10 bg-slate-100 shrink-0 mx-1" />

        {/* Location Display */}
        <div className="flex items-center px-5 py-4 md:py-3 gap-4 active:bg-slate-50 md:hover:bg-slate-50 transition-colors rounded-2xl md:rounded-full group text-left">
          <MapPin className="w-5 h-5 text-slate-400 shrink-0 group-active:text-rose-500 md:group-hover:text-rose-500 transition-colors" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-1.5">Where</p>
            <p className="text-slate-800 font-black truncate leading-none h-4">{location}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
