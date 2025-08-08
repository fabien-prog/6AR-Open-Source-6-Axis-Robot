import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    Box, Accordion, AccordionItem, AccordionButton, AccordionPanel, AccordionIcon,
    Heading, Text, FormControl, FormLabel, Input, SimpleGrid, Button, HStack, VStack,
    Select, Table, Thead, Tbody, Tr, Th, Td, useColorModeValue, useToast, Icon,
} from "@chakra-ui/react";
import { PiHouseLine, PiCursorText, PiRepeat, PiArrowsHorizontal, PiQuestion } from "react-icons/pi";
import { useData } from "../Main/DataContext";

// Pure helpers (hoisted)
function rotm2euler(m) {
    const sy = Math.hypot(m[0][0], m[1][0]);
    let x, y, z;
    if (sy > 1e-6) {
        x = Math.atan2(m[2][1], m[2][2]);
        y = Math.atan2(-m[2][0], sy);
        z = Math.atan2(m[1][0], m[0][0]);
    } else {
        x = Math.atan2(-m[1][2], m[1][1]);
        y = Math.atan2(-m[2][0], sy);
        z = 0;
    }
    return [x, y, z].map((r) => (r * 180) / Math.PI);
}
function eulerToQuat(rx, ry, rz) {
    const [a, b, c] = [rx, ry, rz].map((d) => (d * Math.PI) / 360);
    const [cx, sx] = [Math.cos(a), Math.sin(a)];
    const [cy, sy] = [Math.cos(b), Math.sin(b)];
    const [cz, sz] = [Math.cos(c), Math.sin(c)];
    return [
        sx * cy * cz - cx * sy * sz,
        cx * sy * cz + sx * cy * sz,
        cx * cy * sz - sx * sy * cz,
        cx * cy * cz + sx * sy * sz,
    ];
}

