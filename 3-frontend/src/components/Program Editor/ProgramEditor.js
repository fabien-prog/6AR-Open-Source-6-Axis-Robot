// src/components/ProgramEditor.jsx
/* eslint-disable react/jsx-no-comment-textnodes */
import React, { useState, useReducer, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  HStack,
  Text,
  useToast,
  useDisclosure,
} from "@chakra-ui/react";
import { DragDropContext } from "react-beautiful-dnd";
import {
  PiEyeBold,
  PiPencilBold,
  PiArrowUUpLeft,
  PiArrowUUpRight,
  PiCheckSquareOffset,
  PiDownloadSimple,
  PiFloppyDisk,
  PiPlayCircleFill,
} from "react-icons/pi";

import BlockEditor from "./BlockEditor";
import Sidebar from "./Sidebar";
import VariableEditor from "./VariableEditor";
import ProgramManagerDrawer from "../modals/ProgramManagerDrawer";
import { generateCode } from "./codeGenerator";

// ——— Block defaults ———
const defaultParams = {
  "Move L": {
    src: "manual",
    joints: ["", "", "", "", "", ""],
    cartesian: "",
    referenceType: "World",
    referenceObject: "",
    speed: "100",
    zone: "Fine",
  },
  "Move J": {
    src: "manual",
    moveMode: "cartesian",
    joints: ["", "", "", "", "", ""],
    cartesian: "",
    referenceType: "World",
    referenceObject: "",
    speed: "Vmax",
    zone: "Coarse",
  },
  Home: {},
  If: { variableSource: "IO", io: "DI_1", condition: "", operator: "==", value: "" },
  "End If": {},
  Counter: { name: "", initial: "0", increment: "1", target: "" },
  Then: { action: "Decrease Counter", targetCounter: "" },
  "For Loop": {
    counter: "",
    endSource: "Literal",
    end: "",
    start: "0",
    step: "1",
  },
  "End For": {},
  Else: {},
  "Console Log": { message: "", level: "info" },
  "Math": {
    varName: "",        // name of the variable to assign into
    expression: "",     // e.g. "a + b * 2"
  },
};

// ——— Initial empty program state ———
const initialState = { blocks: [], variables: [] };

// ——— Reducer for blocks + variables ———
function reducer(state, action) {
  switch (action.type) {
    case "SET_STATE":
      return action.payload;
    case "ADD_BLOCK":
      return { ...state, blocks: [...state.blocks, action.payload] };
    case "UPDATE_BLOCK":
      return {
        ...state,
        blocks: state.blocks.map((b, i) =>
          i === action.index ? { ...b, ...action.payload } : b
        ),
      };
    case "REMOVE_BLOCK":
      return {
        ...state,
        blocks: state.blocks.filter((_, i) => i !== action.index),
      };
    case "REORDER_BLOCKS":
      return { ...state, blocks: action.payload };
    case "ADD_VARIABLE":
      return { ...state, variables: [...state.variables, action.payload] };
    case "UPDATE_VARIABLE":
      return {
        ...state,
        variables: state.variables.map((v, i) =>
          i === action.index ? { ...v, ...action.payload } : v
        ),
      };
    case "REMOVE_VARIABLE":
      return {
        ...state,
        variables: state.variables.filter((_, i) => i !== action.index),
      };
    case "REORDER_VARIABLES":
      return { ...state, variables: action.payload };
    default:
      return state;
  }
}

// ——— Simple history for undo/redo ———
function useHistory(initialPresent) {
  const [history, setHistory] = useState({
    past: [],
    present: initialPresent,
    future: [],
  });

  const updateHistory = (newPresent) => {
    setHistory((h) => ({
      past: [...h.past, h.present],
      present: newPresent,
      future: [],
    }));
  };

  const undo = () => {
    let prev = null;
    setHistory((h) => {
      const { past, present, future } = h;
      if (!past.length) return h;
      prev = past[past.length - 1];
      return {
        past: past.slice(0, past.length - 1),
        present: prev,
        future: [present, ...future],
      };
    });
    return prev;
  };

  const redo = () => {
    let nextVal = null;
    setHistory((h) => {
      const { past, present, future } = h;
      if (!future.length) return h;
      nextVal = future[0];
      return {
        past: [...past, present],
        present: nextVal,
        future: future.slice(1),
      };
    });
    return nextVal;
  };

  return [history.present, updateHistory, undo, redo];
}

