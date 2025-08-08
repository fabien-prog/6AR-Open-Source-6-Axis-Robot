import React, { useEffect } from "react";
import { Box, Flex, useColorMode } from "@chakra-ui/react";
import MainTabs from "./components/MainTabs";

function App() {
  const { setColorMode } = useColorMode();

  useEffect(() => {
    setColorMode("dark"); // Force dark mode on mount
  }, [setColorMode]);

  return (
    <Flex justify="center" align="start" overflowY="hidden" h="100vh">
      <Box maxW="100vw" minW="600px" maxH="1024px" w="100%">
        <MainTabs />
      </Box>
    </Flex>
  );
}

export default App;
