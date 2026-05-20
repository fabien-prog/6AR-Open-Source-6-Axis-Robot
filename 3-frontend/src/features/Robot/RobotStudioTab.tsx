import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PiStopBold, PiMinusBold, PiXBold } from "react-icons/pi";

import { useViewer } from "@/features/Robot/Viewer/ViewerContext";
import { ViewerProvider } from "@/features/Robot/Viewer/ViewerContext";
import { Overlays } from "@/features/Robot/Viewer/Overlays";
import RobotLoader from "@/features/Robot/Viewer/RobotLoader";
import AddStlDialog from "@/features/Robot/AddStlDialog";
import type { ExtraModelProps } from "@/features/Robot/ExtraModel";

import SimRobotCards, { SimPoseEditorWidget, SimLinearMoveWidget, SimMotionPeaksWidget, SimStreamProvider } from "@/features/Robot/SimRobotCards";
import { PiArrowsClockwiseBold } from "react-icons/pi";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRobotIO, useRobotKinematics } from "@/contexts/robot";
import { useJointStore } from "@/stores/JointStore";
import { movePhysicalToVirtual } from "@/lib/syncMotion";
import { toast } from "sonner";
import PhysRobotCards, {
  PhysQuickBarWidget,
  PhysPresetsWidget,
  PhysHomingWidget,
  PhysSingleJointMovesWidget,
  PhysCartesianMoveWidget,
  PhysMultiMoveWidget,
  PhysJointStatusWidget,
  IoHeaderWidget,
  IoEStopWidget,
  IoButtonsWidget,
  IoLimitsWidget,
  IoOutputsWidget,
} from "@/features/Robot/PhysRobotCards";

import { useRobotCommands, useRobotStatus } from "@/contexts/robot";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuItem } from "@/components/ui/dropdown-menu";

/* =======================================================================================
 *  Windowed Widget Layout (grid snap + resize + minimize + no duplicates + autosave)
 * ======================================================================================= */

type WidgetKind =
  | "sim.full"
  | "phys.full"
  | "sim.pose"
  | "sim.linear"
  | "sim.peaks"
  | "phys.quick"
  | "phys.presets"
  | "phys.homing"
  | "phys.single"
  | "phys.cartesian"
  | "phys.multi"
  | "phys.status"
  | "io.header"
  | "io.estop"
  | "io.buttons"
  | "io.limits"
  | "io.outputs";

type Widget = {
  kind: WidgetKind;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  visible: boolean;
};

const LS_KEY = "6ar.widgetLayout.v4";
const GRID = 20;
const PERSIST_DEBOUNCE_MS = 2000;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function snap(n: number, grid = GRID) {
  return Math.round(n / grid) * grid;
}

function dedupeWidgets(widgets: Widget[]) {
  const seen = new Set<WidgetKind>();
  const out: Widget[] = [];
  for (const w of widgets) {
    if (seen.has(w.kind)) continue;
    seen.add(w.kind);
    out.push(w);
  }
  return out;
}

function readLayoutFromStorage<T>(key: string, initial: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return initial();
    return JSON.parse(raw) as T;
  } catch {
    return initial();
  }
}

function usePersistentLayoutState<T>(key: string, initial: () => T) {
  const [value, setValue] = useState<T>(() => readLayoutFromStorage(key, initial));
  const persistTimerRef = useRef<number | null>(null);

  const flushNow = useCallback(
    (nextValue?: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(nextValue ?? value));
      } catch {
        // ignore
      }
    },
    [key, value],
  );

  useEffect(() => {
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      flushNow(value);
      persistTimerRef.current = null;
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [value, flushNow]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, []);

  return { value, setValue, flushNow } as const;
}