// ——— Helpers to group blocks in view mode ———
function groupBlocks(blocks) {
  const result = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === "If") {
      const group = { ...b, thenChildren: [], elseChildren: [] };
      i++;
      let depth = 1,
        insideElse = false,
        thenArr = [],
        elseArr = [];
      while (i < blocks.length && depth > 0) {
        const cur = blocks[i];
        if (cur.type === "If") depth++;
        else if (cur.type === "End If") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        } else if (cur.type === "Else" && depth === 1) {
          insideElse = true;
          i++;
          continue;
        }
        if (!insideElse) thenArr.push(cur);
        else elseArr.push(cur);
        i++;
      }
      group.thenChildren = groupBlocks(thenArr);
      group.elseChildren = groupBlocks(elseArr);
      result.push(group);
    } else if (b.type === "For Loop") {
      const group = { ...b, children: [] };
      i++;
      let depth = 1,
        inner = [];
      while (i < blocks.length && depth > 0) {
        const cur = blocks[i];
        if (cur.type === "For Loop") depth++;
        else if (cur.type === "End For") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        if (depth > 0) inner.push(cur);
        i++;
      }
      group.children = groupBlocks(inner);
      result.push(group);
    } else if (b.type === "End If" || b.type === "End For") {
      i++;
    } else {
      result.push(b);
      i++;
    }
  }
  return result;
}

// ——— Render variables in view mode ———
function renderVariableDeclarations(vars) {
  return vars.map((v, i) => {
    let decl = "";
    if (v.type.includes("CONST")) decl = "const";
    else if (v.type.includes("VAR")) decl = "var";
    else if (v.type.includes("Work Object")) decl = "workObject";
    else if (v.type.includes("Robot Target")) decl = "robotTarget";
    return (
      <Text key={i} fontFamily="monospace" color="orange.400">
        {decl} {v.name} = {v.value}
      </Text>
    );
  });
}

// ——— Render grouped blocks in view mode ———
const viewBlockColors = {
  If: "cyan.400",
  Else: "cyan.400",
  "For Loop": "pink.400",
  "Move L": "primary.400",
  "Move J": "primary.400",
  Home: "red.400",
  Counter: "teal.400",
  Then: "green.400",
  "Console Log": "purple.400",
};
function renderGroupedBlocks(blocks, indent = 0) {
  return blocks.map((b, idx) => {
    const color = viewBlockColors[b.type] || "gray.300";
    const renderLine = (line) => (
      <>
        {line}
        {b.comment && (
          <Text as="span" ml={2} color="green.600">
            // {b.comment}
          </Text>
        )}
      </>
    );
    if (b.type === "If") {
      const left =
        b.variableSource === "IO"
          ? b.io
          : b.variableSource === "Variable"
            ? b.io
            : b.condition;
      return (
        <Box key={idx} pl={indent} mb={1}>
          <Text fontFamily="monospace" color={color}>
            {renderLine(
              <>
                if ( {left} {b.operator} {b.value} ) {"{"}
              </>
            )}
          </Text>
          <Box pl={4}>{renderGroupedBlocks(b.thenChildren, indent + 4)}</Box>
          {b.elseChildren.length > 0 && (
            <>
              <Text fontFamily="monospace" color={color} pl={indent}>
                else {"{"}
              </Text>
              <Box pl={4}>
                {renderGroupedBlocks(b.elseChildren, indent + 4)}
              </Box>
            </>
          )}
          <Text fontFamily="monospace" color="gray.500" pl={indent}>
            {"}"}
          </Text>
        </Box>
      );
    } else if (b.type === "For Loop") {
      return (
        <Box key={idx} pl={indent} mb={1}>
          <Text fontFamily="monospace" color={color}>
            {renderLine(
              <>
                {`for (${b.counter} = ${b.start}; ${b.counter} <= ${b.end}; ${b.counter} += ${b.step}) {`}
              </>
            )}
          </Text>
          <Box pl={4}>{renderGroupedBlocks(b.children, indent + 4)}</Box>
          <Text fontFamily="monospace" color="gray.500" pl={indent}>
            {"}"}
          </Text>
        </Box>
      );
    } else if (b.type === "Console Log") {
      return (
        <Box key={idx} pl={indent} mb={1}>
          <Text fontFamily="monospace" color={color}>
            {renderLine(<>console.{b.level}("{b.message}");</>)}
          </Text>
        </Box>
      );
    } else if (b.type === "Move L" || b.type === "Move J") {
      const cmd = b.type === "Move L" ? "moveL" : "moveJ";
      const target = b.src === "manual" ? b.cartesian || "[…]" : b.pointVariable;
      return (
        <Box key={idx} pl={indent} mb={1}>
          <Text fontFamily="monospace" color={color}>
            {renderLine(
              <>{cmd}({target}, speed={b.speed}, ref={b.referenceType});</>
            )}
          </Text>
        </Box>
      );
    } else if (b.type === "Home") {
      return (
        <Box key={idx} pl={indent} mb={1}>
          <Text fontFamily="monospace" color={color}>
            {renderLine(<>Home();</>)}
          </Text>
        </Box>
      );
    } else if (b.type === "Counter") {
      return (
        <Box key={idx} pl={indent} mb={1}>
          <Text fontFamily="monospace" color={color}>
            {renderLine(
              <>
                Counter({b.name}, init={b.initial}, inc={b.increment}, to={b.target});
              </>
            )}
          </Text>
        </Box>
      );
    } else if (b.type === "Then") {
      return (
        <Box key={idx} pl={indent} mb={1}>
          <Text fontFamily="monospace" color={color}>
            {renderLine(<>{b.action}({b.targetCounter});</>)}
          </Text>
        </Box>
      );
    }
    return null;
  });
}

