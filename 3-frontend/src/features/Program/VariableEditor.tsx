import React, { useCallback } from "react";
import * as THREE from "three";
import { FiChevronDown, FiChevronUp, FiPlus, FiTrash2 } from "react-icons/fi";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useSocket } from "@/contexts/SocketContext";
import { useJointStore } from "../../stores/JointStore";

function fkOrientationToEulerDeg(ori: any): [number, number, number] {
  let q: THREE.Quaternion;

  if (Array.isArray(ori) && ori.length === 4 && ori.every((v) => Number.isFinite(v))) {
    q = new THREE.Quaternion(ori[0], ori[1], ori[2], ori[3]);
  } else if (
    Array.isArray(ori) && ori.length === 3 &&
    ori.every((row) => Array.isArray(row) && row.length === 3 && row.every((v) => Number.isFinite(v)))
  ) {
    const m = new THREE.Matrix4().set(
      ori[0][0], ori[0][1], ori[0][2], 0,
      ori[1][0], ori[1][1], ori[1][2], 0,
      ori[2][0], ori[2][1], ori[2][2], 0,
      0, 0, 0, 1,
    );
    q = new THREE.Quaternion().setFromRotationMatrix(m);
  } else {
    return [0, 0, 0];
  }

  const e = new THREE.Euler().setFromQuaternion(q, "XYZ");
  return [
    THREE.MathUtils.radToDeg(e.x),
    THREE.MathUtils.radToDeg(e.y),
    THREE.MathUtils.radToDeg(e.z),
  ];
}

const variableCategories = ["Variable (VAR)", "Constant (CONST)", "Work Object", "Robot Target"] as const;
const dataTypes = ["Boolean", "Number", "String", "Coordinate", "Array"] as const;
const repOptions = ["Cartesian", "Joint"] as const;

const rowBgDark: Record<string, string> = {
  "Variable (VAR)": "bg-emerald-950/50",
  "Constant (CONST)": "bg-yellow-950/40",
  "Work Object": "bg-orange-950/40",
  "Robot Target": "bg-blue-950/40",
};

export default function VariableEditor({
  variables,
  dispatch,
}: {
  variables: any[];
  dispatch: React.Dispatch<any>;
}) {
  const { socket } = useSocket();
  const anglesUi = useJointStore((s) => s.anglesUi);

  const addVariable = () => {
    dispatch({
      type: "ADD_VARIABLE",
      payload: {
        name: "",
        type: "Constant (CONST)",
        dataType: "Number",
        representation: "",
        value: "",
      },
    });
  };

  const updateVariable = useCallback(
    (index: number, field: string, value: any) =>
      dispatch({ type: "UPDATE_VARIABLE", index, payload: { [field]: value } }),
    [dispatch],
  );

  const removeVariable = useCallback(
    (index: number) => dispatch({ type: "REMOVE_VARIABLE", index }),
    [dispatch],
  );

  const moveVariable = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= variables.length) return;
      const arr = [...variables];
      const [v] = arr.splice(from, 1);
      arr.splice(to, 0, v);
      dispatch({ type: "REORDER_VARIABLES", payload: arr });
    },
    [variables, dispatch],
  );

  const teachVariable = useCallback(
    (index: number) => {
      const v = variables[index];
      // anglesUi is set by the 3D viewer (setAnglesUi) and always reflects
      // what's currently shown — reliable with or without a real robot.
      const angles = anglesUi.map(Number);

      if (v.type === "Robot Target" && v.representation === "Cartesian") {
        if (!socket) return;

        const onResponse = ({ position, orientation }: any) => {
          clearTimeout(timeout);
          const pos = Array.isArray(position) && position.length >= 3 ? position : [0, 0, 0];
          const [a, b, c] = fkOrientationToEulerDeg(orientation);
          const fmt = [
            +Number(pos[0]).toFixed(4),
            +Number(pos[1]).toFixed(4),
            +Number(pos[2]).toFixed(4),
            +a.toFixed(3),
            +b.toFixed(3),
            +c.toFixed(3),
          ].join(",");
          dispatch({ type: "UPDATE_VARIABLE", index, payload: { value: `(${fmt})` } });
        };

        // Safety: remove listener if Pi bridge doesn't respond within 3 s
        const timeout = window.setTimeout(() => {
          socket.off("fk_response", onResponse);
        }, 3000);

        socket.once("fk_response", onResponse);
        socket.emit("fk_request", { angles });
      } else if (v.type === "Work Object" || v.type === "Robot Target") {
        const fmt = angles.map((j) => +j.toFixed(3)).join(",");
        dispatch({ type: "UPDATE_VARIABLE", index, payload: { value: `(${fmt})` } });
      }
    },
    [variables, anglesUi, socket, dispatch],
  );

  return (
    <TooltipProvider>
      <div className="rounded-md border border-zinc-700 bg-zinc-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xl font-semibold text-zinc-100">Declarations</div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="secondary" onClick={addVariable}>
                <FiPlus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add Variable</TooltipContent>
          </Tooltip>
        </div>

        {variables.length > 0 && (
          <div className="mb-2 grid grid-cols-[2fr_1.5fr_1.5fr_1.5fr_2fr_1.5fr] gap-3 text-xs font-semibold text-zinc-400">
            <div>Name</div>
            <div>Category</div>
            <div>Data Type</div>
            <div>Rep.</div>
            <div>Value</div>
            <div className="text-center">Actions</div>
          </div>
        )}

        <div className="space-y-2">
          {variables.map((variable, i) => {
            const rowBg = rowBgDark[variable.type] || "bg-zinc-800/40";

            return (
              <div
                key={i}
                className={cn(
                  "grid grid-cols-[2fr_1.5fr_1.5fr_1.5fr_2fr_1.5fr] items-center gap-3 rounded-md p-2",
                  rowBg,
                )}
              >
                <Input
                  className="h-8"
                  placeholder="Name"
                  value={variable.name}
                  onChange={(e) => updateVariable(i, "name", e.target.value)}
                />

                <Select
                  value={variable.type}
                  onValueChange={(t) => {
                    updateVariable(i, "type", t);

                    if (t === "Robot Target") {
                      updateVariable(i, "representation", "Cartesian");
                      updateVariable(i, "dataType", "Coordinate");
                    } else {
                      updateVariable(i, "representation", "");
                    }
                    if (t === "Work Object") updateVariable(i, "dataType", "Coordinate");
                  }}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {variableCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={variable.dataType}
                  onValueChange={(v) => updateVariable(i, "dataType", v)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dataTypes.map((dt) => (
                      <SelectItem key={dt} value={dt}>
                        {dt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {variable.type === "Robot Target" ? (
                  <Select
                    value={variable.representation}
                    onValueChange={(v) => updateVariable(i, "representation", v)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {repOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div />
                )}

                <Input
                  className="h-8"
                  placeholder="Value / Data"
                  value={variable.value}
                  onChange={(e) => updateVariable(i, "value", e.target.value)}
                />

                <div className="flex justify-end gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="secondary" onClick={() => moveVariable(i, i - 1)}>
                        <FiChevronUp />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Move Up</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="secondary" onClick={() => moveVariable(i, i + 1)}>
                        <FiChevronDown />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Move Down</TooltipContent>
                  </Tooltip>

                  {["Work Object", "Robot Target"].includes(variable.type) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="secondary" className="h-8" onClick={() => teachVariable(i)}>
                          Teach
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Teach (from virtual joints)</TooltipContent>
                    </Tooltip>
                  )}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="destructive" onClick={() => removeVariable(i)}>
                        <FiTrash2 />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
