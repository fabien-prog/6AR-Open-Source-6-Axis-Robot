/* eslint-disable no-new-func */
import React, { useCallback, useMemo, useState } from "react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { PiArrowDown, PiArrowUp, PiCheck, PiCopy, PiHouseBold, PiMapPinAreaBold, PiPencilSimple, PiSpeedometer, PiTarget, PiTerminal, PiTrash } from "react-icons/pi";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { MathEditor } from "./MathEditor";
import { useRobotIO } from "@/contexts/robot";

// Accent colors per block type (use border-left inline)
const blockColors: Record<string, string> = {
  "Move L": "#3b82f6",
  "Move J": "#3b82f6",
  Home: "#ef4444",
  If: "#22d3ee",
  Else: "#eab308",
  "End If": "#71717a",
  Counter: "#14b8a6",
  Then: "#22c55e",
  "For Loop": "#ec4899",
  "End For": "#ec4899",
  "Console Log": "#a855f7",
  Math: "#f97316",
  SetDO: "#60a5fa",
  WaitDI: "#60a5fa",
};

function computeIndentLevels(blocks: any[]) {
  const levels: number[] = [];
  let indent = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "End If" || b.type === "End For") indent = Math.max(indent - 1, 0);
    levels.push(indent);
    if (b.type === "If" || b.type === "For Loop") indent += 1;
  }
  return levels;
}

function renderSummary(block: any, variables: any[] = []) {
  switch (block.type) {
    case "Move L": {
      const src = block.src || "manual";
      const pt = src === "manual"
        ? `[${block.x ?? 0}, ${block.y ?? 0}, ${block.z ?? 0}]`
        : block.pointVariable || "—";
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="gap-2 px-3 py-1">
            <PiTarget className="h-4 w-4" /> {pt}
          </Badge>
          <Badge variant="secondary" className="gap-2 px-3 py-1">
            <PiSpeedometer className="h-4 w-4" /> {block.speed} mm/s
          </Badge>
          <Badge variant="secondary" className="gap-2 px-3 py-1">
            <PiMapPinAreaBold className="h-4 w-4" /> {block.referenceType === "WObj" ? block.referenceObject || "–" : "World"}
          </Badge>
        </div>
      );
    }

    case "Move J": {
      const src = block.src || "manual";
      let pt: string;

      if (src === "manual") {
        if (block.moveMode === "joint") {
          pt = `[${(block.joints || []).join(",")}]`;
        } else {
          pt = block.cartesian || "—";
        }
      } else {
        pt = block.pointVariable || "—";
      }

      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-2 px-3 py-1">
            {block.moveMode === "joint" ? "Joint" : "Cartesian"}
          </Badge>

          <Badge className="gap-2 px-3 py-1">
            <PiTarget className="h-4 w-4" /> {pt}
          </Badge>

          <Badge variant="secondary" className="gap-2 px-3 py-1">
            <PiSpeedometer className="h-4 w-4" /> {block.speed} °/s
          </Badge>

          <Badge variant="secondary" className="gap-2 px-3 py-1">
            <PiMapPinAreaBold className="h-4 w-4" /> {block.referenceType === "WObj" ? block.referenceObject || "–" : "World"}
          </Badge>
        </div>
      );
    }

    case "Home":
      return (
        <Badge variant="destructive" className="gap-2 px-3 py-1">
          <PiHouseBold className="h-4 w-4" /> Home all axes
        </Badge>
      );

    case "SetDO":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="px-3 py-1">Set Digital Output {block.pin} to:</Badge>
          <Badge variant={block.state === "1" ? "default" : "secondary"} className="px-3 py-1">
            {block.state}
          </Badge>
        </div>
      );

    case "WaitDI":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="px-3 py-1">Wait for Digital Input {block.pin} to be:</Badge>
          <Badge variant={block.state === "1" ? "default" : "secondary"} className="px-3 py-1">
            {block.state}
          </Badge>
        </div>
      );

    case "If": {
      const left = block.variableSource === "IO" ? block.io : block.variableSource === "Variable" ? block.io : block.condition;

      return (
        <Badge variant="secondary" className="px-3 py-1">
          {left} {block.operator} {block.value}
        </Badge>
      );
    }

    case "For Loop":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="px-3 py-1">
            {block.counter || "START"}: {block.start}
          </Badge>
          <Badge variant="secondary" className="px-3 py-1">
            end: {block.end}
          </Badge>
          <Badge variant="secondary" className="px-3 py-1">
            step: {block.step}
          </Badge>
        </div>
      );

    case "Counter":
      return (
        <Badge variant="secondary" className="px-3 py-1">
          {block.name} : {block.initial} → {block.target} (+{block.increment})
        </Badge>
      );

    case "Then":
      return (
        <Badge className="gap-2 px-3 py-1">
          <PiCheck className="h-4 w-4" /> {block.action} {block.targetCounter}
        </Badge>
      );

    case "Console Log":
      return (
        <Badge variant="secondary" className="gap-2 px-3 py-1">
          <PiTerminal className="h-4 w-4" /> console.{block.level}("{block.message}")
        </Badge>
      );

    case "Math": {
      let preview: any = "—";
      try {
        const names = variables.map((v) => v.name);
        const values = variables.map((v) => {
          const n = parseFloat(v.value);
          return Number.isNaN(n) ? 0 : n;
        });
        const fn = new Function(...names, `return ${block.expression || "0"};`);
        preview = fn(...values);
      } catch {}

      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="px-3 py-1">{block.varName || "—"}</Badge>
          <Badge variant="secondary" className="px-3 py-1">
            {block.expression || "—"}
          </Badge>
          <Badge className="gap-2 px-3 py-1">
            <PiCheck className="h-4 w-4" /> {String(preview)}
          </Badge>
        </div>
      );
    }

    default:
      return null;
  }
}

