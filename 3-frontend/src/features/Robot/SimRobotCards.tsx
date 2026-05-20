import React, { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { toast } from "sonner";

import { useJointStore } from "@/stores/JointStore";
import { useRobotCommands, useRobotKinematics, useRobotStatus } from "@/contexts/robot";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type Vec6 = [number, number, number, number, number, number];
const ZERO6: Vec6 = [0, 0, 0, 0, 0, 0];

type PoseData = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
};

function quatFromAbcDeg(aDeg: number, bDeg: number, cDeg: number): [number, number, number, number] {
  const e = new THREE.Euler(THREE.MathUtils.degToRad(aDeg), THREE.MathUtils.degToRad(bDeg), THREE.MathUtils.degToRad(cDeg), "XYZ");
  const q = new THREE.Quaternion().setFromEuler(e);
  return [q.x, q.y, q.z, q.w];
}

function abcDegFromQuat(qArr: number[] | undefined): [number, number, number] {
  const q = new THREE.Quaternion(qArr?.[0] ?? 0, qArr?.[1] ?? 0, qArr?.[2] ?? 0, qArr?.[3] ?? 1);
  const e = new THREE.Euler().setFromQuaternion(q, "XYZ");
  return [THREE.MathUtils.radToDeg(e.x), THREE.MathUtils.radToDeg(e.y), THREE.MathUtils.radToDeg(e.z)];
}

function quatFromFkOrientation(ori: any): [number, number, number, number] | null {
  if (Array.isArray(ori) && ori.length === 4 && ori.every((v) => Number.isFinite(v))) {
    return [ori[0], ori[1], ori[2], ori[3]];
  }

  if (Array.isArray(ori) && ori.length === 3 && ori.every((row) => Array.isArray(row) && row.length === 3 && row.every((v) => Number.isFinite(v)))) {
    const m = new THREE.Matrix4().set(ori[0][0], ori[0][1], ori[0][2], 0, ori[1][0], ori[1][1], ori[1][2], 0, ori[2][0], ori[2][1], ori[2][2], 0, 0, 0, 0, 1);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    return [q.x, q.y, q.z, q.w];
  }

  return null;
}

function safeParse(s: string, fallback = 0) {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : fallback;
}

