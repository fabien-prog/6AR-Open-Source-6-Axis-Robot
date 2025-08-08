import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Box, Grid, Heading,
  FormControl, FormLabel,
  NumberInput, NumberInputField, NumberInputStepper,
  NumberIncrementStepper, NumberDecrementStepper,
  Button, HStack, InputGroup, InputRightAddon,
  SimpleGrid, useColorModeValue, useToast,
  Stat, StatLabel, StatNumber, Progress, Text,
  Slider, SliderTrack, SliderFilledTrack, SliderThumb,
} from "@chakra-ui/react";
import * as THREE from "three";
import RobotLoader from "../Main/RobotLoader";
import { useData } from "../Main/DataContext";
import AddStlModal from "../modals/AddSTLModal";
import { movePhysicalToVirtual } from "../utils/syncMotion";
import { useJointStore } from "../utils/store";

export default function MoveAxisTab() {
  const {
    socket,
    getAllJointStatus,
    ikRequest,
    fkPosition = [],
    fkOrientation = [],
    linearMove,
    profileLinear,
    setIsMoving,
    moveMultiple,
    parameters,
  } = useData();

  // Zustand joint store (degrees)
  const storeAngles = useJointStore((s) => s.angles);
  const setAngles = useJointStore((s) => s.setAngles);

  const toast = useToast();
  const initialSync = useRef(true);
  const debounceTimer = useRef(null);

  // — Pose editor inputs —
  const [posX, setPosX] = useState("0");
  const [posY, setPosY] = useState("500");
  const [posZ, setPosZ] = useState("710");
  const [angA, setAngA] = useState("-180");
  const [angB, setAngB] = useState("0");
  const [angC, setAngC] = useState("-180");

  // — Linear-move card inputs —
  const [lmX, setLmX] = useState("0");
  const [lmY, setLmY] = useState("500");
  const [lmZ, setLmZ] = useState("710");
  const [lmA, setLmA] = useState("-180");
  const [lmB, setLmB] = useState("0");
  const [lmC, setLmC] = useState("-180");
  const [lmSpeed, setLmSpeed] = useState("0.1");
  const [lmAccel, setLmAccel] = useState("0.1");

  // — Extras & streaming flags —
  const [extras, setExtras] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isProfiling, setIsProfiling] = useState(false);

  // Profile playback ref
  const profileRef = useRef({
    positions: [],
    idx: 0,
    timer: null,
    dt: 0,
    final: [],
    targetCartesian: {},
  });

  // Seed pose editor from FK once
  useEffect(() => {
    if (initialSync.current) {
      initialSync.current = false;
      return;
    }
    if (fkPosition.length === 3) {
      setPosX((fkPosition[0] * 1000).toFixed(3));
      setPosY((fkPosition[1] * 1000).toFixed(3));
      setPosZ((fkPosition[2] * 1000).toFixed(3));
    }
    if (fkOrientation.length === 3 && fkOrientation.every((r) => Array.isArray(r))) {
      const m = new THREE.Matrix4().set(
        fkOrientation[0][0], fkOrientation[0][1], fkOrientation[0][2], 0,
        fkOrientation[1][0], fkOrientation[1][1], fkOrientation[1][2], 0,
        fkOrientation[2][0], fkOrientation[2][1], fkOrientation[2][2], 0,
        0, 0, 0, 1
      );
      const e = new THREE.Euler().setFromRotationMatrix(m, "XYZ");
      setAngA(THREE.MathUtils.radToDeg(e.x).toFixed(1));
      setAngB(THREE.MathUtils.radToDeg(e.y).toFixed(1));
      setAngC(THREE.MathUtils.radToDeg(e.z).toFixed(1));
    }
  }, [fkPosition, fkOrientation]);

  // Apply IK when pose editor fields change (debounced)
  const applyPose = useCallback(() => {
    const [x, y, z, a, b, c] = [posX, posY, posZ, angA, angB, angC].map(parseFloat);
    if ([x, y, z, a, b, c].some(isNaN)) return;
    const e = new THREE.Euler(
      THREE.MathUtils.degToRad(a),
      THREE.MathUtils.degToRad(b),
      THREE.MathUtils.degToRad(c),
      "XYZ"
    );
    const q = new THREE.Quaternion().setFromEuler(e);
    ikRequest([x / 1000, y / 1000, z / 1000], [q.x, q.y, q.z, q.w]);
  }, [posX, posY, posZ, angA, angB, angC, ikRequest]);

  const scheduleApplyPose = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      applyPose();
      debounceTimer.current = null;
    }, 50);
  }, [applyPose]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // IK responses → write to store (degrees)
  useEffect(() => {
    if (!socket) return;
    const onIk = (msg) => {
      if (msg.error) {
        toast({ title: "IK error", description: msg.error, status: "error" });
      } else if (Array.isArray(msg.angles)) {
        setAngles([...msg.angles]); // pass a fresh array
      }
    };
    socket.on("ik_response", onIk);
    return () => {
      socket.off("ik_response", onIk);
    };
  }, [socket, toast, setAngles]);

  // Linear move (server streams angles)
  const doLinearMove = () => {
    setIsStreaming(true);
    const [x, y, z, a, b, c] = [lmX, lmY, lmZ, lmA, lmB, lmC].map(parseFloat);
    const e = new THREE.Euler(
      THREE.MathUtils.degToRad(a),
      THREE.MathUtils.degToRad(b),
      THREE.MathUtils.degToRad(c),
      "XYZ"
    );
    const q = new THREE.Quaternion().setFromEuler(e);
    linearMove({
      position: [x / 1000, y / 1000, z / 1000],
      quaternion: [q.x, q.y, q.z, q.w],
      speed: parseFloat(lmSpeed),
      angular_speed_deg: 45,
      accel: parseFloat(lmAccel),
    });
  };

  useEffect(() => {
    if (!socket) return;
    const onAngles = (angles) => setAngles([...angles]);
    const onDone = () => {
      setIsStreaming(false);
      toast({ title: "Interpolation done", status: "success" });
    };
    socket.on("linearMove", onAngles);
    socket.on("linearMoveComplete", onDone);
    return () => {
      socket.off("linearMove", onAngles);
      socket.off("linearMoveComplete", onDone);
    };
  }, [socket, setAngles, toast]);

  // Profile (batched) — we play back locally by pushing steps to the store
  const doComputeProfile = () => {
    setIsProfiling(true);
    setIsMoving?.(true);

    profileRef.current.targetCartesian = {
      x: parseFloat(lmX),
      y: parseFloat(lmY),
      z: parseFloat(lmZ),
      a: parseFloat(lmA),
      b: parseFloat(lmB),
      c: parseFloat(lmC),
    };

    const [x, y, z, a, b, c] = [lmX, lmY, lmZ, lmA, lmB, lmC].map(parseFloat);
    const e = new THREE.Euler(
      THREE.MathUtils.degToRad(a),
      THREE.MathUtils.degToRad(b),
      THREE.MathUtils.degToRad(c),
      "XYZ"
    );
    const q = new THREE.Quaternion().setFromEuler(e);
    profileLinear({
      position: [x / 1000, y / 1000, z / 1000],
      quaternion: [q.x, q.y, q.z, q.w],
      speed: parseFloat(lmSpeed),
      accel: parseFloat(lmAccel),
    });
  };

  useEffect(() => {
    if (!socket) return;

    let playbackTimer = null;

    const onProfile = (msg) => {
      setIsProfiling(false);

      const { initial = [], final = [], dt = 0.02, speeds = [] } = msg;
      if (!Array.isArray(speeds) || speeds.length === 0) {
        toast({ title: "No profile segments", status: "warning" });
        setIsMoving?.(false);
        return;
      }

      // integrate velocities → positions (degrees)
      const positions = [];
      let qdeg = initial.slice();
      positions.push(qdeg.slice());
      speeds.forEach((vdeg) => {
        qdeg = qdeg.map((qi, j) => qi + vdeg[j] * dt);
        positions.push(qdeg.slice());
      });

      profileRef.current.positions = positions;
      profileRef.current.idx = 0;
      profileRef.current.final = final;

      playbackTimer = setInterval(() => {
        const i = profileRef.current.idx;
        if (i >= profileRef.current.positions.length) {
          clearInterval(playbackTimer);
          setAngles([...profileRef.current.final]);

          // update pose‐editor fields too
          const { x, y, z, a, b, c } = profileRef.current.targetCartesian;
          setPosX(x.toFixed(3));
          setPosY(y.toFixed(3));
          setPosZ(z.toFixed(3));
          setAngA(a.toFixed(1));
          setAngB(b.toFixed(1));
          setAngC(c.toFixed(1));

          toast({ title: "Profile done", status: "success" });
          setIsMoving?.(false);
        } else {
          setAngles([...profileRef.current.positions[i]]);
          profileRef.current.idx += 1;
        }
      }, dt * 1000);
    };

    const onError = ({ error }) => {
      setIsProfiling(false);
      toast({ title: "Profile failed", description: error, status: "error" });
    };

    socket.on("profileLinear_response", onProfile);
    socket.on("profileLinear_error", onError);

    return () => {
      socket.off("profileLinear_response", onProfile);
      socket.off("profileLinear_error", onError);
      if (playbackTimer) clearInterval(playbackTimer);
    };
  }, [socket, toast, setAngles, setIsMoving]);

  // Move physical robot to whatever is currently in the viewer (store)
  const handleMovePhysicalToVirtual = useCallback(() => {
    movePhysicalToVirtual({
      getAllJointStatus,
      poseJoints: useJointStore.getState().angles, // read latest at click time
      parameters,
      moveMultiple,
      toast,
    });
  }, [getAllJointStatus, parameters, moveMultiple, toast]);

  const handleAddExtra = (e) => setExtras((es) => [...es, e]);

  // UI theming…
  const bg = useColorModeValue("gray.100", "gray.900");
  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.300", "gray.500");

  return (
    <Box display="flex" flexDir="column" h="full" w="full" bg={bg} p={2}>
      <Grid
        flex="1"
        templateRows="1fr 1fr"
        templateColumns="1fr 1fr"
        gap={2}
        overflow="hidden"
      >
        {/* Pose Editor */}
        <Box
          bg={cardBg}
          p={3}
          rounded="xl"
          border="1px solid"
          borderColor={border}
          shadow="sm"
        >
          <Heading size="lg" mb={2}>
            Pose Editor Simulation
          </Heading>
          <SimpleGrid columns={2} spacing={2}>
            {["X", "Y", "Z"].map((ax) => {
              const state = { X: posX, Y: posY, Z: posZ };
              const setter = { X: setPosX, Y: setPosY, Z: setPosZ };
              return (
                <Box
                  bg="gray.700"
                  p={3}
                  rounded="xl"
                  border="1px solid"
                  borderColor={border}
                  key={ax}
                >
                  <FormControl>
                    <FormLabel>{ax} (mm)</FormLabel>
                    <HStack spacing={1}>
                      <Button
                        size="sm"
                        onClick={() => {
                          setter[ax](
                            (parseFloat(state[ax]) - 10).toFixed(3)
                          );
                          scheduleApplyPose();
                        }}
                      >
                        −10
                      </Button>
                      <InputGroup size="sm">
                        <NumberInput
                          value={state[ax]}
                          onChange={(v) => {
                            setter[ax](v);
                            scheduleApplyPose();
                          }}
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                        <InputRightAddon w="50px">mm</InputRightAddon>
                      </InputGroup>
                      <Button
                        size="sm"
                        onClick={() => {
                          setter[ax](
                            (parseFloat(state[ax]) + 10).toFixed(3)
                          );
                          scheduleApplyPose();
                        }}
                      >
                        +10
                      </Button>
                    </HStack>
                    <Slider
                      mt={2}
                      min={-1000}
                      max={1000}
                      step={1}
                      value={parseFloat(state[ax])}
                      onChange={(v) => {
                        setter[ax](v.toFixed(3));
                        scheduleApplyPose();
                      }}
                    >
                      <SliderTrack>
                        <SliderFilledTrack />
                      </SliderTrack>
                      <SliderThumb />
                    </Slider>
                  </FormControl>
                </Box>
              );
            })}

            {["A", "B", "C"].map((ax) => {
              const state = { A: angA, B: angB, C: angC };
              const setter = { A: setAngA, B: setAngB, C: setAngC };
              return (
                <Box
                  bg="gray.700"
                  p={3}
                  rounded="xl"
                  border="1px solid"
                  borderColor={border}
                  key={ax}
                >
                  <FormControl>
                    <FormLabel>{ax} (°)</FormLabel>
                    <HStack spacing={1}>
                      <Button
                        size="sm"
                        onClick={() => {
                          setter[ax](
                            (parseFloat(state[ax]) - 2).toFixed(1)
                          );
                          scheduleApplyPose();
                        }}
                      >
                        −2°
                      </Button>
                      <InputGroup size="sm">
                        <NumberInput
                          step={0.1}
                          value={state[ax]}
                          onChange={(v) => {
                            setter[ax](v);
                            scheduleApplyPose();
                          }}
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                        <InputRightAddon w="50px">°</InputRightAddon>
                      </InputGroup>
                      <Button
                        size="sm"
                        onClick={() => {
                          setter[ax](
                            (parseFloat(state[ax]) + 2).toFixed(1)
                          );
                          scheduleApplyPose();
                        }}
                      >
                        +2°
                      </Button>
                    </HStack>
                    <Slider
                      mt={2}
                      min={-180}
                      max={180}
                      step={1}
                      value={parseFloat(state[ax])}
                      onChange={(v) => {
                        setter[ax](v.toFixed(1));
                        scheduleApplyPose();
                      }}
                    >
                      <SliderTrack>
                        <SliderFilledTrack />
                      </SliderTrack>
                      <SliderThumb />
                    </Slider>
                  </FormControl>
                </Box>
              );
            })}
          </SimpleGrid>
        </Box>

        {/* 3D + STL */}
        <Box
          bg="gray.700"
          p={3}
          rounded="xl"
          border="1px solid"
          borderColor={border}
          shadow="sm"
          h="100%"
          d="flex"
          flexDir="column"
        >
          <AddStlModal onAdd={setExtras} />
          <Box flex="1" mt={2}>
            <RobotLoader isLive extras={extras} />
          </Box>
        </Box>

        {/* Linear Move Simulation */}
        <Box
          bg={cardBg}
          p={3}
          rounded="xl"
          border="1px solid"
          borderColor={border}
          shadow="sm"
        >
          <Heading size="lg" mb={2}>
            Linear Move Simulation
          </Heading>

          <SimpleGrid columns={2} spacing={2} mb={4}>
            {["X", "Y", "Z"].map((ax, i) => (
              <FormControl key={ax}>
                <FormLabel fontSize="sm">{ax} (mm)</FormLabel>
                <InputGroup size="sm">
                  <NumberInput
                    step={1}
                    value={[lmX, lmY, lmZ][i]}
                    onChange={[setLmX, setLmY, setLmZ][i]}
                  >
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                  <InputRightAddon w="50px">mm</InputRightAddon>
                </InputGroup>
              </FormControl>
            ))}
            {["A", "B", "C"].map((ax, i) => (
              <FormControl key={ax}>
                <FormLabel fontSize="sm">{ax} (°)</FormLabel>
                <InputGroup size="sm">
                  <NumberInput
                    step={0.1}
                    value={[lmA, lmB, lmC][i]}
                    onChange={[setLmA, setLmB, setLmC][i]}
                  >
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                  <InputRightAddon w="50px">°</InputRightAddon>
                </InputGroup>
              </FormControl>
            ))}
          </SimpleGrid>

          {/* Speed / Accel */}
          <SimpleGrid columns={2} spacing={2} mb={4}>
            <FormControl>
              <FormLabel fontSize="sm">Speed</FormLabel>
              <InputGroup size="sm">
                <NumberInput
                  min={0}
                  step={0.01}
                  precision={3}
                  value={lmSpeed}
                  onChange={(valueString) => setLmSpeed(valueString)}
                  isDisabled={isStreaming || isProfiling}
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
                <InputRightAddon w="56px">units</InputRightAddon>
              </InputGroup>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm">Acceleration</FormLabel>
              <InputGroup size="sm">
                <NumberInput
                  min={0}
                  step={0.01}
                  precision={3}
                  value={lmAccel}
                  onChange={(valueString) => setLmAccel(valueString)}
                  isDisabled={isStreaming || isProfiling}
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
                <InputRightAddon w="56px">units</InputRightAddon>
              </InputGroup>
            </FormControl>
          </SimpleGrid>

          <HStack spacing={4}>
            <Button
              flex="1"
              variant="outline"
              colorScheme="primary"
              onClick={doLinearMove}
              isLoading={isStreaming}
            >
              Simulate Interpolation
            </Button>
            <Button
              flex="1"
              variant="outline"
              colorScheme="primary"
              onClick={doComputeProfile}
              isLoading={isProfiling}
            >
              Simulate Profile
            </Button>
          </HStack>
        </Box>

        {/* Joint Status */}
        <Box
          bg={cardBg}
          p={3}
          rounded="xl"
          border="1px solid"
          borderColor={border}
          shadow="sm"
        >
          <Heading size="lg" mb={2}>
            Joint Status
          </Heading>
          <SimpleGrid columns={[2, 3]} spacing={6}>
            {(storeAngles || []).map((ang, i) => {
              const JOINT_LIMITS = [
                { min: -37, max: 143 },
                { min: -10, max: 160 },
                { min: -125, max: 125 },
                { min: -144, max: 206 },
                { min: -120, max: 120 },
                { min: -172.5, max: 172.5 },
              ];
              const { min, max } = JOINT_LIMITS[i];
              const clamped = Math.max(min, Math.min(max, ang));
              const pct = ((clamped - min) / (max - min)) * 100;
              let scheme = "green";
              const near = Math.min(ang - min, max - ang);
              if (near <= 0) scheme = "red";
              else if (near <= 5) scheme = "orange";
              else if (near <= 10) scheme = "yellow";
              return (
                <Box
                  key={i}
                  p={4}
                  rounded="xl"
                  border="1px solid"
                  borderColor={`${scheme}.300`}
                >
                  <Stat>
                    <StatLabel>Joint {i + 1}</StatLabel>
                    <StatNumber color={`${scheme}.500`}>
                      {ang.toFixed(1)}°
                    </StatNumber>
                  </Stat>
                  <Progress value={pct} colorScheme={scheme} size="sm" mt={2} />
                  <Text fontSize="sm" color="gray.500">
                    Range: {min}° – {max}°
                  </Text>
                </Box>
              );
            })}
          </SimpleGrid>
          <Button mt={4} colorScheme="primary" onClick={handleMovePhysicalToVirtual}>
            Move physical robot to virtual joint positions
          </Button>
        </Box>
      </Grid>
    </Box>
  );
}