export default function RobotActionsTab() {
    const {
        getAllJointStatus, homeAll, jointStatuses, moveTo, moveBy, moveMultiple,
        home, parameters, listParameters, abortHoming, socket, setIsMoving,
    } = useData();

    // Global state
    const [joint, setJoint] = useState(1);

    // Per-action state
    const [fastSpd, setFastSpd] = useState("");
    const [slowSpd, setSlowSpd] = useState("");
    const [tgt, setTgt] = useState("");
    const [spd, setSpd] = useState("");
    const [acc, setAcc] = useState("");
    const [delta, setDelta] = useState("");
    const [spdBy, setSpdBy] = useState("");
    const [accBy, setAccBy] = useState("");
    const [multiParams, setMultiParams] = useState(
        () => Array.from({ length: 6 }, () => ({ target: "", speed: "", accel: "" }))
    );

    // Linear‐to‐Teensy
    const [linPos, setLinPos] = useState([0, 0, 0]);
    const [linEuler, setLinEuler] = useState([0, 0, 0]);
    const [linSpeed, setLinSpeed] = useState("100");
    const [linAccel, setLinAccel] = useState("300");

    // Live‐update toggle
    const [liveUpdate, setLiveUpdate] = useState(false);
    const toast = useToast();

    // ─── LifeCycle Hooks ───────────────────────────────
    useEffect(() => {
        getAllJointStatus();
        listParameters();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // produce FK once on connect/status ready
    useEffect(() => {
        if (!socket || jointStatuses.length !== 6) return;
        const handleFk = (resp) => {
            setLinPos(resp.position.map((c) => c * 1000));
            setLinEuler(rotm2euler(resp.orientation));
            socket.off("fk_response", handleFk);
        };
        socket.on("fk_response", handleFk);
        socket.emit("fk_request", { angles: jointStatuses.map((j) => j.position) });
    }, [socket, jointStatuses]);

    useEffect(() => {
        if (!socket) return;
        const onError = ({ error }) => {
            setIsMoving(false);
            toast({
                title: "Linear-Teensy move failed",
                description: error,
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        };
        socket.on("linearMoveToTeensy_error", onError);
        return () => socket.off("linearMoveToTeensy_error", onError);
    }, [socket, setIsMoving, toast]);

    useEffect(() => {
        let id;
        if (liveUpdate) id = setInterval(getAllJointStatus, 500);
        return () => clearInterval(id);
    }, [liveUpdate, getAllJointStatus]);

    useEffect(() => {
        const f = parameters[`joint${joint}.homingSpeed`];
        const s = parameters[`joint${joint}.slowHomingSpeed`];
        if (typeof f === "number") setFastSpd(f.toString());
        if (typeof s === "number") setSlowSpd(s.toString());
    }, [joint, parameters]);

    // ─── Handlers (stable) ──────────────────────────────
    const handleLinearMove = useCallback(() => {
        const speed = parseFloat(linSpeed) / 1000;
        const accel = parseFloat(linAccel) / 1000;
        const quat = eulerToQuat(...linEuler);
        const pos = linPos.map((v) => v / 1000);
        socket.emit("linearMoveToTeensy", {
            position: pos, quaternion: quat, speed, angular_speed_deg: 45, accel,
        });
    }, [socket, linSpeed, linAccel, linEuler, linPos]);

    const handleVelocityProfileMove = useCallback(() => {
        const speed = parseFloat(linSpeed) / 1000;
        const accel = parseFloat(linAccel) / 1000;
        const quat = eulerToQuat(...linEuler);
        const pos = linPos.map((v) => v / 1000);
        socket.emit("profileMoveToTeensy", {
            position: pos, quaternion: quat, speed, angular_speed_deg: 45, accel,
        });
    }, [socket, linSpeed, linAccel, linEuler, linPos]);

    const handleMultiChange = useCallback((idx, field, val) => {
        setMultiParams((p) => {
            const c = [...p];
            c[idx] = { ...c[idx], [field]: val };
            return c;
        });
    }, []);

    const tableRows = useMemo(() => (
        jointStatuses.map((js) => (
            <Tr key={js.joint}>
                <Td>J{js.joint}</Td>
                <Td isNumeric>{js.position.toFixed(1)}</Td>
                <Td isNumeric>{js.velocity.toFixed(1)}</Td>
                <Td isNumeric>{js.acceleration.toFixed(1)}</Td>
                <Td isNumeric>{js.target != null ? js.target.toFixed(1) : "—"}</Td>
            </Tr>
        ))
    ), [jointStatuses]);

    const bg = useColorModeValue("gray.50", "gray.900");
    const panelBg = useColorModeValue("white", "gray.900");
    const border = useColorModeValue("gray.200", "gray.500");

    // ─── Render ─────────────────────────────────────────
    return (
        <Box p={4} bg={bg} rounded="xl" maxW="100%" h="100%" overflowY="auto" border="1px solid" borderColor={border}>
            {/* Header & Joint Selector */}
            <HStack justify="space-between" mb={2}>
                <Heading size="lg">Physical Robot Actions</Heading>
                <FormControl w="120px">
                    <FormLabel mb="1">Active Joint</FormLabel>
                    <Select size="sm" value={joint} onChange={(e) => setJoint(+e.target.value)}>
                        {[1, 2, 3, 4, 5, 6].map((j) => (<option key={j} value={j}>J{j}</option>))}
                    </Select>
                </FormControl>
            </HStack>

            <Accordion allowMultiple>
                {/* Homing */}
                <AccordionItem border="1px solid" bg="gray.700" borderColor={border} mb={2}>
                    <AccordionButton _expanded={{ bg: "cyan.600" }}>
                        <Box flex="1" textAlign="left" display="flex" alignItems="center">
                            <Icon as={PiHouseLine} mr={2} boxSize="18px" /> Joint Calibration
                        </Box>
                        <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel bg={panelBg} p={4}>
                        <SimpleGrid columns={[1, 2]} spacing={3} mb={3}>
                            <FormControl>
                                <FormLabel fontSize="sm">Fast (°/s)</FormLabel>
                                <Input size="sm" value={fastSpd} onChange={(e) => setFastSpd(e.target.value)} />
                            </FormControl>
                            <FormControl>
                                <FormLabel fontSize="sm">Slow (°/s)</FormLabel>
                                <Input size="sm" value={slowSpd} onChange={(e) => setSlowSpd(e.target.value)} />
                            </FormControl>
                        </SimpleGrid>
                        <HStack spacing={2}>
                            <Button size="sm" colorScheme="cyan" onClick={() => home(joint, +fastSpd, +slowSpd)}>
                                Start Homing J{joint}
                            </Button>
                            <Button size="sm" colorScheme="cyan" variant="outline" onClick={homeAll}>
                                Home All Axes Sequentially
                            </Button>
                            <Button size="sm" colorScheme="cyan" variant="outline" onClick={abortHoming}>
                                Abort Homing
                            </Button>
                        </HStack>
                    </AccordionPanel>
                </AccordionItem>

                {/* Status */}
                <AccordionItem border="1px solid" bg="gray.700" borderColor={border} mb={2}>
                    <AccordionButton _expanded={{ bg: "primary.700" }}>
                        <Box flex="1" textAlign="left" display="flex" alignItems="center">
                            <Icon as={PiQuestion} mr={2} boxSize="18px" /> Status
                        </Box>
                        <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel bg={panelBg} p={4}>
                        <HStack spacing={2} mb={3}>
                            <Button size="sm" colorScheme={liveUpdate ? "red" : "primary"} onClick={() => setLiveUpdate((v) => !v)}>
                                {liveUpdate ? "Stop Live Refresh" : "Start Live Refresh"}
                            </Button>
                            <Button size="sm" colorScheme="primary" onClick={getAllJointStatus}>
                                Single Refresh
                            </Button>
                        </HStack>
                        <Box overflowX="auto">
                            <Table variant="simple" size="sm">
                                <Thead>
                                    <Tr>
                                        <Th>Jnt</Th>
                                        <Th isNumeric>Pos</Th>
                                        <Th isNumeric>Vel</Th>
                                        <Th isNumeric>Acc</Th>
                                        <Th isNumeric>Tgt</Th>
                                    </Tr>
                                </Thead>
                                <Tbody>{tableRows}</Tbody>
                            </Table>
                        </Box>
                    </AccordionPanel>
                </AccordionItem>

                {/* Cartesian Linear Move */}
                <AccordionItem border="1px solid" bg="gray.700" borderColor={border} mb={2}>
                    <AccordionButton _expanded={{ bg: "orange.600" }}>
                        <Box flex="1" textAlign="left" display="flex" alignItems="center">
                            <Icon as={PiArrowsHorizontal} mr={2} boxSize="18px" /> Cartesian Linear Move
                        </Box>
                        <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel bg={panelBg} p={4}>
                        <Text fontSize="sm" mb={2} fontWeight="semibold">Current TCP Pose (Physical Robot)</Text>
                        <Text mb={3}>
                            Cartesian position (X, Y, Z) : [{linPos[0].toFixed(1)}, {linPos[1].toFixed(1)}, {linPos[2].toFixed(1)}]
                            <br />
                            Euler Angles (rX, Ry, rZ): [{linEuler.map((v) => v.toFixed(1)).join(", ")}]
                        </Text>
                        <SimpleGrid columns={2} spacing={2} mb={2}>
                            {["X", "Y", "Z"].map((axis, i) => (
                                <FormControl key={axis}>
                                    <FormLabel fontSize="xs">{axis} mm</FormLabel>
                                    <Input
                                        size="sm"
                                        value={linPos[i].toFixed(1)}
                                        onChange={(e) => {
                                            const v = parseFloat(e.target.value) || 0;
                                            setLinPos((p) => { const c = [...p]; c[i] = v; return c; });
                                        }}
                                    />
                                </FormControl>
                            ))}
                            {["rX", "rY", "rZ"].map((axis, i) => (
                                <FormControl key={axis}>
                                    <FormLabel fontSize="xs">{axis} °</FormLabel>
                                    <Input
                                        size="sm"
                                        value={linEuler[i].toFixed(1)}
                                        onChange={(e) => {
                                            const v = parseFloat(e.target.value) || 0;
                                            setLinEuler((p) => { const c = [...p]; c[i] = v; return c; });
                                        }}
                                    />
                                </FormControl>
                            ))}
                        </SimpleGrid>
                        <HStack spacing={2} mb={2}>
                            <FormControl>
                                <FormLabel fontSize="xs">Speed (mm/s)</FormLabel>
                                <Input size="sm" value={linSpeed} onChange={(e) => setLinSpeed(e.target.value)} />
                            </FormControl>
                            <FormControl>
                                <FormLabel fontSize="xs">Acceleration (mm/s2)</FormLabel>
                                <Input size="sm" value={linAccel} onChange={(e) => setLinAccel(e.target.value)} />
                            </FormControl>
                        </HStack>
                        <Button size="sm" colorScheme="gray" onClick={handleLinearMove}>Execute Interpolated Move</Button>
                        <Button ml={2} size="sm" colorScheme="orange" onClick={handleVelocityProfileMove}>Execute Velocity Profile Move</Button>
                    </AccordionPanel>
                </AccordionItem>

                {/* Absolute Move */}
                <AccordionItem border="1px solid" bg="gray.700" borderColor={border} mb={2}>
                    <AccordionButton _expanded={{ bg: "yellow.500" }}>
                        <Box flex="1" textAlign="left" display="flex" alignItems="center">
                            <Icon as={PiCursorText} mr={2} boxSize="18px" /> Absolute Move
                        </Box>
                        <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel bg={panelBg} p={4}>
                        <SimpleGrid columns={[1, 3]} spacing={3} mb={3}>
                            <FormControl>
                                <FormLabel fontSize="sm">Target (°)</FormLabel>
                                <Input size="sm" value={tgt} onChange={(e) => setTgt(e.target.value)} />
                            </FormControl>
                            <FormControl>
                                <FormLabel fontSize="sm">Speed (°/s)</FormLabel>
                                <Input size="sm" value={spd} onChange={(e) => setSpd(e.target.value)} />
                            </FormControl>
                            <FormControl>
                                <FormLabel fontSize="sm">Accel (°/s²)</FormLabel>
                                <Input size="sm" value={acc} onChange={(e) => setAcc(e.target.value)} />
                            </FormControl>
                        </SimpleGrid>
                        <Button size="sm" colorScheme="yellow" onClick={() => moveTo(joint, +tgt, +spd, +acc)}>
                            Execute
                        </Button>
                    </AccordionPanel>
                </AccordionItem>

                {/* Relative Move */}
                <AccordionItem border="1px solid" bg="gray.700" borderColor={border} mb={2}>
                    <AccordionButton _expanded={{ bg: "green.600" }}>
                        <Box flex="1" textAlign="left" display="flex" alignItems="center">
                            <Icon as={PiRepeat} mr={2} boxSize="18px" /> Relative Move
                        </Box>
                        <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel bg={panelBg} p={4}>
                        <SimpleGrid columns={[1, 3]} spacing={3} mb={3}>
                            <FormControl>
                                <FormLabel fontSize="sm">Δ (°)</FormLabel>
                                <Input size="sm" value={delta} onChange={(e) => setDelta(e.target.value)} />
                            </FormControl>
                            <FormControl>
                                <FormLabel fontSize="sm">Speed (°/s)</FormLabel>
                                <Input size="sm" value={spdBy} onChange={(e) => setSpdBy(e.target.value)} />
                            </FormControl>
                            <FormControl>
                                <FormLabel fontSize="sm">Accel (°/s²)</FormLabel>
                                <Input size="sm" value={accBy} onChange={(e) => setAccBy(e.target.value)} />
                            </FormControl>
                        </SimpleGrid>
                        <Button size="sm" colorScheme="green" onClick={() => moveBy(joint, +delta, +spdBy, +accBy)}>
                            Execute
                        </Button>
                    </AccordionPanel>
                </AccordionItem>

                {/* Multi-Joint Move */}
                <AccordionItem border="1px solid" bg="gray.700" borderColor={border} mb={2}>
                    <AccordionButton _expanded={{ bg: "purple.600" }}>
                        <Box flex="1" textAlign="left" display="flex" alignItems="center">
                            <Icon as={PiArrowsHorizontal} mr={2} boxSize="18px" /> Absolute Move Multiple
                        </Box>
                        <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel bg={panelBg} p={4}>
                        <VStack spacing={2} mb={3}>
                            {multiParams.map((p, i) => (
                                <HStack key={i} spacing={2}>
                                    <Text w="25px">J{i + 1}</Text>
                                    <Input size="xs" placeholder="Tgt" value={p.target} onChange={(e) => handleMultiChange(i, "target", e.target.value)} />
                                    <Input size="xs" placeholder="Spd" value={p.speed} onChange={(e) => handleMultiChange(i, "speed", e.target.value)} />
                                    <Input size="xs" placeholder="Acc" value={p.accel} onChange={(e) => handleMultiChange(i, "accel", e.target.value)} />
                                </HStack>
                            ))}
                        </VStack>
                        <Button
                            size="sm"
                            colorScheme="purple"
                            onClick={() => {
                                const js = [], ts = [], ss = [], as = [];
                                multiParams.forEach((p, idx) => {
                                    const t = parseFloat(p.target);
                                    if (!isNaN(t)) {
                                        js.push(idx + 1);
                                        ts.push(t);
                                        ss.push(parseFloat(p.speed) || 0);
                                        as.push(parseFloat(p.accel) || 0);
                                    }
                                });
                                moveMultiple(js, ts, ss, as);
                            }}
                        >
                            Execute
                        </Button>
                    </AccordionPanel>
                </AccordionItem>
            </Accordion>
        </Box>
    );
}
