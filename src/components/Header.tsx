import { CalendarDays } from "lucide-react";

interface HeaderProps {
  onOpenPreferences: () => void;
  onNavigate: (page: string) => void;
  currentPage: string;
  totalEvents: number;
  aiCurationStatus: 'idle' | 'processing' | 'complete';
}

export const Header = ({ onOpenPreferences, onNavigate, currentPage, totalEvents, aiCurationStatus }: HeaderProps) => {
  return (
    <header className="header-gradient text-white sticky top-0 z-10">
      <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-white/20">
            <CalendarDays className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">EventFinder</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-full bg-white/20 px-3 py-1 text-sm font-medium">
            {totalEvents} events
          </div>
        </div>
      </nav>
    </header>
  );
};