function buildPoseFromFields(xMm: string, yMm: string, zMm: string, aDeg: string, bDeg: string, cDeg: string): PoseData {
  const x = safeParse(xMm) / 1000;
  const y = safeParse(yMm) / 1000;
  const z = safeParse(zMm) / 1000;
  const q = quatFromAbcDeg(safeParse(aDeg), safeParse(bDeg), safeParse(cDeg));
  return {
    position: [x, y, z],
    quaternion: q,
  };
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
  simulating: boolean;
  startAngles: number[];
  startX: string;
  startY: string;
  startZ: string;
  startA: string;
  startB: string;
  startC: string;
  targetX: string;
  targetY: string;
  targetZ: string;
  targetA: string;
  targetB: string;
  targetC: string;
  lmSpeed: string;
  lmAccel: string;
  angSpeed: string;
  setTargetX: (v: string) => void;
  setTargetY: (v: string) => void;
  setTargetZ: (v: string) => void;
  setTargetA: (v: string) => void;
  setTargetB: (v: string) => void;
  setTargetC: (v: string) => void;
  setLmSpeed: (v: string) => void;
  setLmAccel: (v: string) => void;
  setAngSpeed: (v: string) => void;
  onTeachStart: () => void;
  onTeachEnd: () => void;
  onResetToStart: () => void;
  onSimulate: () => void;
  onStopSim: () => void;
  onSendToRobot: () => void;
}) {
  const {
    socketConnected,
    simulating,
    startAngles,
    startX,
    startY,
    startZ,
    startA,
    startB,
    startC,
    targetX,
    targetY,
    targetZ,
    targetA,
    targetB,
    targetC,
    lmSpeed,
    lmAccel,
    angSpeed,
    setTargetX,
    setTargetY,
    setTargetZ,
    setTargetA,
    setTargetB,
    setTargetC,
    setLmSpeed,
    setLmAccel,
    setAngSpeed,
    onTeachStart,
    onTeachEnd,
    onResetToStart,
    onSimulate,
    onStopSim,
    onSendToRobot,
  } = props;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Linear Move Simulation</div>
          <div className="text-xs text-muted-foreground">Teach start • teach end • preview path • then send</div>
        </div>
        <Badge variant={simulating ? "secondary" : "outline"}>{simulating ? "Simulating" : "Ready"}</Badge>
      </div>

      <Separator className="my-3" />

      <div className="grid gap-3">
        <div className="rounded-xl border p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold">Start pose</div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={onTeachStart}>
                Teach Start
              </Button>
              <Button size="sm" variant="outline" onClick={onResetToStart}>
                Reset Viewer
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field k="X" unit="mm" value={startX} setValue={() => {}} disabled />
            <Field k="Y" unit="mm" value={startY} setValue={() => {}} disabled />
            <Field k="Z" unit="mm" value={startZ} setValue={() => {}} disabled />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Field k="A" unit="°" value={startA} setValue={() => {}} disabled />
            <Field k="B" unit="°" value={startB} setValue={() => {}} disabled />
            <Field k="C" unit="°" value={startC} setValue={() => {}} disabled />
          </div>

          <div className="mt-2 text-xs text-muted-foreground">
            Joints:{" "}
            {startAngles
              .slice(0, 6)
              .map((v) => v.toFixed(1))
              .join(" / ")}
            °
          </div>
        </div>

        <div className="rounded-xl border p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold">End pose</div>
            <Button size="sm" variant="secondary" onClick={onTeachEnd}>
              Teach End
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field k="X" unit="mm" value={targetX} setValue={setTargetX} disabled={simulating} />
            <Field k="Y" unit="mm" value={targetY} setValue={setTargetY} disabled={simulating} />
            <Field k="Z" unit="mm" value={targetZ} setValue={setTargetZ} disabled={simulating} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Field k="A" unit="°" value={targetA} setValue={setTargetA} disabled={simulating} />
            <Field k="B" unit="°" value={targetB} setValue={setTargetB} disabled={simulating} />
            <Field k="C" unit="°" value={targetC} setValue={setTargetC} disabled={simulating} />
          </div>

          <div className="mt-2 text-xs text-muted-foreground">Move the TCP gizmo or type values, then click Teach End to commit the end pose.</div>
        </div>

        <div className="rounded-xl border p-3">
          <div className="mb-2 text-xs font-semibold">Motion</div>
          <div className="grid grid-cols-3 gap-2">
            <Field k="Speed" unit="m/s" value={lmSpeed} setValue={setLmSpeed} disabled={simulating} />
            <Field k="Accel" unit="m/s²" value={lmAccel} setValue={setLmAccel} disabled={simulating} />
            <Field k="Angular" unit="°/s" value={angSpeed} setValue={setAngSpeed} disabled={simulating} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={simulating ? onStopSim : onSimulate} variant={simulating ? "destructive" : "default"} disabled={!socketConnected}>
            {simulating ? "Stop Simulation" : "Simulate Robot Linear Motion"}
          </Button>

          <Button onClick={onSendToRobot} variant="secondary" disabled={!socketConnected || simulating}>
            Send to Robot
          </Button>
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

  const setAnglesUi = useJointStore((s) => (s.setAnglesUi ?? (s as any).setAngles) as (a: number[]) => void);
  const setAnglesFast = useJointStore((s) => (s.setAnglesFast ?? (s as any).setAngles) as (a: number[]) => void);

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

    const onIkResponse = (msg: any) => {
      if (msg?.error) return;
      const angles = Array.isArray(msg) ? msg : (msg?.angles ?? msg?.joints);
      if (Array.isArray(angles) && angles.length === 6) {
        setAnglesFast(angles);
        setAnglesUi(angles);
      }
    };

    const onStarted = () => setIsStreaming(true);

    const onDone = () => {
      setIsStreaming(false);
      toast.success("Move done");
    };

    const onErr = (msg: any) => {
      setIsStreaming(false);
      toast.error("Linear move error", {
        description: String(msg?.error ?? "Unknown error"),
      });
    };

    socket.on("ik_response", onIkResponse);
    socket.on("linearMoveStarted", onStarted);
    socket.on("linearMoveComplete", onDone);
    socket.on("linearMove_error", onErr);

    return () => {
      socket.off("ik_response", onIkResponse);
      socket.off("linearMoveStarted", onStarted);
      socket.off("linearMoveComplete", onDone);
      socket.off("linearMove_error", onErr);
    };
  }, [socket, setAnglesFast, setAnglesUi]);

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
  if (!ctx) throw new Error("useSimStreamModel must be used within SimStreamProvider");
  return ctx;
}

/* ========================================================================== */
/*                            Full Panel (legacy)                             */
/* ========================================================================== */

