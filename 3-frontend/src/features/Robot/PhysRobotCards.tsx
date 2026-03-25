import React, { createContext, memo, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PiWarningCircleBold } from "react-icons/pi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useRobotCommands, useRobotStatus, useRobotKinematics, useRobotIO } from "@/contexts/robot";
import { useJointStore } from "@/stores/JointStore";

/* -------------------- helpers -------------------- */

function rotm2euler(m: number[][]) {
  const sy = Math.hypot(m[0][0], m[1][0]);
  let x: number, y: number, z: number;
  if (sy > 1e-6) {
    x = Math.atan2(m[2][1], m[2][2]);
    y = Math.atan2(-m[2][0], sy);
    z = Math.atan2(m[1][0], m[0][0]);
  } else {
    x = Math.atan2(-m[1][2], m[1][1]);
    y = Math.atan2(-m[2][0], sy);
    z = 0;
  }
  return [x, y, z].map((r) => (r * 180) / Math.PI);
}

function eulerToQuat(rx: number, ry: number, rz: number) {
  const [a, b, c] = [rx, ry, rz].map((d) => (d * Math.PI) / 360);
  const [cx, sx] = [Math.cos(a), Math.sin(a)];
  const [cy, sy] = [Math.cos(b), Math.sin(b)];
  const [cz, sz] = [Math.cos(c), Math.sin(c)];
  return [sx * cy * cz - cx * sy * sz, cx * sy * cz + sx * cy * sz, cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz];
}

const INPUT_LABELS: Record<number, string> = {
  1: "Emergency Stop",
  2: "Green 1",
  3: "Green 2",
  4: "Yellow 1",
  5: "Yellow 2",
  6: "Red 1",
  7: "Red 2",
  8: "Primary 1",
  9: "Primary 2",
  10: "Black 1",
  11: "Black 2",
  12: "White 1",
  13: "White 2",
  14: "Limit J1",
  15: "Limit J2",
  16: "Limit J3",
  17: "Limit J4",
  18: "Limit J5",
  19: "Limit J6",
};

const OUTPUT_LABELS: Record<number, string> = {
  1: "Green LED",
  2: "Red LED",
  3: "Yellow LED",
  4: "Alarm",
  5: "Gripper",
  6: "Unused 1",
  7: "Unused 2",
  8: "Unused 3",
  9: "Compressor",
};

function Dot({ on }: { on: boolean }) {
  return <span className={["inline-block h-2.5 w-2.5 rounded-full", on ? "bg-primary" : "bg-muted-foreground/30"].join(" ")} />;
}

/* ========================================================================== */
/*                             shared models/hooks                            */
/* ========================================================================== */

type Preset = {
  id: string;
  name: string;
  createdAt: number;
  jointsDeg: number[];
  speeds?: number[];
  accels?: number[];
};

const PRESET_KEY = "6ar.presets.v1";

type MultiRow = { target: string; speed: string; accel: string };

type JointRow = {
  joint: number;
  position: number;
  velocity: number;
  acceleration: number;
  target: number | null;
};

type PhysActionsModel = {
  connected: boolean;

  joint: number;
  setJoint: (j: number) => void;

  liveUpdate: boolean;
  setLiveUpdate: React.Dispatch<React.SetStateAction<boolean>>;

  refreshStatus: () => void;
  copyJoints: () => void;
  copyTcp: () => void;

  presets: Preset[];
  currentJoints: number[] | null;
  addPresetFromCurrent: () => void;
  renamePreset: (id: string, name: string) => void;
  deletePreset: (id: string) => void;
  applyPresetToInputs: (preset: Preset) => void;
  executePreset: (preset: Preset) => void;

  fastSpd: string;
  slowSpd: string;
  setFastSpd: React.Dispatch<React.SetStateAction<string>>;
  setSlowSpd: React.Dispatch<React.SetStateAction<string>>;
  homeJoint: () => void;
  homeAll: () => Promise<void> | void;
  abortHoming: () => void;

  tgt: string;
  spd: string;
  acc: string;
  delta: string;
  spdBy: string;
  accBy: string;
  setTgt: React.Dispatch<React.SetStateAction<string>>;
  setSpd: React.Dispatch<React.SetStateAction<string>>;
  setAcc: React.Dispatch<React.SetStateAction<string>>;
  setDelta: React.Dispatch<React.SetStateAction<string>>;
  setSpdBy: React.Dispatch<React.SetStateAction<string>>;
  setAccBy: React.Dispatch<React.SetStateAction<string>>;
  moveTo: () => void;
  moveBy: () => void;

  linPos: number[];
  linEuler: number[];
  linSpeed: string;
  linAccel: string;
  setLinPos: React.Dispatch<React.SetStateAction<number[]>>;
  setLinEuler: React.Dispatch<React.SetStateAction<number[]>>;
  setLinSpeed: React.Dispatch<React.SetStateAction<string>>;
  setLinAccel: React.Dispatch<React.SetStateAction<string>>;
  interpolated: () => void;
  velocityProfile: () => void;

  multiParams: MultiRow[];
  setMultiParams: React.Dispatch<React.SetStateAction<MultiRow[]>>;
  handleMultiChange: (idx: number, field: "target" | "speed" | "accel", val: string) => void;
  executeMultiFromInputs: () => void;

  rows: JointRow[];
};

type PhysIoModel = {
  connected: boolean;
  autoRefresh: boolean;
  setAutoRefresh: React.Dispatch<React.SetStateAction<boolean>>;
  fetchAll: () => void;
  estop: any;
  buttons: any[];
  limits: any[];
  digitalOutputs: any[];
  toggleOutput: (id: number) => void;
  pullOutputs: () => void;
};

const PhysActionsModelContext = createContext<PhysActionsModel | null>(null);
const PhysIoModelContext = createContext<PhysIoModel | null>(null);

