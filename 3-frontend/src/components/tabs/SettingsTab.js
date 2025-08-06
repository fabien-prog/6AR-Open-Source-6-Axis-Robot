import React, { useState, useEffect } from "react";
import {
  Box,
  Text,
  VStack,
  SimpleGrid,
  Button,
  FormControl,
  FormLabel,
  Input,
  useToast,
  useDisclosure,
} from "@chakra-ui/react";
import { useData } from "../Main/DataContext";
import ConfirmationModal from "../modals/ConfirmationModal";

export default function SettingsTab() {
  const { parameters = {}, listParameters, setParam, restartTeensy } = useData();
  const [local, setLocal] = useState({});
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    listParameters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (Object.keys(parameters).length) {
      setLocal(parameters);
    }
  }, [parameters]);

  const handleRestart = () => {
    restartTeensy();  // emits command once
    setLocal({});     // clear local params state
    toast({ title: "Teensy restarting...", status: "info", duration: 1500 });

    // Wait briefly to allow the restart command to send, then refresh parameters after reconnect
    setTimeout(() => {
      listParameters();
    }, 2000);
  };

  const handleChange = (key, raw) => {
    const val = raw === "" || isNaN(raw) ? raw : parseFloat(raw);
    setParam(key, val);
    setLocal(prev => ({ ...prev, [key]: val }));
    toast({
      title: "Saved",
      description: `${key} = ${val}`,
      status: "success",
      duration: 800,
      isClosable: true,
    });
  };

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

  // group by jointX
  const groups = {};
  Object.keys(local).forEach(key => {
    if (key.startsWith("joint")) {
      const grp = key.split(".")[0];
      groups[grp] = groups[grp] || [];
      groups[grp].push(key);
    }
  });

  const jointNames = Object.keys(groups).sort((a, b) =>
    parseInt(a.replace("joint", "")) - parseInt(b.replace("joint", ""))
  );

  return (
    <Box p={6} overflowY="auto">
      <Text fontSize="2xl" fontWeight="bold" mb={6}>Joint Parameters</Text>
      <Button onClick={handleRestart} colorScheme="red" size="md" mb={6}>
        Restart Teensy
      </Button>

      <SimpleGrid columns={[1, 2, 3]} spacing={4}>
        {jointNames.map(grp => (
          <Box key={grp} borderWidth="1px" borderRadius="md" p={4} shadow="sm" bg='gray.700'>
            <Text fontSize="lg" fontWeight="semibold" mb={3}>
              Joint {grp.replace("joint", "")}
            </Text>
            <VStack spacing={3} align="stretch">
              {groups[grp].map(key => (
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
}
