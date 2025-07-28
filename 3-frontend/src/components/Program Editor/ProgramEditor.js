/* eslint-disable react/jsx-no-comment-textnodes */
import { useState, useReducer, useEffect } from "react";
import { Box, Button, ButtonGroup, HStack, Text, useToast, Tabs, TabList, TabPanels, Tab, TabPanel } from "@chakra-ui/react";
import { DragDropContext } from "react-beautiful-dnd";
import BlockEditor from "./BlockEditor";
import Sidebar from "./Sidebar";
import VariableEditor from "./VariableEditor";
import { PiArrowUUpLeft, PiArrowUUpRight, PiCheckSquareOffset, PiDownloadSimple, PiEyeBold, PiFloppyDisk, PiFolderOpen, PiPencilBold } from "react-icons/pi";

// Default parameters for each block type.
const defaultParams = {
  "Move L": {
    point: "",
    referenceType: "World", // "World" or "Tool"
    referenceObject: "", // if "Tool" then a work object variable id
    speed: "100",
    zone: "Fine",
  },
  "Move J": {
    point: "",
    referenceType: "World", // "World" or "Tool"
    referenceObject: "", // if "Tool" then a robot target variable id
    speed: "Vmax",
    zone: "Coarse",
  },
  Home: {},
  If: { variableSource: "IO", io: "DI_1", condition: "", operator: "==", value: "" },
  "End If": {},
  Counter: { name: "", initial: "0", increment: "1", target: "" },
  Then: { action: "Decrease Counter", targetCounter: "" },
  "For Loop": {
    counter: "",          // name of a numeric variable
    endSource: "Literal", // or "Variable"
    end: "",              // literal number or variable name
    start: "0",
    step: "1",
  },
  "End For": {},
  Else: {},
  "Console Log": {
    message: "",
    level: "info", // options: info, warn, error, log
  },
};

const initialState = {
  blocks: [],
  variables: [],
};

const reducer = (state, action) => {
  switch (action.type) {
    case "SET_STATE":
      return action.payload;
    case "ADD_BLOCK":
      return { ...state, blocks: [...state.blocks, action.payload] };
    case "UPDATE_BLOCK":
      const updatedBlocks = state.blocks.map((block, index) => (index === action.index ? { ...block, ...action.payload } : block));
      return { ...state, blocks: updatedBlocks };
    case "REMOVE_BLOCK":
      const newBlocks = state.blocks.filter((_, index) => index !== action.index);
      return { ...state, blocks: newBlocks };
    case "REORDER_BLOCKS":
      return { ...state, blocks: action.payload };
    case "ADD_VARIABLE":
      return { ...state, variables: [...state.variables, action.payload] };
    case "UPDATE_VARIABLE":
      const updatedVariables = state.variables.map((v, i) => (i === action.index ? { ...v, ...action.payload } : v));
      return { ...state, variables: updatedVariables };
    case "REMOVE_VARIABLE":
      return { ...state, variables: state.variables.filter((_, i) => i !== action.index) };
    default:
      return state;
  }
};

// --------------------
// useHistory Hook
// --------------------
function useHistory(initialPresent) {
  const [history, setHistory] = useState({
    past: [],
    present: initialPresent,
    future: [],
  });

  const updateHistory = (newPresent) => {
    setHistory({
      past: [...history.past, history.present],
      present: newPresent,
      future: [],
    });
  };

  const undo = () => {
    const { past, present, future } = history;
    if (past.length === 0) return null;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    setHistory({
      past: newPast,
      present: previous,
      future: [present, ...future],
    });
    return previous;
  };

  const redo = () => {
    const { past, present, future } = history;
    if (future.length === 0) return null;
    const next = future[0];
    const newFuture = future.slice(1);
    setHistory({
      past: [...past, present],
      present: next,
      future: newFuture,
    });
    return next;
  };

  return [history.present, updateHistory, undo, redo];
}

