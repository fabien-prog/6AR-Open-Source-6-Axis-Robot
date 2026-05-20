// src/features/Runner/RunLogsView.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PiFolderOpen, PiPlayCircleFill, PiPauseCircleFill, PiStopCircleFill, PiArrowBendUpLeft, PiDownloadSimple, PiTrash } from "react-icons/pi";

import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import { monokai } from "react-syntax-highlighter/dist/esm/styles/hljs";

import define6ar from "@/utils/hljs-6ar"; // your TS version from earlier
import { run6ar, type Run6arEvent } from "@/lib/run6ar"; // your TS generator

import ProgramManagerDrawer from "@/features/Runner/ProgramManagerDrawer"; // adjust path

import { toast } from "sonner";

// shadcn/ui
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRobotCommands, useRobotIO } from "@/contexts/robot";
import { useSocket } from "@/contexts/SocketContext";

type ProgramItem = { id: number; name: string; code: string };

type LogEntry = {
  id: number;
  time: string;
  type: "log" | "cmd" | "error";
  title: string;
  detail: any;
  line: number;
};

const runnerKey = "runLogsPrograms";

function loadRunnerList(): ProgramItem[] {
  try {
    const raw = localStorage.getItem(runnerKey) || "[]";
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRunnerList(list: ProgramItem[]) {
  localStorage.setItem(runnerKey, JSON.stringify(list));
}

const defaultProgram: ProgramItem = {
  id: 1,
  name: "Main Program.6AR",
  code: `CONST Number CONST_1 = 10;
VAR Number VAR_1 = 1;
VAR Coordinate TARGET_HOME = (-0.107,24.48,60.384,-0.008,95.127,0.06);
VAR Coordinate TARGET_1 = (0,0,0,0,0,0);
VAR Coordinate TARGET_2 = (0,0,0,0,0,0);
VAR Coordinate TARGET_3 = (0,0,0,0,0,0);
PROC Main()
  LOG("PROGRAM STARTED");
  Home;
  MoveJ Cartesian TARGET_HOME Speed 50;
  FOR VAR_1 FROM 2 TO CONST_1 STEP 2
    MoveL Cartesian TARGET_1 Speed 60;
    MoveL Cartesian TARGET_2 Speed 60;
    MoveL Cartesian TARGET_3 Speed 60;
    IF DI_1 == 1 THEN
      MoveJ Cartesian TARGET_HOME Speed 120;
      Counter COUNTER_1 INIT 0 INC 1 TO 12;
    ENDIF;
  ENDFOR;
ENDPROC`,
};

// ---------- theme overrides ----------
SyntaxHighlighter.registerLanguage("6ar", define6ar as any);

const sixarTheme: any = {
  ...monokai,
  "hljs-keyword": { color: "#F92672", fontWeight: "bold" },
  "hljs-emphasis": { color: "#66D9EF", fontStyle: "italic" },
  "hljs-attribute": { color: "#A6E22E" },
  "hljs-variable": { color: "#FD971F" },
  "hljs-string": { color: "#E6DB74" },
  "hljs-number": { color: "#AE81FF" },
  "hljs-comment": { color: "#75715E", fontStyle: "italic" },
  "hljs-params": { color: "#F8F8F2" },
  "hljs-punctuation": { color: "#F8F8F2" },
};

// ---------- math helpers ----------
const round4 = (v: number) => Math.round(v * 10000) / 10000;

const trapezoidalTimeSafe = (d: number, v: number, a: number) => {
  if (!Number.isFinite(d) || d <= 0) return 0;
  if (!Number.isFinite(v) || !Number.isFinite(a) || v <= 0 || a <= 0) return Infinity;

  const tA = v / a;
  const xA = 0.5 * a * tA * tA;
  if (d < 2 * xA) return 2 * Math.sqrt(d / a);
  return 2 * tA + (d - 2 * xA) / v;
};

const solveVForTime = (d: number, T: number, vCap: number, aCap: number) => {
  if (d <= 1e-9) return 0;
  if (vCap <= 0 || aCap <= 0) return 0;

  const tAtCap = trapezoidalTimeSafe(d, vCap, aCap);
  if (tAtCap > T) return vCap;

  let lo = 1e-6;
  let hi = vCap;
  for (let it = 0; it < 50; it++) {
    const mid = 0.5 * (lo + hi);
    const tMid = trapezoidalTimeSafe(d, mid, aCap);
    if (tMid < T) hi = mid;
    else lo = mid;
  }
  return hi;
};

// If Teensy speeds/accels are in motor units, set true
const APPLY_POSITION_FACTOR_TO_PROFILE = false;

// XYZ Euler (degrees) → quaternion [x, y, z, w]
function eulerXYZDegToQuat(aDeg: number, bDeg: number, cDeg: number): [number, number, number, number] {
  const ax = (aDeg * Math.PI) / 180;
  const ay = (bDeg * Math.PI) / 180;
  const az = (cDeg * Math.PI) / 180;
  const cx = Math.cos(ax / 2), sx = Math.sin(ax / 2);
  const cy = Math.cos(ay / 2), sy = Math.sin(ay / 2);
  const cz = Math.cos(az / 2), sz = Math.sin(az / 2);
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ];
}

export default function RunLogsView() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { parameters, digitalInputs } = useRobotIO();
  const { getAllJointStatus, moveMultiple, linearMove, output, getInputs } = useRobotCommands();
  const { socket } = useSocket();

  // Programs
  const [programs, setPrograms] = useState<ProgramItem[]>(() => {
    const saved = loadRunnerList();
    return saved.length ? saved : [defaultProgram];
  });
  const [current, setCurrent] = useState<ProgramItem>(() => {
    const saved = loadRunnerList();
    return saved.length ? saved[0] : defaultProgram;
  });

  const codeLines = useMemo(() => current.code.split("\n"), [current.code]);

  // Logs (buffered)
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsBufferRef = useRef<LogEntry[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  const bufferedAppendLog = useCallback((entry: LogEntry) => {
    logsBufferRef.current.push(entry);
    if (flushTimerRef.current != null) return;
    flushTimerRef.current = window.setTimeout(() => {
      setLogs((prev) => {
        if (logsBufferRef.current.length === 0) return prev;
        const next = prev.concat(logsBufferRef.current);
        logsBufferRef.current = [];
        return next;
      });
      flushTimerRef.current = null;
    }, 16);
  }, []);

  const [executingLine, setExecutingLine] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState(0);

  const genRef = useRef<Generator<Run6arEvent, void, unknown> | null>(null);
  const timerRef = useRef<number | null>(null);
  const codeContainerRef = useRef<HTMLDivElement | null>(null);

  // Handle loading from drawer (custom event)
  const onLoadRunner = useCallback((e: Event) => {
    const ce = e as CustomEvent<ProgramItem>;
    const prog = ce.detail;

    setPrograms((prev) => {
      const exists = prev.find((p) => p.id === prog.id);
      const next = exists ? prev.map((p) => (p.id === prog.id ? prog : p)) : [...prev, prog];
      saveRunnerList(next);
      return next;
    });

    setCurrent(prog);
    toast.info(`Loaded "${prog.name}"`);
    setDrawerOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener("loadRunnerProgram", onLoadRunner);
    return () => window.removeEventListener("loadRunnerProgram", onLoadRunner);
  }, [onLoadRunner]);

  // Auto-import from editor export
  const importFromEditor = useCallback(() => {
    const code = localStorage.getItem("runProgram");
    if (!code) {
      toast.warning("No program found in editor");
      return;
    }

    const name = "Editor Program";
    const existing = programs.find((p) => p.name === name);
    const prog: ProgramItem = { id: existing ? existing.id : Date.now(), name, code };

    setPrograms((ps) => {
      const updated = existing ? ps.map((p) => (p.id === prog.id ? prog : p)) : [...ps, prog];
      saveRunnerList(updated);
      return updated;
    });

    setCurrent(prog);
    toast.success(existing ? "Updated Editor Program" : "Imported Editor Program");
  }, [programs]);

  useEffect(() => {
    window.addEventListener("runProgramExported", importFromEditor);
    return () => window.removeEventListener("runProgramExported", importFromEditor);
  }, [importFromEditor]);

  const lineProps = useCallback(
    (ln: number) => ({
      "data-line": ln,
      style: {
        display: "block",
        background: ln - 1 === executingLine ? "rgba(0,132,255,0.35)" : "transparent",
      },
    }),
    [executingLine],
  );

  // stepOnce: drives UI + real robot
  const stepOnce = useCallback(async () => {
    if (!genRef.current) return { done: true as const };

    const { value, done } = genRef.current.next();
    if (done) {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      setRunning(false);
      return { done: true as const };
    }

    if (!value) return { done: false as const, value: null as any };

    // 1) log to UI
    let title: string;
    let detail: any;
    let line: number;

    if (value.type === "cmd") {
      title = `SEND: ${value.payload.cmd}`;
      detail = value.payload;
      line = value.line;
    } else if (value.type === "log" || value.type === "error") {
      title = value.message;
      line = value.line;
      detail = codeLines[line];
    } else {
      return { done: false as const, value: null as any };
    }

    const entry: LogEntry = {
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      type: value.type === "error" ? "error" : value.type === "cmd" ? "cmd" : "log",
      title,
      detail,
      line,
    };

    bufferedAppendLog(entry);
    setExecutingLine(value.line);
    setSteps((s) => s + 1);

    // 2) commands
    if (value.type === "cmd") {
      const { cmd, mode, target, speed: rawSpeed } = value.payload as any;

      if (cmd === "MoveJ" && mode === "Joint" && target) {
        setRunning(false);

        const joints = [1, 2, 3, 4, 5, 6];
        const targets = [target.x, target.y, target.z, target.rx, target.ry, target.rz];

        const userSpeedDeg = Number(rawSpeed) > 0 ? Number(rawSpeed) : 5;

        const jointMaxSpeedsDeg = joints.map((j) => Number((parameters as any)[`joint${j}.maxSpeed`]) || 0);
        const jointMaxAccelsDeg = joints.map((j) => Number((parameters as any)[`joint${j}.maxAccel`]) || 0);

        const scale = Math.min(1, ...jointMaxSpeedsDeg.map((max) => (userSpeedDeg > 0 ? max / userSpeedDeg : 0)));
        const baseSpeedDeg = userSpeedDeg * scale;

        const baseAccelsDeg = joints.map((_, i) => Math.max(0, jointMaxAccelsDeg[i] / 3));
        const baseSpeedsDeg = joints.map(() => Math.max(0, baseSpeedDeg));

        const status = await getAllJointStatus();
        if (!Array.isArray(status) || status.length !== 6) {
          toast.error("Failed to query joint status");
          setRunning(true);
          return { done: false as const, value: entry };
        }

        const deltasDeg = joints.map((_, i) => Math.abs((targets[i] ?? 0) - (status[i]?.position ?? 0)));

        const posFactor = joints.map((j) => {
          const f = Number((parameters as any)[`joint${j}.positionFactor`]);
          return Number.isFinite(f) && f > 0 ? f : 1;
        });

        const toProfileUnits = (i: number, xDeg: number) => (APPLY_POSITION_FACTOR_TO_PROFILE ? xDeg * posFactor[i] : xDeg);
        const vCap = (i: number) => toProfileUnits(i, baseSpeedsDeg[i]);
        const aCap = (i: number) => toProfileUnits(i, baseAccelsDeg[i]);

        const deltasU = deltasDeg.map((d, i) => toProfileUnits(i, d));
        const tMin = deltasU.map((d, i) => trapezoidalTimeSafe(d, vCap(i), aCap(i)));

        let syncTime = Math.max(...tMin, 0.01);
        if (!Number.isFinite(syncTime) || syncTime <= 0) syncTime = 0.01;

        const speedsU = deltasU.map((d, i) => solveVForTime(d, syncTime, vCap(i), aCap(i)));
        const accelsU = joints.map((_, i) => aCap(i));

        for (let i = 0; i < 6; i++) {
          if (deltasDeg[i] <= 1e-6) {
            speedsU[i] = 0;
            accelsU[i] = 0;
          }
        }

        const speeds = speedsU.map((v) => round4(v));
        const accels = accelsU.map((a) => round4(a));
        const targetsRounded = targets.map((t) => round4(t ?? 0));

        moveMultiple(joints, targetsRounded, speeds, accels);

        const safetyMargin = 250;
        window.setTimeout(() => setRunning(true), syncTime * 1000 + safetyMargin);
        return { done: false as const, value: entry };
      }

      if (cmd === "MoveL" && Array.isArray(value.payload.position)) {
        setRunning(false);
        const { position, eulerDeg, speed: speedMms, angSpeed, accel } = value.payload as any;

        const proceed = async () => {
          const status = await getAllJointStatus();
          const seed = Array.isArray(status) && status.length === 6
            ? status.map((s: any) => s?.position ?? 0)
            : [0, 0, 0, 0, 0, 0];

          const quaternion = eulerXYZDegToQuat(eulerDeg[0], eulerDeg[1], eulerDeg[2]);
          const speedMs = (speedMms as number) / 1000;

          const onComplete = () => {
            socket?.off("linearMove_error", onError);
            setRunning(true);
          };
          const onError = () => {
            socket?.off("linearMoveComplete", onComplete);
            toast.error("Linear move failed");
            setRunning(true);
          };
          socket?.once("linearMoveComplete", onComplete);
          socket?.once("linearMove_error", onError);

          linearMove({ position, quaternion, speed: speedMs, angular_speed_deg: angSpeed, accel, seed });
        };

        void proceed();
        return { done: false as const, value: entry };
      }

      if (cmd === "SetDO") {
        const { pin, state } = value.payload as any;
        output([pin], [state]);
        window.setTimeout(() => setRunning(true), 50);
        return { done: false as const, value: entry };
      }

      if (cmd === "WaitDI") {
        const { pin, state } = value.payload as any;
        setRunning(false);

        const check = () => {
          getInputs();
          const di = digitalInputs.find((d: any) => d.id === pin);
          if (di && (di.status ? 1 : 0) === state) setRunning(true);
          else window.setTimeout(check, 100);
        };

        window.setTimeout(check, 100);
        return { done: false as const, value: entry };
      }
    }

    return { done: false as const, value: entry };
  }, [bufferedAppendLog, codeLines, digitalInputs, getAllJointStatus, getInputs, moveMultiple, linearMove, socket, parameters, output]);

  // runLoop scheduler
  useEffect(() => {
    if (!running) return;
    let cancelled = false;

    const loop = async () => {
      const res = await stepOnce();
      if (cancelled || res.done) return;

      const delay = res.value && res.value.type === "cmd" ? 150 : 15;
      timerRef.current = window.setTimeout(loop, delay);
    };

    loop();
    return () => {
      cancelled = true;
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [running, stepOnce]);

  // scroll highlight into view
  useEffect(() => {
    if (executingLine == null || !codeContainerRef.current) return;
    const ln = executingLine + 1;
    const node = codeContainerRef.current.querySelector(`[data-line="${ln}"]`);
    if (node) (node as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" });
  }, [executingLine]);

  // UI handlers
  const handleRun = useCallback(() => {
    setLogs([]);
    logsBufferRef.current = [];
    setExecutingLine(null);
    setSteps(0);
    genRef.current = run6ar(current.code);
    setRunning(true);
  }, [current.code]);

  const handlePause = useCallback(() => setRunning(false), []);
  const handleStop = useCallback(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    genRef.current = null;
    setRunning(false);
    setExecutingLine(null);
    setSteps(0);
    setLogs([]);
    logsBufferRef.current = [];
  }, []);

  const handleStep = useCallback(() => {
    if (!running) void stepOnce();
  }, [running, stepOnce]);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const code = String(ev.target?.result ?? "");
      const prog: ProgramItem = { id: Date.now(), name: f.name, code };

      setPrograms((ps) => {
        const next = [...ps, prog];
        saveRunnerList(next);
        return next;
      });
      setCurrent(prog);
      toast.success(`Loaded "${prog.name}"`);
    };

    reader.readAsText(f);
    e.target.value = "";
  }, []);

  const exportLogs = useCallback(() => {
    const text = logs
      .map((l) => {
        const det = l.detail != null ? l.detail : "";
        const single = typeof det === "string" ? det.replace(/\n/g, " ") : JSON.stringify(det);
        return `[${l.time}] ${l.title} (${single})`;
      })
      .join("\n");

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "run6ar.log";
    a.click();

    URL.revokeObjectURL(url);
  }, [logs]);

  return (
    <div className="h-full w-full min-h-0">
      {/* hidden file input */}
      <input ref={fileInputRef} type="file" accept=".6ar,.txt" onChange={handleUpload} className="hidden" />

      <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
        <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
          {/* Left column */}
          <div className="flex min-h-0 flex-[2] flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                <PiFolderOpen className="mr-2 h-4 w-4" />
                Load File
              </Button>

              <Button size="sm" variant="secondary" onClick={importFromEditor}>
                <PiDownloadSimple className="mr-2 h-4 w-4" />
                Import Editor Program
              </Button>

              <Select
                value={String(current.id)}
                onValueChange={(val) => {
                  const next = programs.find((p) => String(p.id) === val) || programs[0];
                  setCurrent(next);
                }}
              >
                <SelectTrigger className="h-9 w-[240px]">
                  <SelectValue placeholder="Select program" />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button size="sm" onClick={() => setDrawerOpen(true)}>
                Manage…
              </Button>

              <ProgramManagerDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} editorKey="programEditorPrograms" runnerKey={runnerKey} />
            </div>

            <Card className="min-h-0 flex-1 overflow-hidden">
              <CardContent className="min-h-0 p-0">
                <ScrollArea className="h-full" ref={undefined as any}>
                  <div ref={codeContainerRef} className="p-3">
                    <SyntaxHighlighter language="6ar" style={sixarTheme} showLineNumbers wrapLines lineProps={lineProps as any}>
                      {current.code}
                    </SyntaxHighlighter>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleRun} disabled={running} className="bg-emerald-600 hover:bg-emerald-700">
                <PiPlayCircleFill className="mr-2 h-4 w-4" />
                Run
              </Button>
              <Button onClick={handlePause} disabled={!running} variant="secondary">
                <PiPauseCircleFill className="mr-2 h-4 w-4" />
                Pause
              </Button>
              <Button onClick={handleStep} variant="secondary">
                <PiArrowBendUpLeft className="mr-2 h-4 w-4" />
                Step
              </Button>
              <Button onClick={handleStop} variant="destructive">
                <PiStopCircleFill className="mr-2 h-4 w-4" />
                Stop
              </Button>

              <Separator orientation="vertical" className="mx-1 h-6" />
              <div className="text-sm text-muted-foreground">Lines Executed: {steps}</div>
            </div>
          </div>

          {/* Right column */}
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-lg font-semibold">Execution Logs</div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setLogs([]);
                    logsBufferRef.current = [];
                  }}
                >
                  <PiTrash className="mr-2 h-4 w-4" />
                  Clear
                </Button>

                <Button size="sm" variant="secondary" onClick={exportLogs}>
                  <PiDownloadSimple className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>
            </div>

            <Card className="min-h-0 flex-1 overflow-hidden">
              <CardContent className="min-h-0 p-0">
                <ScrollArea className="h-full">
                  <div className="p-2">
                    {logs.length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">No log entries</div>
                    ) : (
                      <Accordion type="multiple" className="w-full">
                        {logs.map((l) => (
                          <AccordionItem key={l.id} value={String(l.id)}>
                            <AccordionTrigger className="px-2">
                              <div className="flex w-full items-center gap-2 text-left">
                                <span className="shrink-0 text-xs text-muted-foreground">[{l.time}]</span>
                                <Badge variant={l.type === "cmd" ? "default" : l.type === "error" ? "destructive" : "secondary"}>{l.type}</Badge>
                                <span className="truncate">{l.title}</span>
                              </div>
                            </AccordionTrigger>

                            <AccordionContent className="px-2 pb-3">
                              <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-xs">{typeof l.detail === "string" ? l.detail : JSON.stringify(l.detail, null, 2)}</pre>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
