import React, { useState, useEffect } from "react";
import { Dashboard } from "@/components/Dashboard";
import { DashboardV2 } from "@/components/v2/DashboardV2";
import { Button } from "@/components/ui/button";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const Index = () => {
  const [uiVersion, setUiVersion] = useState<'v1' | 'v2'>('v1');

  useEffect(() => {
    // 1. Check URL params first
    const params = new URLSearchParams(window.location.search);
    const uiParam = params.get('ui');
    
    // 2. Check LocalStorage second
    const storedUi = localStorage.getItem('squirtle_ui_version') as 'v1' | 'v2' | null;
    
    if (uiParam === 'v1' || uiParam === 'v2') {
      setUiVersion(uiParam);
      localStorage.setItem('squirtle_ui_version', uiParam);
    } else if (storedUi === 'v1' || storedUi === 'v2') {
      setUiVersion(storedUi);
    } else {
      // Default to V2 if you want to promote the new design, 
      // but let's stick to V1 as requested for stability if needed.
      // Re-reading user request: "add a toggle to the other front end"
      // Let's default to V1.
      setUiVersion('v1');
    }
  }, []);

  const toggleUi = () => {
    const next = uiVersion === 'v1' ? 'v2' : 'v1';
    setUiVersion(next);
    localStorage.setItem('squirtle_ui_version', next);
    // Optional: Clear URL param when toggling manually
    const url = new URL(window.location.href);
    url.searchParams.delete('ui');
    window.history.replaceState({}, '', url);
  };

  return (
    <div className="relative min-h-screen">
      {uiVersion === 'v1' ? <Dashboard /> : <DashboardV2 />}
      
      {/* Global UI Toggle Button */}
      <div className="fixed bottom-6 left-6 z-[60]">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleUi}
          className={cn(
            "rounded-full h-12 px-5 font-bold shadow-2xl border-2 transition-all duration-300 backdrop-blur-md",
            uiVersion === 'v1' 
              ? "bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50" 
              : "bg-slate-900 text-white border-slate-700 hover:bg-slate-800"
          )}
        >
          <Layers className="w-4 h-4 mr-2" />
          {uiVersion === 'v1' ? "TRY MODERN V2" : "BACK TO CLASSIC V1"}
        </Button>
      </div>
    </div>
  );
};

export default Index;
