import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PiPlugBold, PiGearBold, PiArrowClockwiseBold, PiFactoryBold } from "react-icons/pi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { useRobotCommands, useRobotIO } from "@/contexts/robot";
import { useSocket } from "@/contexts/SocketContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type LocalParams = Record<string, string | number | boolean>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SOCKET_URL_KEY = "6ar.socketUrl";
const DEBOUNCE_MS = 300;

function isNumericLike(v: string) {
  if (v.trim() === "") return false;
  return !Number.isNaN(Number(v));
}

function SectionHeading({ icon: Icon, title }: { icon: React.ElementType<{ className: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
    </div>
  );
}

// ─── Connection section ───────────────────────────────────────────────────────

function ConnectionSection() {
  const { socket, connected } = useSocket();
  const defaultUrl =
    (import.meta.env.VITE_SOCKET_URL as string | undefined) ?? "http://192.168.0.55:5001";
  const [url, setUrl] = useState<string>(
    () => localStorage.getItem(SOCKET_URL_KEY) ?? defaultUrl,
  );

  const handleSave = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    localStorage.setItem(SOCKET_URL_KEY, trimmed);
    toast.info("Socket URL saved — reload to reconnect.", { duration: 4000 });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSave();
  };

  return (
    <div className="space-y-4">
      <SectionHeading icon={PiPlugBold} title="Connection" />

      <Card>
        <CardContent className="pt-4 space-y-4">
          {/* Status row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full shrink-0 ${
                  connected ? "bg-green-500 shadow-[0_0_6px_1px_rgba(34,197,94,0.6)]" : "bg-red-500"
                }`}
              />
              <span className="text-sm text-muted-foreground">
                {connected ? socket.connected ? "Connected" : "Not connected" : "Not connected"}
              </span>
            </div>
            <Badge variant={connected ? "default" : "destructive"} className="shrink-0">
              {connected ? "Online" : "Offline"}
            </Badge>
          </div>

          <Separator />

          {/* URL input */}
          <div className="space-y-1.5">
            <Label htmlFor="socket-url" className="text-xs text-muted-foreground">
              Server URL
            </Label>
            <div className="flex gap-2">
              <Input
                id="socket-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="http://192.168.0.55:5001"
                className="font-mono text-sm h-8"
                spellCheck={false}
              />
              <Button variant="secondary" size="sm" className="shrink-0" onClick={handleSave}>
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Saved URL is used on next page reload.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Joint Parameters section ─────────────────────────────────────────────────

function JointParametersSection() {
  const { parameters = {} } = useRobotIO();
  const { listParameters, setParam, restartTeensy } = useRobotCommands();

  const [local, setLocal] = useState<LocalParams>({});
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // initial load
  useEffect(() => {
    listParameters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sync incoming params → local
  useEffect(() => {
    if (parameters && Object.keys(parameters).length) {
      setLocal(parameters as LocalParams);
    }
  }, [parameters]);

  // cleanup all pending timers on unmount
  useEffect(() => {
    return () => {
      for (const t of Object.values(debounceRef.current)) {
        if (t != null) clearTimeout(t);
      }
      if (restartTimerRef.current != null) clearTimeout(restartTimerRef.current);
    };
  }, []);

  const handleRestart = useCallback(() => {
    restartTeensy();
    setLocal({});
    toast.info("Teensy restarting…");
    if (restartTimerRef.current != null) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(() => {
      listParameters();
      restartTimerRef.current = null;
    }, 2000);
  }, [restartTeensy, listParameters]);

  const handleChange = useCallback(
    (key: string, raw: string) => {
      const val: string | number = raw === "" ? "" : isNumericLike(raw) ? Number(raw) : raw;

      setLocal((prev) => (prev[key] === val ? prev : { ...prev, [key]: val }));

      const existing = debounceRef.current[key];
      if (existing != null) clearTimeout(existing);

      debounceRef.current[key] = setTimeout(() => {
        setParam(key, val);
        toast.success(`${key} = ${String(val)}`, { duration: 1500 });
        debounceRef.current[key] = null;
      }, DEBOUNCE_MS);
    },
    [setParam],
  );

  const jointGroups = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const k in local) {
      if (k.startsWith("joint")) {
        const grp = k.split(".")[0];
        (groups[grp] ||= []).push(k);
      }
    }
    for (const g of Object.keys(groups)) {
      groups[g].sort((a, b) => a.localeCompare(b));
    }
    const names = Object.keys(groups).sort(
      (a, b) => parseInt(a.slice(5), 10) - parseInt(b.slice(5), 10),
    );
    return { groups, names };
  }, [local]);

  const isLoading = !Object.keys(local).length;

  return (
    <div className="space-y-4">
      {/* Section heading + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading icon={PiGearBold} title="Joint Parameters" />

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleRestart}
          >
            <PiArrowClockwiseBold className="h-3.5 w-3.5" />
            Restart Teensy
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <PiFactoryBold className="h-3.5 w-3.5" />
                Factory Reset
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset to Factory Defaults?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will erase all custom joint parameters and restore factory defaults. This
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    setParam("ResetToFactory", 1);
                    toast.warning("Factory reset requested.");
                    setTimeout(() => listParameters(), 500);
                  }}
                >
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <Card className="border-dashed">
          <CardContent className="pt-6 pb-6 flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-muted-foreground">Loading parameters…</p>
            <p className="text-xs text-muted-foreground/70">
              If this never loads, check your socket connection or restart the Teensy.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {jointGroups.names.map((grp) => (
            <Card key={grp} className="overflow-hidden">
              <CardHeader className="py-3 px-4 bg-muted/30 border-b">
                <CardTitle className="text-sm font-semibold">
                  Joint {grp.replace("joint", "")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {jointGroups.groups[grp].map((key) => {
                  const label = key.split(".").slice(1).join(".") || key;
                  const value = local[key] ?? "";
                  return (
                    <div key={key} className="grid grid-cols-[1fr_auto] items-center gap-3">
                      <Label className="text-xs text-muted-foreground truncate" title={label}>
                        {label}
                      </Label>
                      <Input
                        value={String(value)}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className="h-7 w-24 text-right font-mono text-xs"
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default memo(function SettingsTab() {
  return (
    <div className="p-6 space-y-8">
      <ConnectionSection />
      <Separator />
      <JointParametersSection />
    </div>
  );
});