export default function SimRobotCards() {
  return (
    <SimStreamProvider>
      <ScrollArea className="h-full">
        <div className="grid gap-3 pr-1">
          <SimPoseEditorWidget />
          <SimLinearMoveWidget />
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

  const poseRef = useRef({ x: "0", y: "500", z: "600", a: "0", b: "180", c: "0" });

  const setXYZ = useCallback((x: string, y: string, z: string) => {
    poseRef.current.x = x;
    poseRef.current.y = y;
    poseRef.current.z = z;
    setPosX(x);
    setPosY(y);
    setPosZ(z);
  }, []);

  const setABC = useCallback((a: string, b: string, c: string) => {
    poseRef.current.a = a;
    poseRef.current.b = b;
    poseRef.current.c = c;
    setAngA(a);
    setAngB(b);
    setAngC(c);
  }, []);

  const applyPose = useCallback(() => {
    const { x, y, z, a, b, c } = poseRef.current;
    const xv = safeParse(x),
      yv = safeParse(y),
      zv = safeParse(z);
    const av = safeParse(a),
      bv = safeParse(b),
      cv = safeParse(c);
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

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    },
    [],
  );

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

  const { connected } = useRobotStatus();
  const didInitRef = useRef(false);

  useEffect(() => {
    if (connected && !didInitRef.current) {
      didInitRef.current = true;
      applyPose();
    }
    if (!connected) didInitRef.current = false;
  }, [connected, applyPose]);

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
      posX={posX}
      posY={posY}
      posZ={posZ}
      angA={angA}
      angB={angB}
      angC={angC}
      setPosX={(v) => {
        poseRef.current.x = v;
        setPosX(v);
      }}
      setPosY={(v) => {
        poseRef.current.y = v;
        setPosY(v);
      }}
      setPosZ={(v) => {
        poseRef.current.z = v;
        setPosZ(v);
      }}
      setAngA={(v) => {
        poseRef.current.a = v;
        setAngA(v);
      }}
      setAngB={(v) => {
        poseRef.current.b = v;
        setAngB(v);
      }}
      setAngC={(v) => {
        poseRef.current.c = v;
        setAngC(v);
      }}
      onApplyNow={applyPose}
      onScheduleApply={scheduleApplyPose}
    />
  );
}