function usePhysActionsModelInternal(): PhysActionsModel {
  const { getAllJointStatus, homeAll, moveTo, moveBy, moveMultiple, home, listParameters, abortHoming } = useRobotCommands();

  const { jointStatuses = [] } = useRobotKinematics();
  const { parameters = {} } = useRobotIO();
  const { connected, socket, setIsMoving } = useRobotStatus();

  const joint = useJointStore((s) => s.selectedJoint);
  const setJoint = useJointStore((s) => s.setSelectedJoint);

  const [fastSpd, setFastSpd] = useState("");
  const [slowSpd, setSlowSpd] = useState("");

  const [tgt, setTgt] = useState("");
  const [spd, setSpd] = useState("");
  const [acc, setAcc] = useState("");

  const [delta, setDelta] = useState("");
  const [spdBy, setSpdBy] = useState("");
  const [accBy, setAccBy] = useState("");

  const [multiParams, setMultiParams] = useState<MultiRow[]>(Array.from({ length: 6 }, () => ({ target: "", speed: "", accel: "" })));

  const [linPos, setLinPos] = useState<number[]>([0, 0, 0]);
  const [linEuler, setLinEuler] = useState<number[]>([0, 0, 0]);
  const [linSpeed, setLinSpeed] = useState("100");
  const [linAccel, setLinAccel] = useState("300");

  const [liveUpdate, setLiveUpdate] = useState(false);

  const [presets, setPresets] = useState<Preset[]>(() => {
    try {
      const raw = localStorage.getItem(PRESET_KEY);
      const parsed = raw ? (JSON.parse(raw) as Preset[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
    } catch {
      // ignore
    }
  }, [presets]);

  const currentJoints = useMemo(() => {
    if (jointStatuses.length !== 6) return null;
    return jointStatuses.map((j: any) => Number(j.position) || 0);
  }, [jointStatuses]);

  const rows = useMemo<JointRow[]>(
    () =>
      jointStatuses.map((js: any) => ({
        joint: js.joint,
        position: js.position,
        velocity: js.velocity,
        acceleration: js.acceleration,
        target: js.target,
      })),
    [jointStatuses],
  );

  const tcpText = useMemo(() => `TCP(mm): [${linPos.map((v) => v.toFixed(1)).join(", ")}], Euler(deg): [${linEuler.map((v) => v.toFixed(1)).join(", ")}]`, [linPos, linEuler]);

  const jointsText = useMemo(() => {
    if (!currentJoints) return "Joints: unavailable";
    return `Joints(deg): [${currentJoints.map((v) => v.toFixed(2)).join(", ")}]`;
  }, [currentJoints]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Clipboard blocked");
    }
  }, []);

  useEffect(() => {
    getAllJointStatus?.();
    listParameters?.();
  }, [getAllJointStatus, listParameters]);

  useEffect(() => {
    if (!socket || jointStatuses.length !== 6) return;

    const handleFk = (resp: any) => {
      setLinPos(resp.position.map((c: number) => c * 1000));
      setLinEuler(rotm2euler(resp.orientation));
      socket.off("fk_response", handleFk);
    };

    socket.on("fk_response", handleFk);
    socket.emit("fk_request", {
      angles: jointStatuses.map((j: any) => j.position),
    });

    return () => socket.off("fk_response", handleFk);
  }, [socket, jointStatuses]);

  useEffect(() => {
    if (!socket) return;
    const onError = ({ error }: any) => {
      setIsMoving?.(false);
      toast.error("Linear-Teensy move failed", { description: error });
    };
    socket.on("linearMoveToTeensy_error", onError);
    return () => socket.off("linearMoveToTeensy_error", onError);
  }, [socket, setIsMoving]);

  useEffect(() => {
    if (!liveUpdate) return;
    const id = window.setInterval(() => getAllJointStatus?.(), 500);
    return () => window.clearInterval(id);
  }, [liveUpdate, getAllJointStatus]);

  useEffect(() => {
    const f = (parameters as any)?.[`joint${joint}.homingSpeed`];
    const s = (parameters as any)?.[`joint${joint}.slowHomingSpeed`];
    if (typeof f === "number") setFastSpd(f.toString());
    if (typeof s === "number") setSlowSpd(s.toString());
  }, [joint, parameters]);

  useEffect(() => {
    setSpd((prev) => (prev === "" ? "40" : prev));
    setAcc((prev) => (prev === "" ? "120" : prev));
    setSpdBy((prev) => (prev === "" ? "40" : prev));
    setAccBy((prev) => (prev === "" ? "120" : prev));
  }, [joint]);

  const handleMultiChange = useCallback((idx: number, field: "target" | "speed" | "accel", val: string) => {
    setMultiParams((p) => {
      const c = [...p];
      c[idx] = { ...c[idx], [field]: val };
      return c;
    });
  }, []);

  const executeMultiFromInputs = useCallback(() => {
    const js: number[] = [];
    const ts: number[] = [];
    const ss: number[] = [];
    const as: number[] = [];

    multiParams.forEach((p, idx) => {
      const t = parseFloat(p.target);
      if (!Number.isNaN(t)) {
        js.push(idx + 1);
        ts.push(t);
        ss.push(parseFloat(p.speed) || 0);
        as.push(parseFloat(p.accel) || 0);
      }
    });

    if (js.length === 0) {
      toast.warning("No targets set");
      return;
    }

    moveMultiple?.(js, ts, ss, as);
  }, [multiParams, moveMultiple]);

  const executePreset = useCallback(
    (preset: Preset) => {
      if (!preset?.jointsDeg?.length) return;
      const js = [1, 2, 3, 4, 5, 6];
      const ts = preset.jointsDeg.map((x) => Number(x) || 0);
      const ss = (preset.speeds?.length === 6 ? preset.speeds : Array(6).fill(parseFloat(spd) || 40)) as number[];
      const as = (preset.accels?.length === 6 ? preset.accels : Array(6).fill(parseFloat(acc) || 120)) as number[];
      moveMultiple?.(js, ts, ss, as);
    },
    [moveMultiple, spd, acc],
  );

  const applyPresetToInputs = useCallback(
    (preset: Preset) => {
      setMultiParams((old) =>
        old.map((_, i) => ({
          target: (preset.jointsDeg?.[i] ?? "").toString(),
          speed: ((preset.speeds?.[i] ?? parseFloat(spd)) || 40).toString(),
          accel: ((preset.accels?.[i] ?? parseFloat(acc)) || 120).toString(),
        })),
      );
      toast.success("Preset loaded into Multi Move");
    },
    [spd, acc],
  );

  const addPresetFromCurrent = useCallback(() => {
    if (!currentJoints) {
      toast.warning("Joint status not ready");
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const p: Preset = {
      id,
      name: `Preset ${presets.length + 1}`,
      createdAt: Date.now(),
      jointsDeg: currentJoints.map((v) => Number(v) || 0),
    };
    setPresets((prev) => [p, ...prev]);
    toast.success("Preset saved", {
      description: "From current joint angles",
    });
  }, [currentJoints, presets.length]);

  const renamePreset = useCallback((id: string, name: string) => {
    setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }, []);

  const deletePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
    toast.success("Preset deleted");
  }, []);

  const handleLinearMove = useCallback(() => {
    if (!socket?.connected) {
      toast.warning("Socket offline");
      return;
    }
    const speed = parseFloat(linSpeed) / 1000;
    const accel = parseFloat(linAccel) / 1000;
    const quat = eulerToQuat(linEuler[0], linEuler[1], linEuler[2]);
    const pos = linPos.map((v) => v / 1000);

    socket.emit("linearMoveToTeensy", {
      position: pos,
      quaternion: quat,
      speed,
      angular_speed_deg: 45,
      accel,
    });
  }, [socket, linSpeed, linAccel, linEuler, linPos]);

  const handleVelocityProfileMove = useCallback(() => {
    if (!socket?.connected) {
      toast.warning("Socket offline");
      return;
    }
    const speed = parseFloat(linSpeed) / 1000;
    const accel = parseFloat(linAccel) / 1000;
    const quat = eulerToQuat(linEuler[0], linEuler[1], linEuler[2]);
    const pos = linPos.map((v) => v / 1000);

    socket.emit("profileMoveToTeensy", {
      position: pos,
      quaternion: quat,
      speed,
      angular_speed_deg: 45,
      accel,
    });
  }, [socket, linSpeed, linAccel, linEuler, linPos]);

  return useMemo(
    () => ({
      connected: !!connected,

      joint,
      setJoint,
      liveUpdate,
      setLiveUpdate,
      refreshStatus: () => getAllJointStatus?.(),
      copyJoints: () => copyToClipboard(jointsText),
      copyTcp: () => copyToClipboard(tcpText),

      presets,
      currentJoints,
      addPresetFromCurrent,
      renamePreset,
      deletePreset,
      applyPresetToInputs,
      executePreset,

      fastSpd,
      slowSpd,
      setFastSpd,
      setSlowSpd,
      homeJoint: () => home?.(joint, +fastSpd, +slowSpd),
      homeAll: () => homeAll?.(),
      abortHoming: () => abortHoming?.(),

      tgt,
      spd,
      acc,
      delta,
      spdBy,
      accBy,
      setTgt,
      setSpd,
      setAcc,
      setDelta,
      setSpdBy,
      setAccBy,
      moveTo: () => moveTo?.(joint, +tgt, +spd, +acc),
      moveBy: () => moveBy?.(joint, +delta, +spdBy, +accBy),

      linPos,
      linEuler,
      linSpeed,
      linAccel,
      setLinPos,
      setLinEuler,
      setLinSpeed,
      setLinAccel,
      interpolated: handleLinearMove,
      velocityProfile: handleVelocityProfileMove,

      multiParams,
      setMultiParams,
      handleMultiChange,
      executeMultiFromInputs,

      rows,
    }),
    [
      connected,
      joint,
      liveUpdate,
      getAllJointStatus,
      copyToClipboard,
      jointsText,
      tcpText,
      presets,
      currentJoints,
      addPresetFromCurrent,
      renamePreset,
      deletePreset,
      applyPresetToInputs,
      executePreset,
      fastSpd,
      slowSpd,
      home,
      homeAll,
      abortHoming,
      tgt,
      spd,
      acc,
      delta,
      spdBy,
      accBy,
      moveTo,
      moveBy,
      linPos,
      linEuler,
      linSpeed,
      linAccel,
      handleLinearMove,
      handleVelocityProfileMove,
      multiParams,
      handleMultiChange,
      executeMultiFromInputs,
      rows,
    ],
  );
}

