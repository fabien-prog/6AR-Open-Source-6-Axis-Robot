import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import URDFLoader from "urdf-loader";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import ExtraModel from "./ExtraModel";
import { Box } from "@chakra-ui/react";

// ——— The URDFRobot component now supports an `isLive` prop ———
function URDFRobot({ targetAngles, isLive }) {
  const robotRef = useRef(null);
  const currentRef = useRef([]); // radians
  const startRef = useRef([]);
  const endRef = useRef([]);
  const startTimeRef = useRef(0);
  const DURATION_MS = 500;
  const jointNames = ["J1", "J2", "J3", "J4", "J5", "J6"];

  // 1) Load URDF once
  useEffect(() => {
    const loader = new URDFLoader();
    loader.packages = {
      "6AR-000-000.SLDASM": "/files/6AR-000-000.SLDASM/"
    };
    loader.loadMeshCb = (path, manager, onComplete) => {
      new STLLoader(manager).load(
        path,
        geo => onComplete(
          new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x888888 }))
        ),
        undefined,
        err => { console.error("STL error", err); onComplete(null, err); }
      );
    };

    loader.load(
      "/files/6AR-000-000.SLDASM/urdf/6AR-000-000.SLDASM.urdf",
      robot => {
        robot.rotateX(-Math.PI / 2);
        robot.position.set(0, 0, 0);
        robot.rotateX(Math.PI / 2);
        robot.add(new THREE.AxesHelper(1));
        robot.updateMatrixWorld(true);
        robotRef.current = robot;
      },
      undefined,
      err => console.error("URDF load error", err)
    );
  }, []);

  // 2) Whenever `targetAngles` **or** `isLive` changes, set up snap vs tween
  useEffect(() => {
    if (isLive) {
      // LIVE MODE: snap immediately
      currentRef.current = targetAngles.map(a => THREE.MathUtils.degToRad(a));
      return;
    }
    // DISCRETE MODE: record tween start/end
    startTimeRef.current = performance.now();
    if (currentRef.current.length !== targetAngles.length) {
      currentRef.current = targetAngles.map(a => THREE.MathUtils.degToRad(a));
    }
    startRef.current = [...currentRef.current];
    endRef.current = targetAngles.map(a => THREE.MathUtils.degToRad(a));
  }, [targetAngles, isLive]);

  // 3) Each frame: either snap or lerp
  useFrame(() => {
    const robot = robotRef.current;
    if (!robot) return;

    if (isLive) {
      // snap to current angles
      jointNames.forEach((name, i) => {
        const joint = robot.joints[name];
        if (!joint) return;
        const v = THREE.MathUtils.degToRad(targetAngles[i] || 0);
        joint.setJointValue(v);
        currentRef.current[i] = v;
      });
    } else {
      // tween from start→end over DURATION_MS
      const now = performance.now();
      const t = Math.min(1, (now - startTimeRef.current) / DURATION_MS);
      jointNames.forEach((name, i) => {
        const joint = robot.joints[name];
        if (!joint) return;
        const s = startRef.current[i] || 0;
        const e = endRef.current[i] || 0;
        const v = THREE.MathUtils.lerp(s, e, t);
        joint.setJointValue(v);
        currentRef.current[i] = v;
      });
    }
  });

  return robotRef.current ? <primitive object={robotRef.current} /> : null;
}

// ——— The Canvas wrapper now also accepts `isLive` ———
export default function RobotLoader({ joints, isLive, extras = [] }) {
  return (
    <Box h="40vh" w="full" position="relative">
      <Canvas frameloop="demand" camera={{ position: [0, 3, 0.5], fov: 50, up: [0, 0, 1] }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={2} />
        <URDFRobot targetAngles={joints} isLive={isLive} />
        <mesh rotation={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[1.5, 1.5]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        {extras.map((e, i) => (
          <ExtraModel
            key={i}
            url={e.url}
            position={e.position}
            rotation={e.rotation}
          />
        ))}
        <OrbitControls />
      </Canvas>
    </Box>
  );
}
