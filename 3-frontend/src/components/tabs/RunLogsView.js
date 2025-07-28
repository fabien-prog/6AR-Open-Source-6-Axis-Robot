// src/components/tabs/RunLogsView.jsx
import React, { useState, useEffect } from "react";
import {
  Box,
  Flex,
  HStack,
  Text,
  Button,
  IconButton,
  Input,
  Select,
  Divider,
  Progress,
  useColorModeValue,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Tag,
} from "@chakra-ui/react";
import {
  PiFolderOpen,
  PiPlayCircleFill,
  PiPauseCircleFill,
  PiStopCircleFill,
  PiArrowBendUpRight,
  PiArrowBendUpLeft,
  PiDownloadSimple,
  PiTrash,
  PiMagnifyingGlass,
} from "react-icons/pi";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import js from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";

SyntaxHighlighter.registerLanguage("javascript", js);

const mockPrograms = [
  {
    id: 1,
    name: "spiral_draw.6AR",
    code:
`// Spiral drawing routine
const center = { x: 0.3, y: 0.0, z: 0.2, rX: -180.0, rY: 0.0, rZ: 180.0 };
const turns = 5;
const pointsPerTurn = 36;
const radiusStep = 0.01;

for (let t = 0; t < turns; t++) {
  for (let i = 0; i < pointsPerTurn; i++) {
    const angle = (2 * Math.PI * i) / pointsPerTurn;
    const r = radiusStep * (t + i / pointsPerTurn);
    const x = center.x + r * Math.cos(angle);
    const y = center.y + r * Math.sin(angle);
    moveL({ x, y, z: center.z }, "Fine", 50);
  }
}`
  },
  {
    id: 2,
    name: "pick_and_place_batch.6AR",
    code:
`// Batch pick-and-place from an array of targets
const picks = [
  { x: 0.2, y: 0.1, z: 0.05 },
  { x: 0.25, y: -0.1, z: 0.05 },
  { x: 0.3, y: 0.0, z: 0.05 },
];
const drop = { x: 0.0, y: 0.3, z: 0.1 };

for (let pt of picks) {
  moveJ(pt, "Coarse", 100);    // approach
  openGripper();
  moveL({ ...pt, z: pt.z - 0.05 }, "Fine", 50); // descend
  closeGripper();
  moveL({ ...pt, z: pt.z + 0.1 }, "Fine", 50);  // lift
  moveJ(drop, "Coarse", 100);  // go to drop
  openGripper();
}`
  },
  {
    id: 3,
    name: "inspection_scan_grid.6AR",
    code:
`// Surface inspection in a grid pattern
const start = { x: 0.1, y: 0.1, z: 0.2 };
const dx = 0.05, dy = 0.05;
const rows = 4, cols = 6;

for (let i = 0; i < rows; i++) {
  for (let j = 0; j < cols; j++) {
    const x = start.x + j * dx;
    const y = start.y + (i % 2 === 0 ? i * dy : (rows - 1 - i) * dy);
    const z = start.z;
    moveL({ x, y, z }, "Fine", 60);
    // imagine a sensor check here
    console.log(\`Checked point \${i},\${j}\`, "info");
  }
}`
  }
];