export function SimLinearMoveWidget() {
  const { socket } = useRobotStatus();
  const { profileLinear, linearMove } = useRobotCommands();
  const { fkPosition, fkOrientation } = useRobotKinematics();

  const uiAngles = useJointStore((s) => (s.anglesUi ?? (s as any).angles ?? ZERO6) as number[]);
  const setAnglesUi = useJointStore((s) => (s.setAnglesUi ?? (s as any).setAngles) as (a: number[]) => void);
  const setAnglesFast = useJointStore((s) => (s.setAnglesFast ?? (s as any).setAngles) as (a: number[]) => void);

  const [startAngles, setStartAngles] = useState<number[]>(ZERO6.slice());
  const [startPose, setStartPose] = useState<PoseData>({
    position: [0, 0.5, 0.6],
    quaternion: quatFromAbcDeg(0, 180, 0),
  });
  const [endPose, setEndPose] = useState<PoseData>({
    position: [0, 0.5, 0.71],
    quaternion: quatFromAbcDeg(-180, 0, -180),
  });

  const [startX, setStartX] = useState("0.0");
  const [startY, setStartY] = useState("500.0");
  const [startZ, setStartZ] = useState("600.0");
  const [startA, setStartA] = useState("0.0");
  const [startB, setStartB] = useState("180.0");
  const [startC, setStartC] = useState("0.0");

  const [targetX, setTargetX] = useState("0.0");
  const [targetY, setTargetY] = useState("500.0");
  const [targetZ, setTargetZ] = useState("710.0");
  const [targetA, setTargetA] = useState("-180.0");
  const [targetB, setTargetB] = useState("0.0");
  const [targetC, setTargetC] = useState("-180.0");

  const [lmSpeed, setLmSpeed] = useState("0.10");
  const [lmAccel, setLmAccel] = useState("0.10");
  const [angSpeed, setAngSpeed] = useState("45");

  const [simulating, setSimulating] = useState(false);

  const simTimeoutRef = useRef<number | null>(null);
  const simCancelledRef = useRef(false);
  const initializedRef = useRef(false);

  const stopPreview = useCallback(() => {
    simCancelledRef.current = true;
    if (simTimeoutRef.current != null) {
      window.clearTimeout(simTimeoutRef.current);
      simTimeoutRef.current = null;
    }
    setSimulating(false);
  }, []);

  useEffect(() => {
    return () => stopPreview();
  }, [stopPreview]);

  const captureCurrentTcp = useCallback(() => {
    if (!Array.isArray(fkPosition) || fkPosition.length !== 3 || !fkPosition.every((v) => Number.isFinite(v))) {
      return null;
    }

    const quat = quatFromFkOrientation(fkOrientation);
    if (!quat) return null;

    const posMm = fkPosition.map((v) => v * 1000) as [number, number, number];
    const abc = abcDegFromQuat(quat);

    return {
      pose: {
        position: [fkPosition[0], fkPosition[1], fkPosition[2]] as [number, number, number],
        quaternion: quat,
      },
      posMm,
      abc,
    };
  }, [fkPosition, fkOrientation]);

  const teachStart = useCallback(() => {
    const current = captureCurrentTcp();
    if (!current) {
      toast.error("Cannot teach start", { description: "FK pose is not available yet." });
      return;
    }

    setStartAngles(uiAngles.slice(0, 6));
    setStartPose(current.pose);

    setStartX(current.posMm[0].toFixed(1));
    setStartY(current.posMm[1].toFixed(1));
    setStartZ(current.posMm[2].toFixed(1));
    setStartA(current.abc[0].toFixed(1));
    setStartB(current.abc[1].toFixed(1));
    setStartC(current.abc[2].toFixed(1));

    toast.success("Start pose taught");
  }, [captureCurrentTcp, uiAngles]);

  const teachEnd = useCallback(() => {
    const pose = buildPoseFromFields(targetX, targetY, targetZ, targetA, targetB, targetC);
    setEndPose(pose);
    toast.success("End pose taught");
  }, [targetX, targetY, targetZ, targetA, targetB, targetC]);

  useEffect(() => {
    const onTcp = (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {};
      const position = detail.position as number[] | undefined;
      const quaternion = detail.quaternion as number[] | undefined;

      if (!Array.isArray(position) || position.length !== 3) return;
      if (!Array.isArray(quaternion) || quaternion.length !== 4) return;

      const abc = abcDegFromQuat(quaternion);
      setTargetX((position[0] * 1000).toFixed(1));
      setTargetY((position[1] * 1000).toFixed(1));
      setTargetZ((position[2] * 1000).toFixed(1));
      setTargetA(abc[0].toFixed(1));
      setTargetB(abc[1].toFixed(1));
      setTargetC(abc[2].toFixed(1));
    };

    window.addEventListener("robot_tcp_target_preview", onTcp);
    window.addEventListener("robot_tcp_target_changed", onTcp);
    return () => {
      window.removeEventListener("robot_tcp_target_preview", onTcp);
      window.removeEventListener("robot_tcp_target_changed", onTcp);
    };
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    if (!Array.isArray(fkPosition) || fkPosition.length !== 3 || !fkPosition.every((v) => Number.isFinite(v))) return;

    const quat = quatFromFkOrientation(fkOrientation);
    if (!quat) return;

    const abc = abcDegFromQuat(quat);
    const posMm = fkPosition.map((v) => v * 1000);

    const pose: PoseData = {
      position: [fkPosition[0], fkPosition[1], fkPosition[2]],
      quaternion: quat,
    };

    setStartPose(pose);
    setEndPose(pose);
    setStartAngles(uiAngles.slice(0, 6));

    setStartX(posMm[0].toFixed(1));
    setStartY(posMm[1].toFixed(1));
    setStartZ(posMm[2].toFixed(1));
    setStartA(abc[0].toFixed(1));
    setStartB(abc[1].toFixed(1));
    setStartC(abc[2].toFixed(1));

    setTargetX(posMm[0].toFixed(1));
    setTargetY(posMm[1].toFixed(1));
    setTargetZ(posMm[2].toFixed(1));
    setTargetA(abc[0].toFixed(1));
    setTargetB(abc[1].toFixed(1));
    setTargetC(abc[2].toFixed(1));

    initializedRef.current = true;
  }, [fkPosition, fkOrientation, uiAngles]);

  const resetViewerToStart = useCallback(() => {
    setAnglesFast(startAngles);
    setAnglesUi(startAngles);
  }, [setAnglesFast, setAnglesUi, startAngles]);

  const animateProfile = useCallback(
    (profile: any) => {
      const dtMs = Math.max(1, Math.round((profile?.dt ?? 0.02) * 1000));
      const initial = Array.isArray(profile?.initial) ? profile.initial.slice(0, 6) : startAngles.slice(0, 6);
      const speeds = Array.isArray(profile?.speeds) ? profile.speeds : [];

      if (!speeds.length) {
        setAnglesFast(initial);
        setAnglesUi(initial);
        setSimulating(false);
        toast.success("Simulation complete");
        return;
      }

      let q = initial.slice();
      let idx = 0;

      const tick = () => {
        if (simCancelledRef.current) return;

        if (idx >= speeds.length) {
          const finalQ = Array.isArray(profile?.final) && profile.final.length >= 6 ? profile.final.slice(0, 6) : q;

          setAnglesFast(finalQ);
          setAnglesUi(finalQ);
          setSimulating(false);
          toast.success("Simulation complete");
          return;
        }

        const v = Array.isArray(speeds[idx]) ? speeds[idx] : ZERO6;
        q = q.map((angle: number, j: string | number) => angle + Number(v[j] ?? 0) * (dtMs / 1000));

        setAnglesFast(q);
        if (idx % 2 === 0 || idx === speeds.length - 1) {
          setAnglesUi(q);
        }

        idx += 1;
        simTimeoutRef.current = window.setTimeout(tick, dtMs);
      };

      setAnglesFast(initial);
      setAnglesUi(initial);
      simTimeoutRef.current = window.setTimeout(tick, dtMs);
    },
    [setAnglesFast, setAnglesUi, startAngles],
  );

  const simulate = useCallback(() => {
    if (!socket?.connected) {
      toast.warning("Socket offline");
      return;
    }

    if (!startPose) {
      toast.error("Teach a start pose first");
      return;
    }

    if (!endPose) {
      toast.error("Teach an end pose first");
      return;
    }

    stopPreview();
    simCancelledRef.current = false;
    setSimulating(true);
    resetViewerToStart();

    const onProfile = (profile: any) => {
      socket.off("profileLinear_error", onProfileErr);
      animateProfile(profile);
    };

    const onProfileErr = (msg: any) => {
      socket.off("profileLinear_response", onProfile);
      setSimulating(false);
      toast.error("Simulation failed", {
        description: String(msg?.error ?? "Unknown profile error"),
      });
    };

    socket.once("profileLinear_response", onProfile);
    socket.once("profileLinear_error", onProfileErr);

    profileLinear?.({
      position: endPose.position,
      quaternion: endPose.quaternion,
      speed: safeParse(lmSpeed, 0.1),
      angular_speed_deg: safeParse(angSpeed, 45),
      accel: safeParse(lmAccel, 0.1),
      seed: startAngles.slice(0, 6),
    });
  }, [socket, startPose, endPose, lmSpeed, lmAccel, angSpeed, profileLinear, resetViewerToStart, stopPreview, animateProfile]);

  const sendToRobot = useCallback(() => {
    if (!socket?.connected) {
      toast.warning("Socket offline");
      return;
    }

    if (!endPose) {
      toast.error("Teach an end pose first");
      return;
    }

    linearMove?.({
      position: endPose.position,
      quaternion: endPose.quaternion,
      speed: safeParse(lmSpeed, 0.1),
      angular_speed_deg: safeParse(angSpeed, 45),
      accel: safeParse(lmAccel, 0.1),
      seed: startAngles.slice(0, 6),
    });

    toast.success("Linear move sent");
  }, [socket, endPose, lmSpeed, lmAccel, angSpeed, linearMove, startAngles]);

  return (
    <LinearMoveCard
      socketConnected={!!socket?.connected}
      simulating={simulating}
      startAngles={startAngles}
      startX={startX}
      startY={startY}
      startZ={startZ}
      startA={startA}
      startB={startB}
      startC={startC}
      targetX={targetX}
      targetY={targetY}
      targetZ={targetZ}
      targetA={targetA}
      targetB={targetB}
      targetC={targetC}
      lmSpeed={lmSpeed}
      lmAccel={lmAccel}
      angSpeed={angSpeed}
      setTargetX={setTargetX}
      setTargetY={setTargetY}
      setTargetZ={setTargetZ}
      setTargetA={setTargetA}
      setTargetB={setTargetB}
      setTargetC={setTargetC}
      setLmSpeed={setLmSpeed}
      setLmAccel={setLmAccel}
      setAngSpeed={setAngSpeed}
      onTeachStart={teachStart}
      onTeachEnd={teachEnd}
      onResetToStart={resetViewerToStart}
      onSimulate={simulate}
      onStopSim={stopPreview}
      onSendToRobot={sendToRobot}
    />
  );
}

export function SimMotionPeaksWidget() {
  const model = useSimStreamModel();
  return <MotionPeaksCard debug={model.debug} />;
}
