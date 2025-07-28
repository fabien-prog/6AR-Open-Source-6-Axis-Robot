// ConfirmationModal.js
import React from "react";
import { Box, Button, Text } from "@chakra-ui/react";
import ReusableModal from "./ReusableModal";

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = true,
}) => {
  const standardFooterButtons = (
    <Box flex='1' display="flex" justifyContent="flex-end">
      <Button variant="outline" mr={3} onClick={onClose}>
        {cancelText}
      </Button>
      <Button colorScheme="primary" onClick={onConfirm}>
        {confirmText}
      </Button>
    </Box>
  );

  const destructiveFooterButtons = (
    <Box flex='1' display="flex" justifyContent="flex-end">
      <Button colorScheme="gray" mr={3} variant="outline" onClick={onClose}>
        {cancelText}
      </Button>
      <Button colorScheme="red" onClick={onConfirm}>
        {confirmText}
      </Button>
    </Box>
  );

  const footerButtons = isDestructive ? destructiveFooterButtons : standardFooterButtons;

  return (
    <ReusableModal isOpen={isOpen} onClose={onClose} title={title} footerButtons={footerButtons} size="sm">
      <Text fontSize="md">{description}</Text>
    </ReusableModal>
  );
};

export default ConfirmationModal;
