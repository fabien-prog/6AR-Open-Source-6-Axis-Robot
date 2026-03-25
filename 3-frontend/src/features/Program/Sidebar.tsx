import { useMemo } from "react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const categories = [
  { title: "Standard", blocks: ["Move L", "Move J", "Home"] },
  { title: "I/O", blocks: ["SetDO", "WaitDI"] },
  { title: "Conditionals", blocks: ["If", "Else", "End If", "Then"] },
  { title: "Loops", blocks: ["For Loop", "End For"] },
  { title: "Miscellaneous", blocks: ["Counter", "Console Log", "Math"] },
] as const;

const blockDescriptions: Record<string, string[]> = {
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
  Home: ["Home — Homing Routine", "Homes all axes using their limit switches.", "No parameters."],
  If: [
    "If — Conditional Start",
    "Begins an IF block based on a comparison.",
    "Parameters:",
    "- Variable: Choose DI input, a Variable, or a Constant",
    "- Operator: ==, !=, <, >",
    "- Value: Right-hand side to compare",
  ],
  Else: ["Else — Conditional Else (not working yet)", "Defines the alternate branch of an IF block.", "No parameters."],
  "End If": ["End If — Conditional End", "Closes the IF/ELSE structure.", "No parameters."],
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
  "End For": ["End For — Loop End", "Closes the FOR loop.", "No parameters."],
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
  SetDO: ["SetDO(pin, state)", "Sets a digital output pin to 0 or 1.", "pin: DO_n", "state: 0 or 1"],
  WaitDI: ["WaitDI(pin, state)", "Pauses execution until a digital input matches the state.", "pin: DI_n", "state: 0 or 1"],
};

export default function Sidebar({ expanded, setExpanded }: { expanded: boolean; setExpanded: (v: boolean) => void }) {
  const collapsedBlocks = useMemo(() => categories.flatMap((c) => c.blocks), []);

  return (
    <TooltipProvider>
      <div className={cn("absolute left-0 top-0 z-[2] rounded-lg bg-zinc-800 p-3 shadow-lg transition-[width] duration-300", expanded ? "w-[240px]" : "w-[60px]")}>
        <div className="flex flex-col gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="ml-auto text-zinc-100 hover:bg-zinc-700" onClick={() => setExpanded(!expanded)}>
                {expanded ? <FiChevronLeft size={18} /> : <FiChevronRight size={18} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{expanded ? "Collapse Sidebar" : "Expand Sidebar"}</TooltipContent>
          </Tooltip>

          {expanded && <div className="mb-1 text-center text-lg font-semibold text-zinc-100">Blocks</div>}

          {expanded ? (
            <Accordion type="multiple" className="w-full">
              {categories.map((category, catIndex) => (
                <AccordionItem key={category.title} value={category.title} className="border-0">
                  <AccordionTrigger className="px-1 py-1 text-sm font-semibold text-zinc-100 hover:no-underline">{category.title}</AccordionTrigger>

                  <AccordionContent className="pt-2">
                    <Droppable droppableId={`sidebar-${catIndex}`} isDropDisabled>
                      {(provided: any) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-2">
                          {category.blocks.map((type, idx) => (
                            <Draggable key={type} draggableId={type} index={idx}>
                              {(prov: any) => (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      ref={prov.innerRef}
                                      {...prov.draggableProps}
                                      {...prov.dragHandleProps}
                                      className="cursor-grab rounded-md bg-zinc-900 p-2 text-sm text-zinc-100 hover:bg-zinc-700"
                                    >
                                      {type}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-[320px] whitespace-pre-wrap">
                                    <div className="space-y-1">
                                      {(blockDescriptions[type] || [type]).map((line, i) => (
                                        <div key={i} className="text-xs text-zinc-100">
                                          {line}
                                        </div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <Droppable droppableId="sidebar-collapsed" isDropDisabled>
              {(provided: any) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col items-center gap-2">
                  {collapsedBlocks.map((type, idx) => (
                    <Draggable key={type} draggableId={type} index={idx}>
                      {(prov: any) => (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps} className="cursor-grab rounded-md bg-zinc-900 p-2 text-sm text-zinc-100 hover:bg-zinc-700">
                              {type.charAt(0)}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right">{type}</TooltipContent>
                        </Tooltip>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
