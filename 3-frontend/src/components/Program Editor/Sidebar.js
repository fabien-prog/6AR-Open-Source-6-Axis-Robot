// src/components/Sidebar.jsx
import React from "react";
import {
  Box,
  VStack,
  Text,
  IconButton,
  Tooltip,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
} from "@chakra-ui/react";
import { Draggable, Droppable } from "react-beautiful-dnd";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

// 1) Define categories for blocks.
const categories = [
  { title: "Standard", blocks: ["Move L", "Move J", "Home"] },
  { title: "I/O", blocks: ["SetDO", "WaitDI"] },
  { title: "Conditionals", blocks: ["If", "Else", "End If", "Then"] },
  { title: "Loops", blocks: ["For Loop", "End For"] },
  { title: "Miscellaneous", blocks: ["Counter", "Console Log", "Math"] },
];

// 2) Descriptions for each block type
const blockDescriptions = {
  "Move L": [
    "Move L — Linear Move",
    "Moves the robot in a straight line to a specified target at the set speed.",
    "Parameters:",
    "- Source: Manual joints or a RobTarget variable",
    "- Cartesian: X, Y, Z, Rx, Ry, Rz coordinates (if manual)",
    "- Speed: Linear speed in mm/s",
    "- Reference: World or Work Object frame",
  ],
  "Move J": [
    "Move J — Joint Move",
    "Moves the robot by driving each joint to specified angles so that they all arrive at the same time with a max angular single joint speed.",
    "Parameters:",
    "- Source: Manual joints or a RobTarget variable",
    "- Mode: Joint (angles) or Cartesian (converted)",
    "- Joint Angles: Six values J1…J6 (if manual joint mode)",
    "- Speed: Max joint speed in °/s",
    "- Reference: World or Work Object frame",
  ],
  Home: [
    "Home — Homing Routine",
    "Homes all axes using their limit switches.",
    "No parameters.",
  ],
  If: [
    "If — Conditional Start",
    "Begins an IF block based on a comparison. Passes through if condition is true else it ignores it.",
    "Parameters:",
    "- Variable: Choose DI input, a Variable, or a Constant",
    "- Operator: ==, !=, <, >",
    "- Value: Right-hand side to compare",
  ],
  Else: [
    "Else — Conditional Else (not working yet)",
    "Defines the alternate branch of an IF block.",
    "No parameters.",
  ],
  "End If": [
    "End If — Conditional End",
    "Closes the IF/ELSE structure.",
    "No parameters.",
  ],
  Then: [
    "Then — Counter Action",
    "Performs an action on a counter variable when condition met.",
    "Parameters:",
    "- Action: Increase, Decrease, or Set Counter",
    "- Target: Name of the counter variable",
  ],
  "For Loop": [
    "For Loop — Loop Start",
    "Repeats enclosed blocks a set number of times.",
    "Parameters:",
    "- Counter: A numeric variable",
    "- Start: Initial value",
    "- End: Final value",
    "- Step: Increment per iteration",
  ],
  "End For": [
    "End For — Loop End",
    "Closes the FOR loop.",
    "No parameters.",
  ],
  Counter: [
    "Counter — Counter Declaration",
    "Defines and initializes a counter variable.",
    "Parameters:",
    "- Name: Counter variable name",
    "- Initial: Starting value",
    "- Increment: Step amount",
    "- Target: Final value",
  ],
  "Console Log": [
    "Console Log — Logging",
    "Outputs text to the console (supports $variable interpolation).",
    "Parameters:",
    "- Message: Text to log (use $var to insert variable values)",
    "- Level: info, warn, error, or log",
  ],
  Math: [
    "Math — Expression Evaluation",
    "Computes an expression and stores the result in a specified variable.",
    "Parameters:",
    "- Target Var: Variable to receive the result",
    "- Expression: Use +, -, *, /, (), variables, and numbers",
  ],
  SetDO: [
    "SetDO(pin, state)",
    "Sets a digital output pin to 0 or 1.",
    "pin: DO_n",
    "state: 0 or 1"
  ],
  WaitDI: [
    "WaitDI(pin, state)",
    "Pauses execution until a digital input matches the state.",
    "pin: DI_n",
    "state: 0 or 1"
  ],
};

