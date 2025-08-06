// src/components/BlockEditor.jsx
import React, { useMemo } from "react";
import {
  Box,
  Button,
  HStack,
  VStack,
  Text,
  Tooltip,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
  PopoverCloseButton,
  Select,
  Badge,
  PopoverHeader,
  PopoverBody,
  Input,
  NumberInput,
  NumberInputField,
  SimpleGrid,
  Icon
} from "@chakra-ui/react";
import { Draggable, Droppable } from "react-beautiful-dnd";
import {
  PiArrowUp,
  PiArrowDown,
  PiCopy,
  PiPencilSimple,
  PiTrash,
  PiTarget,
  PiCheck,
  PiSpeedometer,
  PiMapPinAreaBold,
  PiTerminal,
  PiHouseBold,
} from "react-icons/pi";
import { MathEditor } from "./MathEditor";

// 1) Accent colors for each block type
const blockColors = {
  "Move L": "primary.500",
  "Move J": "primary.500",
  Home: "red.500",
  If: "cyan.500",
  Else: "yellow.500",
  "End If": "gray.500",
  Counter: "teal.500",
  Then: "green.500",
  "For Loop": "pink.500",
  "End For": "pink.500",
  "Console Log": "purple.500",
};

// 2) Compute nesting levels for indentation
function computeIndentLevels(blocks) {
  const levels = [];
  let indent = 0;
  blocks.forEach((b) => {
    if (b.type === "End If" || b.type === "End For") {
      indent = Math.max(indent - 1, 0);
    }
    levels.push(indent);
    if (b.type === "If" || b.type === "For Loop") {
      indent += 1;
    }
  });
  return levels;
}

