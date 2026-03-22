import Logo from "../Logo";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { ENV } from "@/env";
import useSWR from "swr";
import { FrigateConfig } from "@/types/frigateConfig";
import { IconType } from "react-icons";
import { FaVideo, FaCompactDisc } from "react-icons/fa";
import { IoSearch } from "react-icons/io5";
import {
  LuActivity,
  LuConstruction,
  LuLayoutDashboard,
  LuList,
  LuSettings,
  LuSquarePen,
  LuChevronLeft,
  LuChevronRight,
} from "react-icons/lu";
import { MdVideoLibrary, MdCategory, MdChat } from "react-icons/md";
import { TbFaceId } from "react-icons/tb";
import { usePersistence } from "@/hooks/use-persistence";

type SidebarNavItem = {
  icon: IconType;
  label: string;
  url: string;
  enabled?: boolean;
  end?: boolean;
};

type SidebarSection = {
  title?: string;
  items: SidebarNavItem[];
};

export default function AppSidebar() {
  const { t } = useTranslation(["common"]);
  const { data: config } = useSWR<FrigateConfig>("config", {
    revalidateOnFocus: false,
  });
  const isAdmin = useIsAdmin();
  const location = useLocation();

  const [collapsed, setCollapsed] = usePersistence<boolean>(
    "sidebarCollapsed",
    false,
  );

  const sections: SidebarSection[] = [
    {
      items: [
        {
          icon: LuLayoutDashboard,
          label: t("menu.dashboard", { defaultValue: "Dashboard" }),
          url: "/",
          end: true,
        },
        {
          icon: FaVideo,
          label: t("menu.live.title"),
          url: "/live",
        },
        {
          icon: MdVideoLibrary,
          label: t("menu.review"),
          url: "/review",
        },
        {
          icon: IoSearch,
          label: t("menu.explore"),
          url: "/explore",
        },
        {
          icon: FaCompactDisc,
          label: t("menu.export"),
          url: "/export",
        },
      ],
    },
    {
      title: t("menu.system", { defaultValue: "System" }),
      items: [
        {
          icon: LuActivity,
          label: t("menu.systemMetrics", { defaultValue: "System" }),
          url: "/system",
          enabled: isAdmin,
        },
        {
          icon: LuList,
          label: t("menu.systemLogs", { defaultValue: "Logs" }),
          url: "/logs",
          enabled: isAdmin,
        },
        {
          icon: LuSquarePen,
          label: t("menu.configurationEditor", { defaultValue: "Config" }),
          url: "/config",
          enabled: isAdmin,
        },
        {
          icon: TbFaceId,
          label: t("menu.faceLibrary", { defaultValue: "Faces" }),
          url: "/faces",
          enabled: isAdmin && config?.face_recognition?.enabled,
        },
        {
          icon: MdCategory,
          label: t("menu.classification", { defaultValue: "Classification" }),
          url: "/classification",
          enabled: isAdmin,
        },
        {
          icon: MdChat,
          label: t("menu.chat", { defaultValue: "Chat" }),
          url: "/chat",
          enabled: isAdmin && config?.genai?.model !== "none",
        },
        {
          icon: LuConstruction,
          label: t("menu.uiPlayground", { defaultValue: "Playground" }),
          url: "/playground",
          enabled: ENV !== "production",
        },
      ],
    },
  ];

  const isActive = (url: string, end?: boolean) => {
    if (end) return location.pathname === url;
    return location.pathname.startsWith(url);
  };

  const isCollapsed = collapsed ?? false;

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-20 flex flex-col border-r border-secondary-highlight bg-background_alt transition-all duration-200",
        isCollapsed ? "w-[52px]" : "w-56",
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex h-12 shrink-0 items-center border-b border-secondary-highlight",
          isCollapsed ? "justify-center px-2" : "gap-3 px-4",
        )}
      >
        <NavLink to="/">
          <Logo className="size-6 shrink-0" />
        </NavLink>
        {!isCollapsed && (
          <span className="text-sm font-semibold text-foreground">
            FrigateNVR
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="scrollbar-container flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section, sIdx) => {
          const visibleItems = section.items.filter(
            (item) => item.enabled !== false,
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={sIdx} className={cn(sIdx > 0 && "mt-4")}>
              {section.title && !isCollapsed && (
                <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-secondary-foreground/60">
                  {section.title}
                </div>
              )}
              {sIdx > 0 && isCollapsed && (
                <div className="mx-2 mb-2 border-t border-secondary-highlight" />
              )}
              <div className="flex flex-col gap-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.url, item.end);

                  return (
                    <NavLink
                      key={item.url}
                      to={item.url}
                      className={cn(
                        "flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors",
                        isCollapsed ? "justify-center px-0" : "px-2.5",
                        active
                          ? "bg-selected text-white"
                          : "text-secondary-foreground hover:bg-muted hover:text-foreground",
                      )}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <Icon className="size-[18px] shrink-0" />
                      {!isCollapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer: Settings + shortcuts + collapse */}
      <div className="shrink-0 border-t border-secondary-highlight px-2 py-2">
        <NavLink
          to="/settings"
          className={cn(
            "flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors",
            isCollapsed ? "justify-center px-0" : "px-2.5",
            isActive("/settings")
              ? "bg-selected text-white"
              : "text-secondary-foreground hover:bg-muted hover:text-foreground",
          )}
          title={isCollapsed ? t("menu.settings") : undefined}
        >
          <LuSettings className="size-[18px] shrink-0" />
          {!isCollapsed && (
            <span className="truncate">{t("menu.settings")}</span>
          )}
        </NavLink>
        {!isCollapsed && (
          <div className="mt-1 flex items-center justify-center gap-1 px-2 text-[10px] text-secondary-foreground/50">
            <kbd className="rounded border border-secondary-highlight bg-background px-1 py-0.5 font-mono">
              ⌘K
            </kbd>
            <span>
              {t("commandPalette.shortcutHint", {
                defaultValue: "Quick search",
              })}
            </span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!isCollapsed)}
          className="mt-1 flex w-full items-center justify-center rounded-md py-1.5 text-secondary-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <LuChevronRight className="size-4" />
          ) : (
            <LuChevronLeft className="size-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