// ——— Multi‐program storage ———
const editorKey = "programEditorPrograms";
const defaultEditorProgram = {
  id: 1,
  name: "Untitled Program",
  state: initialState,
};
function loadEditorList() {
  try {
    return JSON.parse(localStorage.getItem(editorKey) || "[]");
  } catch {
    return [];
  }
}
function saveEditorList(list) {
  localStorage.setItem(editorKey, JSON.stringify(list));
}

// ——— Main component ———
export default function ProgramEditor() {
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();

  // programs list + current
  const [programs, setPrograms] = useState(() => {
    const saved = loadEditorList();
    return saved.length ? saved : [defaultEditorProgram];
  });
  const [currentProgram, setCurrentProgram] = useState(programs[0]);

  // history & reducer
  const [, updateHistory, undo, redo] = useHistory(initialState);
  const [state, dispatch] = useReducer(
    reducer,
    currentProgram.state || initialState
  );

  // UI state
  const [editMode, setEditMode] = useState(true);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [filter] = useState("");

  // sync editor state to currentProgram
  useEffect(() => {
    dispatch({
      type: "SET_STATE",
      payload: currentProgram.state || initialState,
    });
  }, [currentProgram]);

  // handle load from drawer
  const onLoadEditor = useCallback(
    (e) => {
      const prog = e.detail; // { id, name, state }
      setPrograms((prev) => {
        const exists = prev.find((p) => p.id === prog.id);
        const next = exists
          ? prev.map((p) => (p.id === prog.id ? prog : p))
          : [...prev, prog];
        saveEditorList(next);
        return next;
      });
      setCurrentProgram(prog);
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
    window.addEventListener("loadEditorProgram", onLoadEditor);
    return () =>
      window.removeEventListener("loadEditorProgram", onLoadEditor);
  }, [onLoadEditor]);

  // create new blank
  const createNewProgram = () => {
    const id = Date.now();
    const prog = {
      id,
      name: `Program ${programs.length + 1}`,
      state: initialState,
    };
    const next = [...programs, prog];
    saveEditorList(next);
    setPrograms(next);
    setCurrentProgram(prog);
    toast({
      title: `Created "${prog.name}"`,
      status: "success",
      duration: 2000,
    });
  };

  // save current program state
  const saveCurrentProgram = () => {
    const updated = { ...currentProgram, state };
    setPrograms((prev) => {
      const next = prev.map((p) =>
        p.id === updated.id ? updated : p
      );
      saveEditorList(next);
      return next;
    });
    setCurrentProgram(updated);
    toast({
      title: `Saved "${updated.name}"`,
      status: "success",
      duration: 2000,
    });
  };

  // export code (with optional download)
  const exportCode = ({ download = false } = {}) => {
    const code = generateCode(state);
    localStorage.setItem("runProgram", code);
    toast({ title: "Exported to runner", status: "success", duration: 2000 });
    if (download) {
      const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Main.6ar";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Code downloaded", status: "success", duration: 2000 });
    }
  };

  // run in simulator
  const runInSimulator = () => {
    exportCode({ download: false });
    window.dispatchEvent(new Event("runProgramExported"));
    window.dispatchEvent(new Event("switchToRunTab"));
  };

  // syntax validation
  const validateSyntax = () => {
    const errors = [];

    // 1) Unmatched If / End If & For Loop / End For
    let ifCount = 0, forCount = 0;
    state.blocks.forEach((b, i) => {
      const line = i + 1;
      if (b.type === "If") ifCount++;
      if (b.type === "End If") {
        ifCount--;
        if (ifCount < 0) {
          errors.push(`Line ${line}: 'End If' without matching 'If'`);
          ifCount = 0;
        }
      }
      if (b.type === "For Loop") forCount++;
      if (b.type === "End For") {
        forCount--;
        if (forCount < 0) {
          errors.push(`Line ${line}: 'End For' without matching 'For Loop'`);
          forCount = 0;
        }
      }
    });
    if (ifCount > 0) errors.push(`Unmatched ${ifCount} 'If' without 'End If'`);
    if (forCount > 0) errors.push(`Unmatched ${forCount} 'For Loop' without 'End For'`);

    // 2) Parameter‐level validation
    state.blocks.forEach((b, i) => {
      const line = i + 1;
      switch (b.type) {
        case "Move L":
          if (!b.cartesian) errors.push(`Line ${line}: Move L requires Cartesian coordinates`);
          break;
        case "Move J":
          if (b.src === "manual") {
            if (b.moveMode === "joint") {
              if (!b.joints || b.joints.some(v => v === "")) {
                errors.push(`Line ${line}: Move J (joint mode) needs all 6 joint values`);
              }
            } else {
              if (!b.cartesian) {
                errors.push(`Line ${line}: Move J (cartesian mode) needs Cartesian coordinates`);
              }
            }
          } else {
            if (!b.pointVariable) {
              errors.push(`Line ${line}: Move J (variable mode) needs a RobTarget variable`);
            }
          }
          break;
        case "If":
          if (b.variableSource === "IO" || b.variableSource === "Variable") {
            if (!b.io) errors.push(`Line ${line}: If block missing ${b.variableSource} selection`);
          } else if (b.variableSource === "Constant") {
            if (!b.condition) errors.push(`Line ${line}: If block missing constant value`);
          }
          if (!b.operator) errors.push(`Line ${line}: If block missing operator`);
          if (!b.value) errors.push(`Line ${line}: If block missing comparison value`);
          break;
        case "Then":
          if (!b.targetCounter) errors.push(`Line ${line}: Then block needs a counter target`);
          break;
        case "Counter":
          if (!b.name) errors.push(`Line ${line}: Counter needs a name`);
          if (b.initial === "") errors.push(`Line ${line}: Counter needs an initial value`);
          if (b.increment === "") errors.push(`Line ${line}: Counter needs an increment`);
          if (!b.target) errors.push(`Line ${line}: Counter needs a target value`);
          break;
        case "For Loop":
          if (!b.counter) errors.push(`Line ${line}: For Loop needs a counter variable`);
          if (b.start === "") errors.push(`Line ${line}: For Loop needs a start value`);
          if (b.end === "") errors.push(`Line ${line}: For Loop needs an end value`);
          if (b.step === "") errors.push(`Line ${line}: For Loop needs a step value`);
          break;
        case "Console Log":
          if (!b.message) errors.push(`Line ${line}: Console Log needs a message`);
          break;
        case "Math":
          if (!b.varName) errors.push(`Line ${line}: Math needs a target variable`);
          if (!b.expression) errors.push(`Line ${line}: Math needs an expression`);
          break;
        default:
          break;
      }
    });

    // 3) Report results
    if (errors.length) {
      const maxShow = 5;
      const toShow = errors.slice(0, maxShow).join("\n");
      const more = errors.length > maxShow
        ? `\nand ${errors.length - maxShow} more errors...`
        : "";
      toast({
        title: "Validation Errors",
        description: toShow + more,
        status: "error",
        isClosable: true,
        duration: null,       // stay open until dismissed
      });
    } else {
      toast({
        title: "Syntax Valid",
        status: "success",
      });
    }
  };

  // undo/redo
  const handleUndo = () => {
    const prev = undo();
    if (prev) dispatch({ type: "SET_STATE", payload: prev });
  };
  const handleRedo = () => {
    const nxt = redo();
    if (nxt) dispatch({ type: "SET_STATE", payload: nxt });
  };

  // drag/drop
  const onDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (
      source.droppableId.startsWith("sidebar") &&
      destination.droppableId === "blocks"
    ) {
      const newBlock = { type: draggableId, ...defaultParams[draggableId] };
      const arr = Array.from(state.blocks);
      arr.splice(destination.index, 0, newBlock);
      dispatch({ type: "REORDER_BLOCKS", payload: arr });
      updateHistory({ ...state, blocks: arr });
    } else if (
      source.droppableId === "blocks" &&
      destination.droppableId === "blocks"
    ) {
      const arr = Array.from(state.blocks);
      const [moved] = arr.splice(source.index, 1);
      arr.splice(destination.index, 0, moved);
      dispatch({ type: "REORDER_BLOCKS", payload: arr });
      updateHistory({ ...state, blocks: arr });
    }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Box maxW="1400px" mx="auto" mt={4} position="relative">
        {/* Toolbar */}
        <HStack justify="space-between" mb={6} wrap="wrap" spacing={4}>
          <Text fontSize="3xl" fontWeight="bold">
            Graphical Program Editor
          </Text>
          <HStack spacing={4}>
            <Button
              size="sm"
              leftIcon={editMode ? <PiEyeBold /> : <PiPencilBold />}
              onClick={() => setEditMode(!editMode)}
            >
              {editMode ? "View" : "Edit"}
            </Button>
            <ButtonGroup size="sm" isAttached variant="outline">
              <Button leftIcon={<PiArrowUUpLeft />} onClick={handleUndo}>
                Undo
              </Button>
              <Button leftIcon={<PiArrowUUpRight />} onClick={handleRedo}>
                Redo
              </Button>
            </ButtonGroup>
            <ButtonGroup size="sm" isAttached variant="outline">
              <Button size="sm" colorScheme="purple" onClick={createNewProgram}>
                New Program
              </Button>
              <Button colorScheme="teal" size="sm" onClick={onOpen}>
                Manage Programs
              </Button>
              <Button
                colorScheme="blue"
                leftIcon={<PiFloppyDisk />}
                size="sm"
                onClick={saveCurrentProgram}
              >
                Save locally
              </Button>
              <Button
                leftIcon={<PiDownloadSimple />}
                size="sm"
                colorScheme="orange"
                onClick={() => exportCode({ download: true })}
              >
                Download Code
              </Button>
              <Button
                colorScheme="green"
                leftIcon={<PiPlayCircleFill />}
                size="sm"
                onClick={runInSimulator}
              >
                Run in Simulator
              </Button>
            </ButtonGroup>
            <Button
              leftIcon={<PiCheckSquareOffset />}
              size="sm"
              w="100px"
              onClick={validateSyntax}
            >
              Validate
            </Button>
          </HStack>
        </HStack>

        {/* Variables Panel */}
        {editMode ? (
          <Box mb={6}>
            <VariableEditor variables={state.variables} dispatch={dispatch} />
          </Box>
        ) : (
          <Box bg="black" p={4} borderRadius="md" mb={6}>
            {state.variables.length > 0 && (
              <>
                <Text fontFamily="monospace" color="green.400" mb={2}>
                // Variable Declarations
                </Text>
                {renderVariableDeclarations(state.variables)}
              </>
            )}
          </Box>
        )}

        {/* Blocks Panel */}
        {editMode ? (
          <Box position="relative">
            <Sidebar
              expanded={sidebarExpanded}
              setExpanded={setSidebarExpanded}
            />
            <Box
              ml={sidebarExpanded ? "250px" : "70px"}
              transition="0.3s ease"
            >
              <BlockEditor
                state={state}
                dispatch={dispatch}
                filter={filter}
              />
            </Box>
          </Box>
        ) : (
          <Box bg="black" p={4} borderRadius="md">
            <Text fontFamily="monospace" color="green.400" mb={2}>
            // Main Program
            </Text>
            {state.blocks.length > 0 ? (
              renderGroupedBlocks(groupBlocks(state.blocks))
            ) : (
              <Text color="gray.500">No blocks added.</Text>
            )}
          </Box>
        )}
      </Box>

      {/* Program Manager Drawer */}
      <ProgramManagerDrawer
        isOpen={isOpen}
        onClose={onClose}
        editorKey={editorKey}
        runnerKey="runLogsPrograms"
      />
    </DragDropContext>
  );
}