const WIDGET_META: Record<WidgetKind, { title: string; w: number; h: number; group: "Simulation" | "Physical Robot" | "I/O" }> = {
  "sim.full": { title: "Simulation (Full)", w: 520, h: 820, group: "Simulation" },
  "phys.full": { title: "Physical Robot (Full)", w: 560, h: 820, group: "Physical Robot" },

  "sim.pose": { title: "Pose Editor (IK)", w: 500, h: 320, group: "Simulation" },
  "sim.linear": { title: "Linear Move Simulation", w: 560, h: 760, group: "Simulation" },
  "sim.peaks": { title: "Motion Peaks", w: 520, h: 680, group: "Simulation" },

  "phys.quick": { title: "Physical Console (Quick Bar)", w: 760, h: 160, group: "Physical Robot" },
  "phys.presets": { title: "Presets", w: 860, h: 340, group: "Physical Robot" },
  "phys.homing": { title: "Homing / Calibration", w: 560, h: 300, group: "Physical Robot" },
  "phys.single": { title: "Single Joint Moves", w: 560, h: 520, group: "Physical Robot" },
  "phys.cartesian": { title: "Cartesian Move (Teensy)", w: 860, h: 420, group: "Physical Robot" },
  "phys.multi": { title: "Multi Move", w: 860, h: 420, group: "Physical Robot" },
  "phys.status": { title: "Joint Status", w: 620, h: 420, group: "Physical Robot" },

  "io.header": { title: "I/O Header", w: 620, h: 130, group: "I/O" },
  "io.estop": { title: "E-Stop", w: 620, h: 170, group: "I/O" },
  "io.buttons": { title: "Inputs: Buttons", w: 760, h: 420, group: "I/O" },
  "io.limits": { title: "Inputs: Limit Switches", w: 680, h: 360, group: "I/O" },
  "io.outputs": { title: "Outputs", w: 760, h: 380, group: "I/O" },
};

function defaultLayout(): Widget[] {
  const base: Array<{ kind: WidgetKind; x: number; y: number }> = [
    { kind: "sim.pose", x: 20, y: 110 },
    { kind: "sim.linear", x: 20, y: 460 },
    { kind: "sim.peaks", x: 560, y: 110 },

    { kind: "phys.quick", x: 1120, y: 110 },
    { kind: "phys.status", x: 1120, y: 300 },
  ];

  return base.map((b, i) => {
    const m = WIDGET_META[b.kind];
    return {
      kind: b.kind,
      title: m.title,
      x: snap(b.x),
      y: snap(b.y),
      w: snap(m.w),
      h: snap(m.h),
      z: 10 + i,
      minimized: false,
      visible: true,
    };
  });
}

function WidgetBody({ kind }: { kind: WidgetKind }) {
  switch (kind) {
    case "sim.full":
      return <SimRobotCards />;
    case "phys.full":
      return <PhysRobotCards />;

    case "sim.pose":
      return <SimPoseEditorWidget />;
    case "sim.linear":
      return <SimLinearMoveWidget />;
    case "sim.peaks":
      return <SimMotionPeaksWidget />;

    case "phys.quick":
      return <PhysQuickBarWidget />;
    case "phys.presets":
      return <PhysPresetsWidget />;
    case "phys.homing":
      return <PhysHomingWidget />;
    case "phys.single":
      return <PhysSingleJointMovesWidget />;
    case "phys.cartesian":
      return <PhysCartesianMoveWidget />;
    case "phys.multi":
      return <PhysMultiMoveWidget />;
    case "phys.status":
      return <PhysJointStatusWidget />;

    case "io.header":
      return <IoHeaderWidget />;
    case "io.estop":
      return <IoEStopWidget />;
    case "io.buttons":
      return <IoButtonsWidget />;
    case "io.limits":
      return <IoLimitsWidget />;
    case "io.outputs":
      return <IoOutputsWidget />;

    default:
      return <div className="p-3 text-sm text-muted-foreground">Unknown widget: {kind}</div>;
  }
}

const MemoWidgetBody = memo(WidgetBody);

