import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import URDFLoader from "urdf-loader";
import { STLLoader } from "three-stdlib";
import { PiRepeat } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import ExtraModel, { type ExtraModelProps } from "@/features/Robot/ExtraModel";
import { jointAnglesRef } from "@/stores/JointStore";
import { CameraControlsRig } from "@/features/Robot/Viewer/CameraControlsRig";
import { useViewerRefs, useViewerUi } from "@/features/Robot/Viewer/ViewerContext";


type Extra = ExtraModelProps;

const JOINT_NAMES = ["J1", "J2", "J3", "J4", "J5", "J6"] as const;
const JOINT_INDEX: Record<string, number> = {
  J1: 0,
  J2: 1,
  J3: 2,
  J4: 3,
  J5: 4,
  J6: 5,
};

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// Pre-allocated colors — never reallocated at runtime
const _C_SAFE   = new THREE.Color(0x9a9a9a); // neutral gray
const _C_WARN   = new THREE.Color(0xf59e0b); // amber
const _C_DANGER = new THREE.Color(0xef4444); // red
const _C_TMP    = new THREE.Color();

function jointLimitColor(deg: number, min: number, max: number): number {
  const range = max - min;
  if (range <= 0) return 0x9a9a9a;
  const margin = Math.min(deg - min, max - deg); // degrees from nearest limit
  const warnAt   = range * 0.15;                 // warn within 15 % of range
  const dangerAt = range * 0.05;                 // danger within 5 %
  if (margin >= warnAt) return _C_SAFE.getHex();
  const t = Math.max(0, (margin - dangerAt) / (warnAt - dangerAt)); // 0 = danger, 1 = warn edge
  _C_TMP.lerpColors(_C_DANGER, _C_WARN, t);
  return _C_TMP.getHex();
}

/* =======================================================================================
 * Helpers
 * ======================================================================================= */

function findClosestURDFJoint(obj: THREE.Object3D | null): any | null {
  let cur: any = obj;
  while (cur) {
    if (cur.isURDFJoint) return cur;
    cur = cur.parent;
  }
  return null;
}

function findClosestURDFLink(obj: THREE.Object3D | null): any | null {
  let cur: any = obj;
  while (cur) {
    if (cur.isURDFLink) return cur;
    cur = cur.parent;
  }
  return null;
}

// Pre-allocated temporaries for normalizeAxisToQuaternion — never reallocated at runtime
const _NAQ_X = new THREE.Vector3();
const _NAQ_Y = new THREE.Vector3();
const _NAQ_Z = new THREE.Vector3();
const _NAQ_M = new THREE.Matrix4();

function normalizeAxisToQuaternion(axisWorld: THREE.Vector3, outQ: THREE.Quaternion) {
  _NAQ_X.copy(axisWorld).normalize();
  const tmp = Math.abs(_NAQ_X.dot(Z_AXIS)) > 0.9 ? Y_AXIS : Z_AXIS;
  _NAQ_Z.crossVectors(_NAQ_X, tmp).normalize();
  _NAQ_Y.crossVectors(_NAQ_Z, _NAQ_X).normalize();
  _NAQ_M.makeBasis(_NAQ_X, _NAQ_Y, _NAQ_Z);
  outQ.setFromRotationMatrix(_NAQ_M);
  return outQ;
}

function findTcpObject(robot: any): THREE.Object3D | null {
  if (!robot) return null;
  const preferredNames = ["J6"];
  for (const name of preferredNames) {
    const obj = robot.links?.[name] ?? robot.joints?.[name] ?? robot.getObjectByName?.(name) ?? null;
    if (obj) return obj;
  }

  return null;
}

const _TCP_POS   = new THREE.Vector3();
const _TCP_QUAT  = new THREE.Quaternion();
const _TCP_SCALE = new THREE.Vector3();
const _TCP_OFF   = new THREE.Vector3();

function setTcpTargetFromRobot(robot: any, tcpTarget: THREE.Object3D, zOffsetMeters = 0.2) {
  const tcpBase = findTcpObject(robot);
  if (!tcpBase) return false;

  tcpBase.updateMatrixWorld(true);
  tcpBase.matrixWorld.decompose(_TCP_POS, _TCP_QUAT, _TCP_SCALE);

  _TCP_OFF.set(0, 0, zOffsetMeters).applyQuaternion(_TCP_QUAT);

  tcpTarget.position.copy(_TCP_POS).add(_TCP_OFF);
  tcpTarget.quaternion.copy(_TCP_QUAT);
  tcpTarget.visible = true;
  tcpTarget.updateMatrixWorld(true);

  return true;
}

