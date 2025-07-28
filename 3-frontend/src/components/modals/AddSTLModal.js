// AddStlModal.jsx
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
  const [unit, setUnit] = useState("mm");
const FACTORS = { mm:1000, cm:100, m:1, in:39.3701, ft:3.28084 };
  const [pos, setPos] = useState({ x: 0, y: 0, z: 0 });
  const [rot, setRot] = useState({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    if (!file) return setBbox({ x: 0, y: 0, z: 0 });
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
    const scale = 1 / FACTORS[unit];    // convert raw STL units → meters
    const posMeters = [pos.x, pos.y, pos.z].map(v => v * scale);
    const rotRad    = [rot.x, rot.y, rot.z].map(d => THREE.MathUtils.degToRad(d));
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
      <Button onClick={onOpen} size="sm" mb={2}>Add STL</Button>
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay/>
        <ModalContent>
          <ModalHeader>Add STL Object</ModalHeader>
          <ModalCloseButton/>
          <ModalBody>
            <FormControl mb={3}>
              <FormLabel>STL File</FormLabel>
              <Input type="file" accept=".stl"
                onChange={e => setFile(e.target.files[0]||null)}
              />
            </FormControl>
            <FormControl mb={3}>
              <FormLabel>Units</FormLabel>
              <Select value={unit} onChange={e=>setUnit(e.target.value)}>
                <option value="mm">Millimeters</option>
                <option value="cm">Centimeters</option>
                <option value="m">Meters</option>
                <option value="in">Inches</option>
                <option value="ft">Feet</option>
              </Select>
            </FormControl>

            {file && (
              <Box bg="gray.800" p={2} rounded="md" mb={4}>
                <Text fontWeight="bold" mb={1}>Dimensions:</Text>
                {["x","y","z"].map(ax => {
                  const raw = bbox[ax];
                  const val = (raw*FACTORS[unit]).toFixed(2);
                  const label = ax==="x"?"Width":ax==="y"?"Depth":"Height";
                  return <Text key={ax}>{label}: {val} {unit}</Text>;
                })}
              </Box>
            )}

            <FormControl mb={3}>
              <FormLabel>Position ({unit})</FormLabel>
              {["x","y","z"].map(k=>(
                <NumberInput
                  key={k}
                  size="sm"
                  value={pos[k]}
                  onChange={v=>setPos(p=>({...p,[k]:parseFloat(v)}))}
                  mb={1}
                >
                  <NumberInputField placeholder={k.toUpperCase()}/>
                </NumberInput>
              ))}
            </FormControl>

            <FormControl>
              <FormLabel>Rotation (°)</FormLabel>
              {["x","y","z"].map(k=>(
                <NumberInput
                  key={k}
                  size="sm"
                  value={rot[k]}
                  onChange={v=>setRot(r=>({...r,[k]:parseFloat(v)}))}
                  mb={1}
                >
                  <NumberInputField placeholder={k.toUpperCase()}/>
                </NumberInput>
              ))}
            </FormControl>
          </ModalBody>

          <ModalFooter>
            <Button colorScheme="blue" mr={2} onClick={handleAdd} isDisabled={!file}>
              Add to Scene
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
