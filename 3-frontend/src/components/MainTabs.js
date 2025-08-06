// src/components/MainPage.jsx

import React, { useState, useEffect } from "react";
import {
  Box,
  Flex,
  Grid,
  VStack,
  HStack,
  Button,
  Icon,
  Heading,
  Tag,
  useColorModeValue,
  useDisclosure,
  ButtonGroup,
} from "@chakra-ui/react";
import { PiWarningCircleBold, PiSlidersHorizontalBold } from "react-icons/pi";
import { useData } from "./Main/DataContext";

import MoveAxisTab from "./tabs/MoveAxisTab";
import RobotActionsTab from "./tabs/RobotActionsTab";
import IOControlsTab from "./tabs/IOControlsTab";
import SettingsModal from "./SettingsModal";

import ProgramEditor from "../components/Program Editor/ProgramEditor";
import RunLogsView from "./tabs/RunLogsView";

const MainPage = () => {
  const { stopAll, systemStatus, elapsedTime, connected } = useData();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [view, setView] = useState("robot");  // "robot" | "program" | "run"

  // Listen for the one-click round-trip event
  useEffect(() => {
    const handler = () => setView("run");
    window.addEventListener("switchToRunTab", handler);
    return () => window.removeEventListener("switchToRunTab", handler);
  }, []);

  const headerBg = useColorModeValue("white", "gray.700");
  const panelBg = useColorModeValue("white", "gray.700");

  return (
    <Flex direction="column" h="100vh" overflow="hidden" bg={useColorModeValue("gray.50", "gray.900")}>
      {/* ─── Header ────────────────────────────────────────── */}
      <Flex
        as="header"
        align="center"
        justify="space-between"
        px={6}
        py={3}
        bg={headerBg}
        shadow="sm"
        zIndex={1}
      >
        <Heading size="md">6AR Robot Controller Software V1.0.0</Heading>

        <HStack spacing={2}>
          {/* ─── View Selector ──────────────────────────────────── */}
          <ButtonGroup isAttached bg={headerBg} px={4} py={1} shadow="sm">
            <Button
              variant={view === "robot" ? "solid" : "outline"}
              onClick={() => setView("robot")}
            >
              Robot
            </Button>
            <Button
              variant={view === "program" ? "solid" : "outline"}
              onClick={() => setView("program")}
            >
              Program
            </Button>
            <Button
              variant={view === "run" ? "solid" : "outline"}
              onClick={() => setView("run")}
            >
              Run
            </Button>
          </ButtonGroup>

          <Tag size="sm" colorScheme={connected ? "green" : "red"}>
            {connected ? "Online" : "Offline"}
          </Tag>
          <Tag size="sm" colorScheme="whiteAlpha">Status: {systemStatus}</Tag>
          <Tag size="sm" colorScheme="whiteAlpha">Uptime: {Math.floor(elapsedTime / 1000)}s</Tag>
          <Button size="sm" leftIcon={<Icon as={PiSlidersHorizontalBold} />} onClick={onOpen}>
            Settings
          </Button>
          <Button size="sm" colorScheme="red" leftIcon={<Icon as={PiWarningCircleBold} />} onClick={stopAll}>
            E-Stop
          </Button>
        </HStack>
      </Flex>

      {/* ─── Panels Container ─────────────────────────────────── */}
      <Box position="relative" flex="1" overflow="hidden">
        {/* Robot View */}
        <Box
          position="absolute"
          top={0} left={0} width="100%" height="100%"
          display={view === "robot" ? "block" : "none"}
        >
          <Grid
            templateColumns={{ base: "1fr", md: "2fr 1fr" }}
            gap={2}
            h="100%"
            overflow="hidden"
          >
            <Box bg={panelBg} rounded="md" shadow="md" overflow="hidden">
              <MoveAxisTab />
            </Box>
            <VStack spacing={2} my={2} mr={2} h="100%">
              <Box flex="1" bg={panelBg} w='100%' rounded="md" shadow="xl" overflow="hidden">
                <RobotActionsTab />
              </Box>
              <Box flex="1" bg={panelBg} rounded="md" shadow="md" overflowY="auto">
                <IOControlsTab />
              </Box>
            </VStack>
          </Grid>
        </Box>

        {/* Program Editor View */}
        <Box
          position="absolute"
          top={0} left={0} width="100%" height="100%"
          display={view === "program" ? "block" : "none"}
          overflowY="auto"
          p={4}
        >
          <ProgramEditor />
        </Box>

        {/* Run & Logs View */}
        <Box
          position="absolute"
          top={0} left={0} width="100%" height="100%"
          display={view === "run" ? "block" : "none"}
          overflow="hidden"
        >
          <RunLogsView />
        </Box>
      </Box>

      {/* ─── Settings Modal ──────────────────────────────── */}
      <SettingsModal isOpen={isOpen} onClose={onClose} />
    </Flex>
  );
};

export default MainPage;