function usePhysIoModelInternal(): PhysIoModel {
  const { digitalInputs = [], digitalOutputs = [] } = useRobotIO();
  const { connected } = useRobotStatus();
  const { output, getInputs, getOutputs, getSystemStatus } = useRobotCommands();

  const [autoRefresh, setAutoRefresh] = useState(false);

  const estop = digitalInputs?.[0] ?? { id: 1, status: false, enabled: true };
  const buttons = digitalInputs.slice(1, 13);
  const limits = digitalInputs.slice(13, 19);

  const fetchAll = useCallback(() => {
    getInputs?.();
    getOutputs?.();
    getSystemStatus?.();
  }, [getInputs, getOutputs, getSystemStatus]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(fetchAll, 250);
    return () => window.clearInterval(id);
  }, [autoRefresh, fetchAll]);

  const toggleOutput = useCallback(
    (id: number) => {
      const out = digitalOutputs.find((o: any) => o.id === id);
      if (!out || !out.enabled) return;
      const next = out.status ? 0 : 1;
      output?.([id], [next]);
      getOutputs?.();
    },
    [digitalOutputs, output, getOutputs],
  );

  return useMemo(
    () => ({
      connected: !!connected,
      autoRefresh,
      setAutoRefresh,
      fetchAll,
      estop,
      buttons,
      limits,
      digitalOutputs,
      toggleOutput,
      pullOutputs: () => getOutputs?.(),
    }),
    [connected, autoRefresh, fetchAll, estop, buttons, limits, digitalOutputs, toggleOutput, getOutputs],
  );
}