const RunLogsView = () => {
  // --- Program loader & code viewer state ---
  const [programs] = useState(mockPrograms);
  const [currentProgram, setCurrentProgram] = useState(programs[0]);
  // eslint-disable-next-line no-unused-vars
  const [uploadedFile, setUploadedFile] = useState(null);
  const [executingLine, setExecutingLine] = useState(null);
  const codeLines = currentProgram.code.split("\n");

  // --- Runtime status ---
  const [elapsed, setElapsed] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);
  const [running, setRunning] = useState(false);

  // --- Logs panel state ---
  const [logs, setLogs] = useState([
    { id: 1, type: "info", message: "Program loaded", time: "12:00:00" },
    // ...
  ]);
  const [logFilter, setLogFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // --- Simulate execution ---
  useEffect(() => {
    let timer;
    if (running) {
      timer = setInterval(() => {
        setElapsed((t) => t + 1);
        setCycleCount((c) => c + 1);
        // highlight next line
        setExecutingLine((prev) =>
          prev === null || prev === codeLines.length - 1 ? 0 : prev + 1
        );
        // append a log
        setLogs((ls) => [
          ...ls,
          {
            id: Date.now(),
            type: "info",
            message: `Executed line ${executingLine === null ? 1 : executingLine + 1}`,
            time: new Date().toLocaleTimeString(),
          },
        ]);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [running, executingLine, codeLines.length]);

  // --- Filtered logs ---
  const filteredLogs = logs.filter((l) => {
    if (logFilter !== "all" && l.type !== logFilter) return false;
    if (searchTerm && !l.message.includes(searchTerm)) return false;
    return true;
  });

  // --- Handlers ---
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadedFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const code = ev.target.result;
      const newProg = {
        id: Date.now(),
        name: file.name,
        code,
      };
      setCurrentProgram(newProg);
    };
    reader.readAsText(file);
  };

  return (
    <Flex h="100%" gap={4} p={4} minH={0}>
      {/* ─── Left: Run & Program Viewer ───────────────────────── */}
      <Flex direction="column" flex="2" gap={4} minH={0}>
        {/* Program Loader */}
        <HStack>
          <Input
            type="file"
            accept=".js,.txt"
            onChange={handleUpload}
            display="none"
            id="file-upload"
          />
          <label htmlFor="file-upload">
            <Button leftIcon={<PiFolderOpen />} size="sm">
              Load Program
            </Button>
          </label>

          <Select
            value={currentProgram.id}
            onChange={(e) =>
              setCurrentProgram(
                programs.find((p) => p.id === +e.target.value)
              )
            }
            size="sm"
            maxW="200px"
          >
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </HStack>

        {/* Code Viewer */}
        <Box
          flex="1"
          overflowY="auto"
          p={2}
          bg={useColorModeValue("gray.50", "gray.800")}
          borderRadius="md"
          border="1px solid"
          borderColor={useColorModeValue("gray.200", "gray.600")}
        >
          <SyntaxHighlighter
            language="javascript"
            style={atomOneDark}
            showLineNumbers
            wrapLines
            lineProps={(ln) => ({
              style: {
                display: "block",
                background:
                  ln - 1 === executingLine
                    ? "rgba(255,255,0,0.2)"
                    : "transparent",
              },
            })}
          >
            {currentProgram.code}
          </SyntaxHighlighter>
        </Box>

        {/* Execution Controls */}
        <HStack spacing={4}>
          <IconButton
            colorScheme="green"
            icon={<PiPlayCircleFill />}
            aria-label="Run"
            onClick={() => setRunning(true)}
          />
          <IconButton
            colorScheme="yellow"
            icon={<PiPauseCircleFill />}
            aria-label="Pause"
            onClick={() => setRunning(false)}
          />
          <IconButton
            colorScheme="blue"
            icon={<PiArrowBendUpLeft />}
            aria-label="Step Back"
            onClick={() =>
              setExecutingLine((l) => Math.max(0, (l ?? codeLines.length) - 1))
            }
          />
          <IconButton
            colorScheme="blue"
            icon={<PiArrowBendUpRight />}
            aria-label="Step Forward"
            onClick={() =>
              setExecutingLine((l) =>
                l === null || l === codeLines.length - 1 ? 0 : l + 1
              )
            }
          />
          <IconButton
            colorScheme="red"
            icon={<PiStopCircleFill />}
            aria-label="Stop"
            onClick={() => {
              setRunning(false);
              setExecutingLine(null);
            }}
          />
          <Divider />
          <Text>
            Elapsed: <Tag>{elapsed}s</Tag>
          </Text>
          <Text>
            Cycles: <Tag>{cycleCount}</Tag>
          </Text>
        </HStack>

        {/* Progress Bar */}
        <Progress
          value={executingLine === null ? 0 : ((executingLine + 1) / codeLines.length) * 100}
          size="sm"
          colorScheme="primary"
        />
      </Flex>

      {/* ─── Right: Logs Panel ─────────────────────────── */}
      <Flex direction="column" flex="1" minH={0}>
        {/* Filter & Search */}
        <HStack mb={2}>
          <Select
            size="sm"
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </Select>
          <Input
            size="sm"
            placeholder="Search logs…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            icon={<PiMagnifyingGlass />}
          />
          <IconButton
            size="sm"
            icon={<PiTrash />}
            aria-label="Clear logs"
            onClick={() => setLogs([])}
          />
          <IconButton
            size="sm"
            icon={<PiDownloadSimple />}
            aria-label="Export logs"
            onClick={() => {
              const blob = new Blob(
                [logs.map((l) => `[${l.time}] ${l.type}: ${l.message}`).join("\n")],
                { type: "text/plain" }
              );
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "logs.txt";
              a.click();
              URL.revokeObjectURL(url);
            }}
          />
        </HStack>

        {/* Log entries */}
        <Box
          flex="1"
          overflowY="auto"
          borderRadius="md"
          border="1px solid"
          borderColor={useColorModeValue("gray.200", "gray.600")}
        >
          <Accordion allowMultiple>
            {filteredLogs.map((log) => (
              <AccordionItem key={log.id}>
                <AccordionButton>
                  <Box flex="1" textAlign="left">
                    [{log.time}] <Tag size="sm">{log.type}</Tag> {log.message}
                  </Box>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel pb={4}>
                  <Text fontSize="sm" color="gray.500">
                    {/* Details could go here */}
                    Details for log #{log.id}
                  </Text>
                </AccordionPanel>
              </AccordionItem>
            ))}
            {filteredLogs.length === 0 && (
              <Box p={4} textAlign="center" color="gray.500">
                No log entries
              </Box>
            )}
          </Accordion>
        </Box>
      </Flex>
    </Flex>
  );
};

export default RunLogsView;
