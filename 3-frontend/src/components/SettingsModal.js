// src/components/SettingsModal.jsx
import React from "react";
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
} from "@chakra-ui/react";
import SettingsTab from "./tabs/SettingsTab";

const SettingsModal = ({ isOpen, onClose }) => (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent
            bg="gray.900"
            borderRadius="xl"        // <-- full‐corner radius
            overflow="hidden"         // <-- clip children (useful if header has its own bg)
        >
            <ModalHeader
                bg="gray.700"
                borderTopRadius="xl"    // <-- just top corners
            >
                Settings
            </ModalHeader>
            <ModalCloseButton />
            <ModalBody p={0}>
                <SettingsTab />
            </ModalBody>
        </ModalContent>
    </Modal>
);

export default SettingsModal;
