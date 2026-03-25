import React, { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { toast } from "sonner";

import { useJointStore } from "@/stores/JointStore";
import { useRobotCommands, useRobotStatus } from "@/contexts/robot";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type Vec6 = [number, number, number, number, number, number];
const ZERO6: Vec6 = [0, 0, 0, 0, 0, 0];

function safeParse(s: string, fallback = 0) {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : fallback;
}

function Field({ k, unit, value, setValue, disabled }: { k: string; unit: string; value: string; setValue: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {k} <span className="text-muted-foreground">({unit})</span>
      </Label>
      <Input value={value} onChange={(e) => setValue(e.target.value)} disabled={disabled} />
    </div>
  );
}

function MotionPeaks({ debug }: { debug: { v: number[]; a: number[]; vMaxAbs: number[]; aMaxAbs: number[] } }) {
  const vmaxGuess = 180;
  const amaxGuess = 2000;

  const badge = (pct: number) => {
    if (pct >= 95) return <Badge variant="destructive">HOT</Badge>;
    if (pct >= 75) return <Badge variant="secondary">HIGH</Badge>;
    if (pct >= 50) return <Badge variant="outline">MED</Badge>;
    return <Badge variant="outline">OK</Badge>;
  };

  return (
    <div className="grid gap-2">
      {Array.from({ length: 6 }).map((_, i) => {
        const v = debug.v[i] ?? 0;
        const a = debug.a[i] ?? 0;
        const vMax = debug.vMaxAbs[i] ?? 0;
        const aMax = debug.aMaxAbs[i] ?? 0;

        const vPct = Math.min(100, (Math.abs(v) / vmaxGuess) * 100);
        const aPct = Math.min(100, (Math.abs(a) / amaxGuess) * 100);

        return (
          <div key={i} className="rounded-xl border p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold">J{i + 1}</div>
              <div className="text-xs text-muted-foreground">
                peak v {vMax.toFixed(1)} • peak a {aMax.toFixed(0)}
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between rounded-lg border bg-background/40 px-2 py-1 text-xs">
                <span className="text-muted-foreground">v</span>
                <span className="font-semibold">{v.toFixed(1)}</span>
                {badge(vPct)}
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-background/40 px-2 py-1 text-xs">
                <span className="text-muted-foreground">a</span>
                <span className="font-semibold">{a.toFixed(0)}</span>
                {badge(aPct)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ========================================================================== */
/*                                   CARDS                                    */
/* ========================================================================== */

export const PoseEditorCard = memo(function PoseEditorCard(props: {
  socketConnected: boolean;
  posX: string;
  posY: string;
  posZ: string;
  angA: string;
  angB: string;
  angC: string;
  setPosX: (v: string) => void;
  setPosY: (v: string) => void;
  setPosZ: (v: string) => void;
  setAngA: (v: string) => void;
  setAngB: (v: string) => void;
  setAngC: (v: string) => void;
  onApplyNow: () => void;
  onScheduleApply: () => void;
}) {
  const { socketConnected, posX, posY, posZ, angA, angB, angC, setPosX, setPosY, setPosZ, setAngA, setAngB, setAngC, onApplyNow, onScheduleApply } = props;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Pose Editor (IK)</div>
          <div className="text-xs text-muted-foreground">Debounced edits • Apply sends now</div>
        </div>
        <Button size="sm" variant="secondary" onClick={onApplyNow} disabled={!socketConnected}>
          Apply
        </Button>
      </div>

      <Separator className="my-3" />

      <div className="grid grid-cols-3 gap-2">
        <Field
          k="X"
          unit="mm"
          value={posX}
          setValue={(v) => {
            setPosX(v);
            onScheduleApply();
          }}
        />
        <Field
          k="Y"
          unit="mm"
          value={posY}
          setValue={(v) => {
            setPosY(v);
            onScheduleApply();
          }}
        />
        <Field
          k="Z"
          unit="mm"
          value={posZ}
          setValue={(v) => {
            setPosZ(v);
            onScheduleApply();
          }}
        />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <Field
          k="A"
          unit="°"
          value={angA}
          setValue={(v) => {
            setAngA(v);
            onScheduleApply();
          }}
        />
        <Field
          k="B"
          unit="°"
          value={angB}
          setValue={(v) => {
            setAngB(v);
            onScheduleApply();
          }}
        />
        <Field
          k="C"
          unit="°"
          value={angC}
          setValue={(v) => {
            setAngC(v);
            onScheduleApply();
          }}
        />
      </div>
    </Card>
  );
});

export const LinearMoveCard = memo(function LinearMoveCard(props: {
  socketConnected: boolean;
  speedPct: number;
  disabled: boolean;
  isStreaming: boolean;
  uiAngles: number[];
  lmX: string;
  lmY: string;
  lmZ: string;
  lmA: string;
  lmB: string;
  lmC: string;
  lmSpeed: string;
  lmAccel: string;
  setLmX: (v: string) => void;
  setLmY: (v: string) => void;
  setLmZ: (v: string) => void;
  setLmA: (v: string) => void;
  setLmB: (v: string) => void;
  setLmC: (v: string) => void;
  setLmSpeed: (v: string) => void;
  setLmAccel: (v: string) => void;
  onExecute: () => void;
}) {
  const {
    socketConnected,
    speedPct,
    disabled,
    isStreaming,
    uiAngles,
    lmX,
    lmY,
    lmZ,
    lmA,
    lmB,
    lmC,
    lmSpeed,
    lmAccel,
    setLmX,
    setLmY,
    setLmZ,
    setLmA,
    setLmB,
    setLmC,
    setLmSpeed,
    setLmAccel,
    onExecute,
  } = props;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Linear Move (Sim Stream)</div>
          <div className="text-xs text-muted-foreground">Uses speed override • Streams angles/speeds/accels</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{speedPct}%</Badge>
          <Button size="sm" onClick={onExecute} disabled={!socketConnected || disabled}>
            Execute
          </Button>
        </div>
      </div>

      <Separator className="my-3" />

      <div className="grid gap-3">
        <div className="grid grid-cols-3 gap-2">
          <Field k="X" unit="mm" value={lmX} setValue={setLmX} disabled={disabled} />
          <Field k="Y" unit="mm" value={lmY} setValue={setLmY} disabled={disabled} />
          <Field k="Z" unit="mm" value={lmZ} setValue={setLmZ} disabled={disabled} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field k="A" unit="°" value={lmA} setValue={setLmA} disabled={disabled} />
          <Field k="B" unit="°" value={lmB} setValue={setLmB} disabled={disabled} />
          <Field k="C" unit="°" value={lmC} setValue={setLmC} disabled={disabled} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field k="Speed" unit="m/s" value={lmSpeed} setValue={setLmSpeed} disabled={disabled} />
          <Field k="Accel" unit="m/s²" value={lmAccel} setValue={setLmAccel} disabled={disabled} />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{isStreaming ? "Streaming…" : "Idle"}</span>
          <span className="truncate">
            Angles:{" "}
            {uiAngles
              ?.slice(0, 6)
              .map((a) => a.toFixed(1))
              .join(" / ")}
            °
          </span>
        </div>
      </div>
    </Card>
  );
});

export const MotionPeaksCard = memo(function MotionPeaksCard(props: { debug: { v: number[]; a: number[]; vMaxAbs: number[]; aMaxAbs: number[] } }) {
  const { debug } = props;
  return (
    <Card className="p-3">
      <div className="text-sm font-semibold">Motion Peaks</div>
      <div className="text-xs text-muted-foreground">Live v/a + absolute peaks</div>
      <Separator className="my-3" />
      <MotionPeaks debug={debug} />
    </Card>
  );
});

/* ========================================================================== */
/*                              Shared Sim Stream                             */
/* ========================================================================== */

type SimStreamModel = {
  socketConnected: boolean;
  isStreaming: boolean;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  resetPeaks: () => void;
  debug: {
    v: number[];
    a: number[];
    vMaxAbs: number[];
    aMaxAbs: number[];
  };
};

const SimStreamContext = createContext<SimStreamModel | null>(null);

function useSimStreamModelInternal(): SimStreamModel {
  const { socket } = useRobotStatus();

  const setAnglesUi = useJointStore((s) => (s.setAnglesUi ?? (s as any).setAngles) as (a: number[]) => void);
  const setAnglesFast = useJointStore((s) => (s.setAnglesFast ?? (s as any).setAngles) as (a: number[]) => void);

  const latestSpeedsRef = useRef<number[] | null>(null);
  const latestAccelsRef = useRef<number[] | null>(null);

  const peaksRef = useRef({
    vMaxAbs: [0, 0, 0, 0, 0, 0],
    aMaxAbs: [0, 0, 0, 0, 0, 0],
  });

  const [debug, setDebug] = useState({
    v: [0, 0, 0, 0, 0, 0],
    a: [0, 0, 0, 0, 0, 0],
    vMaxAbs: [0, 0, 0, 0, 0, 0],
    aMaxAbs: [0, 0, 0, 0, 0, 0],
  });

  const [isStreaming, setIsStreaming] = useState(false);

  const resetPeaks = useCallback(() => {
    peaksRef.current.vMaxAbs = [0, 0, 0, 0, 0, 0];
    peaksRef.current.aMaxAbs = [0, 0, 0, 0, 0, 0];
    setDebug({
      v: [0, 0, 0, 0, 0, 0],
      a: [0, 0, 0, 0, 0, 0],
      vMaxAbs: [0, 0, 0, 0, 0, 0],
      aMaxAbs: [0, 0, 0, 0, 0, 0],
    });
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onStep = (msg: any) => {
      const angles = Array.isArray(msg) ? msg : msg?.angles;

      if (Array.isArray(angles) && angles.length === 6) {
        setAnglesFast(angles);
        setAnglesUi(angles);
      }

      if (Array.isArray(msg?.speeds) && msg.speeds.length === 6) {
        latestSpeedsRef.current = msg.speeds;
        const vMax = peaksRef.current.vMaxAbs;
        for (let i = 0; i < 6; i++) {
          vMax[i] = Math.max(vMax[i], Math.abs(msg.speeds[i] || 0));
        }
      }

      if (Array.isArray(msg?.accels) && msg.accels.length === 6) {
        latestAccelsRef.current = msg.accels;
        const aMax = peaksRef.current.aMaxAbs;
        for (let i = 0; i < 6; i++) {
          aMax[i] = Math.max(aMax[i], Math.abs(msg.accels[i] || 0));
        }
      }
    };

    const onDone = () => {
      setIsStreaming(false);
      toast.success("Move done", {
        description: "Motion peaks updated.",
      });
    };

    const onIkResponse = (msg: any) => {
      if (msg?.error) return;
      const angles = Array.isArray(msg) ? msg : (msg?.angles ?? msg?.joints);
      if (Array.isArray(angles) && angles.length === 6) {
        setAnglesFast(angles);
        setAnglesUi(angles);
      }
    };

    socket.on("linearMove", onStep);
    socket.on("linearMoveComplete", onDone);
    socket.on("ik_response", onIkResponse);

    return () => {
      socket.off("linearMove", onStep);
      socket.off("linearMoveComplete", onDone);
      socket.off("ik_response", onIkResponse);
    };
  }, [socket, setAnglesFast, setAnglesUi]);

  const lastDebugStampRef = useRef<number>(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      const v = latestSpeedsRef.current;
      const acc = latestAccelsRef.current;

      // Skip update entirely if no speed data has arrived yet
      if (!Array.isArray(v) || v.length !== 6) return;

      // Skip if nothing changed since last tick (compare first value as a cheap proxy)
      const stamp = (v[0] ?? 0) + (acc?.[0] ?? 0);
      if (stamp === lastDebugStampRef.current) return;
      lastDebugStampRef.current = stamp;

      setDebug({
        v: v.slice(),
        a: Array.isArray(acc) && acc.length === 6 ? acc.slice() : ZERO6.slice(),
        vMaxAbs: peaksRef.current.vMaxAbs.slice(),
        aMaxAbs: peaksRef.current.aMaxAbs.slice(),
      });
    }, 100);

    return () => clearInterval(id);
  }, []);

  return useMemo(
    () => ({
      socketConnected: !!socket?.connected,
      isStreaming,
      setIsStreaming,
      resetPeaks,
      debug,
    }),
    [socket, isStreaming, resetPeaks, debug],
  );
}

export function SimStreamProvider({ children }: { children: React.ReactNode }) {
  const model = useSimStreamModelInternal();
  return <SimStreamContext.Provider value={model}>{children}</SimStreamContext.Provider>;
}

function useSimStreamModel() {
  const ctx = useContext(SimStreamContext);
  if (!ctx) {
    throw new Error("useSimStreamModel must be used within SimStreamProvider");
  }
  return ctx;
}

/* ========================================================================== */
/*                            Full Panel (legacy)                             */
/* ========================================================================== */

export default function SimRobotCards({ speedPct }: { speedPct: number }) {
  return (
    <SimStreamProvider>
      <ScrollArea className="h-full">
        <div className="grid gap-3 pr-1">
          <SimPoseEditorWidget />
          <SimLinearMoveWidget speedPct={speedPct} />
          <SimMotionPeaksWidget />
        </div>
      </ScrollArea>
    </SimStreamProvider>
  );
}

/* ========================================================================== */
/*                         Zero-prop Widget Exports                           */
/* ========================================================================== */

export function SimPoseEditorWidget() {
  const { socket } = useRobotStatus();
  const { ikRequest } = useRobotCommands();

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [posX, setPosX] = useState("0");
  const [posY, setPosY] = useState("500");
  const [posZ, setPosZ] = useState("600");
  const [angA, setAngA] = useState("0");
  const [angB, setAngB] = useState("180");
  const [angC, setAngC] = useState("0");

  // Stable ref so applyPose always reads the latest values regardless of closure age
  const poseRef = useRef({ x: "0", y: "500", z: "600", a: "0", b: "180", c: "0" });

  // Update both state (for rendering) and ref (for debounced reads)
  const setXYZ = useCallback((x: string, y: string, z: string) => {
    poseRef.current.x = x; poseRef.current.y = y; poseRef.current.z = z;
    setPosX(x); setPosY(y); setPosZ(z);
  }, []);
  const setABC = useCallback((a: string, b: string, c: string) => {
    poseRef.current.a = a; poseRef.current.b = b; poseRef.current.c = c;
    setAngA(a); setAngB(b); setAngC(c);
  }, []);

  // applyPose reads from ref — no stale closure issue
  const applyPose = useCallback(() => {
    const { x, y, z, a, b, c } = poseRef.current;
    const xv = safeParse(x), yv = safeParse(y), zv = safeParse(z);
    const av = safeParse(a), bv = safeParse(b), cv = safeParse(c);
    if ([xv, yv, zv, av, bv, cv].some((v) => !Number.isFinite(v))) return;
    const e = new THREE.Euler(THREE.MathUtils.degToRad(av), THREE.MathUtils.degToRad(bv), THREE.MathUtils.degToRad(cv), "XYZ");
    const q = new THREE.Quaternion().setFromEuler(e);
    ikRequest?.([xv / 1000, yv / 1000, zv / 1000], [q.x, q.y, q.z, q.w]);
  }, [ikRequest]);

  const scheduleApplyPose = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      applyPose();
      debounceTimer.current = null;
    }, 80);
  }, [applyPose]);

  useEffect(() => () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); }, []);

  // Throttle for gizmo IK: apply immediately, then at most every 50 ms during drag.
  const gizmoThrottleRef = useRef<number | null>(null);
  const gizmoPendingRef = useRef(false);

  const throttledApplyPose = useCallback(() => {
    if (gizmoThrottleRef.current != null) {
      gizmoPendingRef.current = true;
      return;
    }
    applyPose();
    gizmoThrottleRef.current = window.setTimeout(() => {
      gizmoThrottleRef.current = null;
      if (gizmoPendingRef.current) {
        gizmoPendingRef.current = false;
        applyPose();
      }
    }, 50);
  }, [applyPose]);

  // Send initial pose as soon as we have a live socket connection
  const { connected } = useRobotStatus();
  const didInitRef = useRef(false);
  useEffect(() => {
    if (connected && !didInitRef.current) {
      didInitRef.current = true;
      applyPose();
    }
    if (!connected) didInitRef.current = false; // reset on disconnect so it re-fires on reconnect
  }, [connected, applyPose]);

  // TCP gizmo → pose editor: fired during drag (preview) and on release (changed)
  useEffect(() => {
    const parseTcp = (e: Event) => {
      const { position, quaternion } = (e as CustomEvent).detail ?? {};
      if (!position || !quaternion) return null;
      const q = new THREE.Quaternion(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
      const euler = new THREE.Euler().setFromQuaternion(q, "XYZ");
      return {
        x: (position[0] * 1000).toFixed(1),
        y: (position[1] * 1000).toFixed(1),
        z: (position[2] * 1000).toFixed(1),
        a: THREE.MathUtils.radToDeg(euler.x).toFixed(1),
        b: THREE.MathUtils.radToDeg(euler.y).toFixed(1),
        c: THREE.MathUtils.radToDeg(euler.z).toFixed(1),
      };
    };

    const handlePreview = (e: Event) => {
      const v = parseTcp(e);
      if (!v) return;
      setXYZ(v.x, v.y, v.z);
      setABC(v.a, v.b, v.c);
      throttledApplyPose();
    };

    const handleChanged = (e: Event) => {
      const v = parseTcp(e);
      if (!v) return;
      setXYZ(v.x, v.y, v.z);
      setABC(v.a, v.b, v.c);
      // Flush any pending throttle and apply the final position immediately.
      if (gizmoThrottleRef.current != null) {
        clearTimeout(gizmoThrottleRef.current);
        gizmoThrottleRef.current = null;
        gizmoPendingRef.current = false;
      }
      applyPose();
    };

    window.addEventListener("robot_tcp_target_preview", handlePreview);
    window.addEventListener("robot_tcp_target_changed", handleChanged);
    return () => {
      window.removeEventListener("robot_tcp_target_preview", handlePreview);
      window.removeEventListener("robot_tcp_target_changed", handleChanged);
    };
  }, [setXYZ, setABC, applyPose, throttledApplyPose]);

  // IK error handler
  useEffect(() => {
    if (!socket) return;
    const onIk = (msg: any) => {
      if (msg?.error) toast.error("IK error", { description: msg.error });
    };
    socket.on("ik_response", onIk);
    return () => socket.off("ik_response", onIk);
  }, [socket]);

  return (
    <PoseEditorCard
      socketConnected={!!socket?.connected}
      posX={posX} posY={posY} posZ={posZ}
      angA={angA} angB={angB} angC={angC}
      setPosX={(v) => { poseRef.current.x = v; setPosX(v); }}
      setPosY={(v) => { poseRef.current.y = v; setPosY(v); }}
      setPosZ={(v) => { poseRef.current.z = v; setPosZ(v); }}
      setAngA={(v) => { poseRef.current.a = v; setAngA(v); }}
      setAngB={(v) => { poseRef.current.b = v; setAngB(v); }}
      setAngC={(v) => { poseRef.current.c = v; setAngC(v); }}
      onApplyNow={applyPose}
      onScheduleApply={scheduleApplyPose}
    />
  );
}