// Render a nice badge-based summary
function renderSummary(block, variables = []) {
  switch (block.type) {
    case "Move L":
    case "Move J": {
      // fall back to manual if unset
      const src = block.src || "manual";
      // if manual + MoveJ: respect moveMode, otherwise always Cartesian
      let pt;
      if (src === "manual") {
        if (block.type === "Move J" && block.moveMode === "joint") {
          pt = `[${(block.joints || []).join(",")}]`;
        } else {
          pt = block.cartesian || "—";
        }
      } else {
        pt = block.pointVariable || "—";
      }
      return (
        <HStack spacing={3} wrap="wrap">
          {block.type === "Move J" && (
            <Badge colorScheme="gray" display="inline-flex" alignItems="center" px={3} py={2} borderRadius="md" fontSize="sm">
              {block.moveMode === "joint" ? "Joint" : "Cartesian"}
            </Badge>
          )}
          <Badge
            display="inline-flex"
            alignItems="center"
            colorScheme="blue"
            px={3}
            py={2}
            borderRadius="md"
            fontSize="sm"
          >
            <Icon boxSize='16px' as={PiTarget} mr={2} /> {pt}
          </Badge>
          <Badge
            display="inline-flex"
            alignItems="center"
            colorScheme="green"
            px={3}
            py={2}
            borderRadius="md"
            fontSize="sm"
          >
            <Icon boxSize='16px' as={PiSpeedometer} mr={2} />{" "}
            {block.speed} {block.type === "Move L" ? "mm/s" : "°/s"}
          </Badge>
          <Badge
            display="inline-flex"
            alignItems="center"
            colorScheme="orange"
            px={3}
            py={2}
            borderRadius="md"
            fontSize="sm"
          >
            <Icon boxSize='16px' as={PiMapPinAreaBold} mr={2} />{" "}
            {block.referenceType === "WObj"
              ? block.referenceObject || "–"
              : "World"}
          </Badge>
        </HStack>
      );
    }
    case "Home":
      return (
        <Badge
          display="inline-flex"
          alignItems="center"
          colorScheme="red"
          px={3}
          py={2}
          borderRadius="md"
          fontSize="sm"
        >
          <Icon boxSize='16px' as={PiHouseBold} mr={2} /> Home all axes
        </Badge>
      );
    case "If": {
      const left =
        block.variableSource === "IO"
          ? block.io
          : block.variableSource === "Variable"
            ? block.io
            : block.condition;
      return (
        <HStack spacing={3} wrap="wrap">
          <Badge
            display="inline-flex"
            alignItems="center"
            colorScheme="cyan"
            px={3}
            py={2}
            borderRadius="md"
            fontSize="sm"
          >
            {left} {block.operator}   {block.value}
          </Badge>
        </HStack>
      );
    }
    case "For Loop":
      return (
        <HStack spacing={3} wrap="wrap">
          <Badge
            display="inline-flex"
            alignItems="center"
            colorScheme="pink"
            px={3}
            py={2}
            borderRadius="md"
            fontSize="sm"
          >
            {block.counter || "START "}: {block.start}
          </Badge>
          <Badge
            display="inline-flex"
            alignItems="center"
            colorScheme="pink"
            px={3}
            py={2}
            borderRadius="md"
            fontSize="sm"
          >
            end: {block.end}
          </Badge>
          <Badge
            display="inline-flex"
            alignItems="center"
            colorScheme="pink"
            px={3}
            py={2}
            borderRadius="md"
            fontSize="sm"
          >
            step: {block.step}
          </Badge>
        </HStack>
      );
    case "Counter":
      return (
        <Badge
          display="inline-flex"
          alignItems="center"
          colorScheme="teal"
          px={3}
          py={2}
          borderRadius="md"
          fontSize="sm"
        >
          {block.name} : {block.initial} → {block.target} (+{block.increment})
        </Badge>
      );
    case "Then":
      return (
        <Badge
          display="inline-flex"
          alignItems="center"
          colorScheme="green"
          px={3}
          py={2}
          borderRadius="md"
          fontSize="sm"
        >
          <Icon boxSize='16px' as={PiCheck} mr={2} /> {block.action} {block.targetCounter}
        </Badge>
      );
    case "Console Log":
      return (
        <Badge
          display="inline-flex"
          alignItems="center"
          colorScheme="purple"
          px={3}
          py={2}
          borderRadius="md"
          fontSize="sm"
        >
          <Icon boxSize='16px' as={PiTerminal} mr={2} /> console.{block.level}(
          "{block.message}")
        </Badge>
      );
    case "Math": {
      // 1) Try computing the preview
      let preview = "—";
      try {
        // extract names and numeric values
        const names = variables.map(v => v.name);
        const values = variables.map(v => {
          const n = parseFloat(v.value);
          return isNaN(n) ? 0 : n;
        });
        // build a function: (a,b,c...) => expression
        // eslint-disable-next-line no-new-func
        const fn = new Function(...names, `return ${block.expression || "0"};`);
        preview = fn(...values);
      } catch {
        // keep preview as "—" on error
      }

      return (
        <HStack spacing={3}>
          <Badge
            display="inline-flex"
            alignItems="center"
            colorScheme="blue"
            px={3}
            py={2}
            borderRadius="md"
            fontSize="sm"
          >
            {block.varName || "—"}
          </Badge>
          <Badge
            display="inline-flex"
            alignItems="center"
            colorScheme="red"
            px={3}
            py={2}
            borderRadius="md"
            fontSize="sm"
          >
            {block.expression || "—"}
          </Badge>
          <Badge
            display="inline-flex"
            alignItems="center"
            colorScheme="green"
            px={3}
            py={2}
            borderRadius="md"
            fontSize="sm"
          >
            {/* reuse your PiCheck icon to indicate “result” */}
            <Icon boxSize="16px" as={PiCheck} mr={2} /> {preview}
          </Badge>
        </HStack>
      );
    }
    default:
      return null;
  }
}

