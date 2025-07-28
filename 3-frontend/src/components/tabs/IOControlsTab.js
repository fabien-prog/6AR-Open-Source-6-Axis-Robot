import React, { useState, useEffect } from "react";
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
import {
  PiWarningCircleBold,
  PiCircle,
  PiCircleFill,
} from "react-icons/pi";
import { useData } from "../Main/DataContext";

export default function IOControlsTab() {
  const {
    digitalInputs = [],
    digitalOutputs = [],
    output,
    getInputs,
    getOutputs,
    getSystemStatus,
  } = useData();

  // safe defaults
  const estop = digitalInputs[0] || { id: 1, status: false, enabled: true };
  const buttons = digitalInputs.slice(1, 13);
  const limits = digitalInputs.slice(13, 19);

  const inputLabels = {
    1: "Emergency Stop", 2: "Green 1", 3: "Green 2",
    4: "Yellow 1", 5: "Yellow 2", 6: "Red 1",
    7: "Red 2", 8: "Primary 1", 9: "Primary 2",
    10: "Black 1", 11: "Black 2", 12: "White 1",
    13: "White 2", 14: "Limit J1", 15: "Limit J2",
    16: "Limit J3", 17: "Limit J4", 18: "Limit J5",
    19: "Limit J6",
  };
  const outputLabels = {
    1: "Green LED", 2: "Red LED", 3: "Yellow LED",
    4: "Alarm", 5: "Gripper", 6: "Unused 1",
    7: "Unused 2", 8: "Unused 3", 9: "Compressor",
  };

  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    getInputs();
    getOutputs();
    getSystemStatus();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      getInputs();
      getOutputs();
      getSystemStatus();
    }, 250);
    return () => clearInterval(id);
  }, [autoRefresh, getInputs, getOutputs, getSystemStatus]);

  const bg = useColorModeValue("gray.50", "gray.800");
  const cardBg = useColorModeValue("white", "gray.800");
  const heading = useColorModeValue("black", "white");
  const textColor = useColorModeValue("gray.800", "gray.100");

  const toggleOutput = (id) => {
    const out = digitalOutputs.find(o => o.id === id);
    if (!out || !out.enabled) return;
    const next = out.status ? 0 : 1;
    output([id], [next]);
    getOutputs();
  };

  const border = useColorModeValue("gray.200", "gray.500");

  return (
    <Box bg={bg} h="100%" rounded="xl" p={2} border="1px solid" borderColor={border}>
      <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4} h="100%">
        {/* E-Stop */}
        <Box
          bg={cardBg} p={4} rounded="xl" shadow="sm"
          border="1px solid"
          
          borderColor={estop.status ? "red.300" : "green.300"}
        >
          <HStack spacing={4}>
            <Icon
              as={PiWarningCircleBold}
              boxSize={8}
              color={estop.status ? "red.500" : "green.400"}
            />
            <VStack align="start" spacing={0}>
              <Heading size="sm" color={heading}>
                {inputLabels[estop.id]}
              </Heading>
              <Text color={textColor} fontSize="sm">
                {estop.status ? "EMERGENCY STOP ENGAGED" : "System Ready"}
              </Text>
            </VStack>
          </HStack>
        </Box>

        {/* Live Refresh */}
        <Box
          bg={cardBg} p={4} rounded="xl" shadow="sm"
          border="1px solid" borderColor="gray.300"
        >
          <HStack justify="space-between">
            <Text fontWeight="semibold" color={heading}>Live Refresh</Text>
            <Switch
              isChecked={autoRefresh}
              onChange={() => setAutoRefresh(!autoRefresh)}
              colorScheme="primary"
            />
          </HStack>
        </Box>

        {/* Buttons */}
        <Box bg={cardBg} p={3} rounded="md" shadow="sm" gridColumn="1 / -1">
          <SimpleGrid columns={[3, 4, 6]} spacing={4}>
            {buttons.map(btn => (
              <VStack key={btn.id} spacing={1}>
                <Icon
                  as={btn.status ? PiCircleFill : PiCircle}
                  boxSize={6}
                  color={btn.status ? "primary.500" : "gray.300"}
                />
                <Text fontSize="xs" color={textColor} textAlign="center">
                  {inputLabels[btn.id]}
                </Text>
              </VStack>
            ))}
          </SimpleGrid>
        </Box>

        {/* Limit Switches */}
        <Box bg={cardBg} p={3} rounded="md" shadow="sm">
          <SimpleGrid columns={[2, 3]} spacing={4}>
            {limits.map(lim => (
              <VStack key={lim.id} spacing={1}>
                <Icon
                  as={lim.status ? PiCircleFill : PiCircle}
                  boxSize={6}
                  color={lim.status ? "primary.500" : "gray.300"}
                />
                <Text fontSize="xs" color={textColor} textAlign="center">
                  {inputLabels[lim.id]}
                </Text>
              </VStack>
            ))}
          </SimpleGrid>
        </Box>

        {/* Outputs */}
        <Box bg={cardBg} p={3} rounded="md" shadow="sm">
          <SimpleGrid columns={[2, 3]} spacing={3}>
            {digitalOutputs.map(out => (
              <Button
                key={out.id}
                size="sm"
                colorScheme={out.status ? "gray" : "primary"}
                variant="outline"
                onClick={() => toggleOutput(out.id)}
                isDisabled={!out.enabled}
              >
                {outputLabels[out.id]}
              </Button>
            ))}
          </SimpleGrid>
        </Box>
      </Grid>
    </Box>
  );
}
