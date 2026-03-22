import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { FrigateConfig } from "@/types/frigateConfig";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  LuLayoutDashboard,
  LuActivity,
  LuList,
  LuSquarePen,
  LuSettings,
  LuVideo,
} from "react-icons/lu";
import { FaVideo, FaCompactDisc } from "react-icons/fa";
import { IoSearch } from "react-icons/io5";
import { MdVideoLibrary } from "react-icons/md";

export default function CommandPalette() {
  const { t } = useTranslation(["common"]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: config } = useSWR<FrigateConfig>("config", {
    revalidateOnFocus: false,
  });
  const isAdmin = useIsAdmin();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = useCallback(
    (command: () => void) => {
      setOpen(false);
      command();
    },
    [],
  );

  const cameras = useMemo(() => {
    if (!config?.cameras) return [];
    return Object.values(config.cameras)
      .filter((c) => c.enabled_in_config)
      .sort((a, b) => (a.ui?.order ?? 0) - (b.ui?.order ?? 0));
  }, [config]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder={t("commandPalette.placeholder", {
          defaultValue: "Search pages, cameras...",
        })}
      />
      <CommandList>
        <CommandEmpty>
          {t("commandPalette.noResults", {
            defaultValue: "No results found.",
          })}
        </CommandEmpty>

        {/* Navigation */}
        <CommandGroup
          heading={t("commandPalette.navigation", {
            defaultValue: "Navigation",
          })}
        >
          <CommandItem
            onSelect={() => runCommand(() => navigate("/"))}
          >
            <LuLayoutDashboard className="mr-2 size-4" />
            {t("menu.dashboard", { defaultValue: "Dashboard" })}
            <CommandShortcut>⌘D</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate("/live"))}
          >
            <FaVideo className="mr-2 size-4" />
            {t("menu.live.title")}
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate("/review"))}
          >
            <MdVideoLibrary className="mr-2 size-4" />
            {t("menu.review")}
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate("/explore"))}
          >
            <IoSearch className="mr-2 size-4" />
            {t("menu.explore")}
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate("/export"))}
          >
            <FaCompactDisc className="mr-2 size-4" />
            {t("menu.export")}
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate("/settings"))}
          >
            <LuSettings className="mr-2 size-4" />
            {t("menu.settings")}
          </CommandItem>
          {isAdmin && (
            <>
              <CommandItem
                onSelect={() => runCommand(() => navigate("/system"))}
              >
                <LuActivity className="mr-2 size-4" />
                {t("menu.systemMetrics", { defaultValue: "System" })}
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => navigate("/config"))}
              >
                <LuSquarePen className="mr-2 size-4" />
                {t("menu.configurationEditor", { defaultValue: "Config" })}
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => navigate("/logs"))}
              >
                <LuList className="mr-2 size-4" />
                {t("menu.systemLogs", { defaultValue: "Logs" })}
              </CommandItem>
            </>
          )}
        </CommandGroup>

        {/* Cameras */}
        {cameras.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup
              heading={t("commandPalette.cameras", {
                defaultValue: "Cameras",
              })}
            >
              {cameras.map((cam) => (
                <CommandItem
                  key={cam.name}
                  onSelect={() =>
                    runCommand(() => navigate(`/live#${cam.name}`))
                  }
                >
                  <LuVideo className="mr-2 size-4" />
                  {cam.friendly_name || cam.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
