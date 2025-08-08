import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Box,
  Grid,
  Heading,
  Text,
  SimpleGrid,
  Button,
  VStack,
  HStack,
  Switch,
  useColorModeValue,
  Icon,
} from "@chakra-ui/react";
import { PiWarningCircleBold, PiCircle, PiCircleFill } from "react-icons/pi";
import { useData } from "../Main/DataContext";

// hoist static label maps
const INPUT_LABELS = {
  1: "Emergency Stop", 2: "Green 1", 3: "Green 2",
  4: "Yellow 1", 5: "Yellow 2", 6: "Red 1",
  7: "Red 2", 8: "Primary 1", 9: "Primary 2",
  10: "Black 1", 11: "Black 2", 12: "White 1",
  13: "White 2", 14: "Limit J1", 15: "Limit J2",
  16: "Limit J3", 17: "Limit J4", 18: "Limit J5",
  19: "Limit J6",
};
const OUTPUT_LABELS = {
  1: "Green LED", 2: "Red LED", 3: "Yellow LED",
  4: "Alarm", 5: "Gripper", 6: "Unused 1",
  7: "Unused 2", 8: "Unused 3", 9: "Compressor",
};

function IOControlsTabImpl() {
  const {
    digitalInputs = [],
    digitalOutputs = [],
    output,
    getInputs,
    getOutputs,
    getSystemStatus,
  } = useData();

  // derived slices memoized
  const { estop, buttons, limits } = useMemo(() => {
    const _estop = digitalInputs[0] || { id: 1, status: false, enabled: true };
    return {
      estop: _estop,
      buttons: digitalInputs.slice(1, 13),
      limits: digitalInputs.slice(13, 19),
    };
  }, [digitalInputs]);

  const [autoRefresh, setAutoRefresh] = useState(false);

  // stable fetch-all
  const fetchAll = useCallback(() => {
    getInputs();
    getOutputs();
    getSystemStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchAll, 250);
    return () => clearInterval(id);
  }, [autoRefresh, fetchAll]);

  const bg = useColorModeValue("gray.50", "gray.800");
  const cardBg = useColorModeValue("white", "gray.800");
  const heading = useColorModeValue("black", "white");
  const textColor = useColorModeValue("gray.800", "gray.100");
  const border = useColorModeValue("gray.200", "gray.500");

  const toggleOutput = useCallback((id) => {
    const out = digitalOutputs.find((o) => o.id === id);
    if (!out || !out.enabled) return;
    const next = out.status ? 0 : 1;
    output([id], [next]);
    // pull fresh states after the write
    getOutputs();
  }, [digitalOutputs, output, getOutputs]);

  return (
    <Box bg={bg} h="100%" rounded="xl" p={2} border="1px solid" borderColor={border}>
      <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4} h="100%">
        {/* E-Stop */}
        <Box
          bg={cardBg} p={4} rounded="xl" shadow="sm" border="1px solid"
          borderColor={estop.status ? "red.300" : "green.300"}
        >
          <HStack spacing={4}>
            <Icon as={PiWarningCircleBold} boxSize={8} color={estop.status ? "red.500" : "green.400"} />
            <VStack align="start" spacing={0}>
              <Heading size="sm" color={heading}>{INPUT_LABELS[estop.id]}</Heading>
              <Text color={textColor} fontSize="sm">
                {estop.status ? "EMERGENCY STOP ENGAGED" : "System Ready"}
              </Text>
            </VStack>
          </HStack>
        </Box>

        {/* Live Refresh */}
        <Box bg={cardBg} p={4} rounded="xl" shadow="sm" border="1px solid" borderColor="gray.300">
          <HStack justify="space-between">
            <Text fontWeight="semibold" color={heading}>Live Refresh</Text>
            <Switch
              isChecked={autoRefresh}
              onChange={() => setAutoRefresh((v) => !v)}
              colorScheme="primary"
            />
          </HStack>
        </Box>

        {/* Buttons */}
        <Box bg={cardBg} p={3} rounded="md" shadow="sm" gridColumn="1 / -1">
          <SimpleGrid columns={[3, 4, 6]} spacing={4}>
            {buttons.map((btn) => (
              <VStack key={btn.id} spacing={1}>
                <Icon as={btn.status ? PiCircleFill : PiCircle} boxSize={6} color={btn.status ? "primary.500" : "gray.300"} />
                <Text fontSize="xs" color={textColor} textAlign="center">
                  {INPUT_LABELS[btn.id]}
                </Text>
              </VStack>
            ))}
          </SimpleGrid>
        </Box>

        {/* Limit Switches */}
        <Box bg={cardBg} p={3} rounded="md" shadow="sm">
          <SimpleGrid columns={[2, 3]} spacing={4}>
            {limits.map((lim) => (
              <VStack key={lim.id} spacing={1}>
                <Icon as={lim.status ? PiCircleFill : PiCircle} boxSize={6} color={lim.status ? "primary.500" : "gray.300"} />
                <Text fontSize="xs" color={textColor} textAlign="center">
                  {INPUT_LABELS[lim.id]}
                </Text>
              </VStack>
            ))}
          </SimpleGrid>
        </Box>

        {/* Outputs */}
        <Box bg={cardBg} p={3} rounded="md" shadow="sm">
          <SimpleGrid columns={[2, 3]} spacing={3}>
            {digitalOutputs.map((out) => (
              <Button
                key={out.id}
                size="sm"
                colorScheme={out.status ? "gray" : "primary"}
                variant="outline"
                onClick={() => toggleOutput(out.id)}
                isDisabled={!out.enabled}
              >
                {OUTPUT_LABELS[out.id]}
              </Button>
            ))}
          </SimpleGrid>
        </Box>
      </Grid>
    </Box>
  );
}

export default React.memo(IOControlsTabImpl);
