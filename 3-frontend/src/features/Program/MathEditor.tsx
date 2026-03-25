/* eslint-disable no-new-func */
import React, { useMemo, useRef, useState } from "react";
import { PiCheck } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type VariableItem = { name: string; value: string };

export function MathEditor({ block, index, variables, updateBlock }: { block: any; index: number; variables: VariableItem[]; updateBlock: (index: number, field: string, value: any) => void }) {
  const varNames = useMemo(() => variables.map((v) => v.name), [variables]);
  const varValues = useMemo(
    () =>
      variables.map((v) => {
        const n = parseFloat(v.value);
        return Number.isNaN(n) ? 0 : n;
      }),
    [variables],
  );

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [tempNum, setTempNum] = useState<string>("");

  const [auto, setAuto] = useState<{
    open: boolean;
    suggestions: string[];
    range: [number, number];
  }>({ open: false, suggestions: [], range: [0, 0] });

  const preview = useMemo(() => {
    try {
      const fn = new Function(...varNames, `return ${block.expression || "0"};`);
      return fn(...varValues);
    } catch {
      return null;
    }
  }, [block.expression, varNames, varValues]);

  const handleExprChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const expr = e.target.value;
    updateBlock(index, "expression", expr);

    const pos = e.target.selectionStart ?? expr.length;
    const m = expr.slice(0, pos).match(/([A-Za-z_][A-Za-z0-9_]*)$/);

    if (m) {
      const [full, partial] = m;
      setAuto({
        open: true,
        suggestions: varNames.filter((n) => n.startsWith(partial)),
        range: [pos - full.length, pos],
      });
    } else {
      setAuto({ open: false, suggestions: [], range: [0, 0] });
    }
  };

  const insertAtCursor = (text: string) => {
    const inp = inputRef.current;
    if (!inp) return;
    const value = inp.value ?? "";
    const s = inp.selectionStart ?? value.length;
    const e = inp.selectionEnd ?? value.length;

    const next = value.slice(0, s) + text + value.slice(e);
    updateBlock(index, "expression", next);

    requestAnimationFrame(() => {
      inp.setSelectionRange(s + text.length, s + text.length);
      inp.focus();
    });
  };

  const pick = (name: string) => {
    const [s, e] = auto.range;
    const old = block.expression || "";
    const next = old.slice(0, s) + name + old.slice(e);
    updateBlock(index, "expression", next);
    setAuto({ open: false, suggestions: [], range: [0, 0] });
  };

  return (
    <div className="space-y-2">
      {/* Target Var dropdown */}
      <div className="flex items-center gap-2">
        <div className="w-[100px] text-xs text-muted-foreground">Target Var:</div>
        <Select value={block.varName || ""} onValueChange={(v) => updateBlock(index, "varName", v)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="result" />
          </SelectTrigger>
          <SelectContent>
            {varNames.map((n) => (
              <SelectItem key={n} value={n}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1">
        {["+", "-", "*", "/", "(", ")"].map((op) => (
          <Button key={op} size="sm" variant="secondary" className="h-7 px-2" onClick={() => insertAtCursor(op)} type="button">
            {op}
          </Button>
        ))}

        <Select onValueChange={(v) => insertAtCursor(v)}>
          <SelectTrigger className="h-7 w-[110px]">
            <SelectValue placeholder="Var" />
          </SelectTrigger>
          <SelectContent>
            {varNames.map((n) => (
              <SelectItem key={n} value={n}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input className="h-7 w-[110px]" placeholder="123" value={tempNum} onChange={(e) => setTempNum(e.target.value)} inputMode="decimal" />

        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2"
          onClick={() => {
            if (tempNum.trim()) insertAtCursor(tempNum.trim());
            setTempNum("");
          }}
          type="button"
        >
          #
        </Button>
      </div>

      {/* Expression + autocomplete */}
      <Popover
        open={auto.open}
        onOpenChange={(open) => {
          if (!open) setAuto({ open: false, suggestions: [], range: [0, 0] });
        }}
      >
        <PopoverTrigger asChild>
          <Input ref={inputRef} className="h-8" placeholder="e.g. a + b * 2" value={block.expression || ""} onChange={handleExprChange} />
        </PopoverTrigger>

        <PopoverContent align="start" className="w-[220px] p-1">
          <div className="max-h-[220px] overflow-auto">
            {auto.suggestions.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">No matches</div>
            ) : (
              auto.suggestions.map((sug) => (
                <button key={sug} className="w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-accent" onClick={() => pick(sug)} type="button">
                  {sug}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Preview */}
      {preview !== null && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <PiCheck className="h-4 w-4" />
          <span>{String(preview)}</span>
        </div>
      )}
    </div>
  );
}