function WidgetWindow({
  widget,
  onBringToFront,
  onMoveLive,
  onMoveCommit,
  onResizeLive,
  onResizeCommit,
  onToggleMinimize,
  onClose,
  children,
}: {
  widget: Widget;
  onBringToFront: (kind: WidgetKind) => void;
  onMoveLive: (kind: WidgetKind, x: number, y: number) => void;
  onMoveCommit: (kind: WidgetKind, x: number, y: number) => void;
  onResizeLive: (kind: WidgetKind, w: number, h: number) => void;
  onResizeCommit: (kind: WidgetKind, w: number, h: number) => void;
  onToggleMinimize: (kind: WidgetKind) => void;
  onClose: (kind: WidgetKind) => void;
  children: React.ReactNode;
}) {
  const dragRef = useRef<{ startX: number; startY: number; px: number; py: number; active: boolean } | null>(null);
  const resizeRef = useRef<{ startW: number; startH: number; px: number; py: number; active: boolean } | null>(null);

  const liveRectRef = useRef({ x: widget.x, y: widget.y, w: widget.w, h: widget.h });
  const rafMoveRef = useRef<number | null>(null);
  const rafResizeRef = useRef<number | null>(null);

  useEffect(() => {
    liveRectRef.current = { x: widget.x, y: widget.y, w: widget.w, h: widget.h };
  }, [widget.x, widget.y, widget.w, widget.h]);

  useEffect(() => {
    return () => {
      if (rafMoveRef.current) cancelAnimationFrame(rafMoveRef.current);
      if (rafResizeRef.current) cancelAnimationFrame(rafResizeRef.current);
    };
  }, []);

  const flushMove = useCallback(() => {
    if (rafMoveRef.current) {
      cancelAnimationFrame(rafMoveRef.current);
      rafMoveRef.current = null;
    }
    const { x, y } = liveRectRef.current;
    onMoveCommit(widget.kind, x, y);
  }, [onMoveCommit, widget.kind]);

  const flushResize = useCallback(() => {
    if (rafResizeRef.current) {
      cancelAnimationFrame(rafResizeRef.current);
      rafResizeRef.current = null;
    }
    const { w, h } = liveRectRef.current;
    onResizeCommit(widget.kind, w, h);
  }, [onResizeCommit, widget.kind]);

  const onPointerDownHeader = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      if (e.target !== e.currentTarget) return;

      onBringToFront(widget.kind);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      dragRef.current = {
        active: true,
        startX: liveRectRef.current.x,
        startY: liveRectRef.current.y,
        px: e.clientX,
        py: e.clientY,
      };
    },
    [onBringToFront, widget.kind],
  );

  const onPointerMoveHeader = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d?.active) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxX = vw - 60;
      const maxY = vh - 90;

      const nx = clamp(snap(d.startX + (e.clientX - d.px)), 0, maxX);
      const ny = clamp(snap(d.startY + (e.clientY - d.py)), 0, maxY);

      liveRectRef.current.x = nx;
      liveRectRef.current.y = ny;

      if (rafMoveRef.current == null) {
        rafMoveRef.current = requestAnimationFrame(() => {
          rafMoveRef.current = null;
          onMoveLive(widget.kind, liveRectRef.current.x, liveRectRef.current.y);
        });
      }
    },
    [onMoveLive, widget.kind],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d?.active) return;
      dragRef.current = null;

      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      flushMove();
    },
    [flushMove],
  );

  const onPointerDownResize = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      onBringToFront(widget.kind);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      resizeRef.current = {
        active: true,
        startW: liveRectRef.current.w,
        startH: liveRectRef.current.h,
        px: e.clientX,
        py: e.clientY,
      };
    },
    [onBringToFront, widget.kind],
  );

  const onPointerMoveResize = useCallback(
    (e: React.PointerEvent) => {
      const r = resizeRef.current;
      if (!r?.active) return;

      const nw = snap(clamp(r.startW + (e.clientX - r.px), 280, 1400));
      const nh = snap(clamp(r.startH + (e.clientY - r.py), 200, 1100));

      liveRectRef.current.w = nw;
      liveRectRef.current.h = nh;

      if (rafResizeRef.current == null) {
        rafResizeRef.current = requestAnimationFrame(() => {
          rafResizeRef.current = null;
          onResizeLive(widget.kind, liveRectRef.current.w, liveRectRef.current.h);
        });
      }
    },
    [onResizeLive, widget.kind],
  );

  const endResize = useCallback(
    (e: React.PointerEvent) => {
      const r = resizeRef.current;
      if (!r?.active) return;
      resizeRef.current = null;

      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      flushResize();
    },
    [flushResize],
  );

  if (!widget.visible || widget.minimized) return null;

  return (
    <div
      className="pointer-events-auto absolute rounded-2xl border bg-background/75 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/60"
      style={{
        left: widget.x,
        top: widget.y,
        width: widget.w,
        height: widget.h,
        zIndex: widget.z,
      }}
      onMouseDown={() => onBringToFront(widget.kind)}
    >
      <div
        className="flex h-10 cursor-grab items-center justify-between gap-2 rounded-t-2xl border-b bg-muted/20 px-3 active:cursor-grabbing"
        onPointerDown={onPointerDownHeader}
        onPointerMove={onPointerMoveHeader}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        <div className="min-w-0 truncate select-none text-xs font-semibold">{widget.title}</div>

        <div
          className="flex items-center gap-1"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Minimize"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMinimize(widget.kind);
            }}
          >
            <PiMinusBold className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClose(widget.kind);
            }}
          >
            <PiXBold className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="h-[calc(100%-40px)] overflow-hidden p-2">
        <div className="h-full overflow-auto rounded-xl">{children}</div>
      </div>

      <div
        className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-sm border bg-background/70"
        onPointerDown={onPointerDownResize}
        onPointerMove={onPointerMoveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        title="Resize"
      />
    </div>
  );
}

