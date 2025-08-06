/* eslint-disable no-new-func */
import React, { useRef, useState, useMemo } from "react";
import {
    Box,
    Button,
    HStack,
    Input,
    NumberInput,
    NumberInputField,
    Popover,
    PopoverArrow,
    PopoverBody,
    PopoverContent,
    PopoverTrigger,
    Select,
    Text,
} from "@chakra-ui/react";
import { PiCheck } from "react-icons/pi";

export function MathEditor({
    block,
    index,
    variables,
    updateBlock,
}) {
    // pull names + numeric values
    const varNames = useMemo(() => variables.map(v => v.name), [variables]);
    const varValues = useMemo(() =>
        variables.map(v => {
            const n = parseFloat(v.value);
            return isNaN(n) ? 0 : n;
        }),
        [variables]);

    // refs + state for toolbar & autocomplete
    const inputRef = useRef(null);
    const [tempNum, setTempNum] = useState("");
    const [auto, setAuto] = useState({ open: false, suggestions: [], range: [0, 0] });

    // 1) compute preview only when expression or vars change
    const preview = useMemo(() => {
        try {
            const fn = new Function(...varNames, `return ${block.expression || "0"};`);
            return fn(...varValues);
        } catch {
            return null;
        }
    }, [block.expression, varNames, varValues]);

    // 3) typing + autocomplete logic (unchanged)
    const handleExprChange = e => {
        const expr = e.target.value;
        updateBlock(index, "expression", expr);
        const pos = e.target.selectionStart;
        const m = expr.slice(0, pos).match(/([A-Za-z_][A-Za-z0-9_]*)$/);
        if (m) {
            const [full, partial] = m;
            setAuto({
                open: true,
                suggestions: varNames.filter(n => n.startsWith(partial)),
                range: [pos - full.length, pos]
            });
        } else {
            setAuto({ open: false, suggestions: [], range: [0, 0] });
        }
    };

    // 4) insert toolbar text at cursor
    const insertAtCursor = text => {
        const inp = inputRef.current;
        if (!inp) return;
        const { value, selectionStart: s, selectionEnd: e } = inp;
        const next = value.slice(0, s) + text + value.slice(e);
        updateBlock(index, "expression", next);
        setTimeout(() => {
            inp.setSelectionRange(s + text.length, s + text.length);
            inp.focus();
        }, 0);
    };

    // 5) pick autocomplete
    const pick = name => {
        const [s, e] = auto.range;
        const old = block.expression || "";
        const next = old.slice(0, s) + name + old.slice(e);
        updateBlock(index, "expression", next);
        setAuto({ open: false, suggestions: [], range: [0, 0] });
    };

    return (
        <>
            {/* Target Var dropdown */}
            <HStack spacing={2} mb={2}>
                <Text w="100px" fontSize="sm">Target Var:</Text>
                <Select
                    size="sm"
                    value={block.varName || ""}
                    placeholder="result"
                    onChange={e => updateBlock(index, "varName", e.target.value)}
                >
                    {varNames.map(n => <option key={n} value={n}>{n}</option>)}
                </Select>
            </HStack>

            {/* Operator / paren / var / number toolbar */}
            <HStack spacing={1} mb={2}>
                {["+", "-", "*", "/", "(", ")"].map(op => (
                    <Button key={op} size="xs" onClick={() => insertAtCursor(op)}>{op}</Button>
                ))}
                <Select
                    size="xs"
                    w="80px"
                    placeholder="Var"
                    onChange={e => insertAtCursor(e.target.value)}
                >
                    {varNames.map(n => <option key={n} value={n}>{n}</option>)}
                </Select>
                <NumberInput
                    size="xs"
                    w="80px"
                    value={tempNum}
                    onChange={setTempNum}
                >
                    <NumberInputField placeholder="123" />
                </NumberInput>
                <Button
                    size="xs"
                    onClick={() => { insertAtCursor(tempNum); setTempNum(""); }}
                >
                    #
                </Button>
            </HStack>

            {/* Expression + autocomplete */}
            <Popover
                isOpen={auto.open}
                placement="bottom-start"
                onClose={() => setAuto({ open: false, suggestions: [], range: [0, 0] })}
            >
                <PopoverTrigger>
                    <Input
                        size="sm"
                        ref={inputRef}
                        placeholder="e.g. a + b * 2"
                        value={block.expression || ""}
                        onChange={handleExprChange}
                    />
                </PopoverTrigger>
                <PopoverContent w="200px">
                    <PopoverArrow />
                    <PopoverBody p={1}>
                        {auto.suggestions.map(sug => (
                            <Box
                                key={sug}
                                p={1}
                                _hover={{ bg: "gray.100", cursor: "pointer" }}
                                onClick={() => pick(sug)}
                            >
                                {sug}
                            </Box>
                        ))}
                    </PopoverBody>
                </PopoverContent>
            </Popover>

            {/* Live preview badge */}
            {preview !== null && (
                <Text fontSize="xs" color="gray.400" mt={1}>
                    <PiCheck style={{ verticalAlign: "middle", marginRight: 4 }} />
                    {preview}
                </Text>
            )}
        </>
    );
}
