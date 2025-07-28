// client/src/components/Modals/ReusableModal.js

import React from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Text,
  useColorModeValue,
  useBreakpointValue,
} from "@chakra-ui/react";

const ReusableModal = ({ isOpen, onClose, title, children, footerButtons, size = "lg", isCentered = true, scrollBehavior = "inside" }) => {
  const bgColor = useColorModeValue("white", "gray.800");
  const headerBgColor = useColorModeValue("gray.50", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.800");
  const isMobile = useBreakpointValue({ base: true, md: false });

  return (
    <Modal size={size} isOpen={isOpen} onClose={onClose} scrollBehavior={scrollBehavior} isCentered={isCentered}>
      <ModalOverlay />
      <ModalContent maxW={isMobile ? "90%" : "600px"} borderRadius="xl">
        <ModalHeader borderTopRadius="xl" borderBottom="1px solid" borderColor={borderColor} bg={headerBgColor}>
          <Text fontSize="lg" fontWeight="500">
            {title}
          </Text>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody bg={bgColor} py={4}>
          {children}
        </ModalBody>
        {footerButtons && (
          <ModalFooter bg={bgColor} borderRadius="xl" justifyContent="space-between">
            {footerButtons}
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );
};

export default ReusableModal;
