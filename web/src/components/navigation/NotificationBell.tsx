import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import useSWR from "swr";
import { FrigateConfig } from "@/types/frigateConfig";
import { ReviewSegment } from "@/types/review";
import { useApiHost } from "@/api";
import { cn } from "@/lib/utils";
import TimeAgo from "@/components/dynamic/TimeAgo";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LuBell } from "react-icons/lu";

export default function NotificationBell() {
  const { t } = useTranslation(["common"]);
  const navigate = useNavigate();
  const apiHost = useApiHost();
  const [open, setOpen] = useState(false);

  const { data: config } = useSWR<FrigateConfig>("config", {
    revalidateOnFocus: false,
  });

  const twentyFourHoursAgo = useMemo(
    () => Math.floor(Date.now() / 1000) - 86400,
    [],
  );

  const { data: recentAlerts } = useSWR<ReviewSegment[]>(
    [
      "review",
      {
        limit: 10,
        severity: "alert",
        after: twentyFourHoursAgo,
        reviewed: 0,
      },
    ],
    { refreshInterval: 30000 },
  );

  const unreadCount = recentAlerts?.length ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative rounded-md p-2 text-secondary-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("notifications.title", {
            defaultValue: "Notifications",
          })}
        >
          <LuBell className="size-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0"
        sideOffset={8}
      >
        <div className="border-b border-secondary-highlight px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            {t("notifications.title", { defaultValue: "Notifications" })}
          </h3>
          <p className="text-xs text-secondary-foreground">
            {t("notifications.recentAlerts", {
              defaultValue: "Recent alerts (24h)",
            })}
          </p>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {recentAlerts && recentAlerts.length > 0 ? (
            recentAlerts.map((event) => (
              <button
                key={event.id}
                className="flex w-full items-center gap-3 border-b border-secondary-highlight/50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted"
                onClick={() => {
                  setOpen(false);
                  navigate("/review", {
                    state: {
                      severity: event.severity,
                      recording: {
                        camera: event.camera,
                        startTime: event.start_time - 4,
                        severity: event.severity,
                      },
                    },
                  });
                }}
              >
                <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded bg-black">
                  <img
                    src={`${apiHost}${event.thumb_path.replace("/media/frigate/", "")}`}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        event.severity === "alert"
                          ? "bg-danger"
                          : "bg-yellow-500",
                      )}
                    />
                    <span className="truncate text-sm font-medium text-foreground">
                      {config?.cameras?.[event.camera]?.friendly_name ||
                        event.camera}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-secondary-foreground">
                    <span className="truncate">
                      {[
                        ...(event.data.objects || []),
                        ...(event.data.audio || []),
                      ]
                        .filter(
                          (v, i, a) =>
                            a.indexOf(v) === i && !v.includes("-verified"),
                        )
                        .join(", ") || event.severity}
                    </span>
                    <span className="shrink-0">
                      <TimeAgo time={event.start_time * 1000} dense />
                    </span>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-secondary-foreground">
              {t("notifications.noAlerts", {
                defaultValue: "No recent alerts",
              })}
            </div>
          )}
        </div>
        {unreadCount > 0 && (
          <div className="border-t border-secondary-highlight p-2">
            <button
              className="w-full rounded-md px-3 py-1.5 text-center text-xs font-medium text-selected transition-colors hover:bg-muted"
              onClick={() => {
                setOpen(false);
                navigate("/review");
              }}
            >
              {t("notifications.viewAll", {
                defaultValue: "View all events",
              })}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
