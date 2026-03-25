import { useEffect, useRef } from "react";
import * as THREE from "three";
import CameraControls from "camera-controls";
import { useFrame, useThree } from "@react-three/fiber";

CameraControls.install({ THREE });

export function CameraControlsRig({ enabled = true, dollyToCursor = true, onInit }: { enabled?: boolean; dollyToCursor?: boolean; onInit?: (controls: CameraControls | null) => void }) {
  const { camera, gl, scene, invalidate } = useThree();

  const controlsRef = useRef<CameraControls | null>(null);
  const targetHelperRef = useRef<THREE.Mesh | null>(null);
  const targetVec = useRef(new THREE.Vector3()).current;

  useEffect(() => {
    camera.up.set(0, 0, 1);

    const controls = new CameraControls(camera as THREE.PerspectiveCamera, gl.domElement);
    controlsRef.current = controls;

    onInit?.(controls);

    // Make camera behavior normal again
    controls.mouseButtons.left = CameraControls.ACTION.ROTATE;
    controls.mouseButtons.middle = CameraControls.ACTION.DOLLY;
    controls.mouseButtons.right = CameraControls.ACTION.SCREEN_PAN;
    controls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;

    controls.touches.one = CameraControls.ACTION.TOUCH_ROTATE;
    controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY_TRUCK;

    controls.dollyToCursor = dollyToCursor;
    controls.draggingSmoothTime = 0;
    controls.azimuthRotateSpeed = 1.0;
    controls.polarRotateSpeed = 1.0;
    controls.dollySpeed = 1.5;
    controls.minDistance = 0.2;
    controls.maxDistance = 200;
    controls.smoothTime = 0;

    const geom = new THREE.SphereGeometry(0.02, 16, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0069ff,
      depthTest: false,
      depthWrite: false,
    });
    const helper = new THREE.Mesh(geom, mat);
    helper.visible = false;
    helper.renderOrder = 999;
    scene.add(helper);
    targetHelperRef.current = helper;

    const handleStart = () => {
      helper.visible = true;
      invalidate();
    };

    const handleEnd = () => {
      helper.visible = false;
      invalidate();
    };

    // Fire invalidate on every pointer move during drag so demand-mode
    // renders a frame for each input event, not just when update() decides to.
    const handleControl = () => invalidate();

    controls.addEventListener("controlstart", handleStart);
    controls.addEventListener("control", handleControl);
    controls.addEventListener("controlend", handleEnd);

    return () => {
      onInit?.(null);

      controls.removeEventListener("controlstart", handleStart);
      controls.removeEventListener("control", handleControl);
      controls.removeEventListener("controlend", handleEnd);
      controls.dispose();
      controlsRef.current = null;

      scene.remove(helper);
      geom.dispose();
      mat.dispose();
      targetHelperRef.current = null;
    };
  }, [camera, gl, scene, invalidate, dollyToCursor, onInit]);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.enabled = enabled;
  }, [enabled]);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.dollyToCursor = dollyToCursor;
  }, [dollyToCursor]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls || !controls.enabled) return;

    const updated = controls.update(delta);

    if (targetHelperRef.current) {
      controls.getTarget(targetVec);
      targetHelperRef.current.position.copy(targetVec);
    }

    if (updated) invalidate();
  });

  return null;
}