/* =======================================================================================
 * URDF Robot
 * ======================================================================================= */

function URDFRobot({ onRobotReady }: { onRobotReady: (robot: any) => void }) {
  const { invalidate } = useThree();
  const [robotObj, setRobotObj] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loader = new URDFLoader();
    loader.packages = { "6AR-000-000.SLDASM": "/files/6AR-000-000.SLDASM/" };

    const sharedMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a });

    loader.loadMeshCb = (path: string, manager: any, done: any) => {
      new STLLoader(manager).load(path, (g) => {
        const mesh = new THREE.Mesh(g, sharedMat);
        done(mesh);
      });
    };

    loader.load(
      "/files/6AR-000-000.SLDASM/urdf/6AR-000-000.SLDASM.urdf",
      (robot: any) => {
        if (cancelled) return;

        robot.position.set(0, 0, 0);
        robot.updateMatrixWorld(true);

        const deg = jointAnglesRef.current;
        for (let i = 0; i < JOINT_NAMES.length; i++) {
          const j = robot.joints?.[JOINT_NAMES[i]];
          if (!j) continue;
          j.setJointValue((deg[i] || 0) * DEG2RAD);
        }

        setRobotObj(robot);
        onRobotReady(robot);
        invalidate();
      },
      undefined,
      (err: unknown) => console.error("URDF load error", err),
    );

    return () => {
      cancelled = true;
    };
  }, [invalidate, onRobotReady]);

  return robotObj ? <primitive object={robotObj} /> : null;
}

const URDFRobotMemo = memo(URDFRobot);

/* =======================================================================================
 * Joint sync loop
 * ======================================================================================= */

// Per-joint URDF limits in degrees, extracted once when the robot loads.
// [lower, upper] in degrees.
type JointLimits = [number, number];

function useJointSync(
  robotRef: React.RefObject<any | null>,
  invalidate: () => void,
) {
  const lastDegRef   = useRef<Float32Array>(new Float32Array([999, 999, 999, 999, 999, 999]));
  const lastHexRef   = useRef<number[]>([0x9a9a9a, 0x9a9a9a, 0x9a9a9a, 0x9a9a9a, 0x9a9a9a, 0x9a9a9a]);
  const prevRobotRef = useRef<any | null>(null);
  const matsRef      = useRef<THREE.MeshStandardMaterial[] | null>(null);
  const limitsRef    = useRef<JointLimits[]>([[0, 360], [0, 360], [0, 360], [0, 360], [0, 360], [0, 360]]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const robot = robotRef.current;
      if (!robot) return;

      // Rebuild everything when a new robot instance loads
      if (robot !== prevRobotRef.current) {
        prevRobotRef.current = robot;

        matsRef.current?.forEach((m) => m.dispose());
        const mats = Array.from({ length: 6 }, () =>
          new THREE.MeshStandardMaterial({ color: 0x9a9a9a }),
        );
        matsRef.current = mats;
        lastHexRef.current = [0x9a9a9a, 0x9a9a9a, 0x9a9a9a, 0x9a9a9a, 0x9a9a9a, 0x9a9a9a];

        // Read limits directly from URDF joint objects (radians → degrees)
        for (let i = 0; i < JOINT_NAMES.length; i++) {
          const j = robot.joints?.[JOINT_NAMES[i]];
          const lower = j?.limit?.lower ?? j?.limits?.lower ?? 0;
          const upper = j?.limit?.upper ?? j?.limits?.upper ?? 0;
          if (Math.abs(upper - lower) > 0.001) {
            limitsRef.current[i] = [lower * RAD2DEG, upper * RAD2DEG];
          }
          // else: leave the [0, 360] fallback so colors still show something
        }

        // Assign each mesh to its closest URDF joint ancestor's material
        robot.traverse((obj: THREE.Object3D) => {
          if (!(obj as THREE.Mesh).isMesh) return;
          let cur: any = obj.parent;
          while (cur) {
            if (cur.isURDFJoint) {
              const idx = JOINT_INDEX[cur.name as string];
              if (idx !== undefined) (obj as THREE.Mesh).material = mats[idx];
              break;
            }
            cur = cur.parent;
          }
        });

        // Force an initial color pass — start lastHexRef at an impossible value
        // so the first tick always applies the correct color.
        lastHexRef.current = [-1, -1, -1, -1, -1, -1];
      }

      const deg   = jointAnglesRef.current;
      const last  = lastDegRef.current;
      const mats  = matsRef.current;

      let changed = false;
      for (let i = 0; i < 6; i++) {
        const d = deg[i] || 0;

        if (Math.abs(d - last[i]) > 1e-4) {
          last[i] = d;
          const j = robot.joints?.[JOINT_NAMES[i]];
          if (j) j.setJointValue(d * DEG2RAD);
          changed = true;
        }

        if (mats) {
          const [jMin, jMax] = limitsRef.current[i];
          const hex = jointLimitColor(d, jMin, jMax);
          if (hex !== lastHexRef.current[i]) {
            lastHexRef.current[i] = hex;
            mats[i].color.setHex(hex);
            changed = true;
          }
        }
      }

      if (changed) invalidate();
    }, 33);

    return () => window.clearInterval(timer);
  }, [robotRef, invalidate]);
}

