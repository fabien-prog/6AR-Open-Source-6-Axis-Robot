// ExtraModel.jsx
import React from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";

export default function ExtraModel({
  url,
  position = [0,0,0],
  rotation = [0,0,0],
  scale = 1
}) {
  const geom = useLoader(STLLoader, url);
  const mat  = new THREE.MeshStandardMaterial({ color: 0x888888 });

  return (
    <mesh
      geometry={geom}
      material={mat}
      position={position}       // already in meters
      rotation={rotation}       // in radians
      scale={[scale, scale, scale]}
      castShadow
      receiveShadow
    />
  );
}
