import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { FrigateConfig } from "@/types/frigateConfig";
import { ReviewSegment } from "@/types/review";
import { useAutoFrigateStats } from "@/hooks/use-stats";
import { useApiHost } from "@/api";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useAllowedCameras } from "@/hooks/use-allowed-cameras";
import { motion, type Variants } from "framer-motion";
import {
  LuVideo,
  LuShieldAlert,
  LuHardDrive,
  LuClock,
  LuCircle,
  LuRefreshCw,
  LuArrowRight,
  LuSearch,
} from "react-icons/lu";
import TimeAgo from "@/components/dynamic/TimeAgo";
import NotificationBell from "@/components/navigation/NotificationBell";
import DarkModeSelect from "@/components/settings/DarkModeSelect";

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

export default function Dashboard() {
  const { t } = useTranslation(["common", "views/system"]);
  const { data: config } = useSWR<FrigateConfig>("config", {
    revalidateOnFocus: false,
  });
  const stats = useAutoFrigateStats();
  const allowedCameras = useAllowedCameras();
  const apiHost = useApiHost();
  const navigate = useNavigate();

  const [thumbCacheKey, setThumbCacheKey] = useState(
    () => Math.floor(Date.now() / 30000),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setThumbCacheKey(Math.floor(Date.now() / 30000));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const refreshThumbnails = useCallback(() => {
    setThumbCacheKey(Date.now());
  }, []);

  const twentyFourHoursAgo = useMemo(
    () => Math.floor(Date.now() / 1000) - 86400,
    [],
  );
  const { data: recentEvents } = useSWR<ReviewSegment[]>(
    [
      "review",
      {
        limit: 20,
        severity: "alert",
        after: twentyFourHoursAgo,
      },
    ],
    { revalidateOnFocus: false },
  );

  const cameras = useMemo(() => {
    if (!config?.cameras) return [];
    return Object.values(config.cameras)
      .filter(
        (c) =>
          c.enabled_in_config &&
          (allowedCameras.length === 0 || allowedCameras.includes(c.name)),
      )
      .sort((a, b) => (a.ui?.order ?? 0) - (b.ui?.order ?? 0));
  }, [config, allowedCameras]);

  const onlineCameras = useMemo(() => {
    if (!stats?.cameras) return 0;
    return Object.values(stats.cameras).filter((c) => c.camera_fps > 0).length;
  }, [stats]);

  const recordingCameras = useMemo(() => {
    if (!config?.cameras) return 0;
    return Object.values(config.cameras).filter(
      (c) => c.enabled_in_config && c.record?.enabled,
    ).length;
  }, [config]);

  const totalDetections = useMemo(() => {
    if (!recentEvents) return 0;
    return recentEvents.length;
  }, [recentEvents]);

  const storage = useMemo(() => {
    if (!stats?.service?.storage) return null;
    const entries = Object.entries(stats.service.storage);
    if (entries.length === 0) return null;
    let totalUsed = 0;
    let totalTotal = 0;
    for (const [, s] of entries) {
      totalUsed += s.used;
      totalTotal += s.total;
    }
    return {
      used: totalUsed,
      total: totalTotal,
      percent: totalTotal > 0 ? Math.round((totalUsed / totalTotal) * 100) : 0,
    };
  }, [stats]);

  const uptime = useMemo(() => {
    if (!stats?.service?.uptime) return null;
    const seconds = stats.service.uptime;
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}j ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }, [stats]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "Ko", "Mo", "Go", "To"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="flex size-full flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-secondary-highlight bg-background px-4">
        <h1 className="text-sm font-semibold text-foreground">
          {t("menu.dashboard", { defaultValue: "Tableau de bord" })}
        </h1>
        <div className="flex items-center gap-1">
          {/* Raccourci palette de commandes */}
          <button
            className="hidden items-center gap-1.5 rounded-md border border-secondary-highlight bg-muted px-2.5 py-1 text-xs text-secondary-foreground transition-colors hover:bg-background md:flex"
            onClick={() =>
              document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", ctrlKey: true }),
              )
            }
            aria-label={t("commandPalette.open", { defaultValue: "Rechercher" })}
          >
            <LuSearch className="size-3" />
            <span>{t("commandPalette.search", { defaultValue: "Rechercher…" })}</span>
            <kbd className="ml-1 rounded border border-secondary-highlight bg-background px-1 font-mono text-[10px]">
              ⌘K
            </kbd>
          </button>
          <NotificationBell />
          <DarkModeSelect />
        </div>
      </header>

      {/* ── Contenu scrollable ── */}
      <motion.div
        className="scrollbar-container flex-1 overflow-y-auto p-4 md:p-6"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Stats Cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <StatsCard
            icon={<LuVideo className="size-5" />}
            label={t("dashboard.camerasOnline", {
              defaultValue: "Caméras en ligne",
            })}
            value={`${onlineCameras} / ${cameras.length}`}
            color="text-green-500"
          />
          <StatsCard
            icon={<LuCircle className="size-5" />}
            label={t("dashboard.recording", { defaultValue: "En enregistrement" })}
            value={`${recordingCameras}`}
            color="text-red-500"
          />
          <StatsCard
            icon={<LuShieldAlert className="size-5" />}
            label={t("dashboard.detections24h", {
              defaultValue: "Détections (24h)",
            })}
            value={`${totalDetections}`}
            color="text-yellow-500"
          />
          <StatsCard
            icon={<LuHardDrive className="size-5" />}
            label={t("dashboard.storage", { defaultValue: "Stockage" })}
            value={
              storage
                ? `${formatBytes(storage.used)} / ${formatBytes(storage.total)}`
                : "--"
            }
            sublabel={storage ? `${storage.percent}%` : undefined}
            color="text-blue-500"
            progress={storage?.percent}
          />
        </div>

        {/* Uptime */}
        {uptime && (
          <motion.div
            variants={item}
            className="mb-6 flex items-center gap-2 text-sm text-secondary-foreground"
          >
            <LuClock className="size-4" />
            <span>
              {t("dashboard.uptime", { defaultValue: "Temps de fonctionnement" })}: {uptime}
            </span>
            {stats?.service?.version && (
              <span className="ml-auto text-xs text-secondary-foreground/60">
                {t("dashboard.versionLabel", { defaultValue: "Frigate v" })}
                {stats.service.version}
              </span>
            )}
          </motion.div>
        )}

        {/* Camera Grid */}
        <motion.div
          variants={item}
          className="mb-3 flex items-center justify-between"
        >
          <h2 className="text-base font-semibold text-foreground">
            {t("dashboard.cameras", { defaultValue: "Caméras" })}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshThumbnails}
              className="rounded-md p-1.5 text-secondary-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t("dashboard.refreshThumbnails", {
                defaultValue: "Rafraîchir les miniatures",
              })}
            >
              <LuRefreshCw className="size-4" />
            </button>
            <button
              onClick={() => navigate("/live")}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-selected transition-colors hover:bg-muted"
            >
              {t("dashboard.viewAll", { defaultValue: "Tout voir" })}
              <LuArrowRight className="size-3" />
            </button>
          </div>
        </motion.div>
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {cameras.map((cam) => {
            const camStats = stats?.cameras?.[cam.name];
            const isOnline = camStats && camStats.camera_fps > 0;

            return (
              <motion.div
                key={cam.name}
                variants={item}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group cursor-pointer overflow-hidden rounded-lg border border-secondary-highlight bg-background_alt transition-colors hover:border-selected/50"
                onClick={() => navigate(`/live#${cam.name}`)}
              >
                <div className="relative aspect-video w-full overflow-hidden bg-black">
                  <img
                    src={`${apiHost}api/${cam.name}/latest.webp?height=360&cache=${thumbCacheKey}`}
                    alt={cam.friendly_name || cam.name}
                    className="size-full object-contain transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute right-2 top-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm",
                        isOnline
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          isOnline
                            ? "bg-green-400 animate-pulse"
                            : "bg-red-400",
                        )}
                      />
                      {isOnline
                        ? t("dashboard.online", { defaultValue: "En ligne" })
                        : t("dashboard.offline", { defaultValue: "Hors ligne" })}
                    </span>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm font-medium text-foreground">
                    {cam.friendly_name || cam.name}
                  </span>
                  {camStats && (
                    <span className="text-xs text-secondary-foreground">
                      {camStats.camera_fps.toFixed(0)}{" "}
                      {t("unit.fps", { defaultValue: "ips" })}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Recent Events */}
        <motion.div
          variants={item}
          className="mb-3 flex items-center justify-between"
        >
          <h2 className="text-base font-semibold text-foreground">
            {t("dashboard.recentEvents", { defaultValue: "Événements récents" })}
          </h2>
          {recentEvents && recentEvents.length > 0 && (
            <button
              onClick={() => navigate("/review")}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-selected transition-colors hover:bg-muted"
            >
              {t("dashboard.viewAll", { defaultValue: "Tout voir" })}
              <LuArrowRight className="size-3" />
            </button>
          )}
        </motion.div>
        {recentEvents && recentEvents.length > 0 ? (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3"
          >
            {recentEvents.slice(0, 12).map((event) => (
              <motion.div
                key={event.id}
                variants={item}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-secondary-highlight bg-background_alt p-3 transition-colors hover:border-selected/50"
                onClick={() =>
                  navigate("/review", {
                    state: {
                      severity: event.severity,
                      recording: {
                        camera: event.camera,
                        startTime: event.start_time - 4,
                        severity: event.severity,
                      },
                    },
                  })
                }
              >
                <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded bg-black">
                  <img
                    src={`${apiHost}${event.thumb_path.replace("/media/frigate/", "")}`}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-block size-2 shrink-0 rounded-full",
                        event.severity === "alert"
                          ? "bg-red-500"
                          : event.severity === "detection"
                            ? "bg-yellow-500"
                            : "bg-blue-500",
                      )}
                    />
                    <span className="truncate text-sm font-medium text-foreground">
                      {config?.cameras?.[event.camera]?.friendly_name ||
                        event.camera}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-secondary-foreground">
                    <span className="truncate">
                      {[
                        ...(event.data.objects || []),
                        ...(event.data.audio || []),
                      ]
                        .filter(
                          (v, i, a) =>
                            a.indexOf(v) === i &&
                            !v.includes("-verified"),
                        )
                        .join(", ") || event.severity}
                    </span>
                    <span className="shrink-0">
                      <TimeAgo time={event.start_time * 1000} dense />
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            variants={item}
            className="rounded-lg border border-secondary-highlight bg-background_alt p-8 text-center text-sm text-secondary-foreground"
          >
            {t("dashboard.noRecentEvents", {
              defaultValue: "Aucun événement récent",
            })}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

type StatsCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  color: string;
  progress?: number;
};

function StatsCard({
  icon,
  label,
  value,
  sublabel,
  color,
  progress,
}: StatsCardProps) {
  return (
    <motion.div
      variants={item}
      whileHover={{ y: -2 }}
      className="relative overflow-hidden rounded-lg border border-secondary-highlight bg-background_alt p-4"
    >
      <div className="flex items-center gap-2">
        <div className={cn("shrink-0", color)}>{icon}</div>
        <span className="text-xs text-secondary-foreground">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-xl font-bold text-foreground">{value}</span>
        {sublabel && (
          <span className="text-xs text-secondary-foreground">{sublabel}</span>
        )}
      </div>
      {progress !== undefined && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary-highlight">
          <motion.div
            className={cn(
              "h-full rounded-full",
              progress < 70
                ? "bg-blue-500"
                : progress < 90
                  ? "bg-orange-400"
                  : "bg-danger",
            )}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      )}
    </motion.div>
  );
}
