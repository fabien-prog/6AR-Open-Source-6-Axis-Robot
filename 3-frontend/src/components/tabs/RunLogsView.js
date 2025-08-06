// src/components/tabs/RunLogsView.js

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Button,
  Select,
  Divider,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Badge,
  useToast,
  useDisclosure,
  useColorModeValue,
  Input,
} from "@chakra-ui/react";
import {
  PiFolderOpen,
  PiPlayCircleFill,
  PiPauseCircleFill,
  PiStopCircleFill,
  PiArrowBendUpLeft,
  PiDownloadSimple,
  PiTrash,
} from "react-icons/pi";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import { monokai } from "react-syntax-highlighter/dist/esm/styles/hljs";
import define6ar from "../utils/hljs-6ar";
import { run6ar } from "../utils/run6ar";
import ProgramManagerDrawer from "../modals/ProgramManagerDrawer";
import { useData } from "../Main/DataContext";

SyntaxHighlighter.registerLanguage("6ar", define6ar);


const sixarTheme = {
  ...monokai,
  "hljs-keyword": { color: "#F92672", fontWeight: "bold" },
  "hljs-emphasis": { color: "#66D9EF", fontStyle: "italic" },
  "hljs-attribute": { color: "#A6E22E" },
  "hljs-variable": { color: "#FD971F" },
  "hljs-string": { color: "#E6DB74" },
  "hljs-number": { color: "#AE81FF" },
  "hljs-comment": { color: "#75715E", fontStyle: "italic" },
  "hljs-params": { color: "#F8F8F2" },
  "hljs-punctuation": { color: "#F8F8F2" },
};

const runnerKey = "runLogsPrograms";