export function SimLinearMoveWidget({ speedPct }: { speedPct: number }) {
  const { socket } = useRobotStatus();
  const { linearMove } = useRobotCommands();
  const model = useSimStreamModel();

  const uiAngles = useJointStore((s) => (s.anglesUi ?? (s as any).angles ?? ZERO6) as number[]);

  const [lmX, setLmX] = useState("0");
  const [lmY, setLmY] = useState("500");
  const [lmZ, setLmZ] = useState("710");
  const [lmA, setLmA] = useState("-180");
  const [lmB, setLmB] = useState("0");
  const [lmC, setLmC] = useState("-180");
  const [lmSpeed, setLmSpeed] = useState("0.1");
  const [lmAccel, setLmAccel] = useState("0.1");

  const doLinearMove = useCallback(() => {
    if (!socket?.connected) {
      toast.warning("Socket offline");
      return;
    }

    model.setIsStreaming(true);
    model.resetPeaks();

    const x = safeParse(lmX);
    const y = safeParse(lmY);
    const z = safeParse(lmZ);
    const a = safeParse(lmA);
    const b = safeParse(lmB);
    const c = safeParse(lmC);

    const e = new THREE.Euler(THREE.MathUtils.degToRad(a), THREE.MathUtils.degToRad(b), THREE.MathUtils.degToRad(c), "XYZ");
    const q = new THREE.Quaternion().setFromEuler(e);

    linearMove?.({
      position: [x / 1000, y / 1000, z / 1000],
      quaternion: [q.x, q.y, q.z, q.w],
      speed: safeParse(lmSpeed) * (speedPct / 100),
      angular_speed_deg: 45,
      accel: safeParse(lmAccel) * (speedPct / 100),
    });
  }, [socket, lmX, lmY, lmZ, lmA, lmB, lmC, lmSpeed, lmAccel, speedPct, linearMove, model]);

  const disabled = model.isStreaming;

  return (
    <LinearMoveCard
      socketConnected={model.socketConnected}
      speedPct={speedPct}
      disabled={disabled}
      isStreaming={model.isStreaming}
      uiAngles={uiAngles ?? ZERO6}
      lmX={lmX}
      lmY={lmY}
      lmZ={lmZ}
      lmA={lmA}
      lmB={lmB}
      lmC={lmC}
      lmSpeed={lmSpeed}
      lmAccel={lmAccel}
      setLmX={setLmX}
      setLmY={setLmY}
      setLmZ={setLmZ}
      setLmA={setLmA}
      setLmB={setLmB}
      setLmC={setLmC}
      setLmSpeed={setLmSpeed}
      setLmAccel={setLmAccel}
      onExecute={doLinearMove}
    />
  );
}

export function SimMotionPeaksWidget() {
  const model = useSimStreamModel();
  return <MotionPeaksCard debug={model.debug} />;
}
