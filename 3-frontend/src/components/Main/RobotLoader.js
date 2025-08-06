// src/components/RobotLoader.jsx
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import URDFLoader from "urdf-loader";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { Box, IconButton } from "@chakra-ui/react";
import { PiRepeat } from "react-icons/pi";
import ExtraModel from "./ExtraModel";

// ——— URDFRobot stays mostly unchanged ———
function URDFRobot({ targetAngles, isLive }) {
  const robotRef = useRef(null);
  const currentRef = useRef([]);
  const startRef = useRef([]);
  const endRef = useRef([]);
  const startTimeRef = useRef(0);
  const DURATION_MS = 400;
  const names = ["J1", "J2", "J3", "J4", "J5", "J6"];

  React.useEffect(() => {
    const loader = new URDFLoader();
    loader.packages = { "6AR-000-000.SLDASM": "/files/6AR-000-000.SLDASM/" };
    loader.loadMeshCb = (path, manager, done) =>
      new STLLoader(manager).load(path, g => done(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x999999 }))));
    loader.load("/files/6AR-000-000.SLDASM/urdf/6AR-000-000.SLDASM.urdf",
      robot => {
        robot.rotateX(-Math.PI / 2);
        robot.position.set(0, 0, 0);
        robot.add(new THREE.AxesHelper(0.2));
        robot.updateMatrixWorld(true);
        robotRef.current = robot;
      },
      undefined, err => console.error("URDF load error", err));
  }, []);

  useEffect(() => {
    if (!robotRef.current) return;
    const toRad = THREE.MathUtils.degToRad;
    if (isLive) {
      currentRef.current = targetAngles.map(a => toRad(a));
    } else {
      startTimeRef.current = performance.now();
      if (!currentRef.current.length) currentRef.current = targetAngles.map(a => toRad(a));
      startRef.current = [...currentRef.current];
      endRef.current = targetAngles.map(a => toRad(a));
    }
  }, [targetAngles, isLive]);

  useFrame(() => {
    const robot = robotRef.current;
    if (!robot) return;
    const tNow = performance.now();
    const t = isLive
      ? 1
      : Math.min(1, (tNow - startTimeRef.current) / DURATION_MS);
    names.forEach((n, i) => {
      const node = robot.joints[n];
      if (!node) return;
      const angle = isLive
        ? THREE.MathUtils.degToRad(targetAngles[i])
        : THREE.MathUtils.lerp(startRef.current[i], endRef.current[i], t);
      node.setJointValue(angle);
      currentRef.current[i] = angle;
    });
  });

  return robotRef.current ? <primitive object={robotRef.current} /> : null;
}

// A little component to draw the corner-axis gizmo
function CornerAxes() {
  return (
    <group position={[-1, 0.01, 1]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* size = 0.2m, make them fat so they’re visible */}
      <axesHelper args={[1.5]} />
    </group>
  );
}

export default function RobotLoader({ joints, isLive, extras = [] }) {
  const cameraRef = useRef();

  const goHome = () => {
    if (!cameraRef.current) return;
    const cam = cameraRef.current;
    // reset position & lookAt
    cam.position.set(1.5, 1.5, 1.5);
    cam.lookAt(0, 0, 0);
  };

  return (
    <Box position="relative" h="45vh" w="100%">
      {/* Home button */}
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
        frameloop="always"
        camera={{ position: [1.5, 1.5, 1.5], fov: 45, near: 0.1, far: 10 }}
        onCreated={({ camera }) => {
          cameraRef.current = camera;
        }}
      >
        {/* Environment & lights */}
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

        {/* Corner axes gizmo */}
        <CornerAxes />

        {/* Your robot and extras */}
        <URDFRobot targetAngles={joints} isLive={isLive} />
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