import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar as CalendarIcon, MapPin, ExternalLink, Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCategoryColor } from "@/utils/categoryColors";

interface ModernEventCardProps {
  event: any;
  onSaveToCalendar: (id: string) => void;
  isSaved?: boolean;
}

export const ModernEventCard = ({ event, onSaveToCalendar, isSaved }: ModernEventCardProps) => {
  const colors = getCategoryColor(event.category || 'all');
  const dateObj = event.startDate ? new Date(event.startDate) : null;
  const formattedDate = dateObj 
    ? dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : 'Date TBD';
  const formattedTime = dateObj 
    ? dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';

  return (
    <Card className="group overflow-hidden border-none bg-white shadow-[0_4px_30px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.08)] transition-all duration-500 rounded-[32px] flex flex-col h-full active:scale-[0.99] md:active:scale-100">
      <div className="relative aspect-[4/3] overflow-hidden">
        {event.imageUrl ? (
          <img 
            src={event.imageUrl} 
            alt={event.title} 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className={cn("w-full h-full flex items-center justify-center bg-slate-50", colors.background)}>
            <div className={cn("w-16 h-16 rounded-3xl flex items-center justify-center bg-white shadow-xl shadow-current/10", colors.text)}>
              <CalendarIcon className="w-8 h-8" />
            </div>
          </div>
        )}
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <Badge className={cn("bg-white/95 backdrop-blur-xl text-slate-900 border-none shadow-xl font-black text-[10px] px-3 py-1.5 rounded-full tracking-widest", colors.text)}>
            {event.price?.type === 'free' ? 'FREE' : event.price?.amount || 'PAID'}
          </Badge>
        </div>
        <button 
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSaveToCalendar(event.id); }}
          className={cn(
            "absolute top-4 right-4 w-12 h-12 rounded-full backdrop-blur-xl transition-all duration-300 shadow-xl flex items-center justify-center active:scale-90",
            isSaved 
              ? "bg-indigo-600 text-white shadow-indigo-200" 
              : "bg-white/90 text-slate-800 hover:bg-white"
          )}
        >
          {isSaved ? <BookmarkCheck className="w-6 h-6" /> : <Bookmark className="w-6 h-6" />}
        </button>
      </div>
      
      <CardContent className="p-7 flex flex-col flex-grow">
        <div className="flex items-center gap-3 mb-4">
          <span className={cn("h-2 w-2 rounded-full", colors.accent.replace('text', 'bg'))} />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
            {event.category || 'Event'}
          </span>
          {event.source && (
            <>
              <div className="w-1 h-1 rounded-full bg-slate-200" />
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                {event.source}
              </span>
            </>
          )}
        </div>
        
        <h3 className="text-xl font-black text-slate-900 leading-[1.2] mb-6 tracking-tight line-clamp-2 group-hover:text-indigo-600 transition-colors">
          {event.title}
        </h3>
        
        <div className="mt-auto space-y-4">
          <div className="flex items-center text-slate-600">
            <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center mr-4 shrink-0">
              <CalendarIcon className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">When</span>
              <span className="text-sm font-bold text-slate-800">{formattedDate} {formattedTime && `• ${formattedTime}`}</span>
            </div>
          </div>
          <div className="flex items-center text-slate-600">
            <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center mr-4 shrink-0">
              <MapPin className="w-5 h-5 text-rose-500" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Where</span>
              <span className="text-sm font-bold text-slate-800 line-clamp-1">{event.venue?.name || 'Venue TBD'}</span>
            </div>
          </div>
        </div>

        {event.eventUrl && (
          <a 
            href={event.eventUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="mt-8 h-14 w-full rounded-2xl bg-slate-50 flex items-center justify-center text-[11px] font-black text-slate-900 tracking-[0.2em] hover:bg-slate-100 active:scale-[0.98] transition-all border border-slate-100"
          >
            VIEW DETAILS
            <ExternalLink className="w-3.5 h-3.5 ml-2" />
          </a>
        )}
      </CardContent>
    </Card>
  );
};
