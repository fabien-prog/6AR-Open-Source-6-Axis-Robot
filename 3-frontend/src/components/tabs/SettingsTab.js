import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Box, Text, VStack, SimpleGrid, Button, FormControl, FormLabel, Input,
  useToast, useDisclosure,
} from "@chakra-ui/react";
import { useData } from "../Main/DataContext";
import ConfirmationModal from "../modals/ConfirmationModal";

export default React.memo(function SettingsTab() {
  const { parameters = {}, listParameters, setParam, restartTeensy } = useData();
  const [local, setLocal] = useState({});
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();

  // debounce map per-key so rapid typing doesn't hammer setParam
  const debounceRef = useRef({}); // key -> timeout id
  const DEBOUNCE_MS = 250;

  useEffect(() => {
    listParameters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (parameters && Object.keys(parameters).length) {
      setLocal(parameters);
    }
  }, [parameters]);

  const handleRestart = useCallback(() => {
    restartTeensy();
    setLocal({});
    toast({ title: "Teensy restarting...", status: "info", duration: 1500 });
    const id = setTimeout(() => { listParameters(); }, 2000);
    return () => clearTimeout(id);
  }, [restartTeensy, listParameters, toast]);

  const handleChange = useCallback((key, raw) => {
    // update local immediately for snappy UI
    const val = raw === "" || isNaN(raw) ? raw : parseFloat(raw);
    setLocal(prev => (prev[key] === val ? prev : { ...prev, [key]: val }));

    // debounce the actual setParam call
    if (debounceRef.current[key]) clearTimeout(debounceRef.current[key]);
    debounceRef.current[key] = setTimeout(() => {
      setParam(key, val);
      toast({
        title: "Saved",
        description: `${key} = ${val}`,
        status: "success",
        duration: 800,
        isClosable: true,
      });
      debounceRef.current[key] = null;
    }, DEBOUNCE_MS);
  }, [setParam, toast]);

  // ── Derived “groups” are memoized ─────────────────────────
  const jointGroups = useMemo(() => {
    const groups = {};
    for (const k in local) {
      if (k.startsWith("joint")) {
        const grp = k.split(".")[0];
        (groups[grp] ||= []).push(k);
      }
    }
    const names = Object.keys(groups).sort(
      (a, b) => parseInt(a.slice(5), 10) - parseInt(b.slice(5), 10)
    );
    return { groups, names };
  }, [local]);

  if (!Object.keys(local).length) {
    return (
      <Box p={6}>
        <Text>Loading settings…</Text>
        <Button mt={4} colorScheme="red" onClick={handleRestart}>
          Restart Teensy
        </Button>
      </Box>
    );
  }

  return (
    <Box p={6} overflowY="auto">
      <Text fontSize="2xl" fontWeight="bold" mb={6}>Joint Parameters</Text>
      <Button onClick={handleRestart} colorScheme="red" size="md" mb={6}>
        Restart Teensy
      </Button>

      <SimpleGrid columns={[1, 2, 3]} spacing={4}>
        {jointGroups.names.map(grp => (
          <Box key={grp} borderWidth="1px" borderRadius="md" p={4} shadow="sm" bg="gray.700">
            <Text fontSize="lg" fontWeight="semibold" mb={3}>
              Joint {grp.replace("joint", "")}
            </Text>
            <VStack spacing={3} align="stretch">
              {jointGroups.groups[grp].map(key => (
                <FormControl key={key}>
                  <FormLabel fontSize="sm">{key.split(".")[1]}</FormLabel>
                  <Input
                    size="sm"
                    value={local[key]}
                    onChange={e => handleChange(key, e.target.value)}
                  />
                </FormControl>
              ))}
            </VStack>
          </Box>
        ))}
      </SimpleGrid>

      <Button mt={6} colorScheme="red" onClick={onOpen}>
        Reset to Factory Defaults
      </Button>

      <ConfirmationModal
        isOpen={isOpen}
        onClose={onClose}
        onConfirm={() => {
          setParam("ResetToFactory", 1);
          listParameters();
          onClose();
        }}
        title="Reset to Defaults"
        body="This will erase all custom settings. Continue?"
      />
    </Box>
  );
});