function NumberGrid6({ value, onChange }: { value: string[] | undefined; onChange: (next: string[]) => void }) {
  const joints = value && value.length === 6 ? value : ["", "", "", "", "", ""];
  return (
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: 6 }).map((_, j) => (
        <Input
          key={j}
          className="h-8"
          placeholder={`J${j + 1}`}
          inputMode="decimal"
          value={joints[j] ?? ""}
          onChange={(e) => {
            const next = [...joints];
            next[j] = e.target.value;
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}

function BlockEditorInner({ state, dispatch, filter }: { state: any; dispatch: React.Dispatch<any>; filter: string }) {
const { digitalInputs, digitalOutputs } = useRobotIO();

  const indentLevels = useMemo(() => computeIndentLevels(state.blocks), [state.blocks]);

  const visible = useMemo(() => {
    const f = (filter || "").toLowerCase();
    return state.blocks.map((blk: any, i: number) => ({ blk, i })).filter(({ blk }: any) => blk.type.toLowerCase().includes(f) || (blk.comment || "").toLowerCase().includes(f));
  }, [state.blocks, filter]);

  const [logAutocomplete, setLogAutocomplete] = useState<{
    openForIndex: number | null;
    replaceRange: [number, number];
    suggestions: string[];
  }>({ openForIndex: null, replaceRange: [0, 0], suggestions: [] });

  const updateBlock = useCallback((i: number, field: string, val: any) => dispatch({ type: "UPDATE_BLOCK", index: i, payload: { [field]: val } }), [dispatch]);

  const removeBlock = useCallback((i: number) => dispatch({ type: "REMOVE_BLOCK", index: i }), [dispatch]);

  const duplicateBlock = useCallback(
    (i: number) => {
      const copy = { ...state.blocks[i] };
      const arr = [...state.blocks];
      arr.splice(i + 1, 0, copy);
      dispatch({ type: "REORDER_BLOCKS", payload: arr });
    },
    [dispatch, state.blocks],
  );

  const moveBlock = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= state.blocks.length) return;
      const arr = [...state.blocks];
      const [blk] = arr.splice(from, 1);
      arr.splice(to, 0, blk);
      dispatch({ type: "REORDER_BLOCKS", payload: arr });
    },
    [dispatch, state.blocks],
  );

  const renderBlockParams = useCallback(
    (block: any, index: number) => {
      if (!block) return null;
      switch (block.type) {
        case "Move L": {
          const src = block.src || "manual";
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-[100px] text-xs text-muted-foreground">Source:</div>
                <Select value={src} onValueChange={(v) => updateBlock(index, "src", v)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="variable">RobTarget Var</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {src === "manual" ? (
                <>
                  <div className="text-xs font-medium text-muted-foreground pt-1">Position (m)</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(["x", "y", "z"] as const).map((k) => (
                      <Input key={k} className="h-8" placeholder={k.toUpperCase()} inputMode="decimal"
                        value={block[k] ?? ""} onChange={(e) => updateBlock(index, k, e.target.value)} />
                    ))}
                  </div>
                  <div className="text-xs font-medium text-muted-foreground pt-1">Orientation A/B/C (°)</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(["a", "b", "c"] as const).map((k) => (
                      <Input key={k} className="h-8" placeholder={k.toUpperCase()} inputMode="decimal"
                        value={block[k] ?? ""} onChange={(e) => updateBlock(index, k, e.target.value)} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-[100px] text-xs text-muted-foreground">Point Var:</div>
                  <Select value={block.pointVariable || ""} onValueChange={(v) => updateBlock(index, "pointVariable", v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="-- Select RobTarget --" /></SelectTrigger>
                    <SelectContent>
                      {state.variables.filter((v: any) => String(v.type).includes("Robot Target") && v.name?.trim()).map((v: any, i: number) => (
                        <SelectItem key={i} value={v.name}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="w-[110px] text-xs text-muted-foreground">Speed (mm/s):</div>
                <Input className="h-8" inputMode="decimal" value={block.speed || ""} onChange={(e) => updateBlock(index, "speed", e.target.value)} />
              </div>

              {src === "manual" && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-[110px] text-xs text-muted-foreground">Ang Speed (°/s):</div>
                    <Input className="h-8" inputMode="decimal" value={block.angular_speed_deg || ""} onChange={(e) => updateBlock(index, "angular_speed_deg", e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-[110px] text-xs text-muted-foreground">Accel (m/s²):</div>
                    <Input className="h-8" inputMode="decimal" value={block.accel || ""} onChange={(e) => updateBlock(index, "accel", e.target.value)} />
                  </div>
                </>
              )}
            </div>
          );
        }

        case "Move J": {
          const src = block.src || "manual";
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-[100px] text-xs text-muted-foreground">Source:</div>
                <Select value={src} onValueChange={(v) => updateBlock(index, "src", v)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual Joints</SelectItem>
                    <SelectItem value="variable">RobTarget Var</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {src === "manual" ? (
                <NumberGrid6 value={block.joints} onChange={(joints) => updateBlock(index, "joints", joints)} />
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-[100px] text-xs text-muted-foreground">Point Var:</div>
                  <Select value={block.pointVariable || ""} onValueChange={(v) => updateBlock(index, "pointVariable", v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="-- Select RobTarget --" /></SelectTrigger>
                    <SelectContent>
                      {state.variables.filter((v: any) => String(v.type).includes("Robot Target") && v.name?.trim()).map((v: any, i: number) => (
                        <SelectItem key={i} value={v.name}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="w-[100px] text-xs text-muted-foreground">Mode:</div>
                <Select value={block.moveMode || "cartesian"} onValueChange={(v) => updateBlock(index, "moveMode", v)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cartesian">Cartesian</SelectItem>
                    <SelectItem value="joint">Joint Angles</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {src === "manual" && block.moveMode === "cartesian" && (
                <div className="flex items-center gap-2">
                  <div className="w-[100px] text-xs text-muted-foreground">Cartesian:</div>
                  <Input className="h-8" placeholder="X, Y, Z, Rx, Ry, Rz" value={block.cartesian || ""} onChange={(e) => updateBlock(index, "cartesian", e.target.value)} />
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="w-[100px] text-xs text-muted-foreground">Reference:</div>
                <Select value={block.referenceType || "World"} onValueChange={(v) => updateBlock(index, "referenceType", v)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="World">World</SelectItem>
                    <SelectItem value="WObj">Work Object</SelectItem>
                  </SelectContent>
                </Select>
                {block.referenceType === "WObj" && (
                  <Select value={block.referenceObject || ""} onValueChange={(v) => updateBlock(index, "referenceObject", v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="-- Select WObj --" /></SelectTrigger>
                    <SelectContent>
                      {state.variables.filter((v: any) => String(v.type).includes("Work Object") && v.name?.trim()).map((v: any, i: number) => (
                        <SelectItem key={i} value={v.name}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="w-[100px] text-xs text-muted-foreground">Speed (°/s):</div>
                <Input className="h-8" inputMode="decimal" value={block.speed || ""} onChange={(e) => updateBlock(index, "speed", e.target.value)} />
              </div>
            </div>
          );
        }

        case "Home":
          return <div className="text-xs text-muted-foreground">No parameters required.</div>;

        case "SetDO":
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-[100px] text-xs text-muted-foreground">Pin:</div>
                <Select value={String(block.pin ?? "")} onValueChange={(v) => updateBlock(index, "pin", v)}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {digitalOutputs.map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        DO_{o.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-[100px] text-xs text-muted-foreground">State:</div>
                <Select value={String(block.state ?? "1")} onValueChange={(v) => updateBlock(index, "state", v)}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0</SelectItem>
                    <SelectItem value="1">1</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="text-xs text-muted-foreground">
                Preview: SetDO(DO_{block.pin},{block.state});
              </div>
            </div>
          );

        case "WaitDI":
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-[100px] text-xs text-muted-foreground">Pin:</div>
                <Select value={String(block.pin ?? "")} onValueChange={(v) => updateBlock(index, "pin", v)}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {digitalInputs.map((di: any) => (
                      <SelectItem key={di.id} value={String(di.id)}>
                        DI_{di.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-[100px] text-xs text-muted-foreground">State:</div>
                <Select value={String(block.state ?? "1")} onValueChange={(v) => updateBlock(index, "state", v)}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0</SelectItem>
                    <SelectItem value="1">1</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="text-xs text-muted-foreground">
                Preview: WaitDI(DI_{block.pin},{block.state});
              </div>
            </div>
          );

        case "If": {
          const source = block.variableSource || "IO";

          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-[80px] text-xs text-muted-foreground">Variable:</div>

                <Select value={source} onValueChange={(v) => updateBlock(index, "variableSource", v)}>
                  <SelectTrigger className="h-8 w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IO">I/O</SelectItem>
                    <SelectItem value="Variable">Variable</SelectItem>
                    <SelectItem value="Constant">Constant</SelectItem>
                  </SelectContent>
                </Select>

                {source === "IO" && (
                  <Select value={block.io || "DI_1"} onValueChange={(v) => updateBlock(index, "io", v)}>
                    <SelectTrigger className="h-8 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["DI_1", "DI_2", "DI_3", "DI_4", "DI_5", "DI_6", "DI_7", "DI_8"].map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {source === "Variable" && (
                  <Select value={block.io || ""} onValueChange={(v) => updateBlock(index, "io", v)}>
                    <SelectTrigger className="h-8 flex-1">
                      <SelectValue placeholder="-- Select variable --" />
                    </SelectTrigger>
                    <SelectContent>
                      {state.variables.filter((v: any) => v.name?.trim()).map((v: any, i: number) => (
                        <SelectItem key={i} value={v.name}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {source === "Constant" && <Input className="h-8 flex-1" placeholder="Constant" value={block.condition || ""} onChange={(e) => updateBlock(index, "condition", e.target.value)} />}
              </div>

              <div className="flex items-center gap-2">
                <div className="w-[80px] text-xs text-muted-foreground">Operator:</div>
                <Select value={block.operator || "=="} onValueChange={(v) => updateBlock(index, "operator", v)}>
                  <SelectTrigger className="h-8 w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="==">==</SelectItem>
                    <SelectItem value="!=">!=</SelectItem>
                    <SelectItem value="<">{"<"}</SelectItem>
                    <SelectItem value=">">{">"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-[80px] text-xs text-muted-foreground">Value:</div>
                <Input className="h-8 flex-1" placeholder="Value" value={block.value || ""} onChange={(e) => updateBlock(index, "value", e.target.value)} />
              </div>
            </div>
          );
        }

        case "Counter":
          return (
            <div className="space-y-2">
              {(["name", "initial", "increment", "target"] as const).map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <div className="w-[80px] text-xs text-muted-foreground">{k.charAt(0).toUpperCase() + k.slice(1)}:</div>
                  <Input className="h-8 flex-1" value={block[k] ?? ""} onChange={(e) => updateBlock(index, k, e.target.value)} placeholder={k} />
                </div>
              ))}
            </div>
          );

        case "Then":
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-[80px] text-xs text-muted-foreground">Action:</div>
                <Select value={block.action || "Decrease Counter"} onValueChange={(v) => updateBlock(index, "action", v)}>
                  <SelectTrigger className="h-8 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Decrease Counter">Decrease Counter</SelectItem>
                    <SelectItem value="Increase Counter">Increase Counter</SelectItem>
                    <SelectItem value="Set Counter">Set Counter</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-[80px] text-xs text-muted-foreground">Target:</div>
                <Input className="h-8 flex-1" placeholder="Counter name" value={block.targetCounter || ""} onChange={(e) => updateBlock(index, "targetCounter", e.target.value)} />
              </div>
            </div>
          );

        case "For Loop": {
          const numberVars = state.variables.filter((v: any) => v.dataType === "Number" && v.name?.trim());
          const endSource = block.endSource || "Literal";

          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-[80px] text-xs text-muted-foreground">Counter:</div>
                <Select value={block.counter || ""} onValueChange={(v) => updateBlock(index, "counter", v)}>
                  <SelectTrigger className="h-8 flex-1">
                    <SelectValue placeholder="Select variable" />
                  </SelectTrigger>
                  <SelectContent>
                    {numberVars.map((v: any, i: number) => (
                      <SelectItem key={i} value={v.name}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-[80px] text-xs text-muted-foreground">End Src:</div>
                <Select value={endSource} onValueChange={(v) => updateBlock(index, "endSource", v)}>
                  <SelectTrigger className="h-8 w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Literal">Literal</SelectItem>
                    <SelectItem value="Variable">Constant</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {endSource === "Literal" ? (
                <div className="flex items-center gap-2">
                  <div className="w-[80px] text-xs text-muted-foreground">End:</div>
                  <Input className="h-8 flex-1" type="number" value={block.end ?? ""} onChange={(e) => updateBlock(index, "end", e.target.value)} />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-[80px] text-xs text-muted-foreground">End Var:</div>
                  <Select value={block.end || ""} onValueChange={(v) => updateBlock(index, "end", v)}>
                    <SelectTrigger className="h-8 flex-1">
                      <SelectValue placeholder="Select variable" />
                    </SelectTrigger>
                    <SelectContent>
                      {numberVars.map((v: any, i: number) => (
                        <SelectItem key={i} value={v.name}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="w-[80px] text-xs text-muted-foreground">Start:</div>
                <Input className="h-8 flex-1" type="number" value={block.start ?? ""} onChange={(e) => updateBlock(index, "start", e.target.value)} />
              </div>

              <div className="flex items-center gap-2">
                <div className="w-[80px] text-xs text-muted-foreground">Step:</div>
                <Input className="h-8 flex-1" type="number" value={block.step ?? ""} onChange={(e) => updateBlock(index, "step", e.target.value)} />
              </div>
            </div>
          );
        }

        case "Console Log": {
          const vars = state.variables.map((v: any) => v.name);

          const handleMsgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const msg = e.target.value;
            updateBlock(index, "message", msg);

            const pos = e.target.selectionStart ?? msg.length;
            const prefix = msg.slice(0, pos).match(/\$([A-Za-z0-9_]*)$/);
            if (prefix) {
              const [full, partial] = prefix;
              const suggestions = vars.filter((n: string) => n.startsWith(partial));
              setLogAutocomplete({
                openForIndex: index,
                replaceRange: [pos - full.length, pos],
                suggestions,
              });
            } else {
              setLogAutocomplete({ openForIndex: null, replaceRange: [0, 0], suggestions: [] });
            }
          };

          const selectSuggestion = (name: string) => {
            const [start, end] = logAutocomplete.replaceRange;
            const old = block.message || "";
            const filled = old.slice(0, start) + "$" + name + old.slice(end);
            updateBlock(index, "message", filled);
            setLogAutocomplete({ openForIndex: null, replaceRange: [0, 0], suggestions: [] });
          };

          const preview = (block.message || "").replace(/\$([A-Za-z0-9_]+)/g, (_: any, n: string) => {
            const find = state.variables.find((v: any) => v.name === n);
            return find ? find.value : `$${n}`;
          });

          return (
            <div className="space-y-2">
              <Popover
                open={logAutocomplete.openForIndex === index}
                onOpenChange={(open) => {
                  if (!open) setLogAutocomplete({ openForIndex: null, replaceRange: [0, 0], suggestions: [] });
                }}
              >
                <PopoverTrigger asChild>
                  <Input className="h-8" placeholder='console.log("…")' value={block.message || ""} onChange={handleMsgChange} />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[220px] p-1">
                  <div className="max-h-[220px] overflow-auto">
                    {logAutocomplete.suggestions.map((s) => (
                      <button key={s} className="w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-accent" onClick={() => selectSuggestion(s)} type="button">
                        {s}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {preview && <div className="text-xs text-muted-foreground">Preview: {preview}</div>}
            </div>
          );
        }

        case "Else":
        case "End For":
        case "End If":
          return <div className="text-xs text-muted-foreground">No parameters required.</div>;

        case "Math":
          return <MathEditor block={block} index={index} variables={state.variables} updateBlock={updateBlock} />;

        default:
          return null;
      }
    },
    [digitalInputs, digitalOutputs, state.variables, logAutocomplete, updateBlock],
  );

  return (
    <Droppable droppableId="blocks" direction="vertical">
      {(provided: any) => (
        <TooltipProvider>
          <div ref={provided.innerRef} {...provided.droppableProps} className="min-h-[300px] space-y-3 rounded-md border border-zinc-700 p-2">
            {visible.map(({ blk: block, i: origIdx }: any) => {
              const indent = indentLevels[origIdx] * 80;
              const leftColor = blockColors[block.type] || "#3b82f6";

              return (
                <Draggable key={origIdx} draggableId={`${origIdx}`} index={origIdx}>
                  {(prov: any) => (
                    <div
                      ref={prov.innerRef}
                      {...prov.draggableProps}
                      {...prov.dragHandleProps}
                      className={cn("rounded-md bg-zinc-900 p-4 transition hover:bg-zinc-800 hover:shadow-lg")}
                      style={{
                        marginLeft: indent,
                        width: `calc(100% - ${indent}px)`,
                        borderLeftWidth: 8,
                        borderLeftStyle: "solid",
                        borderLeftColor: leftColor,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-lg font-semibold text-zinc-100">{block.type}</div>
                          {renderSummary(block, state.variables)}
                        </div>

                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="secondary" onClick={() => moveBlock(origIdx, origIdx - 1)}>
                                <PiArrowUp />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Move Up</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="secondary" onClick={() => moveBlock(origIdx, origIdx + 1)}>
                                <PiArrowDown />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Move Down</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="secondary" onClick={() => duplicateBlock(origIdx)}>
                                <PiCopy />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Duplicate</TooltipContent>
                          </Tooltip>

                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="default" className="h-9">
                                <PiPencilSimple className="mr-2 h-4 w-4" />
                                Edit
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[420px]">
                              <div className="mb-2 text-sm font-semibold">Edit {block.type}</div>
                              <div className="space-y-3">
                                {renderBlockParams(block, origIdx)}
                                <Input className="h-8" value={block.comment || ""} placeholder="Comment…" onChange={(e) => updateBlock(origIdx, "comment", e.target.value)} />
                              </div>
                            </PopoverContent>
                          </Popover>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="destructive" onClick={() => removeBlock(origIdx)}>
                                <PiTrash />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  )}
                </Draggable>
              );
            })}

            {provided.placeholder}
          </div>
        </TooltipProvider>
      )}
    </Droppable>
  );
}

export default React.memo(BlockEditorInner);
