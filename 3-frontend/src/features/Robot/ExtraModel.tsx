// ExtraModel.tsx
import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

type Vec3 = readonly [number, number, number];

export type ExtraModelProps = {
  url: string;
  position?: Vec3;
  rotation?: Vec3; // radians
  scale?: number | Vec3;
  color?: number;
};

function ExtraModelInner({ url, position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, color = 0x888888 }: ExtraModelProps) {
  const geom = useLoader(STLLoader, url);

  useEffect(() => {
    // prepare once per loaded geometry
    geom.computeBoundingBox();
    geom.computeBoundingSphere();

    if (!geom.attributes.normal) {
      geom.computeVertexNormals();
    }

    // optional but usually better for imported STLs
    geom.center();
  }, [geom]);

  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({ color });
  }, [color]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  const scaleVec = useMemo<Vec3>(() => {
    return Array.isArray(scale) ? (scale as Vec3) : ([scale as number, scale as number, scale as number] as const);
  }, [scale]);

  return <mesh geometry={geom} material={material} position={position} rotation={rotation} scale={scaleVec} castShadow receiveShadow frustumCulled matrixAutoUpdate />;
}

const ExtraModel = memo(ExtraModelInner);
export default ExtraModel;