function PhysActionsModelProvider({ children }: { children: React.ReactNode }) {
  const model = usePhysActionsModelInternal();
  return <PhysActionsModelContext.Provider value={model}>{children}</PhysActionsModelContext.Provider>;
}

function PhysIoModelProvider({ children }: { children: React.ReactNode }) {
  const model = usePhysIoModelInternal();
  return <PhysIoModelContext.Provider value={model}>{children}</PhysIoModelContext.Provider>;
}

function usePhysActionsModel() {
  const ctx = useContext(PhysActionsModelContext);
  if (!ctx) {
    throw new Error("usePhysActionsModel must be used within PhysActionsModelProvider");
  }
  return ctx;
}

function usePhysIoModel() {
  const ctx = useContext(PhysIoModelContext);
  if (!ctx) {
    throw new Error("usePhysIoModel must be used within PhysIoModelProvider");
  }
  return ctx;
}

/* ========================================================================== */
/*                                   MAIN                                     */
/* ========================================================================== */

export default function PhysRobotCards() {
  return (
    <Card className="h-full p-3">
      <Tabs defaultValue="actions" className="h-full">
        <TabsList className="w-full">
          <TabsTrigger className="flex-1" value="actions">
            Actions
          </TabsTrigger>
          <TabsTrigger className="flex-1" value="io">
            I/O
          </TabsTrigger>
        </TabsList>

        <TabsContent value="actions" className="m-0 h-[calc(100%-48px)] min-h-0 pt-3">
          <PhysActionsModelProvider>
            <ActionsPanel />
          </PhysActionsModelProvider>
        </TabsContent>

        <TabsContent value="io" className="m-0 h-[calc(100%-48px)] min-h-0 pt-3">
          <PhysIoModelProvider>
            <IOPanel />
          </PhysIoModelProvider>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

/* ========================================================================== */
/*                                   ACTIONS                                  */
/* ========================================================================== */

function ActionsPanel() {
  const m = usePhysActionsModel();

  return (
    <ScrollArea className="h-full">
      <div className="grid gap-3 pr-1">
        <QuickBarCard
          connected={m.connected}
          joint={m.joint}
          setJoint={m.setJoint}
          liveUpdate={m.liveUpdate}
          setLiveUpdate={m.setLiveUpdate}
          onRefresh={m.refreshStatus}
          onCopyJoints={m.copyJoints}
          onCopyTcp={m.copyTcp}
        />

        <PresetsCard
          connected={m.connected}
          presets={m.presets}
          currentJoints={m.currentJoints}
          onSaveCurrent={m.addPresetFromCurrent}
          onLoadCurrentIntoMulti={() => {
            if (!m.currentJoints) return;
            m.applyPresetToInputs({
              id: "tmp",
              name: "Current",
              createdAt: Date.now(),
              jointsDeg: m.currentJoints,
            });
          }}
          onRename={m.renamePreset}
          onDelete={m.deletePreset}
          onLoad={m.applyPresetToInputs}
          onRun={m.executePreset}
        />

        <div className="grid gap-3 lg:grid-cols-2">
          <HomingCard
            connected={m.connected}
            joint={m.joint}
            setJoint={m.setJoint}
            fastSpd={m.fastSpd}
            slowSpd={m.slowSpd}
            setFastSpd={m.setFastSpd}
            setSlowSpd={m.setSlowSpd}
            onHomeJoint={m.homeJoint}
            onHomeAll={m.homeAll}
            onAbort={m.abortHoming}
          />

          <SingleJointMovesCard
            connected={m.connected}
            joint={m.joint}
            tgt={m.tgt}
            spd={m.spd}
            acc={m.acc}
            delta={m.delta}
            spdBy={m.spdBy}
            accBy={m.accBy}
            setTgt={m.setTgt}
            setSpd={m.setSpd}
            setAcc={m.setAcc}
            setDelta={m.setDelta}
            setSpdBy={m.setSpdBy}
            setAccBy={m.setAccBy}
            onMoveTo={m.moveTo}
            onMoveBy={m.moveBy}
          />
        </div>

        <CartesianCard
          connected={m.connected}
          linPos={m.linPos}
          linEuler={m.linEuler}
          linSpeed={m.linSpeed}
          linAccel={m.linAccel}
          setLinPos={m.setLinPos}
          setLinEuler={m.setLinEuler}
          setLinSpeed={m.setLinSpeed}
          setLinAccel={m.setLinAccel}
          onInterpolated={m.interpolated}
          onVelocityProfile={m.velocityProfile}
        />

        <div className="grid gap-3 lg:grid-cols-2">
          <MultiMoveCard
            connected={m.connected}
            multiParams={m.multiParams}
            setMultiParams={m.setMultiParams}
            currentJoints={m.currentJoints}
            onChange={m.handleMultiChange}
            onExecute={m.executeMultiFromInputs}
          />

          <JointStatusCard connected={m.connected} rows={m.rows} onPull={m.refreshStatus} />
        </div>
      </div>
    </ScrollArea>
  );
}

/* -------------------- ACTIONS: individual cards -------------------- */

export const QuickBarCard = memo(function QuickBarCard(props: {
  connected: boolean;
  joint: number;
  setJoint: (j: number) => void;
  liveUpdate: boolean;
  setLiveUpdate: (v: boolean | ((p: boolean) => boolean)) => void;
  onRefresh: () => void;
  onCopyJoints: () => void;
  onCopyTcp: () => void;
}) {
  const { connected, joint, setJoint, liveUpdate, setLiveUpdate, onRefresh, onCopyJoints, onCopyTcp } = props;

  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold">Physical Robot Console</div>
            <Badge variant={connected ? "default" : "destructive"}>{connected ? "Online" : "Offline"}</Badge>
          </div>
          <div className="text-xs text-muted-foreground">Quick actions • presets • homing • joint/cartesian motion</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border bg-background/40 p-1">
            {[1, 2, 3, 4, 5, 6].map((j) => (
              <Button key={j} size="sm" variant={joint === j ? "default" : "ghost"} className="h-8 px-3" onClick={() => setJoint(j)} disabled={!connected}>
                J{j}
              </Button>
            ))}
          </div>

          <Button size="sm" variant="secondary" onClick={onRefresh} disabled={!connected}>
            Refresh
          </Button>

          <Button size="sm" variant={liveUpdate ? "destructive" : "outline"} onClick={() => setLiveUpdate((v: boolean) => !v)} disabled={!connected}>
            Live: {liveUpdate ? "ON" : "OFF"}
          </Button>

          <Button size="sm" variant="outline" onClick={onCopyJoints} disabled={!connected}>
            Copy Joints
          </Button>

          <Button size="sm" variant="outline" onClick={onCopyTcp} disabled={!connected}>
            Copy TCP
          </Button>
        </div>
      </div>
    </Card>
  );
});

export const PresetsCard = memo(function PresetsCard(props: {
  connected: boolean;
  presets: Preset[];
  currentJoints: number[] | null;
  onSaveCurrent: () => void;
  onLoadCurrentIntoMulti: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onLoad: (p: Preset) => void;
  onRun: (p: Preset) => void;
}) {
  const { connected, presets, currentJoints, onSaveCurrent, onLoadCurrentIntoMulti, onRename, onDelete, onLoad, onRun } = props;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Presets</div>
          <div className="text-xs text-muted-foreground">Save / recall joint angle sets</div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onSaveCurrent} disabled={!connected || !currentJoints}>
            Save Current as Preset
          </Button>
          <Button size="sm" variant="secondary" onClick={onLoadCurrentIntoMulti} disabled={!connected || !currentJoints}>
            Load Current into Multi
          </Button>
        </div>
      </div>

      <Separator className="my-3" />

      {presets.length === 0 ? (
        <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
          No presets yet. Click <span className="font-medium">Save Current as Preset</span>.
        </div>
      ) : (
        <div className="grid gap-2">
          {presets.slice(0, 10).map((p) => (
            <div key={p.id} className="rounded-xl border bg-background/40 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input className="h-9 w-[220px]" value={p.name} onChange={(e) => onRename(p.id, e.target.value)} />
                <div className="min-w-[280px] flex-1 text-xs tabular-nums text-muted-foreground">[{p.jointsDeg.map((v) => Number(v).toFixed(1)).join(", ")}]</div>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => onLoad(p)} disabled={!connected}>
                    Load
                  </Button>
                  <Button size="sm" onClick={() => onRun(p)} disabled={!connected}>
                    Run
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => onDelete(p.id)} disabled={!connected}>
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {presets.length > 10 && <div className="text-xs text-muted-foreground">Showing 10 of {presets.length} presets.</div>}
        </div>
      )}
    </Card>
  );
});