/* =======================================================================================
 * Gizmo Controller
 * ======================================================================================= */

function RobotGizmoController({ robotRef }: { robotRef: React.MutableRefObject<any | null> }) {
  const { invalidate, scene } = useThree();
  const { cameraControlsRef, tcpTargetRef } = useViewerRefs();
  const { gizmoMode, selection } = useViewerUi();

  const isDraggingRef = useRef(false);
  useFrame(() => {
    if (isDraggingRef.current) invalidate();
  });

  const jointProxyRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const jointVisualRef = useRef<THREE.Group>(new THREE.Group());
  const activeJointRef = useRef<any | null>(null);

  const tmpPos = useRef(new THREE.Vector3()).current;
  const tmpQ = useRef(new THREE.Quaternion()).current;
  const tmpS = useRef(new THREE.Vector3()).current;
  const axisWorld = useRef(new THREE.Vector3()).current;

  const jointStartValueRef = useRef<number>(0);
  const proxyStartQuatRef = useRef(new THREE.Quaternion());

  const previewRafRef = useRef<number | null>(null);
  const [tcInstance, setTcInstance] = useState<any>(null);

  useEffect(() => {
    const tcpTarget = tcpTargetRef.current;
    if (!scene.children.includes(tcpTarget)) {
      tcpTarget.visible = false;
      scene.add(tcpTarget);
    }

    const jointProxy = jointProxyRef.current;
    if (!scene.children.includes(jointProxy)) {
      jointProxy.visible = true;
      scene.add(jointProxy);
    }

    const visual = jointVisualRef.current;
    if (visual.children.length === 0) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        depthTest: false,
      });

      const axisLine = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 12), mat);
      axisLine.rotation.z = Math.PI / 2;
      visual.add(axisLine);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.004, 10, 64), mat);
      ring.rotation.y = Math.PI / 2; // around local X
      visual.add(ring);

      const center = new THREE.Mesh(new THREE.SphereGeometry(0.01, 12, 12), mat);
      visual.add(center);

      visual.renderOrder = 999;
      visual.visible = false;
      jointProxy.add(visual);
    }

    return () => {
      if (previewRafRef.current != null) {
        cancelAnimationFrame(previewRafRef.current);
        previewRafRef.current = null;
      }
    };
  }, [scene, tcpTargetRef]);

  useEffect(() => {
    activeJointRef.current = null;
    jointVisualRef.current.visible = false;

    if (!(gizmoMode === "joint" && selection.kind === "joint")) {
      invalidate();
      return;
    }

    const robot = robotRef.current;
    const joint = robot?.joints?.[selection.jointName];
    if (!joint) {
      invalidate();
      return;
    }

    activeJointRef.current = joint;

    joint.updateMatrixWorld(true);
    joint.matrixWorld.decompose(tmpPos, tmpQ, tmpS);

    jointProxyRef.current.position.copy(tmpPos);

    const ax = joint.axis ?? [1, 0, 0];
    axisWorld.set(ax[0], ax[1], ax[2]).normalize().applyQuaternion(tmpQ).normalize();

    normalizeAxisToQuaternion(axisWorld, jointProxyRef.current.quaternion);
    jointProxyRef.current.updateMatrixWorld(true);

    jointVisualRef.current.visible = true;
    invalidate();
  }, [gizmoMode, selection, invalidate, robotRef, tmpPos, tmpQ, tmpS, axisWorld]);

  const attachObj = useMemo(() => {
    if (gizmoMode === "joint" && selection.kind === "joint") {
      return jointProxyRef.current;
    }
    if ((gizmoMode === "tcp_translate" || gizmoMode === "tcp_rotate") && selection.kind === "tcp") {
      return tcpTargetRef.current;
    }
    return null;
  }, [gizmoMode, selection, tcpTargetRef]);

  const mode: "translate" | "rotate" = gizmoMode === "tcp_translate" ? "translate" : "rotate";

  const onObjectChange = useCallback(() => {
    if (gizmoMode === "joint") {
      const joint = activeJointRef.current;
      if (!joint) return;

      const qNow = jointProxyRef.current.quaternion.clone().normalize();
      const qStartInv = proxyStartQuatRef.current.clone().invert();
      const qDelta = qStartInv.multiply(qNow).normalize();

      const twist = new THREE.Quaternion(qDelta.x, 0, 0, qDelta.w).normalize();

      let angle = 2 * Math.atan2(twist.x, twist.w);
      if (angle > Math.PI) angle -= 2 * Math.PI;
      if (angle < -Math.PI) angle += 2 * Math.PI;

      const next = jointStartValueRef.current + angle;

      joint.setJointValue(next);
      const idx = JOINT_INDEX[joint.name];
      if (idx !== undefined) jointAnglesRef.current[idx] = next * RAD2DEG;

      invalidate();
      return;
    }

    if (gizmoMode === "tcp_translate" || gizmoMode === "tcp_rotate") {
      invalidate();
      if (previewRafRef.current != null) return;

      previewRafRef.current = requestAnimationFrame(() => {
        previewRafRef.current = null;

        const p = tmpPos;
        const q = tmpQ;
        tcpTargetRef.current.getWorldPosition(p);
        tcpTargetRef.current.getWorldQuaternion(q);

        window.dispatchEvent(
          new CustomEvent("robot_tcp_target_preview", {
            detail: {
              position: [p.x, p.y, p.z],
              quaternion: [q.x, q.y, q.z, q.w],
            },
          }),
        );
      });
    }
  }, [gizmoMode, invalidate, tcpTargetRef, tmpPos, tmpQ]);

  const onDraggingChanged = useCallback(
    (event: any) => {
      const dragging = !!event.value;
      const c: any = cameraControlsRef.current;
      isDraggingRef.current = dragging;

      if (dragging) {
        if (c) c.enabled = false;

        if (gizmoMode === "joint") {
          const joint = activeJointRef.current;
          if (joint) {
            jointStartValueRef.current = joint.jointValue ?? 0;
            proxyStartQuatRef.current.copy(jointProxyRef.current.quaternion);
          }
        }
      } else {
        if (c) c.enabled = true;

        if (previewRafRef.current != null) {
          cancelAnimationFrame(previewRafRef.current);
          previewRafRef.current = null;
        }

        if (gizmoMode === "tcp_translate" || gizmoMode === "tcp_rotate") {
          const p = tmpPos;
          const q = tmpQ;
          tcpTargetRef.current.getWorldPosition(p);
          tcpTargetRef.current.getWorldQuaternion(q);

          window.dispatchEvent(
            new CustomEvent("robot_tcp_target_changed", {
              detail: {
                position: [p.x, p.y, p.z],
                quaternion: [q.x, q.y, q.z, q.w],
              },
            }),
          );
        }

        invalidate();
      }
    },
    [cameraControlsRef, gizmoMode, invalidate, tcpTargetRef, tmpPos, tmpQ],
  );

  useEffect(() => {
    if (!tcInstance) return;

    const onChange = () => invalidate();

    tcInstance.addEventListener("change", onChange);
    tcInstance.addEventListener("dragging-changed", onDraggingChanged);
    tcInstance.addEventListener("objectChange", onObjectChange);

    return () => {
      tcInstance.removeEventListener("change", onChange);
      tcInstance.removeEventListener("dragging-changed", onDraggingChanged);
      tcInstance.removeEventListener("objectChange", onObjectChange);
    };
  }, [tcInstance, onDraggingChanged, onObjectChange, invalidate]);

  if (!attachObj || gizmoMode === "off") return null;

  return (
    <TransformControls
      ref={setTcInstance}
      object={attachObj}
      mode={mode}
      showX={true}
      showY={gizmoMode !== "joint"}
      showZ={gizmoMode !== "joint"}
      size={gizmoMode === "joint" ? 0.85 : 0.9}
      space={gizmoMode === "joint" ? "local" : "world"}
    />
  );
}
/* =======================================================================================
 * Scene contents
 * ======================================================================================= */

