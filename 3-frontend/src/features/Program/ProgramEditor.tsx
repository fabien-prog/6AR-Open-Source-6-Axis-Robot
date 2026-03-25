// src/features/Program/ProgramEditor.tsx
/* eslint-disable react/jsx-no-comment-textnodes */
import React, { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { PiEyeBold, PiPencilBold, PiArrowUUpLeft, PiArrowUUpRight, PiCheckSquareOffset, PiDownloadSimple, PiFloppyDisk, PiPlayCircleFill } from "react-icons/pi";

import BlockEditor from "./BlockEditor";
import Sidebar from "./Sidebar";
import VariableEditor from "./VariableEditor";
import ProgramManagerDrawer from "@/features/Runner/ProgramManagerDrawer";
import { generateCode } from "./CodeGenerator";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type BlockType = "Move L" | "Move J" | "Home" | "If" | "End If" | "Else" | "Counter" | "Then" | "For Loop" | "End For" | "Console Log" | "Math" | "SetDO" | "WaitDI";

type Block = {
  type: BlockType;
  comment?: string;

  // common optional fields used by different blocks
  [k: string]: any;
};

type VariableItem = {
  type: string;
  name: string;
  value: string;
};

type ProgramState = {
  blocks: Block[];
  variables: VariableItem[];
};

type ProgramEntry = { id: number; name: string; state: ProgramState };

const defaultParams: Record<string, any> = {
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
  "For Loop": { counter: "", endSource: "Literal", end: "", start: "0", step: "1" },
  "End For": {},
  Else: {},
  "Console Log": { message: "", level: "info" },
  Math: { varName: "", expression: "" },
  SetDO: { pin: "1", state: "1" },
  WaitDI: { pin: "1", state: "1" },
};

const initialState: ProgramState = { blocks: [], variables: [] };

type Action =
  | { type: "SET_STATE"; payload: ProgramState }
  | { type: "ADD_BLOCK"; payload: Block }
  | { type: "UPDATE_BLOCK"; index: number; payload: Partial<Block> }
  | { type: "REMOVE_BLOCK"; index: number }
  | { type: "REORDER_BLOCKS"; payload: Block[] }
  | { type: "ADD_VARIABLE"; payload: VariableItem }
  | { type: "UPDATE_VARIABLE"; index: number; payload: Partial<VariableItem> }
  | { type: "REMOVE_VARIABLE"; index: number }
  | { type: "REORDER_VARIABLES"; payload: VariableItem[] };

function reducer(state: ProgramState, action: Action): ProgramState {
  switch (action.type) {
    case "SET_STATE":
      return action.payload;
    case "ADD_BLOCK":
      return { ...state, blocks: [...state.blocks, action.payload] };
    case "UPDATE_BLOCK":
      return {
        ...state,
        blocks: state.blocks.map((b, i) => (i === action.index ? { ...b, ...action.payload } : b)),
      };
    case "REMOVE_BLOCK":
      return { ...state, blocks: state.blocks.filter((_, i) => i !== action.index) };
    case "REORDER_BLOCKS":
      return { ...state, blocks: action.payload };
    case "ADD_VARIABLE":
      return { ...state, variables: [...state.variables, action.payload] };
    case "UPDATE_VARIABLE":
      return {
        ...state,
        variables: state.variables.map((v, i) => (i === action.index ? { ...v, ...action.payload } : v)),
      };
    case "REMOVE_VARIABLE":
      return { ...state, variables: state.variables.filter((_, i) => i !== action.index) };
    case "REORDER_VARIABLES":
      return { ...state, variables: action.payload };
    default:
      return state;
  }
}

// ---- Simple history for undo/redo ----
function useHistory<T>(initialPresent: T) {
  const [history, setHistory] = useState<{ past: T[]; present: T; future: T[] }>({
    past: [],
    present: initialPresent,
    future: [],
  });

  const updateHistory = useCallback((newPresent: T) => {
    setHistory((h) => ({
      past: [...h.past, h.present],
      present: newPresent,
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    let prev: T | null = null;
    setHistory((h) => {
      const { past, present, future } = h;
      if (!past.length) return h;
      prev = past[past.length - 1];
      return {
        past: past.slice(0, past.length - 1),
        present: prev as T,
        future: [present, ...future],
      };
    });
    return prev;
  }, []);

  const redo = useCallback(() => {
    let nextVal: T | null = null;
    setHistory((h) => {
      const { past, present, future } = h;
      if (!future.length) return h;
      nextVal = future[0];
      return {
        past: [...past, present],
        present: nextVal as T,
        future: future.slice(1),
      };
    });
    return nextVal;
  }, []);

  return [history.present, updateHistory, undo, redo] as const;
}

// ---- Grouping helpers (unchanged logic, typed loosely) ----
function groupBlocks(blocks: Block[]): any[] {
  const result: any[] = [];
  let i = 0;

  while (i < blocks.length) {
    const b = blocks[i];

    if (b.type === "If") {
      const group: any = { ...b, thenChildren: [], elseChildren: [] };
      i++;
      let depth = 1;
      let insideElse = false;
      const thenArr: Block[] = [];
      const elseArr: Block[] = [];

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
      const group: any = { ...b, children: [] };
      i++;
      let depth = 1;
      const inner: Block[] = [];

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

function renderVariableDeclarations(vars: VariableItem[]) {
  return vars.map((v, i) => {
    let decl = "";
    if (v.type.includes("CONST")) decl = "const";
    else if (v.type.includes("VAR")) decl = "var";
    else if (v.type.includes("Work Object")) decl = "workObject";
    else if (v.type.includes("Robot Target")) decl = "robotTarget";

    return (
      <div key={i} className="font-mono text-sm text-orange-400">
        {decl} {v.name} = {v.value}
      </div>
    );
  });
}

const viewBlockColors: Record<string, string> = {
  If: "text-cyan-300",
  Else: "text-cyan-300",
  "For Loop": "text-pink-300",
  "Move L": "text-sky-300",
  "Move J": "text-sky-300",
  Home: "text-red-300",
  Counter: "text-teal-300",
  Then: "text-green-300",
  "Console Log": "text-purple-300",
};

function renderGroupedBlocks(blocks: any[], indent = 0): React.ReactNode {
  return blocks.map((b, idx) => {
    const color = viewBlockColors[b.type] || "text-zinc-200";

    const renderLine = (line: React.ReactNode) => (
      <>
        {line}
        {b.comment && <span className="ml-2 text-green-400">// {b.comment}</span>}
      </>
    );

    if (b.type === "If") {
      const left = b.variableSource === "IO" ? b.io : b.variableSource === "Variable" ? b.io : b.condition;

      return (
        <div key={idx} style={{ paddingLeft: indent }} className="mb-1">
          <div className={`font-mono text-sm ${color}`}>
            {renderLine(
              <>
                if ( {left} {b.operator} {b.value} ) {"{"}
              </>,
            )}
          </div>

          <div className="pl-4">{renderGroupedBlocks(b.thenChildren, indent + 4)}</div>

          {b.elseChildren?.length > 0 && (
            <>
              <div style={{ paddingLeft: indent }} className={`font-mono text-sm ${color}`}>
                else {"{"}
              </div>
              <div className="pl-4">{renderGroupedBlocks(b.elseChildren, indent + 4)}</div>
            </>
          )}

          <div style={{ paddingLeft: indent }} className="font-mono text-sm text-zinc-500">
            {"}"}
          </div>
        </div>
      );
    }

    if (b.type === "For Loop") {
      return (
        <div key={idx} style={{ paddingLeft: indent }} className="mb-1">
          <div className={`font-mono text-sm ${color}`}>{renderLine(<>{`for (${b.counter} = ${b.start}; ${b.counter} <= ${b.end}; ${b.counter} += ${b.step}) {`}</>)}</div>

          <div className="pl-4">{renderGroupedBlocks(b.children, indent + 4)}</div>

          <div style={{ paddingLeft: indent }} className="font-mono text-sm text-zinc-500">
            {"}"}
          </div>
        </div>
      );
    }

    if (b.type === "Console Log") {
      return (
        <div key={idx} style={{ paddingLeft: indent }} className="mb-1">
          <div className={`font-mono text-sm ${color}`}>
            {renderLine(
              <>
                console.{b.level}("{b.message}");
              </>,
            )}
          </div>
        </div>
      );
    }

    if (b.type === "Move L" || b.type === "Move J") {
      const cmd = b.type === "Move L" ? "moveL" : "moveJ";
      const target = b.src === "manual" ? b.cartesian || "[…]" : b.pointVariable;

      return (
        <div key={idx} style={{ paddingLeft: indent }} className="mb-1">
          <div className={`font-mono text-sm ${color}`}>
            {renderLine(
              <>
                {cmd}({String(target)}, speed={b.speed}, ref={b.referenceType});
              </>,
            )}
          </div>
        </div>
      );
    }

    if (b.type === "Home") {
      return (
        <div key={idx} style={{ paddingLeft: indent }} className="mb-1">
          <div className={`font-mono text-sm ${color}`}>{renderLine(<>Home();</>)}</div>
        </div>
      );
    }

    if (b.type === "Counter") {
      return (
        <div key={idx} style={{ paddingLeft: indent }} className="mb-1">
          <div className={`font-mono text-sm ${color}`}>
            {renderLine(
              <>
                Counter({b.name}, init={b.initial}, inc={b.increment}, to={b.target});
              </>,
            )}
          </div>
        </div>
      );
    }

    if (b.type === "Then") {
      return (
        <div key={idx} style={{ paddingLeft: indent }} className="mb-1">
          <div className={`font-mono text-sm ${color}`}>
            {renderLine(
              <>
                {b.action}({b.targetCounter});
              </>,
            )}
          </div>
        </div>
      );
    }

    return null;
  });
}

// ---- Multi-program storage ----
const editorKey = "programEditorPrograms";
const defaultEditorProgram: ProgramEntry = { id: 1, name: "Untitled Program", state: initialState };

function loadEditorList(): ProgramEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(editorKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function saveEditorList(list: ProgramEntry[]) {
  localStorage.setItem(editorKey, JSON.stringify(list));
}

export default function ProgramEditor() {
  // shadcn drawer open state
  const [drawerOpen, setDrawerOpen] = useState(false);

  // programs list + current
  const [programs, setPrograms] = useState<ProgramEntry[]>(() => {
    const saved = loadEditorList();
    return saved.length ? saved : [defaultEditorProgram];
  });

  const [currentProgram, setCurrentProgram] = useState<ProgramEntry>(() => {
    const saved = loadEditorList();
    return saved.length ? saved[0] : defaultEditorProgram;
  });

  // history & reducer
  const [, updateHistory, undo, redo] = useHistory<ProgramState>(initialState);
  const [state, dispatch] = useReducer(reducer, currentProgram.state || initialState);

  // UI state
  const [editMode, setEditMode] = useState(true);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [filter] = useState("");

  // sync editor state to currentProgram
  useEffect(() => {
    dispatch({ type: "SET_STATE", payload: currentProgram.state || initialState });
  }, [currentProgram]);

  // handle load from drawer (custom event)
  const onLoadEditor = useCallback((e: Event) => {
    const ce = e as CustomEvent<ProgramEntry>;
    const prog = ce.detail;

    setPrograms((prev) => {
      const exists = prev.find((p) => p.id === prog.id);
      const next = exists ? prev.map((p) => (p.id === prog.id ? prog : p)) : [...prev, prog];
      saveEditorList(next);
      return next;
    });

    setCurrentProgram(prog);
    toast.info(`Loaded "${prog.name}"`);
    setDrawerOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener("loadEditorProgram", onLoadEditor);
    return () => window.removeEventListener("loadEditorProgram", onLoadEditor);
  }, [onLoadEditor]);

  // create new blank
  const createNewProgram = useCallback(() => {
    const id = Date.now();
    const prog: ProgramEntry = { id, name: `Program ${programs.length + 1}`, state: initialState };
    const next = [...programs, prog];
    saveEditorList(next);
    setPrograms(next);
    setCurrentProgram(prog);
    toast.success(`Created "${prog.name}"`);
  }, [programs.length]);

  // save current program state
  const saveCurrentProgram = useCallback(() => {
    const updated: ProgramEntry = { ...currentProgram, state };
    setPrograms((prev) => {
      const next = prev.map((p) => (p.id === updated.id ? updated : p));
      saveEditorList(next);
      return next;
    });
    setCurrentProgram(updated);
    toast.success(`Saved "${updated.name}"`);
  }, [currentProgram, state]);

  // export code (with optional download)
  const exportCode = useCallback(
    ({ download = false }: { download?: boolean } = {}) => {
      const code = generateCode(state);
      localStorage.setItem("runProgram", code);
      toast.success("Exported to runner");

      if (download) {
        const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Main.6ar";
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Code downloaded");
      }
    },
    [state],
  );

  // run in simulator
  const runInSimulator = useCallback(() => {
    exportCode({ download: false });
    window.dispatchEvent(new Event("runProgramExported"));
    window.dispatchEvent(new Event("switchToRunTab"));
  }, [exportCode]);

  // syntax validation
  const validateSyntax = useCallback(() => {
    const errors: string[] = [];

    // 1) Unmatched If/End If & For/End For
    let ifCount = 0;
    let forCount = 0;

    for (let i = 0; i < state.blocks.length; i++) {
      const b = state.blocks[i];
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
    }

    if (ifCount > 0) errors.push(`Unmatched ${ifCount} 'If' without 'End If'`);
    if (forCount > 0) errors.push(`Unmatched ${forCount} 'For Loop' without 'End For'`);

    // 2) Parameter-level validation
    state.blocks.forEach((b, i) => {
      const line = i + 1;

      switch (b.type) {
        case "Move L":
          if (!b.cartesian) errors.push(`Line ${line}: Move L requires Cartesian coordinates`);
          break;

        case "Move J":
          if (b.src === "manual") {
            if (b.moveMode === "joint") {
              if (!b.joints || (Array.isArray(b.joints) && b.joints.some((v: string) => v === ""))) {
                errors.push(`Line ${line}: Move J (joint mode) needs all 6 joint values`);
              }
            } else {
              if (!b.cartesian) errors.push(`Line ${line}: Move J (cartesian mode) needs Cartesian coordinates`);
            }
          } else {
            if (!b.pointVariable) errors.push(`Line ${line}: Move J (variable mode) needs a RobTarget variable`);
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

    if (errors.length) {
      const maxShow = 5;
      const toShow = errors.slice(0, maxShow).join("\n");
      const more = errors.length > maxShow ? `\n…and ${errors.length - maxShow} more errors` : "";
      toast.error("Validation Errors", { description: toShow + more });
    } else {
      toast.success("Syntax Valid");
    }
  }, [state.blocks]);

  // undo/redo
  const handleUndo = useCallback(() => {
    const prev = undo();
    if (prev) dispatch({ type: "SET_STATE", payload: prev });
  }, [undo]);

  const handleRedo = useCallback(() => {
    const nxt = redo();
    if (nxt) dispatch({ type: "SET_STATE", payload: nxt });
  }, [redo]);

  // drag/drop
  const onDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;

      const { source, destination, draggableId } = result;

      if (source.droppableId.startsWith("sidebar") && destination.droppableId === "blocks") {
        const newBlock: Block = { type: draggableId as BlockType, ...(defaultParams[draggableId] ?? {}) };
        const arr = Array.from(state.blocks);
        arr.splice(destination.index, 0, newBlock);

        dispatch({ type: "REORDER_BLOCKS", payload: arr });
        updateHistory({ ...state, blocks: arr });
        return;
      }

      if (source.droppableId === "blocks" && destination.droppableId === "blocks") {
        const arr = Array.from(state.blocks);
        const [moved] = arr.splice(source.index, 1);
        arr.splice(destination.index, 0, moved);

        dispatch({ type: "REORDER_BLOCKS", payload: arr });
        updateHistory({ ...state, blocks: arr });
        return;
      }
    },
    [state, updateHistory],
  );

  const groupedView = useMemo(() => groupBlocks(state.blocks), [state.blocks]);

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="mx-auto mt-4 w-full max-w-[1400px] px-4">
        {/* Toolbar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="text-2xl font-bold md:text-3xl">Graphical Program Editor</div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditMode((v) => !v)}>
              {editMode ? <PiEyeBold className="mr-2 h-4 w-4" /> : <PiPencilBold className="mr-2 h-4 w-4" />}
              {editMode ? "View" : "Edit"}
            </Button>

            <div className="flex items-center">
              <Button size="sm" variant="outline" onClick={handleUndo} className="rounded-r-none">
                <PiArrowUUpLeft className="mr-2 h-4 w-4" />
                Undo
              </Button>
              <Button size="sm" variant="outline" onClick={handleRedo} className="rounded-l-none border-l-0">
                <PiArrowUUpRight className="mr-2 h-4 w-4" />
                Redo
              </Button>
            </div>

            <Separator orientation="vertical" className="mx-1 h-6" />

            <Button size="sm" variant="secondary" onClick={createNewProgram}>
              New Program
            </Button>

            <Button size="sm" variant="secondary" onClick={() => setDrawerOpen(true)}>
              Manage Programs
            </Button>

            <Button size="sm" onClick={saveCurrentProgram}>
              <PiFloppyDisk className="mr-2 h-4 w-4" />
              Save locally
            </Button>

            <Button size="sm" variant="secondary" onClick={() => exportCode({ download: true })}>
              <PiDownloadSimple className="mr-2 h-4 w-4" />
              Download Code
            </Button>

            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={runInSimulator}>
              <PiPlayCircleFill className="mr-2 h-4 w-4" />
              Run in Simulator
            </Button>

            <Button size="sm" variant="outline" onClick={validateSyntax}>
              <PiCheckSquareOffset className="mr-2 h-4 w-4" />
              Validate
            </Button>
          </div>
        </div>

        {/* Variables Panel */}
        {editMode ? (
          <div className="mb-6">
            <VariableEditor variables={state.variables} dispatch={dispatch} />
          </div>
        ) : (
          <div className="mb-6 rounded-md bg-black p-4">
            {state.variables.length > 0 && (
              <>
                <div className="mb-2 font-mono text-sm text-green-400">// Variable Declarations</div>
                {renderVariableDeclarations(state.variables)}
              </>
            )}
          </div>
        )}

        {/* Blocks Panel */}
        {editMode ? (
          <div className="relative">
            <Sidebar expanded={sidebarExpanded} setExpanded={setSidebarExpanded} />
            <div className={sidebarExpanded ? "ml-[250px] transition-all duration-300" : "ml-[70px] transition-all duration-300"}>
              <BlockEditor state={state} dispatch={dispatch} filter={filter} />
            </div>
          </div>
        ) : (
          <div className="rounded-md bg-black p-4">
            <div className="mb-2 font-mono text-sm text-green-400">// Main Program</div>
            {state.blocks.length > 0 ? <div className="text-sm">{renderGroupedBlocks(groupedView)}</div> : <div className="text-sm text-zinc-500">No blocks added.</div>}
          </div>
        )}

        {/* Program Manager Drawer */}
        <ProgramManagerDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} editorKey={editorKey} runnerKey="runLogsPrograms" />
      </div>
    </DragDropContext>
  );
}
