import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CalendarDays, User, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface HeaderProps {
  onOpenPreferences: () => void;
  onNavigate: (page: string) => void;
  currentPage: string;
  totalEvents: number;
  aiCurationStatus: 'idle' | 'processing' | 'complete';
}

export const Header = ({ onOpenPreferences, onNavigate, currentPage, totalEvents, aiCurationStatus }: HeaderProps) => {
  const { user, signOut } = useAuth();

  return (
    <header className="header-gradient text-white sticky top-0 z-10">
      <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-white/20">
            <CalendarDays className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">EventFinder</h1>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="relative h-10 w-10 rounded-full bg-white/20">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-white/30 text-white">
                  {user?.email?.[0]?.toUpperCase() || "A"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <div className="flex flex-col space-y-1 p-2">
              <p className="text-sm font-medium leading-none">
                {user?.user_metadata?.display_name || "User"}
              </p>
              <p className="text-xs leading-none text-muted-foreground">
                {user?.email}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </header>
  );
};