const Sidebar = ({ expanded, setExpanded }) => {
  // For collapsed mode, flatten all blocks
  const collapsedBlocks = categories.flatMap(c => c.blocks);

  return (
    <Box
      position="absolute"
      top="0"
      left="0"
      zIndex={2}
      bg="gray.600"
      p={4}
      borderRadius="lg"
      width={expanded ? "240px" : "60px"}
      boxShadow="lg"
      transition="width 0.3s ease"
    >
      <VStack spacing={2} align="stretch">
        <Tooltip
          label={expanded ? "Collapse Sidebar" : "Expand Sidebar"}
          placement="right"
        >
          <IconButton
            variant="ghost"
            color="white"
            icon={expanded ? <FiChevronLeft size={20} /> : <FiChevronRight size={20} />}
            onClick={() => setExpanded(!expanded)}
            alignSelf="flex-end"
            aria-label="Toggle Sidebar"
            _hover={{ bg: "gray.500" }}
          />
        </Tooltip>

        {expanded && (
          <Text
            fontWeight="bold"
            color="white"
            fontSize="xl"
            mb={2}
            textAlign="center"
          >
            Blocks
          </Text>
        )}

        {expanded ? (
          <Accordion allowMultiple>
            {categories.map((category, catIndex) => (
              <AccordionItem key={category.title} border="none">
                <h2>
                  <AccordionButton px={2} py={1}>
                    <Box flex="1" textAlign="left" color="white" fontWeight="bold">
                      {category.title}
                    </Box>
                    <AccordionIcon color="white" />
                  </AccordionButton>
                </h2>
                <AccordionPanel p={2}>
                  <Droppable
                    droppableId={`sidebar-${catIndex}`}
                    isDropDisabled={true}
                    isCombineEnabled={false}
                    ignoreContainerClipping={false}
                  >
                    {(provided) => (
                      <VStack
                        spacing={3}
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        align="stretch"
                      >
                        {category.blocks.map((type, idx) => (
                          <Draggable key={type} draggableId={type} index={idx}>
                            {(prov) => (
                              <Tooltip
                                label={
                                  <VStack align="start" spacing={1} maxW="250px">
                                    {blockDescriptions[type].map((line, i) => (
                                      <Text
                                        key={i}
                                        fontSize="xs"
                                        whiteSpace="pre-wrap"
                                        color="white"
                                      >
                                        {line}
                                      </Text>
                                    ))}
                                  </VStack>
                                }
                                placement="right"
                                hasArrow
                                bg="gray.700"
                              >
                                <Box
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  {...prov.dragHandleProps}
                                  bg="gray.800"
                                  p={3}
                                  borderRadius="md"
                                  _hover={{ bg: "gray.700", cursor: "grab" }}
                                >
                                  <Text color="white" fontSize="md">
                                    {type}
                                  </Text>
                                </Box>
                              </Tooltip>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </VStack>
                    )}
                  </Droppable>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <Droppable
            droppableId="sidebar-collapsed"
            isDropDisabled={true}
            isCombineEnabled={false}
            ignoreContainerClipping={false}
          >
            {(provided) => (
              <VStack
                spacing={3}
                ref={provided.innerRef}
                {...provided.droppableProps}
                align="center"
              >
                {collapsedBlocks.map((type, idx) => (
                  <Draggable key={type} draggableId={type} index={idx}>
                    {(prov) => (
                      <Tooltip
                        label={type}
                        placement="right"
                        hasArrow
                        bg="gray.700"
                      >
                        <Box
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          {...prov.dragHandleProps}
                          bg="gray.800"
                          p={2}
                          borderRadius="md"
                          _hover={{ bg: "gray.700", cursor: "grab" }}
                        >
                          <Text color="white" fontSize="sm">
                            {type.charAt(0)}
                          </Text>
                        </Box>
                      </Tooltip>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </VStack>
            )}
          </Droppable>
        )}
      </VStack>
    </Box>
  );
};

export default Sidebar;