// --------------------
// Group Blocks Function (for view mode grouping)
// --------------------
const groupBlocks = (blocks) => {
  const result = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === "If") {
      let groupBlock = { ...block, thenChildren: [], elseChildren: [] };
      i++;
      let depth = 1;
      let insideElse = false;
      let thenBlocks = [];
      let elseBlocks = [];
      while (i < blocks.length && depth > 0) {
        const current = blocks[i];
        if (current.type === "If") {
          depth++;
        } else if (current.type === "End If") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        } else if (current.type === "Else" && depth === 1) {
          insideElse = true;
          i++;
          continue;
        }
        if (!insideElse) {
          thenBlocks.push(current);
        } else {
          elseBlocks.push(current);
        }
        i++;
      }
      groupBlock.thenChildren = groupBlocks(thenBlocks);
      groupBlock.elseChildren = groupBlocks(elseBlocks);
      result.push(groupBlock);
    } else if (block.type === "For Loop") {
      let groupBlock = { ...block, children: [] };
      i++;
      let depth = 1;
      let innerBlocks = [];
      while (i < blocks.length && depth > 0) {
        const current = blocks[i];
        if (current.type === "For Loop") {
          depth++;
        } else if (current.type === "End For") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        if (depth > 0) innerBlocks.push(current);
        i++;
      }
      groupBlock.children = groupBlocks(innerBlocks);
      result.push(groupBlock);
    } else if (block.type === "End If" || block.type === "End For") {
      i++;
    } else {
      result.push(block);
      i++;
    }
  }
  return result;
};

// --------------------
// Render Variables Declarations (View Mode)
// --------------------
const renderVariableDeclarations = (variables) => {
  return variables.map((v, i) => {
    // Determine declaration keyword based on variable type.
    let declaration = "";
    if (v.type.includes("CONST")) {
      declaration = "const";
    } else if (v.type.includes("VAR")) {
      declaration = "var";
    } else if (v.type.includes("Work Object")) {
      declaration = "workObject";
    } else if (v.type.includes("Robot Target")) {
      declaration = "robotTarget";
    }
    return (
      <Text key={i} fontFamily="monospace" fontSize="md" color="orange.400">
        {declaration} {v.name} = {v.value}
      </Text>
    );
  });
};

// --------------------
// Render Grouped Blocks (View Mode)
// --------------------
const viewBlockColors = {
  If: { bg: "transparent", color: "cyan.400" },
  Else: { bg: "transparent", color: "cyan.400" },
  "For Loop": { bg: "transparent", color: "pink.400" },
  "Move L": { bg: "transparent", color: "primary.400" },
  "Move J": { bg: "transparent", color: "primary.400" },
  Home: { bg: "transparent", color: "red.400" },
  Counter: { bg: "transparent", color: "teal.400" },
  Then: { bg: "transparent", color: "green.400" },
  "Console Log": { bg: "transparent", color: "purple.400" },
};

