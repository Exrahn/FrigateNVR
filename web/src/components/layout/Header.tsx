import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import GeneralSettings from "../menu/GeneralSettings";
import AccountSettings from "../menu/AccountSettings";
import NotificationBell from "../navigation/NotificationBell";
import { LuSearch } from "react-icons/lu";

const ROUTE_TITLES: Record<string, string> = {
  "/": "menu.dashboard",
  "/live": "menu.live.title",
  "/review": "menu.review",
  "/explore": "menu.explore",
  "/export": "menu.export",
  "/settings": "menu.settings",
  "/system": "menu.systemMetrics",
  "/config": "menu.configurationEditor",
  "/logs": "menu.systemLogs",
  "/faces": "menu.faceLibrary",
  "/classification": "menu.classification",
  "/chat": "menu.chat",
  "/playground": "menu.uiPlayground",
  "/replay": "menu.replay",
};

export default function AppHeader() {
  const { t } = useTranslation(["common"]);
  const location = useLocation();

  const pageTitle = useMemo(() => {
    const path = location.pathname;
    if (ROUTE_TITLES[path]) return t(ROUTE_TITLES[path]);
    const match = Object.entries(ROUTE_TITLES).find(
      ([route]) => route !== "/" && path.startsWith(route),
    );
    return match ? t(match[1]) : "";
  }, [location.pathname, t]);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-secondary-highlight bg-background_alt px-6">
      <h1 className="text-lg font-semibold text-foreground">{pageTitle}</h1>
      <div className="flex items-center gap-1">
        <button
          onClick={() =>
            document.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "k",
                metaKey: true,
                bubbles: true,
              }),
            )
          }
          className="flex items-center gap-2 rounded-md border border-secondary-highlight bg-background px-3 py-1.5 text-xs text-secondary-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("commandPalette.open", {
            defaultValue: "Search",
          })}
        >
          <LuSearch className="size-3.5" />
          <span className="hidden md:inline">
            {t("commandPalette.search", { defaultValue: "Search..." })}
          </span>
          <kbd className="pointer-events-none hidden rounded border border-secondary-highlight bg-background_alt px-1.5 py-0.5 font-mono text-[10px] font-medium text-secondary-foreground md:inline">
            ⌘K
          </kbd>
        </button>
        <NotificationBell />
        <GeneralSettings />
        <AccountSettings />
      </div>
    </header>
  );
}
