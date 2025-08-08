import React, { useCallback } from "react";
import {
  Box,
  Grid,
  VStack,
  Text,
  Input,
  Select,
  IconButton,
  Tooltip,
  Button,
  useColorModeValue,
} from "@chakra-ui/react";
import { FiTrash2, FiPlus, FiChevronUp, FiChevronDown } from "react-icons/fi";
// Remove joints from DataContext; we’ll use the store instead
// import { useData } from "../Main/DataContext";
import { useJointStore } from "../utils/store";

// Available variable categories.
const variableCategories = [
  "Variable (VAR)",
  "Constant (CONST)",
  "Work Object",
  "Robot Target",
];
// Available data types.
const dataTypes = ["Boolean", "Number", "String", "Coordinate", "Array"];
// Representation options for RobTarget
const repOptions = ["Cartesian", "Joint"];

// DARK‐MODE background tokens
const rowBgDark = {
  "Variable (VAR)": "green.800",
  "Constant (CONST)": "yellow.700",
  "Work Object": "orange.800",
  "Robot Target": "blue.700",
};

export default function VariableEditor({ variables, dispatch }) {
  // const { joints } = useData(); // ← not used anymore
  const storeAngles = useJointStore((s) => s.angles); // ← virtual/sim angles (deg)

  // page‐wide colors
  const bg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const headerText = useColorModeValue("gray.600", "gray.400");
  const textColor = useColorModeValue("gray.800", "white");

  // Add new variable
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
    (index, field, value) =>
      dispatch({ type: "UPDATE_VARIABLE", index, payload: { [field]: value } }),
    [dispatch]
  );

  const removeVariable = useCallback(
    (index) => dispatch({ type: "REMOVE_VARIABLE", index }),
    [dispatch]
  );

  const moveVariable = useCallback(
    (from, to) => {
      if (to < 0 || to >= variables.length) return;
      const arr = [...variables];
      const [v] = arr.splice(from, 1);
      arr.splice(to, 0, v);
      dispatch({ type: "REORDER_VARIABLES", payload: arr });
    },
    [variables, dispatch]
  );

  // TEACH now reads from the global store (virtual) instead of the physical robot
  const teachVariable = useCallback(
    (index) => {
      const v = variables[index];

      // Only “Work Object” and “Robot Target” are teachable (as before)
      if (v.type === "Work Object" || v.type === "Robot Target") {
        // Always take the virtual angles from the store (deg)
        const jointsArr =
          Array.isArray(storeAngles) && storeAngles.length === 6
            ? storeAngles
            : [0, 0, 0, 0, 0, 0];

        // Format like "(j1,j2,...,j6)" with 3 decimals
        const fmt = jointsArr.map((j) => +Number(j).toFixed(3)).join(",");

        dispatch({
          type: "UPDATE_VARIABLE",
          index,
          payload: { value: `(${fmt})` },
        });
      }
    },
    [variables, storeAngles, dispatch]
  );

  return (
    <Box
      p={4}
      bg={bg}
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="md"
      overflowX="auto"
    >
      <VStack align="stretch" spacing={4}>
        {/* Title + Add */}
        <Grid templateColumns="1fr auto" alignItems="center" mb={2}>
          <Text fontSize="2xl" fontWeight="bold" color={textColor}>
            Declarations
          </Text>
          <Tooltip label="Add Variable" placement="top">
            <IconButton
              size="sm"
              icon={<FiPlus />}
              onClick={addVariable}
              aria-label="Add Variable"
            />
          </Tooltip>
        </Grid>

        {/* Header row */}
        {variables.length > 0 && (
          <Grid
            templateColumns="2fr 1.5fr 1.5fr 1.5fr 2fr 1.5fr"
            gap={3}
            fontSize="sm"
            fontWeight="bold"
            color={headerText}
            alignItems="center"
          >
            <Text>Name</Text>
            <Text>Category</Text>
            <Text>Data&nbsp;Type</Text>
            <Text>Rep.</Text>
            <Text>Value</Text>
            <Text textAlign="center">Actions</Text>
          </Grid>
        )}

        {/* Each variable row */}
        {variables.map((variable, i) => {
          const rowBg = rowBgDark[variable.type];

          return (
            <Grid
              key={i}
              templateColumns="2fr 1.5fr 1.5fr 1.5fr 2fr 1.5fr"
              gap={3}
              alignItems="center"
              bg={rowBg}
              borderRadius="md"
              p={2}
            >
              {/* Name */}
              <Input
                size="sm"
                w="100%"
                placeholder="Name"
                value={variable.name}
                onChange={(e) => updateVariable(i, "name", e.target.value)}
              />

              {/* Category */}
              <Select
                size="sm"
                w="100%"
                value={variable.type}
                onChange={(e) => {
                  const t = e.target.value;
                  updateVariable(i, "type", t);
                  if (t === "Robot Target") {
                    updateVariable(i, "representation", "Cartesian");
                    updateVariable(i, "dataType", "Coordinate");
                  } else {
                    updateVariable(i, "representation", "");
                  }
                  if (t === "Work Object") {
                    updateVariable(i, "dataType", "Coordinate");
                  }
                }}
              >
                {variableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </Select>

              {/* Data Type */}
              <Select
                size="sm"
                w="100%"
                value={variable.dataType}
                onChange={(e) => updateVariable(i, "dataType", e.target.value)}
              >
                {dataTypes.map((dt) => (
                  <option key={dt} value={dt}>
                    {dt}
                  </option>
                ))}
              </Select>

              {/* Representation */}
              {variable.type === "Robot Target" ? (
                <Select
                  size="sm"
                  w="100%"
                  value={variable.representation}
                  onChange={(e) =>
                    updateVariable(i, "representation", e.target.value)
                  }
                >
                  {repOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
              ) : (
                <Box />
              )}

              {/* Value */}
              <Input
                size="sm"
                w="100%"
                placeholder="Value / Data"
                value={variable.value}
                onChange={(e) => updateVariable(i, "value", e.target.value)}
              />

              {/* Actions */}
              <Box display="flex" justifyContent="end" gap={1}>
                <Tooltip label="Move Up">
                  <IconButton
                    size="sm"
                    icon={<FiChevronUp />}
                    onClick={() => moveVariable(i, i - 1)}
                    aria-label="Move Up"
                  />
                </Tooltip>
                <Tooltip label="Move Down">
                  <IconButton
                    size="sm"
                    icon={<FiChevronDown />}
                    onClick={() => moveVariable(i, i + 1)}
                    aria-label="Move Down"
                  />
                </Tooltip>
                {["Work Object", "Robot Target"].includes(variable.type) && (
                  <Tooltip label="Teach position (from virtual joints)">
                    <Button
                      size="sm"
                      colorScheme="primary"
                      onClick={() => teachVariable(i)}
                    >
                      Teach
                    </Button>
                  </Tooltip>
                )}
                <Tooltip label="Remove">
                  <IconButton
                    size="sm"
                    colorScheme="red"
                    icon={<FiTrash2 />}
                    onClick={() => removeVariable(i)}
                    aria-label="Remove"
                  />
                </Tooltip>
              </Box>
            </Grid>
          );
        })}
      </VStack>
    </Box>
  );
}
