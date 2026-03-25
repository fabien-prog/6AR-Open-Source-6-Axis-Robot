import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import type CameraControls from "camera-controls";

export type ViewPreset =
  | "iso"
  | "top"
  | "bottom"
  | "front"
  | "back"
  | "right"
  | "left";

export type GizmoMode = "off" | "joint" | "tcp_translate" | "tcp_rotate";

export type ViewerSelection =
  | { kind: "none" }
  | { kind: "joint"; jointName: string }
  | { kind: "tcp" };

type ViewerRefsCtx = {
  cameraControlsRef: React.RefObject<CameraControls | null>;
  robotGroupRef: React.RefObject<THREE.Group | null>;
  extrasGroupRef: React.RefObject<THREE.Group | null>;
  robotObjectRef: React.RefObject<THREE.Object3D | null>;
  tcpTargetRef: React.RefObject<THREE.Object3D>;
  focusView: (view: ViewPreset) => void;
  setRobotObject: (obj: THREE.Object3D | null) => void;
};

type ViewerUiCtx = {
  selection: ViewerSelection;
  setSelection: React.Dispatch<React.SetStateAction<ViewerSelection>>;
  gizmoMode: GizmoMode;
  setGizmoMode: React.Dispatch<React.SetStateAction<GizmoMode>>;
};

const ViewerRefsContext = createContext<ViewerRefsCtx | null>(null);
const ViewerUiContext = createContext<ViewerUiCtx | null>(null);

export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const cameraControlsRef = useRef<CameraControls | null>(null);
  const robotGroupRef = useRef<THREE.Group | null>(null);
  const extrasGroupRef = useRef<THREE.Group | null>(null);

  const robotObjectRef = useRef<THREE.Object3D | null>(null);
  const tcpTargetRef = useRef<THREE.Object3D>(new THREE.Object3D());

  const [selection, setSelection] = useState<ViewerSelection>({ kind: "none" });
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("off");

  const setRobotObject = useCallback((obj: THREE.Object3D | null) => {
    robotObjectRef.current = obj;
  }, []);

  const focusView = useCallback((view: ViewPreset) => {
    const controls = cameraControlsRef.current;
    if (!controls) return;

    const box = new THREE.Box3();
    let hasAny = false;

    const groups: (THREE.Object3D | null)[] = [
      robotGroupRef.current,
      extrasGroupRef.current,
    ];

    for (const g of groups) {
      if (!g || g.visible === false) continue;
      box.expandByObject(g);
      hasAny = true;
    }

    if (!hasAny) return;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const radius = size.length() * 0.5 || 1;
    const dist = THREE.MathUtils.clamp(radius * 2.5, 0.6, 20);

    const frameObj = robotGroupRef.current ?? null;
    const q = new THREE.Quaternion();
    if (frameObj) frameObj.getWorldQuaternion(q);

    const X = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const Y = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const Z = new THREE.Vector3(0, 0, 1).applyQuaternion(q);

    const dir = new THREE.Vector3();
    switch (view) {
      case "top":
        dir.copy(Z);
        break;
      case "bottom":
        dir.copy(Z).multiplyScalar(-1);
        break;
      case "front":
        dir.copy(Y).multiplyScalar(-1);
        break;
      case "back":
        dir.copy(Y);
        break;
      case "left":
        dir.copy(X);
        break;
      case "right":
        dir.copy(X).multiplyScalar(-1);
        break;
      case "iso":
      default:
        dir.copy(X).addScaledVector(Y, -1).add(Z).normalize();
        break;
    }

    const eye = center.clone().addScaledVector(dir.normalize(), dist);
    controls.setLookAt(
      eye.x,
      eye.y,
      eye.z,
      center.x,
      center.y,
      center.z,
      true,
    );
  }, []);

  const refsValue = useMemo<ViewerRefsCtx>(
    () => ({
      cameraControlsRef,
      robotGroupRef,
      extrasGroupRef,
      robotObjectRef,
      tcpTargetRef,
      focusView,
      setRobotObject,
    }),
    [focusView, setRobotObject],
  );

  const uiValue = useMemo<ViewerUiCtx>(
    () => ({
      selection,
      setSelection,
      gizmoMode,
      setGizmoMode,
    }),
    [selection, gizmoMode],
  );

  return (
    <ViewerRefsContext.Provider value={refsValue}>
      <ViewerUiContext.Provider value={uiValue}>
        {children}
      </ViewerUiContext.Provider>
    </ViewerRefsContext.Provider>
  );
}

export function useViewerRefs() {
  const v = useContext(ViewerRefsContext);
  if (!v) throw new Error("useViewerRefs must be used inside <ViewerProvider>");
  return v;
}

export function useViewerUi() {
  const v = useContext(ViewerUiContext);
  if (!v) throw new Error("useViewerUi must be used inside <ViewerProvider>");
  return v;
}

// Compatibility hook for non-hot paths.
// Avoid using this in render-hot viewer code when granular hooks are enough.
export function useViewer() {
  return {
    ...useViewerRefs(),
    ...useViewerUi(),
  };
}