// Load the list of saved programs (array) from localStorage
function loadRunnerList() {
  try {
    const raw = localStorage.getItem(runnerKey) || "[]";
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// Persist the list back to localStorage
function saveRunnerList(list) {
  localStorage.setItem(runnerKey, JSON.stringify(list));
}

// If there are no saved programs yet, start with this default
const defaultProgram = {
  id: 1,
  name: "Main Program.6AR",
  code: `CONST Number CONST_1 = 10;
VAR Number VAR_1 = 1;
VAR Coordinate TARGET_HOME = (-0.107,24.48,60.384,-0.008,95.127,0.06);
VAR Coordinate TARGET_1 = (0,0,0,0,0,0);
VAR Coordinate TARGET_2 = (0,0,0,0,0,0);
VAR Coordinate TARGET_3 = (0,0,0,0,0,0);
PROC Main()
  LOG("PROGRAM STARTED");
  Home;
  MoveJ Cartesian TARGET_HOME Speed 50;
  FOR VAR_1 FROM 2 TO CONST_1 STEP 2
    MoveL Cartesian TARGET_1 Speed 60;
    MoveL Cartesian TARGET_2 Speed 60;
    MoveL Cartesian TARGET_3 Speed 60;
    IF DI_1 == 1 THEN
      MoveJ Cartesian TARGET_HOME Speed 120;
      Counter COUNTER_1 INIT 0 INC 1 TO 12;
    ENDIF;
  ENDFOR;
ENDPROC`,
};

export default function RunLogsView() {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const {
    getAllJointStatus,
    parameters,
    moveMultiple,
  } = useData();

  // ─── Programs state ───────────────────────────────────
  const [programs, setPrograms] = useState(() => {
    const saved = loadRunnerList();
    return saved.length ? saved : [defaultProgram];
  });
  const [current, setCurrent] = useState(programs[0]);

  // ─── Execution logs state ──────────────────────────────
  const [logs, setLogs] = useState([]);
  const [executingLine, setExecutingLine] = useState(null);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState(0);

  const genRef = useRef(null);
  const timerRef = useRef(null);
  const codeContainerRef = useRef(null);
  const codeLines = current.code.split("\n");

  // ─── Handle loading new/updated programs from the drawer ──
  const onLoadRunner = useCallback(
    (e) => {
      const prog = e.detail; // { id, name, code }
      setPrograms((prev) => {
        const exists = prev.find((p) => p.id === prog.id);
        const next = exists
          ? prev.map((p) => (p.id === prog.id ? prog : p))
          : [...prev, prog];
        saveRunnerList(next);
        return next;
      });
      setCurrent(prog);
      toast({
        title: `Loaded "${prog.name}"`,
        status: "info",
        duration: 2000,
      });
      onClose();
    },
    [toast, onClose]
  );

  useEffect(() => {
    window.addEventListener("loadRunnerProgram", onLoadRunner);
    return () =>
      window.removeEventListener("loadRunnerProgram", onLoadRunner);
  }, [onLoadRunner]);

  // ─── Auto-import from editor export ────────────────────
  const importFromEditor = useCallback(() => {
    const code = localStorage.getItem("runProgram");
    if (!code) {
      toast({
        title: "No program found in editor",
        status: "warning",
        duration: 2000,
      });
      return;
    }
    const name = "Editor Program";
    const existing = programs.find((p) => p.name === name);
    const prog = { id: existing ? existing.id : Date.now(), name, code };

    setPrograms((ps) => {
      const updated = existing
        ? ps.map((p) => (p.id === prog.id ? prog : p))
        : [...ps, prog];
      saveRunnerList(updated);
      return updated;
    });
    setCurrent(prog);
    toast({
      title: existing
        ? "Updated Editor Program"
        : "Imported Editor Program",
      status: "success",
      duration: 2000,
    });
  }, [programs, toast]);

  useEffect(() => {
    window.addEventListener("runProgramExported", importFromEditor);
    return () =>
      window.removeEventListener(
        "runProgramExported",
        importFromEditor
      );
  }, [importFromEditor]);

  // ── stepOnce: drives both UI and real robot ───────────────
  async function stepOnce() {
    if (!genRef.current) return { done: true };
    const { value, done } = genRef.current.next();
    if (done) {
      clearTimeout(timerRef.current);
      setRunning(false);
      return { done: true };
    }

    // 1) log to UI
    const title = value.type === "cmd"
      ? `SEND: ${value.payload.cmd}`
      : value.message;
    const detail = value.type === "cmd"
      ? JSON.stringify(value.payload, null, 2)
      : codeLines[value.line];
    const entry = {
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      type: value.type,
      title,
      detail,
      line: value.line,
    };
    setLogs((l) => [...l, entry]);
    setExecutingLine(value.line);
    setSteps((s) => s + 1);

    // 2) dispatch MoveJ Joint
    if (value.type === "cmd") {
      const { cmd, mode, target, speed: rawSpeed } = value.payload;

      if (cmd === "MoveJ" && mode === "Joint" && target) {
        // pause the interpreter
        setRunning(false);

        // build a flat [J1…J6] array out of the target object:
        const joints = [1, 2, 3, 4, 5, 6];
        const angles = [target.x, target.y, target.z, target.rx, target.ry, target.rz];
        const targets = angles;  // we’ll send this straight through

        // 3) sanitize userSpeed
        const userSpeed = Number(rawSpeed) > 0 ? Number(rawSpeed) : 5;

        // 1) figure out a scaled “baseSpeed” for all axes,
        //    so that userSpeed is honored if it’s below every joint’s max,
        //    or else uniformly scaled down to fit the tightest joint.
        const jointMaxSpeeds = joints.map(j => parameters[`joint${j}.maxSpeed`] || 0);
        const scale = Math.min(
          1,
          ...jointMaxSpeeds.map(max => max / (userSpeed || 1)) // avoid /0
        );
        const baseSpeeds = joints.map(() => userSpeed * scale);

        // 2) accelerations as before (or you could do something similar if you like)
        const baseAccels = joints.map(j => (parameters[`joint${j}.maxAccel`] || 0) / 3);

        // 3) compute individual travel times
        const trapezoidalTime = (d, v, a) => {
          const tA = v / a;
          const xA = 0.5 * a * tA * tA;
          return d < 2 * xA
            ? 2 * Math.sqrt(d / a)
            : 2 * tA + (d - 2 * xA) / v;
        };

        // 4) measure
        const status = await getAllJointStatus();
        const deltas = joints.map((_, i) => Math.abs(targets[i] - status[i].position));
        const syncTime = Math.max(
          ...deltas.map((d, i) => trapezoidalTime(d, baseSpeeds[i], baseAccels[i])),
          0.01
        );

        // 5) solve for vmax & aSync
        const syncProfiles = deltas.map((d, i) => {
          const amax = baseAccels[i];
          const tAmax = syncTime / 2;
          const xAmax = 0.5 * amax * tAmax * tAmax;
          let vmax;
          if (d < 2 * xAmax) {
            vmax = Math.sqrt(d * amax);
          } else {
            const disc = amax * amax * syncTime * syncTime - 4 * amax * d;
            vmax = disc < 0
              ? amax * tAmax
              : (amax * syncTime - Math.sqrt(disc)) / 2;
          }
          vmax = Math.min(vmax, baseSpeeds[i]);
          return { vmax, aSync: vmax / tAmax };
        });

        // 6) round & clamp
        const round4 = v => Math.round(v * 10000) / 10000;
        const speeds = syncProfiles.map(p => round4(Math.max(0.1, p.vmax)));
        const accels = syncProfiles.map(p => round4(Math.max(0.1, p.aSync)));

        // 7) emit the single MoveMultiple
        //moveMultiple(joints, targets, speeds, accels);
        // 8) wait for the robot to finish
        const safetyMargin = 250; // ms
        setTimeout(() => setRunning(true), syncTime * 1000 + safetyMargin);
      }
    }

    return { value: entry, done: false };
  }

  // ── runLoop scheduler ─────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    async function loop() {
      const res = await stepOnce();
      if (cancelled || res.done) return;
      const delay = res.value.type === "cmd" ? 150 : 15;
      setTimeout(loop, delay);
    }
    loop();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // scroll highlight into view
  useEffect(() => {
    if (
      executingLine == null ||
      !codeContainerRef.current
    )
      return;
    const ln = executingLine + 1;
    const node = codeContainerRef.current.querySelector(
      `[data-line="${ln}"]`
    );
    if (node) {
      node.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }, [executingLine]);

  // ─── UI Handlers ───────────────────────────────────────
  const handleRun = () => {
    setLogs([]);
    setExecutingLine(null);
    setSteps(0);
    genRef.current = run6ar(current.code);
    setRunning(true);
  };
  const handlePause = () => setRunning(false);
  const handleStop = () => {
    clearTimeout(timerRef.current);
    genRef.current = null;
    setRunning(false);
    setExecutingLine(null);
    setSteps(0);
    setLogs([]);
  };
  const handleStep = () => {
    if (!running) stepOnce();
  };
  const handleUpload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const code = ev.target.result;
      const prog = { id: Date.now(), name: f.name, code };
      setPrograms((ps) => {
        const next = [...ps, prog];
        saveRunnerList(next);
        return next;
      });
      setCurrent(prog);
    };
    reader.readAsText(f);
    // reset the input so you can re‐upload the same file if needed
    e.target.value = "";
  };

  const bgCode = useColorModeValue("gray.50", "gray.800");

  return (
    <>
      <Input
        ref={fileInputRef}
        type="file"
        accept=".6ar,.txt"
        onChange={handleUpload}
        display="none"
      />
      <Flex h="100%" gap={6} p={6} minH={0}>
        {/* ── Left Column ─────────────────────────────────── */}
        <VStack flex="2" spacing={4} align="stretch">
          <HStack spacing={2}>
            <Button
              leftIcon={<PiFolderOpen />}
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Load File
            </Button>
            <Button
              leftIcon={<PiDownloadSimple />}
              size="sm"
              onClick={importFromEditor}
            >
              Import Editor Program
            </Button>
            <Select
              size="sm"
              maxW="240px"
              value={current.id}
              onChange={(e) =>
                setCurrent(
                  programs.find((p) => p.id === +e.target.value) ||
                  programs[0]
                )
              }
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={onOpen}>
              Manage…
            </Button>
            <ProgramManagerDrawer
              isOpen={isOpen}
              onClose={onClose}
              editorKey="programEditorPrograms"
              runnerKey={runnerKey}
            />
          </HStack>

          <Box
            ref={codeContainerRef}
            flex="1"
            overflowY="auto"
            p={3}
            bg={bgCode}
            borderWidth="1px"
            borderRadius="md"
          >
            <SyntaxHighlighter
              language="6ar"
              style={sixarTheme}
              showLineNumbers
              wrapLines
              lineProps={(ln) => ({
                "data-line": ln,
                style: {
                  display: "block",
                  background:
                    ln - 1 === executingLine
                      ? "rgba(0,132,255,0.4)"
                      : "transparent",
                },
              })}
            >
              {current.code}
            </SyntaxHighlighter>
          </Box>

          <HStack spacing={2}>
            <Button
              colorScheme="green"
              leftIcon={<PiPlayCircleFill />}
              onClick={handleRun}
              isDisabled={running}
            >
              Run
            </Button>
            <Button
              colorScheme="yellow"
              leftIcon={<PiPauseCircleFill />}
              onClick={handlePause}
              isDisabled={!running}
            >
              Pause
            </Button>
            <Button
              colorScheme="cyan"
              leftIcon={<PiArrowBendUpLeft />}
              onClick={handleStep}
            >
              Step
            </Button>
            <Button
              colorScheme="red"
              leftIcon={<PiStopCircleFill />}
              onClick={handleStop}
            >
              Stop
            </Button>
            <Divider orientation="vertical" h="24px" />
            <Text>Lines Executed: {steps}</Text>
          </HStack>
        </VStack>

        {/* ── Right Column ────────────────────────────────── */}
        <VStack flex="1" spacing={4} align="stretch">
          <HStack justify="space-between">
            <Text fontSize="lg" fontWeight="semibold">
              Execution Logs
            </Text>
            <HStack spacing={2}>
              <Button
                size="sm"
                leftIcon={<PiTrash />}
                onClick={() => setLogs([])}
              >
                Clear Logs
              </Button>
              <Button
                size="sm"
                leftIcon={<PiDownloadSimple />}
                onClick={() => {
                  const text = logs
                    .map((l) => {
                      const det =
                        l.detail != null ? l.detail : "";
                      const single =
                        typeof det === "string"
                          ? det.replace(/\n/g, " ")
                          : String(det);
                      return `[${l.time}] ${l.title} (${single})`;
                    })
                    .join("\n");
                  const blob = new Blob([text], {
                    type: "text/plain",
                  });
                  const url =
                    URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "run6ar.log";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export Logs
              </Button>
            </HStack>
          </HStack>

          <Box
            flex="1"
            overflowY="auto"
            borderWidth="1px"
            borderRadius="md"
            p={2}
            bg={useColorModeValue("white", "gray.700")}
          >
            <Accordion allowMultiple>
              {logs.length === 0 ? (
                <Text
                  color="gray.500"
                  textAlign="center"
                  py={8}
                >
                  No log entries
                </Text>
              ) : (
                logs.map((l) => (
                  <AccordionItem key={l.id}>
                    <AccordionButton>
                      <Box flex="1" textAlign="left">
                        [{l.time}]{" "}
                        <Badge
                          size="sm"
                          colorScheme={
                            l.type === "cmd" ? "blue" : "gray"
                          }
                          mr={2}
                        >
                          {l.type}
                        </Badge>
                        {l.title}
                      </Box>
                      <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel pb={4}>
                      <Text
                        as="pre"
                        fontSize="sm"
                        whiteSpace="pre-wrap"
                        wordBreak="break-all"
                      >
                        {l.detail}
                      </Text>
                    </AccordionPanel>
                  </AccordionItem>
                ))
              )}
            </Accordion>
          </Box>
        </VStack>
      </Flex>
    </>
  );
}