const renderGroupedBlocks = (blocks, indent = 0) => {
  return blocks.map((block, index) => {
    const style = viewBlockColors[block.type] || { bg: "transparent", color: "gray.300" };
    const renderLine = (line) => (
      <>
        {line}
        {block.comment && (
          <Text as="span" ml={2} color="green.600">
            // {block.comment}
          </Text>
        )}
      </>
    );
    if (block.type === "If") {
      // Determine left-hand operand text
      const leftOperand =
        block.variableSource === "IO"
          ? block.io
          : block.variableSource === "Variable"
            ? block.io
            : block.condition;

      const operator = block.operator || "==";
      const rightOperand = block.value;

      return (
        <Box key={index} pl={indent} mb={1}>
          <Text fontFamily="monospace" fontSize="md" color={style.color}>
            {renderLine(
              <>if {"{ "}
                {leftOperand} {operator} {rightOperand}
                {" } => {"}</>
            )}
          </Text>

          {/* then-block */}
          <Box pl={4}>
            {renderGroupedBlocks(block.thenChildren, indent + 4)}
          </Box>

          {/* else-block, if any */}
          {block.elseChildren?.length > 0 && (
            <>
              <Text
                fontFamily="monospace"
                fontSize="md"
                color={viewBlockColors["Else"].color}
                pl={indent + 8}
              >
                {renderLine(<>{"} else {"}</>)}
              </Text>
              <Box pl={4}>
                {renderGroupedBlocks(block.elseChildren, indent + 4)}
              </Box>
            </>
          )}

          {/* closing brace */}
          <Text fontFamily="monospace" fontSize="md" color="gray.500" pl={indent}>
            {"}"}
          </Text>
        </Box>
      );
    } else if (block.type === "For Loop") {
      return (
        <Box key={index} pl={indent} mb={1}>
          <Text fontFamily="monospace" fontSize="md" color={viewBlockColors["For Loop"].color}>
            {renderLine(
              <>
                for ( {block.counter ? block.counter : "[var]"} =! {block.end} {block.step} ) {`=> {`}
              </>
            )}
          </Text>
          <Box pl={4}>{renderGroupedBlocks(block.children, indent + 4)}</Box>
          <Text fontFamily="monospace" fontSize="md" color={viewBlockColors["For Loop"].color} pl={indent + 8}>
            counter( add {block.step} to {block.counter} );
          </Text>
          <Text fontFamily="monospace" fontSize="md" color="gray.500" pl={indent}>
            {`}`}
          </Text>
        </Box>
      );
    } else if (block.type === "Console Log") {
      return (
        <Box key={index} pl={indent} mb={1}>
          <Text fontFamily="monospace" fontSize="md" color={style.color}>
            {renderLine(
              <>
                console.{block.level}("{block.message}");
              </>
            )}
          </Text>
        </Box>
      );
    } else if (block.type === "Move L" || block.type === "Move J") {
      const moveType = block.type === "Move L" ? "moveL" : block.type === "Move J" ? "moveJ" : "";
      return (
        <Box key={index} pl={indent} mb={1}>
          <Text fontFamily="monospace" fontSize="md" color={style.color}>
            {renderLine(
              <>
                {moveType} ({block.pointSource === "manual" ? block.point || "[point]" : block.pointVariable || "[select point var]"}, {block.zone}, {block.speed},{" "}
                {block.referenceType === "World" ? "World" : block.referenceObject || "[select ref]"});
              </>
            )}
          </Text>
        </Box>
      );
    } else if (block.type === "Home") {
      return (
        <Box key={index} pl={indent} mb={1}>
          <Text fontFamily="monospace" fontSize="md" color={style.color}>
            {renderLine(<>Home</>)}
          </Text>
        </Box>
      );
    } else if (block.type === "Counter") {
      return (
        <Box key={index} pl={indent} mb={1}>
          <Text fontFamily="monospace" fontSize="md" color={style.color}>
            {renderLine(
              <>
                counter(name: {block.name}, initial: {block.initial}, add: {block.increment}, target: {block.target || "[select target]"});
              </>
            )}
          </Text>
        </Box>
      );
    } else if (block.type === "Then") {
      return (
        <Box key={index} pl={indent} mb={1}>
          <Text fontFamily="monospace" fontSize="md" color={style.color}>
            {renderLine(<>then({block.action})</>)}
          </Text>
        </Box>
      );
    } else {
      return null;
    }
  });
};

