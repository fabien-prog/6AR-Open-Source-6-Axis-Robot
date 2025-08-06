// src/components/AddStlModal.jsx
import React, { useState, useEffect } from "react";
import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Select,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  NumberInput,
  NumberInputField,
  useDisclosure,
  Box,
} from "@chakra-ui/react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";

export default function AddStlModal({ onAdd }) {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [file, setFile] = useState(null);
  const [bbox, setBbox] = useState({ x: 0, y: 0, z: 0 });

  // units → conversion factor so 1 STL‐unit → meters
  const FACTORS = { mm: 1000, cm: 100, m: 1, in: 39.3701, ft: 3.28084 };
  const [unit, setUnit] = useState("mm");

  // optional manual override of the auto‐computed scale
  const [scaleOverride, setScaleOverride] = useState("");

  const [pos, setPos] = useState({ x: 0, y: 0, z: 0 });
  const [rot, setRot] = useState({ x: 0, y: 0, z: 0 });

  // when a new file is chosen, compute its raw bounding‐box
  useEffect(() => {
    if (!file) {
      setBbox({ x: 0, y: 0, z: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    new STLLoader().load(
      url,
      geom => {
        geom.computeBoundingBox();
        const size = new THREE.Vector3();
        geom.boundingBox.getSize(size);
        setBbox({ x: size.x, y: size.y, z: size.z });
        URL.revokeObjectURL(url);
      },
      null,
      () => URL.revokeObjectURL(url)
    );
  }, [file]);

  const handleAdd = () => {
    if (!file) return;
    // default scale = 1 / FACTORS[unit], unless overridden
    const scale = scaleOverride
      ? parseFloat(scaleOverride)
      : 1 / FACTORS[unit];

    const posMeters = [pos.x, pos.y, pos.z].map(v => v * scale);
    const rotRad = [rot.x, rot.y, rot.z].map(d => THREE.MathUtils.degToRad(d));

    onAdd({
      url: URL.createObjectURL(file),
      position: posMeters,
      rotation: rotRad,
      scale,
    });
    onClose();
  };

  return (
    <>
      <Button onClick={onOpen} size="sm" mb={2}>
        Add STL
      </Button>

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add STL Object</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {/* File picker */}
            <FormControl mb={3}>
              <FormLabel>STL File</FormLabel>
              <Input
                type="file"
                accept=".stl"
                onChange={e => setFile(e.target.files[0] || null)}
              />
            </FormControl>

            {/* Units dropdown */}
            <FormControl mb={3}>
              <FormLabel>Units (of STL file)</FormLabel>
              <Select
                value={unit}
                onChange={e => setUnit(e.target.value)}
              >
                <option value="mm">Millimeters</option>
                <option value="cm">Centimeters</option>
                <option value="m">Meters</option>
                <option value="in">Inches</option>
                <option value="ft">Feet</option>
              </Select>
            </FormControl>

            {/* Optional manual scale override */}
            <FormControl mb={3}>
              <FormLabel>Manual Scale Override</FormLabel>
              <NumberInput
                step={0.0001}
                value={scaleOverride}
                placeholder={(1 / FACTORS[unit]).toFixed(4)}
                onChange={v => setScaleOverride(v)}
              >
                <NumberInputField />
              </NumberInput>
              <Text fontSize="sm" color="gray.500">
                Leave blank to use 1 / {FACTORS[unit]}.
              </Text>
            </FormControl>

            {/* Bounding-box preview */}
            {file && (
              <Box bg="gray.800" p={2} rounded="md" mb={4}>
                <Text fontWeight="bold" mb={1}>Raw Dimensions ({unit}):</Text>
                +   {["x", "y", "z"].map(ax => {
                  const raw = bbox[ax];      // “STL-units” (e.g. millimeters)
                  const label = ax === "x"
                    ? "Width"
                    : ax === "y"
                      ? "Depth"
                      : "Height";
                  return (
                    <Text key={ax}>
                      {label}: {raw.toFixed(2)} {unit} {unit}
                    </Text>
                  );
                })}
                <Text fontWeight="bold" mb={1} mt={2}>New Dimensions (m):</Text>
                {["x", "y", "z"].map(ax => {
                  const raw = bbox[ax];     // meters
                 const newMeters = raw / FACTORS[unit];
                  const label = ax === "x" ? "Width" : ax === "y" ? "Depth" : "Height";
                  return (
                    <Text key={ax}>
                      {label}: {newMeters.toFixed(3)} m
                    </Text>
                  );
                })}
              </Box>
            )}

            {/* Position inputs */}
            <FormControl mb={3}>
              <FormLabel>Position ({unit})</FormLabel>
              {["x", "y", "z"].map(k => (
                <NumberInput
                  key={k}
                  size="sm"
                  value={pos[k]}
                  onChange={v => setPos(p => ({ ...p, [k]: parseFloat(v) }))}
                  mb={1}
                >
                  <NumberInputField placeholder={k.toUpperCase()} />
                </NumberInput>
              ))}
            </FormControl>

            {/* Rotation inputs */}
            <FormControl>
              <FormLabel>Rotation (°)</FormLabel>
              {["x", "y", "z"].map(k => (
                <NumberInput
                  key={k}
                  size="sm"
                  value={rot[k]}
                  onChange={v => setRot(r => ({ ...r, [k]: parseFloat(v) }))}
                  mb={1}
                >
                  <NumberInputField placeholder={k.toUpperCase()} />
                </NumberInput>
              ))}
            </FormControl>
          </ModalBody>

          <ModalFooter>
            <Button
              colorScheme="blue"
              mr={2}
              onClick={handleAdd}
              isDisabled={!file}
            >
              Add to Scene
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
