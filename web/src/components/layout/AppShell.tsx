import { ReactNode } from "react";
import AppSidebar from "./Sidebar";
import AppHeader from "./Header";
import { usePersistence } from "@/hooks/use-persistence";
import { cn } from "@/lib/utils";
import { isDesktop, isMobile } from "react-device-detect";
import Bottombar from "../navigation/Bottombar";
import Statusbar from "../Statusbar";
import CommandPalette from "../navigation/CommandPalette";

type AppShellProps = {
  children: ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const [collapsed] = usePersistence<boolean>("sidebarCollapsed", false);
  const isCollapsed = collapsed ?? false;

  if (isMobile) {
    return (
      <div className="flex h-dvh w-full flex-col overflow-hidden">
        <CommandPalette />
        <div
          className={cn(
            "flex-1 overflow-hidden",
          )}
        >
          {children}
        </div>
        <Bottombar />
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <CommandPalette />
      {isDesktop && <AppSidebar />}
      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden transition-all duration-200",
          isDesktop && (isCollapsed ? "ml-16" : "ml-56"),
        )}
      >
        {isDesktop && <AppHeader />}
        <main className="flex-1 overflow-hidden pb-8">
          {children}
        </main>
        {isDesktop && <Statusbar />}
      </div>
    </div>
  );
}
