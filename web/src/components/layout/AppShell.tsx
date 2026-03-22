import { ReactNode } from "react";
import AppSidebar from "./Sidebar";
import { usePersistence } from "@/hooks/use-persistence";
import { cn } from "@/lib/utils";
import { isDesktop, isMobile } from "react-device-detect";
import Bottombar from "../navigation/Bottombar";
import Statusbar from "../Statusbar";
import CommandPalette from "../navigation/CommandPalette";
import { isPWA } from "@/utils/isPWA";

type AppShellProps = {
  children: ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const [collapsed] = usePersistence<boolean>("sidebarCollapsed", false);
  const isCollapsed = collapsed ?? false;

  if (isMobile) {
    return (
      <div className="size-full overflow-hidden">
        <CommandPalette />
        <div
          id="pageRoot"
          className={cn(
            "absolute left-0 right-0 top-0 overflow-hidden",
            `bottom-${isPWA ? 16 : 12} md:bottom-16 landscape:bottom-14 landscape:md:bottom-16`,
          )}
        >
          {children}
        </div>
        <Bottombar />
      </div>
    );
  }

  // Desktop: absolute positioning matching original Frigate layout
  // so all existing pages render correctly
  return (
    <div className="size-full overflow-hidden">
      <CommandPalette />
      {isDesktop && <AppSidebar />}
      {isDesktop && <Statusbar />}
      <div
        id="pageRoot"
        className={cn(
          "absolute right-0 top-0 bottom-8 overflow-hidden transition-all duration-200",
          isDesktop && (isCollapsed ? "left-[52px]" : "left-56"),
        )}
      >
        {children}
      </div>
    </div>
  );
}