const SceneContents = memo(function SceneContents({ extras }: { extras: Extra[] }) {
  const { invalidate } = useThree();
  const { cameraControlsRef, robotGroupRef, extrasGroupRef, tcpTargetRef, focusView, setRobotObject } = useViewerRefs();
  const { gizmoMode, setSelection } = useViewerUi();
  const robotRef = useRef<any | null>(null);

  useJointSync(robotRef, invalidate);

  useEffect(() => {
    if (!(gizmoMode === "tcp_translate" || gizmoMode === "tcp_rotate")) return;

    setSelection({ kind: "tcp" });

    const robot = robotRef.current;
    const tcpTarget = tcpTargetRef.current;
    if (!robot || !tcpTarget) {
      invalidate();
      return;
    }

    setTcpTargetFromRobot(robot, tcpTarget, 0.2); // +200 mm on local TCP Z

    invalidate();
  }, [gizmoMode, setSelection, invalidate, tcpTargetRef]);

  const handleRobotReady = useCallback(
    (robot: any) => {
      robotRef.current = robot;
      setRobotObject(robot);
      // Robot geometry is now in the scene — focus the camera onto it.
      // Controls init fires before the URDF loads so focusView there always
      // gets an empty bounding box. Calling it here guarantees geometry exists.
      focusView("iso");
      invalidate();
    },
    [setRobotObject, focusView, invalidate],
  );

  const handleRobotClick = useCallback(
    (e: any) => {
      if (gizmoMode === "off") return;

      if (gizmoMode === "tcp_translate" || gizmoMode === "tcp_rotate") {
        setSelection({ kind: "tcp" });
        invalidate();
        e.stopPropagation();
        return;
      }

      const hitObj: THREE.Object3D | null = e.object ?? null;
      const joint = findClosestURDFJoint(hitObj) ?? findClosestURDFJoint(findClosestURDFLink(hitObj)?.parent ?? null);

      if (!joint) setSelection({ kind: "none" });
      else setSelection({ kind: "joint", jointName: joint.name });

      invalidate();
      e.stopPropagation();
    },
    [gizmoMode, setSelection, invalidate],
  );

  const handleControlsInit = useCallback(
    (c: any) => {
      cameraControlsRef.current = c;
      // Try to focus immediately; will be a no-op if the robot isn't loaded yet
      // (handleRobotReady will call focusView again once geometry exists).
      if (c) focusView("iso");
      invalidate();
    },
    [cameraControlsRef, focusView, invalidate],
  );

  return (
    <>
      <hemisphereLight intensity={0.45} />
      <directionalLight position={[5, 10, 5]} intensity={1.05} />

      <gridHelper args={[3, 20, "white", "gray"]} rotation={[Math.PI / 2, 0, 0]} />

      <group ref={robotGroupRef} rotation={[0, 0, 0]} onClick={handleRobotClick}>
        <URDFRobotMemo onRobotReady={handleRobotReady} />
      </group>

      <group ref={extrasGroupRef}>
        {extras.map((e, i) => (
          <ExtraModel key={`${e.url}-${i}`} url={e.url} position={e.position} rotation={e.rotation} scale={e.scale} />
        ))}
      </group>

      <RobotGizmoController robotRef={robotRef} />

      <CameraControlsRig enabled dollyToCursor onInit={handleControlsInit} />
    </>
  );
});

/* =======================================================================================
 * RobotLoader
 * ======================================================================================= */

function RobotLoaderInner({ extras = [] }: { extras?: Extra[] }) {
  const handleHome = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("robot_view_home_camera_apply", {
        detail: { stamp: performance.now() },
      }),
    );
  }, []);

  const handleCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    gl.setClearColor(0x000000, 0);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.outputColorSpace = THREE.SRGBColorSpace;
  }, []);

  return (
    <div className="relative h-full w-full">
      <div className="absolute right-3 top-3 z-10">
        <Button size="icon" variant="secondary" onClick={handleHome} title="Go Home">
          <PiRepeat className="h-4 w-4" />
        </Button>
      </div>

      <Canvas
        frameloop="demand"
        dpr={1}
        className="h-full w-full"
        camera={{
          position: [1.5, 1.5, 1.5],
          fov: 45,
          near: 0.1,
          far: 50,
          up: [0, 0, 1],
        }}
        gl={{ antialias: true, alpha: true }}
        onCreated={handleCreated}
        style={{ background: "transparent" }}
      >
        <SceneContents extras={extras} />
      </Canvas>
    </div>
  );
}

export default memo(RobotLoaderInner);
