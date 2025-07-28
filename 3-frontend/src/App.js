import React from "react";
import { Box, Flex } from "@chakra-ui/react";
import MainTabs from "./components/MainTabs";

function App() {
  return (
    <Flex justify="center" align="start"  overflowY='hidden' h="100vh">
      <Box maxW="100vw" minW="600px" maxH="1024px" w="100%">
        <MainTabs />
      </Box>
    </Flex>
  );
}

export default App;
