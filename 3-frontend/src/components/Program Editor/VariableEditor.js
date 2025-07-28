// src/components/Program Editor/VariableEditor.js
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
import { FiTrash2, FiPlus } from "react-icons/fi";
import { useData } from "../Main/DataContext";  // adjust this path if needed

// Available variable categories.
const variableCategories = [
  "Variable (VAR)",
  "Constant (CONST)",
  "Work Object",
  "Robot Target",
];

// Available data types.
const dataTypes = ["Boolean", "Number", "String", "Coordinate", "Array"];

export default function VariableEditor({ variables, dispatch }) {
  const { joints } = useData();

  // colors that adapt to light/dark
  const bg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const headerText = useColorModeValue("gray.600", "gray.400");
  const textColor = useColorModeValue("gray.800", "white");

  const addVariable = () => {
    dispatch({
      type: "ADD_VARIABLE",
      payload: {
        name: "",
        type: "Constant (CONST)",
        dataType: "Number",
        value: "",
      },
    });
  };

  const updateVariable = useCallback(
    (index, field, value) => {
      dispatch({ type: "UPDATE_VARIABLE", index, payload: { [field]: value } });
    },
    [dispatch]
  );

  const removeVariable = useCallback(
    (index) => {
      dispatch({ type: "REMOVE_VARIABLE", index });
    },
    [dispatch]
  );

  const teachVariable = useCallback(
    (index) => {
      const v = variables[index];
      const jointsArr =
        Array.isArray(joints) && joints.length === 6
          ? joints
          : [0, 0, 0, 0, 0, 0];

      if (
        v.type === "Robot Target" ||
        v.type === "Work Object"
      ) {
        const fmt = jointsArr.map((j) => +j.toFixed(3)).join(",");
        dispatch({
          type: "UPDATE_VARIABLE",
          index,
          payload: { value: `(${fmt})` },
        });
      }
    },
    [variables, joints, dispatch]
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
        {/* title + add button */}
        <Grid templateColumns="1fr auto" alignItems="center" mb={2}>
          <Text fontSize="xl" fontWeight="bold" color={textColor}>
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

        {/* header row */}
        {variables.length > 0 && (
          <Grid
            templateColumns="2fr 1.5fr 1.5fr 2fr auto auto"
            gap={3}
            fontSize="sm"
            fontWeight="bold"
            color={headerText}
          >
            <Text>Name</Text>
            <Text>Category</Text>
            <Text>Data Type</Text>
            <Text>Value</Text>
            <Text textAlign="center">Teach</Text>
            <Text textAlign="center">Delete</Text>
          </Grid>
        )}

        {/* each variable */}
        {variables.map((variable, i) => (
          <Grid
            key={i}
            templateColumns="2fr 1.5fr 1.5fr 2fr auto auto"
            gap={3}
            alignItems="center"
          >
            <Input
              size="sm"
              placeholder="Name"
              value={variable.name}
              onChange={(e) => updateVariable(i, "name", e.target.value)}
            />

            <Select
              size="sm"
              value={variable.type}
              onChange={(e) => {
                const newType = e.target.value;
                updateVariable(i, "type", newType);
                if (
                  newType === "Work Object" ||
                  newType === "Robot Target"
                ) {
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

            <Select
              size="sm"
              value={variable.dataType}
              onChange={(e) => updateVariable(i, "dataType", e.target.value)}
            >
              {dataTypes.map((dt) => (
                <option key={dt} value={dt}>
                  {dt}
                </option>
              ))}
            </Select>

            <Input
              size="sm"
              placeholder="Value / Data"
              value={variable.value}
              onChange={(e) => updateVariable(i, "value", e.target.value)}
            />

            {(variable.type === "Work Object" ||
              variable.type === "Robot Target") ? (
              <Tooltip label="Teach current robot position (Move Tab)" placement="top">
                <Button
                  size="sm"
                  colorScheme="primary"
                  onClick={() => teachVariable(i)}
                >
                  Teach
                </Button>
              </Tooltip>
            ) : (
              <Box />
            )}

            <Tooltip label="Remove Variable" placement="top">
              <IconButton
                size="sm"
                colorScheme="red"
                icon={<FiTrash2 />}
                onClick={() => removeVariable(i)}
                aria-label="Remove Variable"
              />
            </Tooltip>
          </Grid>
        ))}
      </VStack>
    </Box>
  );
}
