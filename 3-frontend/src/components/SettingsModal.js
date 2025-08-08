import React from "react";
import {
    Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody,
} from "@chakra-ui/react";
import SettingsTab from "./tabs/SettingsTab";

const SettingsModal = React.memo(({ isOpen, onClose }) => (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent bg="gray.900" borderRadius="xl" overflow="hidden">
            <ModalHeader bg="gray.700" borderTopRadius="xl">Settings</ModalHeader>
            <ModalCloseButton />
            <ModalBody p={0}>
                <SettingsTab />
            </ModalBody>
        </ModalContent>
    </Modal>
));

export default SettingsModal;
