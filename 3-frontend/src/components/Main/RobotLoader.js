import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows, PerformanceMonitor, AdaptiveDpr, AdaptiveEvents } from "@react-three/drei";
import URDFLoader from "urdf-loader";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { Box, IconButton } from "@chakra-ui/react";
import { PiRepeat } from "react-icons/pi";
import ExtraModel from "./ExtraModel";
import { useJointStore } from '../utils/store';

// ——— URDFRobot subscribes to store ———
function URDFRobot({ isLive }) {
  const { invalidate } = useThree();
  const robotRef = useRef(null);
  const jointOrderRef = useRef([]);   // ← array of actual URDFJoint instances (length 6)

  const currentRef = useRef([]);      // radians
  const startRef = useRef([]);        // radians
  const endRef = useRef([]);        // radians
  const startTimeRef = useRef(0);

  // seed snapshot (deg) before first render
  const initialAngles = useRef(useJointStore.getState().angles || [0, 0, 0, 0, 0, 0]);
  const liveAngles = useJointStore(s => s.angles);

  // subscribe to store → update target arrays + invalidate one frame
  useEffect(() => {
    const unsub = useJointStore.subscribe(
      s => s.angles,
      next => {
        const anglesDeg = next || [0, 0, 0, 0, 0, 0];
        const anglesRad = anglesDeg.map(THREE.MathUtils.degToRad);

        if (isLive) {
          currentRef.current = anglesRad;
        } else {
          startRef.current = [...currentRef.current];
          endRef.current = anglesRad;
          startTimeRef.current = performance.now();
        }
        invalidate(); // demand a frame
      }
    );
    return unsub;
  }, [isLive, invalidate]);

  // load URDF and figure out real joint order
  useEffect(() => {
    const loader = new URDFLoader();
    loader.packages = { "6AR-000-000.SLDASM": "/files/6AR-000-000.SLDASM/" };
    loader.loadMeshCb = (path, manager, done) =>
      new STLLoader(manager).load(
        path,
        g => done(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x999999 })))
      );

    loader.load(
      "/files/6AR-000-000.SLDASM/urdf/6AR-000-000.SLDASM.urdf",
      robot => {
        robot.rotateX(-Math.PI / 2);
        robot.position.set(0, 0, 0);
        robot.add(new THREE.AxesHelper(0.2));
        robot.updateMatrixWorld(true);
        robotRef.current = robot;
        invalidate(); // demand a frame

        // 1) Discover movable joints in traversal order
        jointOrderRef.current = ["J1", "J2", "J3", "J4", "J5", "J6"]
          .map(n => robot.joints[n])
          .filter(Boolean);

        // 2) Initialize robot pose to current store angles
        const initDeg = initialAngles.current || [0, 0, 0, 0, 0, 0];
        const initRad = initDeg.map(THREE.MathUtils.degToRad);
        jointOrderRef.current.forEach((j, i) => {
          if (j) j.setJointValue(initRad[i] || 0);
        });
        currentRef.current = initRad;

        invalidate(); // render once
      },
      undefined,
      err => console.error("URDF load error", err)
    );
  }, [invalidate]);

  useFrame(() => {
    if (!robotRef.current) return;
    const anglesRad = liveAngles.map(THREE.MathUtils.degToRad);
    jointOrderRef.current.forEach((joint, i) => {
      if (joint) joint.setJointValue(anglesRad[i] || 0);
    });
  });

  return robotRef.current ? <primitive object={robotRef.current} /> : null;
}

function CornerAxes() {
  return (
    <group position={[-1, 0.01, 1]} rotation={[-Math.PI / 2, 0, 0]}>
      <axesHelper args={[1.5]} />
    </group>
  );
}

export default function RobotLoader({ isLive, extras = [] }) {
  const cameraRef = useRef();
  const [dpr, setDpr] = useState(Math.min(2, window.devicePixelRatio));

  const goHome = () => {
    if (!cameraRef.current) return;
    const cam = cameraRef.current;
    cam.position.set(1.5, 1.5, 1.5);
    cam.lookAt(0, 0, 0);
  };

  return (
    <Box position="relative" h="45vh" w="100%">
      <IconButton
        icon={<PiRepeat />}
        aria-label="Go Home"
        position="absolute"
        top="1rem"
        right="1rem"
        zIndex={1}
        colorScheme="teal"
        size="sm"
        onClick={goHome}
      />

      <Canvas
        shadows
        style={{ width: "100%", height: "100%" }}
        frameloop="demand"
        dpr={dpr}
        camera={{ position: [1.5, 1.5, 1.5], fov: 45, near: 0.1, far: 10 }}
        onCreated={({ camera }) => {
          cameraRef.current = camera;
        }}
      >
        <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(Math.min(2, window.devicePixelRatio))} />
        <AdaptiveDpr />
        <AdaptiveEvents />

        <Environment preset="sunset" />
        <hemisphereLight intensity={0.5} skyColor={0xeeeeff} groundColor={0x444422} />
        <directionalLight
          castShadow
          position={[5, 10, 5]}
          intensity={1.2}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-near={0.5}
          shadow-camera-far={50}
          shadow-camera-left={-5}
          shadow-camera-right={5}
          shadow-camera-top={5}
          shadow-camera-bottom={-5}
        />
        <ContactShadows resolution={1024} frames={1} position={[0, 0, 0]} scale={2} blur={1} far={1} />
        <gridHelper args={[2, 20, `white`, `gray`]} />

        <CornerAxes />
        <URDFRobot isLive={isLive} />
        {extras.map((e, i) => (
          <ExtraModel
            key={i}
            url={e.url}
            position={e.position}
            rotation={e.rotation}
            scale={e.scale}
            castShadow
          />
        ))}

        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          rotateSpeed={0.5}
          maxPolarAngle={Math.PI / 2}
        />
      </Canvas>
    </Box>
  );
}