export default function BlockEditor({ state, dispatch, filter }) {
  // memoize indent levels
  const indentLevels = useMemo(
    () => computeIndentLevels(state.blocks),
    [state.blocks]
  );
  const [logAutocomplete, setLogAutocomplete] = React.useState({
    openForIndex: null,
    replaceRange: [0, 0],
    suggestions: [],
  });

  const visible = state.blocks
    .map((blk, i) => ({ blk, i }))
    .filter(
      ({ blk }) =>
        blk.type.toLowerCase().includes(filter.toLowerCase()) ||
        (blk.comment || "").toLowerCase().includes(filter.toLowerCase())
    );


  // Dispatch helpers
  const updateBlock = (i, field, val) =>
    dispatch({ type: "UPDATE_BLOCK", index: i, payload: { [field]: val } });
  const removeBlock = (i) =>
    dispatch({ type: "REMOVE_BLOCK", index: i });
  const duplicateBlock = (i) => {
    const copy = { ...state.blocks[i] };
    const arr = [...state.blocks];
    arr.splice(i + 1, 0, copy);
    dispatch({ type: "REORDER_BLOCKS", payload: arr });
  };
  const moveBlock = (from, to) => {
    if (to < 0 || to >= state.blocks.length) return;
    const arr = [...state.blocks];
    const [blk] = arr.splice(from, 1);
    arr.splice(to, 0, blk);
    dispatch({ type: "REORDER_BLOCKS", payload: arr });
  };

  // Render block parameters with compact spacing.
  const renderBlockParams = (block, index) => {
    switch (block.type) {
      case "Move L":
      case "Move J": {
        const isMoveL = block.type === "Move L";

        return (
          <>
            {/* 1) Source: manual joints or variable */}
            <HStack spacing={2} mb={2}>
              <Text w="100px" fontSize="sm">Source:</Text>
              <Select
                size="sm"
                value={block.src || "manual"}
                onChange={e => updateBlock(index, "src", e.target.value)}
              >
                <option value="manual">Manual Joints</option>
                <option value="variable">RobTarget Var</option>
              </Select>
            </HStack>

            {/* manual: six NumberInputs */}
            {block.src === "manual" ? (
              <SimpleGrid columns={3} spacing={2} mb={2}>
                {Array.from({ length: 6 }).map((_, j) => (
                  <NumberInput
                    key={j}
                    size="sm"
                    value={block.joints?.[j] ?? ""}
                    onChange={val => {
                      const joints = [...(block.joints || Array(6).fill(""))];
                      joints[j] = val;
                      updateBlock(index, "joints", joints);
                    }}
                  >
                    <NumberInputField placeholder={`J${j + 1}`} />
                  </NumberInput>
                ))}
              </SimpleGrid>
            ) : (
              <HStack spacing={2} mb={2}>
                <Text w="100px" fontSize="sm">Point Var:</Text>
                <Select
                  size="sm"
                  value={block.pointVariable || ""}
                  onChange={e => updateBlock(index, "pointVariable", e.target.value)}
                >
                  <option value="">-- Select RobTarget --</option>
                  {state.variables
                    .filter(v => v.type.includes("Robot Target"))
                    .map((v, i) => (
                      <option key={i} value={v.name}>{v.name}</option>
                    ))}
                </Select>
              </HStack>
            )}

            {/* (Move J only) Mode switch */}
            {!isMoveL && (
              <HStack spacing={2} mb={2}>
                <Text w="100px" fontSize="sm">Mode:</Text>
                <Select
                  size="sm"
                  value={block.moveMode || "cartesian"}
                  onChange={e => updateBlock(index, "moveMode", e.target.value)}
                >
                  <option value="cartesian">Cartesian</option>
                  <option value="joint">Joint Angles</option>
                </Select>
              </HStack>
            )}

            {/* Cartesian entry for Move L, or for Move J in cartesian mode */}
            {block.src === "manual" && (((isMoveL) || block.moveMode === "cartesian")) && (
              <HStack spacing={2} mb={2}>
                <Text w="100px" fontSize="sm">
                  Cartesian:
                </Text>
                <Input
                  size="sm"
                  placeholder="X, Y, Z, Rx, Ry, Rz"
                  value={block.cartesian || ""}
                  onChange={e => updateBlock(index, "cartesian", e.target.value)}
                />
              </HStack>
            )}

            {/* Joint entry for Move J when in joint mode */}
            {block.src === "manual" && !isMoveL && block.moveMode === "joint" && (
              <SimpleGrid columns={3} spacing={2} mb={2}>
                {Array.from({ length: 6 }).map((_, j) => (
                  <NumberInput
                    key={j}
                    size="sm"
                    value={block.joints?.[j] ?? ""}
                    onChange={val => {
                      const joints = [...(block.joints || Array(6).fill(""))];
                      joints[j] = val;
                      updateBlock(index, "joints", joints);
                    }}
                  >
                    <NumberInputField placeholder={`J${j + 1}`} />
                  </NumberInput>
                ))}
              </SimpleGrid>
            )}

            {/* Reference Frame */}
            <HStack spacing={2} mb={2}>
              <Text w="100px" fontSize="sm">Reference:</Text>
              <Select
                size="sm"
                value={block.referenceType || "World"}
                onChange={e => updateBlock(index, "referenceType", e.target.value)}
              >
                <option value="World">World</option>
                <option value="WObj">Work Object</option>
              </Select>
              {block.referenceType === "WObj" && (
                <Select
                  size="sm"
                  value={block.referenceObject || ""}
                  onChange={e => updateBlock(index, "referenceObject", e.target.value)}
                >
                  <option value="">-- Select WObj --</option>
                  {state.variables
                    .filter(v => v.type.includes("Work Object"))
                    .map((v, i) => (
                      <option key={i} value={v.name}>{v.name}</option>
                    ))}
                </Select>
              )}
            </HStack>

            {/* Speed */}
            <HStack spacing={2} mb={2}>
              <Text w="100px" fontSize="sm">
                Speed ({isMoveL ? "mm/s" : "°/s"}):
              </Text>
              <NumberInput
                size="sm"
                value={block.speed || ""}
                onChange={val => updateBlock(index, "speed", val)}
              >
                <NumberInputField />
              </NumberInput>
            </HStack>
          </>
        );
      }
      case "Home":
        return (
          <Text fontSize="xs" color="gray.300">
            No parameters required.
          </Text>
        );
      case "If": {
        // pick source type, default to "IO"
        const source = block.variableSource || "IO";

        return (
          <>
            {/* 1) Left-operand: I/O, Variable, or Constant */}
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">Variable:</Text>
              <Select
                size="sm"
                value={source}
                onChange={e => updateBlock(index, "variableSource", e.target.value)}
              >
                <option value="IO">I/O</option>
                <option value="Variable">Variable</option>
                <option value="Constant">Constant</option>
              </Select>

              {source === "IO" && (
                <Select
                  size="sm"
                  value={block.io || ""}
                  onChange={e => updateBlock(index, "io", e.target.value)}
                >
                  {["DI_1", "DI_2", "DI_3", "DI_4", "DI_5", "DI_6", "DI_7", "DI_8"].map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </Select>
              )}

              {source === "Variable" && (
                <Select
                  size="sm"
                  value={block.io || ""}
                  onChange={e => updateBlock(index, "io", e.target.value)}
                >
                  <option value="">-- Select variable --</option>
                  {state.variables.map((v, i) => (
                    <option key={i} value={v.name}>{v.name}</option>
                  ))}
                </Select>
              )}

              {source === "Constant" && (
                <Input
                  size="sm"
                  placeholder="Constant"
                  value={block.condition || ""}
                  onChange={e => updateBlock(index, "condition", e.target.value)}
                />
              )}
            </HStack>

            {/* 2) Operator */}
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">Operator:</Text>
              <Select
                size="sm"
                value={block.operator || "=="}
                onChange={e => updateBlock(index, "operator", e.target.value)}
              >
                <option value="==">==</option>
                <option value="!=">!=</option>
                <option value="<">{"<"}</option>
                <option value=">">{">"}</option>
              </Select>
            </HStack>

            {/* 3) Right-operand */}
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">Value:</Text>
              <Input
                size="sm"
                placeholder="Value"
                value={block.value || ""}
                onChange={e => updateBlock(index, "value", e.target.value)}
              />
            </HStack>
          </>
        );
      }

      case "Counter":
        return (
          <>
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">
                Name:
              </Text>
              <Input size="sm" placeholder="Counter name" value={block.name || ""} onChange={(e) => updateBlock(index, "name", e.target.value)} />
            </HStack>
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">
                Initial:
              </Text>
              <Input size="sm" placeholder="Initial" value={block.initial || "0"} onChange={(e) => updateBlock(index, "initial", e.target.value)} />
            </HStack>
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">
                Increment:
              </Text>
              <Input size="sm" placeholder="Increment" value={block.increment || "1"} onChange={(e) => updateBlock(index, "increment", e.target.value)} />
            </HStack>
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">
                Target:
              </Text>
              <Input size="sm" placeholder="Target" value={block.target || ""} onChange={(e) => updateBlock(index, "target", e.target.value)} />
            </HStack>
          </>
        );
      case "Then":
        return (
          <>
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">
                Action:
              </Text>
              <Select size="sm" value={block.action || "Decrease Counter"} onChange={(e) => updateBlock(index, "action", e.target.value)}>
                <option value="increase counter">Decrease Counter</option>
                <option value="increase counter">Increase Counter</option>
                <option value="set counter">Set Counter</option>
              </Select>
            </HStack>
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">
                Target:
              </Text>
              <Input size="sm" placeholder="Counter name" value={block.targetCounter || ""} onChange={(e) => updateBlock(index, "targetCounter", e.target.value)} />
            </HStack>
          </>
        );
      case "For Loop": {
        // get all number-typed variables
        const numberVars = state.variables.filter(v => v.dataType === "Number");

        // default endSource to Literal
        const endSource = block.endSource || "Literal";

        return (
          <>
            {/* Counter: must be one of your Number variables */}
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">Counter:</Text>
              <Select
                size="sm"
                placeholder="Select variable"
                value={block.counter}
                onChange={e => updateBlock(index, "counter", e.target.value)}
              >
                {numberVars.map((v, i) => (
                  <option key={i} value={v.name}>{v.name}</option>
                ))}
              </Select>
            </HStack>

            {/* End: choose literal vs. variable */}
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">End Src:</Text>
              <Select
                size="sm"
                value={endSource}
                onChange={e => updateBlock(index, "endSource", e.target.value)}
              >
                <option value="Literal">Literal</option>
                <option value="Variable">Constant</option>
              </Select>
            </HStack>

            {endSource === "Literal" ? (
              <HStack spacing={2} mb={1}>
                <Text w="70px" fontSize="sm">End:</Text>
                <Input
                  size="sm"
                  type="number"
                  placeholder="e.g. 10"
                  value={block.end}
                  onChange={e => updateBlock(index, "end", e.target.value)}
                />
              </HStack>
            ) : (
              <HStack spacing={2} mb={1}>
                <Text w="70px" fontSize="sm">End Var:</Text>
                <Select
                  size="sm"
                  placeholder="Select variable"
                  value={block.end}
                  onChange={e => updateBlock(index, "end", e.target.value)}
                >
                  {numberVars.map((v, i) => (
                    <option key={i} value={v.name}>{v.name}</option>
                  ))}
                </Select>
              </HStack>
            )}

            {/* Start and Step remain as before */}
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">Start:</Text>
              <Input
                size="sm"
                type="number"
                value={block.start}
                onChange={e => updateBlock(index, "start", e.target.value)}
              />
            </HStack>
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">Step:</Text>
              <Input
                size="sm"
                type="number"
                value={block.step}
                onChange={e => updateBlock(index, "step", e.target.value)}
              />
            </HStack>
          </>
        );
      }
      case "Console Log": {
        const vars = state.variables.map(v => v.name);
        const handleMsgChange = e => {
          const msg = e.target.value;
          updateBlock(index, "message", msg);

          // find $word just typed
          const pos = e.target.selectionStart;
          const prefix = msg.slice(0, pos).match(/\$([A-Za-z0-9_]*)$/);
          if (prefix) {
            const [full, partial] = prefix;
            const suggestions = vars.filter(n => n.startsWith(partial));
            setLogAutocomplete({
              openForIndex: index,
              replaceRange: [pos - full.length, pos],
              suggestions,
            });
          } else {
            setLogAutocomplete({ openForIndex: null, suggestions: [] });
          }
        };

        const selectSuggestion = name => {
          const { replaceRange: [start, end] } = logAutocomplete;
          const old = block.message || "";
          const filled = old.slice(0, start) + '$' + name + old.slice(end);
          updateBlock(index, "message", filled);
          setLogAutocomplete({ openForIndex: null, suggestions: [] });
        };

        // build a live preview
        const preview = (block.message || "").replace(
          /\$([A-Za-z0-9_]+)/g,
          (_, n) => {
            const find = state.variables.find(v => v.name === n);
            return find ? find.value : `$${n}`;
          }
        );

        return (
          <>
            <Popover
              isOpen={logAutocomplete.openForIndex === index}
              placement="bottom-start"
              onClose={() => setLogAutocomplete({ openForIndex: null, suggestions: [] })}
            >
              <PopoverTrigger>
                <Input
                  size="sm"
                  placeholder='console.log("…")'
                  value={block.message || ""}
                  onChange={handleMsgChange}
                />
              </PopoverTrigger>
              <PopoverContent w="200px">
                <PopoverArrow />
                <PopoverBody p={1}>
                  {logAutocomplete.suggestions.map(s => (
                    <Box
                      key={s}
                      p={1}
                      _hover={{ bg: "gray.100", cursor: "pointer" }}
                      onClick={() => selectSuggestion(s)}
                    >
                      {s}
                    </Box>
                  ))}
                </PopoverBody>
              </PopoverContent>
            </Popover>
            {preview && (
              <Text fontSize="xs" color="gray.400" mt={1}>
                Preview: {preview}
              </Text>
            )}
          </>
        );
      }
      case "Else":
      case "End For":
        return (
          <Text fontSize="xs" color="gray.600">
            No parameters required.
          </Text>
        );
      case "Math":
        return (
          <MathEditor
            block={block}
            index={index}
            variables={state.variables}
            updateBlock={updateBlock}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Droppable droppableId="blocks" direction="vertical">
      {(provided) => (
        <VStack
          ref={provided.innerRef}
          {...provided.droppableProps}
          spacing={3}
          p={2}
          minH="300px"
          border="1px solid"
          borderColor="gray.600"
          borderRadius="md"
        >
          {visible.map(({ blk: block, i: origIdx }, visIdx) => {
            const indent = indentLevels[origIdx] * 80;
            return (
              <Draggable
                key={origIdx}
                draggableId={`${origIdx}`}
                index={visIdx}
              >
                {(prov) => (
                  <Box
                    ref={prov.innerRef}
                    {...prov.draggableProps}
                    {...prov.dragHandleProps}
                    borderLeftWidth="8px"
                    borderLeftColor={blockColors[block.type]}
                    bg="gray.800"
                    _hover={{ bg: "gray.700", boxShadow: "lg" }}
                    transition={"background-color 0.1s, box-shadow 0.1s"}
                    p={4}
                    ml={`${indent}px`}
                    w={`calc(100% - ${indent}px)`}
                    borderRadius="md"
                  >
                    <HStack justify="space-between" align="start">
                      <VStack align="start" spacing={1}>
                        <Text fontWeight="bold" fontSize="xl">
                          {block.type}
                        </Text>
                        {/* New summary badges */}
                        {renderSummary(block, state.variables)}
                      </VStack>
                      <HStack spacing={1}>
                        <Tooltip label="Move Up">
                          <Button
                            size="sm"
                            onClick={() =>
                              moveBlock(origIdx, origIdx - 1)
                            }
                          >
                            <PiArrowUp />
                          </Button>
                        </Tooltip>
                        <Tooltip label="Move Down">
                          <Button
                            size="sm"
                            onClick={() =>
                              moveBlock(origIdx, origIdx + 1)
                            }
                          >
                            <PiArrowDown />
                          </Button>
                        </Tooltip>
                        <Tooltip label="Duplicate">
                          <Button
                            size="sm"
                            onClick={() => duplicateBlock(origIdx)}
                          >
                            <PiCopy />
                          </Button>
                        </Tooltip>
                        <Popover placement="left" closeOnBlur>
                          <PopoverTrigger>
                            <Button size="sm" colorScheme="primary">
                              <PiPencilSimple /> Edit
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent>
                            <PopoverArrow />
                            <PopoverCloseButton />
                            <PopoverHeader>Edit {block.type}</PopoverHeader>
                            <PopoverBody>
                              {renderBlockParams(block, origIdx)}
                              <Input
                                mt={3}
                                value={block.comment || ""}
                                placeholder="Comment…"
                                onChange={(e) =>
                                  updateBlock(
                                    origIdx,
                                    "comment",
                                    e.target.value
                                  )
                                }
                              />
                            </PopoverBody>
                          </PopoverContent>
                        </Popover>
                        <Tooltip label="Delete">
                          <Button
                            size="sm"
                            variant="outline"
                            colorScheme="red"
                            onClick={() => removeBlock(origIdx)}
                          >
                            <PiTrash />
                          </Button>
                        </Tooltip>
                      </HStack>
                    </HStack>
                  </Box>
                )}
              </Draggable>
            );
          })}
          {provided.placeholder}
        </VStack>
      )}
    </Droppable>
  );
}