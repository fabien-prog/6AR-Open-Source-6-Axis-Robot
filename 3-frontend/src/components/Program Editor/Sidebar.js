import React from "react";
import { Box, VStack, Text, IconButton, Tooltip, Accordion, AccordionItem, AccordionButton, AccordionPanel, AccordionIcon } from "@chakra-ui/react";
import { Draggable, Droppable } from "react-beautiful-dnd";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

// Define categories for blocks.
const categories = [
  { title: "Standard", blocks: ["Move L", "Move J", "Home"] },
  { title: "Conditionals", blocks: ["If", "Else", "End If", "Then"] },
  { title: "Loops", blocks: ["For Loop", "End For"] },
  { title: "Miscellaneous", blocks: ["Counter", "Console Log"] },
];

const Sidebar = ({ expanded, setExpanded }) => {
  // For collapsed mode, flatten all blocks into a single array with consecutive indexes.
  const collapsedBlocks = categories.reduce((acc, category) => acc.concat(category.blocks), []);

  return (
    <Box
      position="absolute"
      top="0px"
      left="0px"
      zIndex={2}
      bg="gray.600"
      p={4}
      borderRadius="lg"
      width={expanded ? "240px" : "60px"}
      boxShadow="lg"
      transition="width 0.3s ease"
    >
      <VStack spacing={2} align="stretch">
        <Tooltip label={expanded ? "Collapse Sidebar" : "Expand Sidebar"} placement="right">
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
          <Text fontWeight="bold" color="white" fontSize="xl" mb={2} textAlign="center">
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
                  {/* Use a unique droppableId for each category */}
                  <Droppable droppableId={`sidebar-${catIndex}`} isDropDisabled={true} isCombineEnabled={false} ignoreContainerClipping={false}>
                    {(provided) => (
                      <VStack spacing={3} ref={provided.innerRef} {...provided.droppableProps} align="stretch">
                        {category.blocks.map((type, index) => (
                          <Draggable key={type} draggableId={type} index={index}>
                            {(provided) => (
                              <Tooltip key={index} label={""} placement="right">
                                <Box
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  bg="gray.800"
                                  p={3}
                                  borderRadius="md"
                                  width="100%"
                                  textAlign="center"
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
          <Droppable droppableId="sidebar-collapsed" isDropDisabled={true} isCombineEnabled={false} ignoreContainerClipping={false}>
            {(provided) => (
              <VStack spacing={3} ref={provided.innerRef} {...provided.droppableProps} align="center">
                {collapsedBlocks.map((type, index) => (
                  <Draggable key={type} draggableId={type} index={index}>
                    {(provided) => (
                      <Tooltip key={index} label={type} placement="right">
                        <Box
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          bg="gray.800"
                          p={2}
                          borderRadius="md"
                          width="100%"
                          textAlign="center"
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