export const HomingCard = memo(function HomingCard(props: {
  connected: boolean;
  joint: number;
  setJoint: (j: number) => void;
  fastSpd: string;
  slowSpd: string;
  setFastSpd: (v: string) => void;
  setSlowSpd: (v: string) => void;
  onHomeJoint: () => void;
  onHomeAll: () => void;
  onAbort: () => void;
}) {
  const { connected, joint, setJoint, fastSpd, slowSpd, setFastSpd, setSlowSpd, onHomeJoint, onHomeAll, onAbort } = props;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Homing / Calibration</div>
          <div className="text-xs text-muted-foreground">Configure and run homing sequences</div>
        </div>
      </div>

      <Separator className="my-3" />

      <div className="grid gap-3">
        {/* Joint selector — shared with Quick Controls */}
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6].map((j) => (
            <Button key={j} size="sm" variant={joint === j ? "default" : "ghost"} className="h-8 flex-1 px-0" onClick={() => setJoint(j)} disabled={!connected}>
              J{j}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Fast (°/s)</Label>
            <Input value={fastSpd} onChange={(e) => setFastSpd(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Slow (°/s)</Label>
            <Input value={slowSpd} onChange={(e) => setSlowSpd(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onHomeJoint} disabled={!connected}>
            Home J{joint}
          </Button>
          <Button variant="secondary" onClick={onHomeAll} disabled={!connected}>
            Home All (J6 → J1)
          </Button>
          <Button variant="destructive" onClick={onAbort} disabled={!connected}>
            Abort
          </Button>
        </div>
      </div>
    </Card>
  );
});

export const SingleJointMovesCard = memo(function SingleJointMovesCard(props: {
  connected: boolean;
  joint: number;
  tgt: string;
  spd: string;
  acc: string;
  delta: string;
  spdBy: string;
  accBy: string;
  setTgt: (v: string) => void;
  setSpd: (v: string) => void;
  setAcc: (v: string) => void;
  setDelta: (v: string) => void;
  setSpdBy: (v: string) => void;
  setAccBy: (v: string) => void;
  onMoveTo: () => void;
  onMoveBy: () => void;
}) {
  const { connected, joint, tgt, spd, acc, delta, spdBy, accBy, setTgt, setSpd, setAcc, setDelta, setSpdBy, setAccBy, onMoveTo, onMoveBy } = props;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Single Joint Moves</div>
          <div className="text-xs text-muted-foreground">Absolute & relative moves</div>
        </div>
        <Badge variant="outline">J{joint}</Badge>
      </div>

      <Separator className="my-3" />

      <div className="grid gap-4">
        <div className="rounded-xl border bg-background/40 p-3">
          <div className="text-xs font-semibold">Absolute</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Target (°)</Label>
              <Input value={tgt} onChange={(e) => setTgt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Speed (°/s)</Label>
              <Input value={spd} onChange={(e) => setSpd(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Accel (°/s²)</Label>
              <Input value={acc} onChange={(e) => setAcc(e.target.value)} />
            </div>
          </div>
          <div className="mt-2">
            <Button className="w-full" onClick={onMoveTo} disabled={!connected}>
              MoveTo J{joint}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-background/40 p-3">
          <div className="text-xs font-semibold">Relative</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Δ (°)</Label>
              <Input value={delta} onChange={(e) => setDelta(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Speed (°/s)</Label>
              <Input value={spdBy} onChange={(e) => setSpdBy(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Accel (°/s²)</Label>
              <Input value={accBy} onChange={(e) => setAccBy(e.target.value)} />
            </div>
          </div>
          <div className="mt-2">
            <Button className="w-full" variant="secondary" onClick={onMoveBy} disabled={!connected}>
              MoveBy J{joint}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
});

export const CartesianCard = memo(function CartesianCard(props: {
  connected: boolean;
  linPos: number[];
  linEuler: number[];
  linSpeed: string;
  linAccel: string;
  setLinPos: React.Dispatch<React.SetStateAction<number[]>>;
  setLinEuler: React.Dispatch<React.SetStateAction<number[]>>;
  setLinSpeed: (v: string) => void;
  setLinAccel: (v: string) => void;
  onInterpolated: () => void;
  onVelocityProfile: () => void;
}) {
  const { connected, linPos, linEuler, linSpeed, linAccel, setLinPos, setLinEuler, setLinSpeed, setLinAccel, onInterpolated, onVelocityProfile } = props;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Cartesian Linear Move (Teensy)</div>
          <div className="text-xs text-muted-foreground">TCP position + Euler (mm / degrees)</div>
        </div>
        <Badge variant="outline" className="tabular-nums">
          [{linPos.map((v) => v.toFixed(0)).join(", ")}] mm
        </Badge>
      </div>

      <Separator className="my-3" />

      <div className="grid gap-3">
        <div className="rounded-xl border bg-muted/20 p-2 text-xs text-muted-foreground">
          Current TCP: [{linPos.map((v) => v.toFixed(1)).join(", ")}] mm • Euler: [{linEuler.map((v) => v.toFixed(1)).join(", ")}]°
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          {(["X", "Y", "Z"] as const).map((axis, i) => (
            <div key={axis} className="space-y-1">
              <Label className="text-xs">{axis} (mm)</Label>
              <Input
                value={linPos[i].toFixed(1)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setLinPos((p) => {
                    const c = [...p];
                    c[i] = v;
                    return c;
                  });
                }}
              />
            </div>
          ))}
          {(["rX", "rY", "rZ"] as const).map((axis, i) => (
            <div key={axis} className="space-y-1">
              <Label className="text-xs">{axis} (°)</Label>
              <Input
                value={linEuler[i].toFixed(1)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setLinEuler((p) => {
                    const c = [...p];
                    c[i] = v;
                    return c;
                  });
                }}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Speed (mm/s)</Label>
            <Input value={linSpeed} onChange={(e) => setLinSpeed(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Acceleration (mm/s²)</Label>
            <Input value={linAccel} onChange={(e) => setLinAccel(e.target.value)} />
          </div>

          <div className="flex items-end">
            <Button className="w-full" onClick={onInterpolated} disabled={!connected}>
              Interpolated
            </Button>
          </div>
          <div className="flex items-end">
            <Button className="w-full" variant="secondary" onClick={onVelocityProfile} disabled={!connected}>
              Velocity Profile
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
});

export const MultiMoveCard = memo(function MultiMoveCard(props: {
  connected: boolean;
  multiParams: { target: string; speed: string; accel: string }[];
  setMultiParams: React.Dispatch<React.SetStateAction<{ target: string; speed: string; accel: string }[]>>;
  currentJoints: number[] | null;
  onChange: (idx: number, field: "target" | "speed" | "accel", val: string) => void;
  onExecute: () => void;
}) {
  const { connected, multiParams, setMultiParams, currentJoints, onChange, onExecute } = props;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Absolute Move Multiple</div>
          <div className="text-xs text-muted-foreground">Set any joints you want, then execute</div>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (!currentJoints) {
              toast.warning("Joint status not ready");
              return;
            }
            setMultiParams((old) =>
              old.map((row, i) => ({
                ...row,
                target: currentJoints[i].toFixed(2),
              })),
            );
            toast.success("Targets filled from current joints");
          }}
          disabled={!connected || !currentJoints}
        >
          Fill Targets
        </Button>
      </div>

      <Separator className="my-3" />

      <div className="grid gap-2">
        {multiParams.map((p, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2">
            <div className="col-span-2 text-xs font-semibold">J{i + 1}</div>
            <Input className="col-span-3" placeholder="Target" value={p.target} onChange={(e) => onChange(i, "target", e.target.value)} />
            <Input className="col-span-3" placeholder="Speed" value={p.speed} onChange={(e) => onChange(i, "speed", e.target.value)} />
            <Input className="col-span-4" placeholder="Accel" value={p.accel} onChange={(e) => onChange(i, "accel", e.target.value)} />
          </div>
        ))}

        <div className="flex gap-2 pt-2">
          <Button className="flex-1" onClick={onExecute} disabled={!connected}>
            Execute Multi Move
          </Button>
          <Button
            className="flex-1"
            variant="secondary"
            onClick={() =>
              setMultiParams(
                Array.from({ length: 6 }, () => ({
                  target: "",
                  speed: "",
                  accel: "",
                })),
              )
            }
            disabled={!connected}
          >
            Clear
          </Button>
        </div>
      </div>
    </Card>
  );
});

export const JointStatusCard = memo(function JointStatusCard(props: {
  connected: boolean;
  rows: {
    joint: number;
    position: number;
    velocity: number;
    acceleration: number;
    target: number | null;
  }[];
  onPull: () => void;
}) {
  const { connected, rows, onPull } = props;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Joint Status</div>
          <div className="text-xs text-muted-foreground">Readback (pos/vel/acc/target)</div>
        </div>
        <Button size="sm" variant="secondary" onClick={onPull} disabled={!connected}>
          Pull
        </Button>
      </div>

      <Separator className="my-3" />

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-left">
              <th className="px-3 py-2">J</th>
              <th className="px-3 py-2 text-right">Pos</th>
              <th className="px-3 py-2 text-right">Vel</th>
              <th className="px-3 py-2 text-right">Acc</th>
              <th className="px-3 py-2 text-right">Tgt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.joint} className="border-t">
                <td className="px-3 py-2 font-medium">J{r.joint}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(r.position).toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(r.velocity).toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(r.acceleration).toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.target != null ? Number(r.target).toFixed(1) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        Tip: use <span className="font-medium">Copy Joints</span> then paste into notes / debug logs.
      </div>
    </Card>
  );
});

/* ========================================================================== */
/*                                     IO                                     */
/* ========================================================================== */

function IOPanel() {
  const io = usePhysIoModel();

  return (
    <ScrollArea className="h-full">
      <div className="grid gap-3 pr-1">
        <IOHeaderBar connected={io.connected} autoRefresh={io.autoRefresh} setAutoRefresh={io.setAutoRefresh} onRefresh={io.fetchAll} />
        <EStopCard estop={io.estop} />
        <div className="grid gap-3 md:grid-cols-2">
          <InputsButtonsCard buttons={io.buttons} />
          <InputsLimitsCard limits={io.limits} />
        </div>
        <OutputsCard connected={io.connected} digitalOutputs={io.digitalOutputs} onPull={io.pullOutputs} onToggle={io.toggleOutput} />
      </div>
    </ScrollArea>
  );
}

/* -------------------- IO: individual cards -------------------- */

export const IOHeaderBar = memo(function IOHeaderBar(props: { connected: boolean; autoRefresh: boolean; setAutoRefresh: (v: boolean | ((p: boolean) => boolean)) => void; onRefresh: () => void }) {
  const { connected, autoRefresh, setAutoRefresh, onRefresh } = props;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">I/O</div>
          <div className="text-xs text-muted-foreground">Inputs + Outputs • Live refresh</div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline">{connected ? "Online" : "Offline"}</Badge>
          <Button size="sm" variant="secondary" onClick={onRefresh} disabled={!connected}>
            Refresh
          </Button>
          <Button size="sm" variant={autoRefresh ? "default" : "outline"} onClick={() => setAutoRefresh((v: boolean) => !v)} disabled={!connected}>
            Live: {autoRefresh ? "ON" : "OFF"}
          </Button>
        </div>
      </div>
    </Card>
  );
});

export const EStopCard = memo(function EStopCard(props: { estop: any }) {
  const { estop } = props;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PiWarningCircleBold className={["h-6 w-6", estop?.status ? "text-destructive" : "text-primary"].join(" ")} />
          <div>
            <div className="text-sm font-semibold">{INPUT_LABELS[estop?.id ?? 1]}</div>
            <div className="text-xs text-muted-foreground">{estop?.status ? "EMERGENCY STOP ENGAGED" : "System Ready"}</div>
          </div>
        </div>
        <Badge variant={estop?.status ? "destructive" : "outline"}>{estop?.status ? "STOPPED" : "OK"}</Badge>
      </div>
    </Card>
  );
});

export const InputsButtonsCard = memo(function InputsButtonsCard(props: { buttons: any[] }) {
  const { buttons } = props;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Buttons</div>
        <div className="text-xs text-muted-foreground">Inputs 2–13</div>
      </div>

      <Separator className="my-3" />

      <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
        {buttons.map((btn: any) => (
          <div key={btn.id} className="rounded-md border bg-background/50 p-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold">{btn.id}</div>
              <Dot on={!!btn.status} />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{INPUT_LABELS[btn.id]}</div>
          </div>
        ))}
      </div>
    </Card>
  );
});

export const InputsLimitsCard = memo(function InputsLimitsCard(props: { limits: any[] }) {
  const { limits } = props;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Limit Switches</div>
        <div className="text-xs text-muted-foreground">Inputs 14–19</div>
      </div>

      <Separator className="my-3" />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {limits.map((lim: any) => (
          <div key={lim.id} className="rounded-md border bg-background/50 p-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold">{lim.id}</div>
              <Dot on={!!lim.status} />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{INPUT_LABELS[lim.id]}</div>
          </div>
        ))}
      </div>
    </Card>
  );
});

export const OutputsCard = memo(function OutputsCard(props: { connected: boolean; digitalOutputs: any[]; onPull: () => void; onToggle: (id: number) => void }) {
  const { connected, digitalOutputs, onPull, onToggle } = props;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Outputs</div>
        <Button size="sm" variant="secondary" onClick={onPull} disabled={!connected}>
          Pull
        </Button>
      </div>

      <Separator className="my-3" />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {digitalOutputs.map((out: any) => (
          <Button key={out.id} size="sm" variant={out.status ? "default" : "outline"} disabled={!out.enabled || !connected} onClick={() => onToggle(out.id)} className="justify-start">
            <span className="mr-2 inline-flex items-center">
              <Dot on={!!out.status} />
            </span>
            {OUTPUT_LABELS[out.id] ?? `Output ${out.id}`}
          </Button>
        ))}
      </div>
    </Card>
  );
});

/* ========================================================================== */
/*                         Standalone Widget Components                        */
/* ========================================================================== */

export function PhysQuickBarWidget() {
  return (
    <PhysActionsModelProvider>
      <PhysQuickBarWidgetInner />
    </PhysActionsModelProvider>
  );
}

function PhysQuickBarWidgetInner() {
  const m = usePhysActionsModel();
  return (
    <QuickBarCard
      connected={m.connected}
      joint={m.joint}
      setJoint={m.setJoint}
      liveUpdate={m.liveUpdate}
      setLiveUpdate={m.setLiveUpdate}
      onRefresh={m.refreshStatus}
      onCopyJoints={m.copyJoints}
      onCopyTcp={m.copyTcp}
    />
  );
}

export function PhysPresetsWidget() {
  return (
    <PhysActionsModelProvider>
      <PhysPresetsWidgetInner />
    </PhysActionsModelProvider>
  );
}

function PhysPresetsWidgetInner() {
  const m = usePhysActionsModel();
  return (
    <PresetsCard
      connected={m.connected}
      presets={m.presets}
      currentJoints={m.currentJoints}
      onSaveCurrent={m.addPresetFromCurrent}
      onLoadCurrentIntoMulti={() => {
        if (!m.currentJoints) return;
        m.applyPresetToInputs({
          id: "tmp",
          name: "Current",
          createdAt: Date.now(),
          jointsDeg: m.currentJoints,
        });
      }}
      onRename={m.renamePreset}
      onDelete={m.deletePreset}
      onLoad={m.applyPresetToInputs}
      onRun={m.executePreset}
    />
  );
}

export function PhysHomingWidget() {
  return (
    <PhysActionsModelProvider>
      <PhysHomingWidgetInner />
    </PhysActionsModelProvider>
  );
}

function PhysHomingWidgetInner() {
  const m = usePhysActionsModel();
  return (
    <HomingCard
      connected={m.connected}
      joint={m.joint}
      setJoint={m.setJoint}
      fastSpd={m.fastSpd}
      slowSpd={m.slowSpd}
      setFastSpd={m.setFastSpd}
      setSlowSpd={m.setSlowSpd}
      onHomeJoint={m.homeJoint}
      onHomeAll={m.homeAll}
      onAbort={m.abortHoming}
    />
  );
}

export function PhysSingleJointMovesWidget() {
  return (
    <PhysActionsModelProvider>
      <PhysSingleJointMovesWidgetInner />
    </PhysActionsModelProvider>
  );
}

function PhysSingleJointMovesWidgetInner() {
  const m = usePhysActionsModel();
  return (
    <SingleJointMovesCard
      connected={m.connected}
      joint={m.joint}
      tgt={m.tgt}
      spd={m.spd}
      acc={m.acc}
      delta={m.delta}
      spdBy={m.spdBy}
      accBy={m.accBy}
      setTgt={m.setTgt}
      setSpd={m.setSpd}
      setAcc={m.setAcc}
      setDelta={m.setDelta}
      setSpdBy={m.setSpdBy}
      setAccBy={m.setAccBy}
      onMoveTo={m.moveTo}
      onMoveBy={m.moveBy}
    />
  );
}

export function PhysCartesianMoveWidget() {
  return (
    <PhysActionsModelProvider>
      <PhysCartesianMoveWidgetInner />
    </PhysActionsModelProvider>
  );
}

function PhysCartesianMoveWidgetInner() {
  const m = usePhysActionsModel();
  return (
    <CartesianCard
      connected={m.connected}
      linPos={m.linPos}
      linEuler={m.linEuler}
      linSpeed={m.linSpeed}
      linAccel={m.linAccel}
      setLinPos={m.setLinPos}
      setLinEuler={m.setLinEuler}
      setLinSpeed={m.setLinSpeed}
      setLinAccel={m.setLinAccel}
      onInterpolated={m.interpolated}
      onVelocityProfile={m.velocityProfile}
    />
  );
}

export function PhysMultiMoveWidget() {
  return (
    <PhysActionsModelProvider>
      <PhysMultiMoveWidgetInner />
    </PhysActionsModelProvider>
  );
}

function PhysMultiMoveWidgetInner() {
  const m = usePhysActionsModel();
  return (
    <MultiMoveCard
      connected={m.connected}
      multiParams={m.multiParams}
      setMultiParams={m.setMultiParams}
      currentJoints={m.currentJoints}
      onChange={m.handleMultiChange}
      onExecute={m.executeMultiFromInputs}
    />
  );
}

export function PhysJointStatusWidget() {
  return (
    <PhysActionsModelProvider>
      <PhysJointStatusWidgetInner />
    </PhysActionsModelProvider>
  );
}

function PhysJointStatusWidgetInner() {
  const m = usePhysActionsModel();
  return <JointStatusCard connected={m.connected} rows={m.rows} onPull={m.refreshStatus} />;
}

export function IoHeaderWidget() {
  return (
    <PhysIoModelProvider>
      <IoHeaderWidgetInner />
    </PhysIoModelProvider>
  );
}

function IoHeaderWidgetInner() {
  const io = usePhysIoModel();
  return <IOHeaderBar connected={io.connected} autoRefresh={io.autoRefresh} setAutoRefresh={io.setAutoRefresh} onRefresh={io.fetchAll} />;
}

export function IoEStopWidget() {
  return (
    <PhysIoModelProvider>
      <IoEStopWidgetInner />
    </PhysIoModelProvider>
  );
}

function IoEStopWidgetInner() {
  const io = usePhysIoModel();
  return <EStopCard estop={io.estop} />;
}

export function IoButtonsWidget() {
  return (
    <PhysIoModelProvider>
      <IoButtonsWidgetInner />
    </PhysIoModelProvider>
  );
}

function IoButtonsWidgetInner() {
  const io = usePhysIoModel();
  return <InputsButtonsCard buttons={io.buttons} />;
}

export function IoLimitsWidget() {
  return (
    <PhysIoModelProvider>
      <IoLimitsWidgetInner />
    </PhysIoModelProvider>
  );
}

function IoLimitsWidgetInner() {
  const io = usePhysIoModel();
  return <InputsLimitsCard limits={io.limits} />;
}

export function IoOutputsWidget() {
  return (
    <PhysIoModelProvider>
      <IoOutputsWidgetInner />
    </PhysIoModelProvider>
  );
}

function IoOutputsWidgetInner() {
  const io = usePhysIoModel();
  return <OutputsCard connected={io.connected} digitalOutputs={io.digitalOutputs} onPull={io.pullOutputs} onToggle={io.toggleOutput} />;
}
