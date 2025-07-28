import React, { useState } from "react";
import { Box, Button, HStack, VStack, Text, Input, Select, Tooltip, IconButton } from "@chakra-ui/react";
import { Draggable, Droppable } from "react-beautiful-dnd";
import { PiArrowUp, PiArrowDown, PiCopy } from "react-icons/pi";

// Define a color mapping for each block type in the editor.
const blockColors = {
  "Move L": "primary.700",
  "Move J": "primary.700",
  Home: "red.700",
  If: "cyan.700",
  Else: "yellow.700",
  "End If": "gray.700",
  Counter: "teal.700",
  Then: "green.700",
  "For Loop": "pink.700",
  "End For": "pink.700",
  "Console Log": "purple.700",
};

const BlockEditor = ({ state, dispatch, filter }) => {
  const filteredBlocks = state.blocks.filter(
    (block) => block.type.toLowerCase().includes(filter.toLowerCase()) || (block.comment && block.comment.toLowerCase().includes(filter.toLowerCase()))
  );

  const [collapsed, setCollapsed] = useState({});

  const toggleCollapse = (index) => {
    setCollapsed((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const updateBlock = (index, field, value) => {
    dispatch({ type: "UPDATE_BLOCK", index, payload: { [field]: value } });
  };

  const removeBlock = (index) => {
    dispatch({ type: "REMOVE_BLOCK", index });
  };

  const duplicateBlock = (index) => {
    const blockToDuplicate = state.blocks[index];
    const newBlocks = Array.from(state.blocks);
    newBlocks.splice(index + 1, 0, { ...blockToDuplicate });
    dispatch({ type: "REORDER_BLOCKS", payload: newBlocks });
  };

  const moveBlockUp = (index) => {
    if (index === 0) return;
    const newBlocks = Array.from(state.blocks);
    [newBlocks[index - 1], newBlocks[index]] = [newBlocks[index], newBlocks[index - 1]];
    dispatch({ type: "REORDER_BLOCKS", payload: newBlocks });
  };

  const moveBlockDown = (index) => {
    if (index === state.blocks.length - 1) return;
    const newBlocks = Array.from(state.blocks);
    [newBlocks[index + 1], newBlocks[index]] = [newBlocks[index], newBlocks[index + 1]];
    dispatch({ type: "REORDER_BLOCKS", payload: newBlocks });
  };

  // Render block parameters with compact spacing.
  const renderBlockParams = (block, index) => {
    switch (block.type) {
      case "Move L":
      case "Move J":
        return (
          <>
            {/* Option to choose point source */}
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">
                Point Src:
              </Text>
              <Select size="sm" value={block.pointSource || "manual"} onChange={(e) => updateBlock(index, "pointSource", e.target.value)}>
                <option value="manual">Manual</option>
                <option value="variable">Variable</option>
              </Select>
            </HStack>
            {block.pointSource === "manual" ? (
              <HStack spacing={2} mb={1}>
                <Text w="70px" fontSize="sm">
                  Point:
                </Text>
                <Input size="sm" placeholder="Enter point" value={block.point || ""} onChange={(e) => updateBlock(index, "point", e.target.value)} />
                <Tooltip label="Auto-fill teaching coordinates" fontSize="xs">
                  <Button size="xs" onClick={() => updateBlock(index, "point", "0,0,0,0,0,0")}>
                    Teach
                  </Button>
                </Tooltip>
              </HStack>
            ) : (
              <HStack spacing={2} mb={1}>
                <Text w="70px" fontSize="sm">
                  Point Var:
                </Text>
                <Select size="sm" value={block.pointVariable || ""} onChange={(e) => updateBlock(index, "pointVariable", e.target.value)}>
                  <option value="">Select RobTarget</option>
                  {state.variables
                    .filter((v) => v.type === "Robot Target (ROBTARGET)")
                    .map((v, i) => (
                      <option key={i} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                </Select>
              </HStack>
            )}
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">
                Reference Type:
              </Text>
              <Select size="sm" value={block.referenceType || "World"} onChange={(e) => updateBlock(index, "referenceType", e.target.value)}>
                <option value="World">World</option>
                <option value="Tool">Tool</option>
              </Select>
            </HStack>
            {block.referenceType === "Tool" && (
              <HStack spacing={2} mb={1}>
                <Text w="70px" fontSize="sm">
                  Reference:
                </Text>
                <Select size="sm" value={block.referenceObject || ""} onChange={(e) => updateBlock(index, "referenceObject", e.target.value)}>
                  <option value="">Select...</option>
                  {block.type === "Move L"
                    ? state.variables
                      .filter((v) => v.type === "Work Object")
                      .map((v, i) => (
                        <option key={i} value={v.name}>
                          {v.name}
                        </option>
                      ))
                    : state.variables
                      .filter((v) => v.type === "Robot Target")
                      .map((v, i) => (
                        <option key={i} value={v.name}>
                          {v.name}
                        </option>
                      ))}
                </Select>
              </HStack>
            )}
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">
                Speed:
              </Text>
              <Select size="sm" value={block.speed || "100"} onChange={(e) => updateBlock(index, "speed", e.target.value)}>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="300">300</option>
                <option value="Vmax">Vmax</option>
              </Select>
            </HStack>
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">
                Zone:
              </Text>
              <Select size="sm" value={block.zone || "Fine"} onChange={(e) => updateBlock(index, "zone", e.target.value)}>
                <option value="Fine">Fine</option>
                <option value="Coarse">Coarse</option>
              </Select>
            </HStack>
          </>
        );
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
                  {["DI 1", "DI 2", "DI 3", "DI 4", "DI 5"].map((opt) => (
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
      case "Console Log":
        return (
          <>
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">
                Message:
              </Text>
              <Input size="sm" placeholder="Enter log message" value={block.message || ""} onChange={(e) => updateBlock(index, "message", e.target.value)} />
            </HStack>
            <HStack spacing={2} mb={1}>
              <Text w="70px" fontSize="sm">
                Level:
              </Text>
              <Select size="sm" value={block.level || "info"} onChange={(e) => updateBlock(index, "level", e.target.value)}>
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
                <option value="log">log</option>
              </Select>
            </HStack>
          </>
        );
      case "Else":
      case "End For":
        return (
          <Text fontSize="xs" color="gray.600">
            No parameters required.
          </Text>
        );
      default:
        return null;
    }
  };

  return (
    <Droppable droppableId="blocks" direction="vertical" isCombineEnabled={false} isDropDisabled={false} ignoreContainerClipping={false}>
      {(provided) => (
        <VStack
          spacing={2}
          flex="1"
          ref={provided.innerRef}
          {...provided.droppableProps}
          minHeight="300px"
          border="1px dashed"
          borderRadius="lg"
          borderColor="gray.400"
          p={2}
        >
          {filteredBlocks.map((block, index) => (
            <Draggable key={index} draggableId={String(index)} index={index}>
              {(provided) => (
                <Box
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  {...provided.dragHandleProps}
                  bg={blockColors[block.type] || "gray.800"}
                  p={2}
                  borderWidth="1px"
                  borderRadius="md"
                  width="100%"
                >
                  <HStack justify="space-between" mb={1}>
                    <Text fontWeight="bold" fontSize="sm">
                      {block.type}
                    </Text>
                    <HStack spacing={1}>
                      <Tooltip label="Move Up" placement="top">
                        <IconButton size="xs" onClick={() => moveBlockUp(index)} icon={<PiArrowUp />} />
                      </Tooltip>
                      <Tooltip label="Move Down" placement="top">
                        <IconButton size="xs" onClick={() => moveBlockDown(index)} icon={<PiArrowDown />} />
                      </Tooltip>
                      <Tooltip label="Duplicate" placement="top">
                        <IconButton size="xs" onClick={() => duplicateBlock(index)} icon={<PiCopy />} />
                      </Tooltip>
                      <Tooltip label="Collapse" placement="top">
                        <Button size="xs" onClick={() => toggleCollapse(index)}>
                          {collapsed[index] ? "Expand" : "Collapse"}
                        </Button>
                      </Tooltip>
                      <Tooltip label="Delete" placement="top">
                        <Button size="xs" bg="red.600" onClick={() => removeBlock(index)}>
                          Del
                        </Button>
                      </Tooltip>
                    </HStack>
                  </HStack>
                  {!collapsed[index] && (
                    <Box>
                      {renderBlockParams(block, index)}
                      <Input mt={1} size="sm" placeholder="Add comment..." value={block.comment || ""} onChange={(e) => updateBlock(index, "comment", e.target.value)} />
                    </Box>
                  )}
                </Box>
              )}
            </Draggable>
          ))}
          {provided.placeholder}
        </VStack>
      )}
    </Droppable>
  );
};

export default BlockEditor;