const MemoWidgetWindow = memo(WidgetWindow);

/* =======================================================================================
 *  RobotStudioTab
 * ======================================================================================= */

export function RobotStudioTabInner() {
  const { connected } = useRobotStatus();
  const { stopAll, getAllJointStatus, moveMultiple } = useRobotCommands();
  const { parameters } = useRobotIO();
  const { joints: realJoints } = useRobotKinematics();
  const virtualJoints = useJointStore((s) => (s.anglesUi ?? (s as any).angles ?? [0, 0, 0, 0, 0, 0]) as number[]);
  const [syncBusy, setSyncBusy] = useState(false);
  const { gizmoMode, setGizmoMode, setSelection } = useViewer();

  const [extras, setExtras] = useState<ExtraModelProps[]>([]);
  const [speedPct, setSpeedPct] = useState(40);

  const onStop = useCallback(() => stopAll?.(), [stopAll]);

  const onSpeedChange = useCallback((v: number[]) => {
    const next = Math.max(1, Math.min(100, Math.round(v?.[0] ?? 40)));
    setSpeedPct(next);
  }, []);

  const onSyncPhysicalToVirtual = useCallback(async () => {
    if (!connected || syncBusy) return;

    setSyncBusy(true);
    try {
      await movePhysicalToVirtual({
        getAllJointStatus,
        poseJoints: virtualJoints.slice(0, 6),
        parameters,
        moveMultiple,
        toast,
      });
    } finally {
      setSyncBusy(false);
    }
  }, [connected, syncBusy, getAllJointStatus, virtualJoints, parameters, moveMultiple]);

  const layoutState = usePersistentLayoutState<Widget[]>(LS_KEY, defaultLayout);
  const widgets = layoutState.value;
  const setWidgets = layoutState.setValue;
  const flushWidgets = layoutState.flushNow;

  useEffect(() => {
    setWidgets((prev) => dedupeWidgets(prev));
  }, [setWidgets]);

  const bringToFront = useCallback(
    (kind: WidgetKind) => {
      setWidgets((prev) => {
        const maxZ = prev.reduce((m, w) => Math.max(m, w.z), 1);
        let changed = false;
        const next = prev.map((w) => {
          if (w.kind !== kind) return w;
          if (w.z === maxZ + 1) return w;
          changed = true;
          return { ...w, z: maxZ + 1 };
        });
        return changed ? next : prev;
      });
    },
    [setWidgets],
  );

  const moveWidgetLive = useCallback(
    (kind: WidgetKind, x: number, y: number) => {
      setWidgets((prev) => {
        let changed = false;
        const next = prev.map((w) => {
          if (w.kind !== kind) return w;
          const sx = snap(x);
          const sy = snap(y);
          if (w.x === sx && w.y === sy) return w;
          changed = true;
          return { ...w, x: sx, y: sy };
        });
        return changed ? next : prev;
      });
    },
    [setWidgets],
  );

  const moveWidgetCommit = useCallback(
    (kind: WidgetKind, x: number, y: number) => {
      setWidgets((prev) => prev.map((w) => (w.kind === kind ? { ...w, x: snap(x), y: snap(y) } : w)));
      flushWidgets();
    },
    [setWidgets, flushWidgets],
  );

  const resizeWidgetLive = useCallback(
    (kind: WidgetKind, w: number, h: number) => {
      setWidgets((prev) => {
        let changed = false;
        const next = prev.map((it) => {
          if (it.kind !== kind) return it;
          const sw = snap(w);
          const sh = snap(h);
          if (it.w === sw && it.h === sh) return it;
          changed = true;
          return { ...it, w: sw, h: sh };
        });
        return changed ? next : prev;
      });
    },
    [setWidgets],
  );

  const resizeWidgetCommit = useCallback(
    (kind: WidgetKind, w: number, h: number) => {
      setWidgets((prev) => prev.map((it) => (it.kind === kind ? { ...it, w: snap(w), h: snap(h) } : it)));
      flushWidgets();
    },
    [setWidgets, flushWidgets],
  );

  const toggleMinimize = useCallback(
    (kind: WidgetKind) => {
      setWidgets((prev) => {
        const maxZ = prev.reduce((m, w) => Math.max(m, w.z), 1);
        return prev.map((w) =>
          w.kind === kind
            ? {
                ...w,
                minimized: !w.minimized,
                z: w.minimized ? maxZ + 1 : w.z,
              }
            : w,
        );
      });
    },
    [setWidgets],
  );

  const closeWidget = useCallback(
    (kind: WidgetKind) => {
      setWidgets((prev) => prev.filter((w) => w.kind !== kind));
    },
    [setWidgets],
  );

  const setVisible = useCallback(
    (kind: WidgetKind, visible: boolean) => {
      setWidgets((prev) => {
        const exists = prev.find((w) => w.kind === kind);

        if (visible) {
          if (exists) {
            const maxZ = prev.reduce((m, w) => Math.max(m, w.z), 1);
            return prev.map((w) => (w.kind === kind ? { ...w, visible: true, minimized: false, z: maxZ + 1 } : w));
          }

          const meta = WIDGET_META[kind];
          const maxZ = prev.reduce((m, w) => Math.max(m, w.z), 1);
          const baseX = snap(20 + (prev.length % 7) * 40);
          const baseY = snap(110 + (prev.length % 7) * 32);

          return [
            ...prev,
            {
              kind,
              title: meta.title,
              x: baseX,
              y: baseY,
              w: snap(meta.w),
              h: snap(meta.h),
              z: maxZ + 1,
              minimized: false,
              visible: true,
            },
          ];
        }

        if (!exists) return prev;
        return prev.filter((w) => w.kind !== kind);
      });
    },
    [setWidgets],
  );

  const resetLayout = useCallback(() => {
    const next = defaultLayout();
    setWidgets(next);
    flushWidgets(next);
  }, [setWidgets, flushWidgets]);

  const minimizeAll = useCallback(() => {
    setWidgets((prev) => prev.map((w) => ({ ...w, minimized: true })));
  }, [setWidgets]);

  const restoreAll = useCallback(() => {
    setWidgets((prev) => {
      const maxZ = prev.reduce((m, w) => Math.max(m, w.z), 1);
      let z = maxZ + 1;
      return prev.map((w) => ({ ...w, minimized: false, z: z++ }));
    });
  }, [setWidgets]);

  const activeKinds = useMemo(() => new Set(widgets.map((w) => w.kind)), [widgets]);

  const simulationMenu: Array<{ kind: WidgetKind; label: string }> = [
    { kind: "sim.pose", label: "Pose Editor" },
    { kind: "sim.linear", label: "Linear Move Simulation" },
    { kind: "sim.peaks", label: "Motion Peaks" },
    { kind: "sim.full", label: "Simulation Panel" },
  ];

  const physicalMenu: Array<{ kind: WidgetKind; label: string }> = [
    { kind: "phys.quick", label: "Quick Controls" },
    { kind: "phys.presets", label: "Presets" },
    { kind: "phys.homing", label: "Homing and Calibration" },
    { kind: "phys.single", label: "Single Joint Control" },
    { kind: "phys.cartesian", label: "Cartesian Move" },
    { kind: "phys.multi", label: "Multi Move" },
    { kind: "phys.status", label: "Joint Status" },
    { kind: "phys.full", label: "Physical Robot Panel" },
  ];

  const ioMenu: Array<{ kind: WidgetKind; label: string }> = [
    { kind: "io.header", label: "I/O Overview" },
    { kind: "io.estop", label: "Emergency Stop" },
    { kind: "io.buttons", label: "Button Inputs" },
    { kind: "io.limits", label: "Limit Switches" },
    { kind: "io.outputs", label: "Outputs" },
  ];

  const minimized = useMemo(() => widgets.filter((w) => w.visible && w.minimized).sort((a, b) => a.title.localeCompare(b.title)), [widgets]);

  const handleAddExtra = useCallback((extra: ExtraModelProps) => {
    setExtras((old) => [...old, extra]);
  }, []);

  return (
    <>
      <div className="relative h-full w-full min-h-0 overflow-hidden text-foreground">
        <div className="absolute inset-0 z-0">
          <RobotLoader extras={extras} />
        </div>

        <div className="absolute inset-0 z-10 pointer-events-none">
          <div className="pointer-events-auto absolute left-5 right-5 top-3 z-50">
            <Card className="py-0">
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex flex-col leading-tight">
                    <div className="text-sm font-semibold tracking-tight">6AR Studio</div>
                  </div>

                  <Separator orientation="vertical" className="hidden h-8 md:block" />

                  <Badge className="shrink-0" variant={connected ? "default" : "destructive"}>
                    {connected ? "Robot Online" : "Robot Offline"}
                  </Badge>
                </div>

                <div className="flex-1" />

                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-9 px-3">
                        Simulation
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[270px]">
                      <DropdownMenuLabel>Simulation Widgets</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {simulationMenu.map((it) => (
                        <DropdownMenuCheckboxItem key={it.kind} checked={activeKinds.has(it.kind)} onCheckedChange={(v) => setVisible(it.kind, !!v)}>
                          {it.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-9 px-3">
                        Physical Robot
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[300px]">
                      <DropdownMenuLabel>Physical Robot Widgets</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {physicalMenu.map((it) => (
                        <DropdownMenuCheckboxItem key={it.kind} checked={activeKinds.has(it.kind)} onCheckedChange={(v) => setVisible(it.kind, !!v)}>
                          {it.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-9 px-3">
                        I/O
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[260px]">
                      <DropdownMenuLabel>I/O Widgets</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {ioMenu.map((it) => (
                        <DropdownMenuCheckboxItem key={it.kind} checked={activeKinds.has(it.kind)} onCheckedChange={(v) => setVisible(it.kind, !!v)}>
                          {it.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-9 px-3">
                        Layout
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[240px]">
                      <DropdownMenuLabel>Layout</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={resetLayout}>Reset layout</DropdownMenuItem>
                      <DropdownMenuItem onClick={minimizeAll}>Minimize all</DropdownMenuItem>
                      <DropdownMenuItem onClick={restoreAll}>Restore all</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          localStorage.removeItem(LS_KEY);
                          resetLayout();
                        }}
                      >
                        Factory reset (clear saved)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-9 px-3">
                      Gizmo
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end" className="w-[260px]">
                    <DropdownMenuLabel>Manipulation Mode</DropdownMenuLabel>
                    <DropdownMenuSeparator />

                    <DropdownMenuCheckboxItem
                      checked={gizmoMode === "off"}
                      onCheckedChange={() => {
                        setGizmoMode("off");
                        setSelection({ kind: "none" });
                      }}
                    >
                      Off
                    </DropdownMenuCheckboxItem>

                    <DropdownMenuCheckboxItem checked={gizmoMode === "joint"} onCheckedChange={() => setGizmoMode("joint")}>
                      Joint rotate
                    </DropdownMenuCheckboxItem>

                    <DropdownMenuCheckboxItem
                      checked={gizmoMode === "tcp_translate"}
                      onCheckedChange={() => {
                        setGizmoMode("tcp_translate");
                        setSelection({ kind: "tcp" });
                      }}
                    >
                      TCP translate (XYZ)
                    </DropdownMenuCheckboxItem>

                    <DropdownMenuCheckboxItem
                      checked={gizmoMode === "tcp_rotate"}
                      onCheckedChange={() => {
                        setGizmoMode("tcp_rotate");
                        setSelection({ kind: "tcp" });
                      }}
                    >
                      TCP rotate (gimbal)
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Separator orientation="vertical" className="hidden h-8 md:block" />

                <div className="hidden items-center gap-3 rounded-xl border bg-background/40 px-3 py-2 lg:flex">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-medium text-muted-foreground">Speed override</span>
                  </div>

                  <div className="w-44">
                    <Slider min={1} max={100} step={1} value={[speedPct]} onValueChange={onSpeedChange} />
                  </div>

                  <div className="w-10 text-right text-xs font-semibold tabular-nums">{speedPct}%</div>
                </div>

                <AddStlDialog onAdd={handleAddExtra} />

                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="secondary" className="rounded-xl" disabled={!connected || syncBusy}>
                      <PiArrowsClockwiseBold className="mr-2 h-4 w-4" />
                      {syncBusy ? "Syncing..." : "Sync P→V"}
                    </Button>
                  </PopoverTrigger>

                  <PopoverContent className="w-[420px] rounded-2xl p-3" align="start">
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-semibold">Move Physical → Virtual</div>
                        <div className="text-xs text-muted-foreground">Reads the real robot joint positions and sends one synchronized MoveMultiple to match the current virtual pose.</div>
                      </div>

                      <Separator />

                      <div className="grid grid-cols-3 gap-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <Card key={`real-${i}`} className="p-2">
                            <div className="text-[11px] font-semibold text-muted-foreground">Real J{i + 1}</div>
                            <div className="text-sm font-semibold">{Number(realJoints?.[i] ?? 0).toFixed(2)}°</div>
                          </Card>
                        ))}
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <Card key={`virt-${i}`} className="p-2">
                            <div className="text-[11px] font-semibold text-muted-foreground">Virtual J{i + 1}</div>
                            <div className="text-sm font-semibold">{Number(virtualJoints?.[i] ?? 0).toFixed(2)}°</div>
                          </Card>
                        ))}
                      </div>

                      <Button className="w-full rounded-xl" onClick={onSyncPhysicalToVirtual} disabled={!connected || syncBusy}>
                        <PiArrowsClockwiseBold className="mr-2 h-4 w-4" />
                        {syncBusy ? "Sending MoveMultiple..." : "Move Physical Robot To Virtual Pose"}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                <Button size="sm" variant="destructive" onClick={onStop} disabled={!connected} className="rounded-xl">
                  <PiStopBold className="mr-2 h-4 w-4" />
                  Stop
                </Button>
              </div>
            </Card>
          </div>

          <div className="absolute inset-0">
            {widgets
              .filter((w) => w.visible)
              .sort((a, b) => a.z - b.z)
              .map((w) => (
                <MemoWidgetWindow
                  key={w.kind}
                  widget={w}
                  onBringToFront={bringToFront}
                  onMoveLive={moveWidgetLive}
                  onMoveCommit={moveWidgetCommit}
                  onResizeLive={resizeWidgetLive}
                  onResizeCommit={resizeWidgetCommit}
                  onToggleMinimize={toggleMinimize}
                  onClose={closeWidget}
                >
                  <MemoWidgetBody kind={w.kind} />
                </MemoWidgetWindow>
              ))}
          </div>

          {minimized.length > 0 && (
            <div className="pointer-events-auto absolute bottom-4 left-5 right-5 z-50">
              <Card className="py-0">
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="text-xs font-semibold text-muted-foreground">Minimized</div>
                  <Separator orientation="vertical" className="h-6" />
                  <div className="flex flex-1 flex-wrap gap-2">
                    {minimized.map((w) => (
                      <Button key={w.kind} size="sm" variant="outline" className="h-8 rounded-xl" onClick={() => toggleMinimize(w.kind)}>
                        {w.title}
                      </Button>
                    ))}
                  </div>
                  <Button size="sm" variant="secondary" onClick={restoreAll}>
                    Restore all
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      <Overlays />
    </>
  );
}

export default function RobotStudioTab() {
  return (
    <ViewerProvider>
      <SimStreamProvider>
        <RobotStudioTabInner />
      </SimStreamProvider>
    </ViewerProvider>
  );
}