const ProgramEditor = () => {
  // Try to load saved project; otherwise fall back to initialState
  const loadInitialState = () => {
    const saved = localStorage.getItem("programProject");
    return saved ? JSON.parse(saved) : initialState;
  };
  const [state, dispatch] = useReducer(reducer, initialState, loadInitialState);
  // eslint-disable-next-line no-unused-vars
  const [historyState, updateHistory, undo, redo] = useHistory(initialState);
    // eslint-disable-next-line no-unused-vars
  const [filter, setFilter] = useState("");
  const [editMode, setEditMode] = useState(true);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const toast = useToast();

  // Auto-save to localStorage whenever `state` changes:
  useEffect(() => {
    localStorage.setItem("programProject", JSON.stringify(state));
  }, [state]);

  // Helper: update state and record history.
  const updateState = (action) => {
    const newState = reducer(state, action);
    dispatch(action);
    updateHistory(newState);
  };

  const saveProject = () => {
    localStorage.setItem("programProject", JSON.stringify(state));
    toast({ title: "Project Saved", status: "success", duration: 2000 });
  };

  const loadProject = () => {
    const saved = localStorage.getItem("programProject");
    if (saved) {
      const newState = JSON.parse(saved);
      dispatch({ type: "SET_STATE", payload: newState });
      updateHistory(newState);
      toast({ title: "Project Loaded", status: "success", duration: 2000 });
    } else {
      toast({ title: "No saved project found", status: "error", duration: 2000 });
    }
  };

  const exportCode = () => {
    // Export variable declarations first.
    const variableCode = state.variables
      .map((v) => {
        let declaration = "";
        if (v.type.includes("CONST")) {
          declaration = "const";
        } else if (v.type.includes("VAR")) {
          declaration = "var";
        } else if (v.type.includes("WOBJ")) {
          declaration = "workObject";
        } else if (v.type.includes("ROBTARGET")) {
          declaration = "robotTarget";
        }
        return `${declaration} ${v.name} = ${v.value};`;
      })
      .join("\n");

    // Then export blocks.
    const blocksCode = state.blocks
      .map((block) => {
        if (block.type === "Move L" || block.type === "Move J") {
          return `${block.type} (Point: ${block.pointSource === "manual" ? block.point : block.pointVariable}, Reference: ${block.referenceType === "World" ? "World" : block.referenceObject
            }, Speed: ${block.speed}, Zone: ${block.zone})`;
        } else if (block.type === "Home") {
          return "Home";
        } else if (block.type === "If") {
          return `If (${block.condition})`;
        } else if (block.type === "Else") {
          return "Else";
        } else if (block.type === "End If") {
          return "End If";
        } else if (block.type === "Counter") {
          return `Counter ${block.name} = ${block.initial}`;
        } else if (block.type === "Then") {
          return `Then Action: ${block.action}`;
        } else if (block.type === "For Loop") {
          return `For (${block.counter} = ${block.start}; ${block.counter} <= ${block.end}; ${block.counter} += ${block.step})`;
        } else if (block.type === "End For") {
          return "End For";
        } else if (block.type === "Console Log") {
          return `Console.log("${block.message}") [${block.level}]`;
        } else {
          return "";
        }
      })
      .join("\n");

    const code = variableCode + "\n\n" + blocksCode;
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "program.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const validateSyntax = () => {
    let balanceIf = 0;
    let balanceFor = 0;
    for (let block of state.blocks) {
      if (block.type === "If") balanceIf++;
      if (block.type === "End If") balanceIf--;
      if (block.type === "For Loop") balanceFor++;
      if (block.type === "End For") balanceFor--;
    }
    if (balanceIf !== 0) {
      toast({ title: "Syntax Error: Unmatched If/End If", status: "error", duration: 3000 });
    } else if (balanceFor !== 0) {
      toast({ title: "Syntax Error: Unmatched For Loop/End For", status: "error", duration: 3000 });
    } else {
      toast({ title: "Syntax Valid", status: "success", duration: 2000 });
    }
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    // Check if source is from a sidebar droppable.
    if (source.droppableId.startsWith("sidebar") && destination.droppableId === "blocks") {
      const newBlock = { type: draggableId, ...defaultParams[draggableId] };
      const newBlocks = Array.from(state.blocks);
      newBlocks.splice(destination.index, 0, newBlock);
      updateState({ type: "REORDER_BLOCKS", payload: newBlocks });
    }
    // Reordering within the blocks list:
    else if (source.droppableId === "blocks" && destination.droppableId === "blocks") {
      const newBlocks = Array.from(state.blocks);
      const [moved] = newBlocks.splice(source.index, 1);
      newBlocks.splice(destination.index, 0, moved);
      updateState({ type: "REORDER_BLOCKS", payload: newBlocks });
    }
  };

  const handleUndo = () => {
    const previous = undo();
    if (previous) {
      dispatch({ type: "SET_STATE", payload: previous });
    }
  };

  const handleRedo = () => {
    const next = redo();
    if (next) {
      dispatch({ type: "SET_STATE", payload: next });
    }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Box maxW="1200px" mx="auto" position="relative">
        <HStack justify="space-between" mb={6} wrap="wrap" spacing={4}>
          <Text fontSize="3xl" fontWeight="bold">
            Graphical Program Editor
          </Text>
          <HStack spacing={4}>
            <Button
              size="sm"
              leftIcon={editMode ? <PiEyeBold fontSize="18px" /> : <PiPencilBold fontSize="18px" />}
              colorScheme="gray"
              onClick={() => setEditMode(!editMode)}
            >
              {editMode ? "View Mode" : "Edit Mode"}
            </Button>
            <ButtonGroup size="sm" isAttached variant="outline" colorScheme="gray">
              <Button leftIcon={<PiArrowUUpLeft fontSize="18px" />} onClick={handleUndo}>
                Undo
              </Button>
              <Button leftIcon={<PiArrowUUpRight fontSize="18px" />} onClick={handleRedo}>
                Redo
              </Button>
            </ButtonGroup>
            <ButtonGroup size="sm" isAttached variant="outline" colorScheme="gray">
              <Button leftIcon={<PiFloppyDisk fontSize="18px" />} onClick={saveProject}>
                Save
              </Button>
              <Button leftIcon={<PiFolderOpen fontSize="18px" />} onClick={loadProject}>
                Load
              </Button>
              <Button leftIcon={<PiDownloadSimple fontSize="18px" />} onClick={exportCode}>
                Export
              </Button>
            </ButtonGroup>
            <Button leftIcon={<PiCheckSquareOffset fontSize="18px" />} size="sm" colorScheme="gray" onClick={validateSyntax}>
              Validate
            </Button>
          </HStack>
        </HStack>
        <Tabs variant="enclosed" isFitted>
          <TabList mb="1em">
            <Tab _selected={{ color: "white", bg: "primary.500" }}>Blocks</Tab>
            <Tab _selected={{ color: "white", bg: "primary.500" }}>Variables</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              {editMode ? (
                <Box position="relative">
                  <Sidebar expanded={sidebarExpanded} setExpanded={setSidebarExpanded} />
                  <Box ml={sidebarExpanded ? "250px" : "70px"} transition="0.3s ease">
                    <BlockEditor state={state} dispatch={dispatch} filter={filter} />
                  </Box>
                </Box>
              ) : (
                <Box bg="black" p={3} borderRadius="md">
                  {/* Render variables at the top */}
                  {state.variables.length > 0 && (
                    <Box mb={4}>
                      <Text fontFamily="monospace" fontSize="md" color="green.400" mb={1}>
                        // Variable Declarations
                      </Text>
                      {renderVariableDeclarations(state.variables)}
                    </Box>
                  )}
                  <Text fontFamily="monospace" fontSize="md" color="green.400" mb={1}>
                    // Main Program
                  </Text>
                  {state.blocks.length > 0 ? renderGroupedBlocks(groupBlocks(state.blocks)) : <Text color="gray.500">No blocks added.</Text>}
                </Box>
              )}
            </TabPanel>
            <TabPanel>
              <VariableEditor variables={state.variables} dispatch={dispatch} />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
    </DragDropContext>
  );
};

export default ProgramEditor;
