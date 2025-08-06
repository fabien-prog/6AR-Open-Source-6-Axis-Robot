import React, { useState, useEffect } from "react";
import {
    Drawer,
    DrawerOverlay,
    DrawerContent,
    DrawerCloseButton,
    DrawerHeader,
    DrawerBody,
    Tabs,
    TabList,
    TabPanels,
    Tab,
    TabPanel,
    VStack,
    HStack,
    Box,
    Text,
    Input,
    IconButton,
    Button,
    useToast,
    Divider,
    useColorModeValue,
} from "@chakra-ui/react";
import {
    FiTrash2,
    FiEdit2,
    FiSave,
} from "react-icons/fi";

// utility to load/write JSON to localStorage
function loadList(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
        return [];
    }
}
function saveList(key, list) {
    localStorage.setItem(key, JSON.stringify(list));
}

export default function ProgramManagerDrawer({
    isOpen,
    onClose,
    // keys in localStorage
    editorKey = "programEditorPrograms",
    runnerKey = "runLogsPrograms",
}) {
    const toast = useToast();

    // two lists
    const [editorList, setEditorList] = useState([]);
    const [runnerList, setRunnerList] = useState([]);

    // name inputs for new saves
    const [newEditorName, setNewEditorName] = useState("");
    const [newRunnerName, setNewRunnerName] = useState("");

    // editing names
    const [editId, setEditId] = useState(null);
    const [editName, setEditName] = useState("");

    // reload lists whenever drawer opens
    useEffect(() => {
        if (!isOpen) return;
        setEditorList(loadList(editorKey));
        setRunnerList(loadList(runnerKey));
        setNewEditorName("");
        setNewRunnerName("");
        setEditId(null);
        setEditName("");
    }, [isOpen, editorKey, runnerKey]);

    // --- Editor tab actions ---
    const saveNewEditor = () => {
        const raw = localStorage.getItem("programProject");
        if (!raw) {
            toast({ title: "No program to save from Editor", status: "warning" });
            return;
        }
        if (!newEditorName.trim()) {
            toast({ title: "Enter a name", status: "warning" });
            return;
        }
        const state = JSON.parse(raw);
        const entry = { id: Date.now(), name: newEditorName.trim(), state };
        const next = [...editorList, entry];
        setEditorList(next);
        saveList(editorKey, next);
        toast({ title: "Saved in Editor", status: "success" });
        setNewEditorName("");
    };

    const loadEditor = (prog) => {
        window.dispatchEvent(new CustomEvent("loadEditorProgram", { detail: prog }));
        toast({ title: `"${prog.name}" loaded in Editor`, status: "info" });
        onClose();
    };

    const deleteEditor = (id) => {
        const next = editorList.filter((p) => p.id !== id);
        setEditorList(next);
        saveList(editorKey, next);
        toast({ title: "Deleted", status: "info" });
    };

    const startRename = (p) => {
        setEditId(p.id);
        setEditName(p.name);
    };
    const commitRename = (key, list, setList) => {
        if (!editName.trim()) return;
        const next = list.map((p) =>
            p.id === editId ? { ...p, name: editName.trim() } : p
        );
        setList(next);
        saveList(key, next);
        toast({ title: "Renamed", status: "success" });
        setEditId(null);
        setEditName("");
    };

    // --- Runner tab actions (same pattern, but use `code` from localStorage["runProgram"]) ---
    const saveNewRunner = () => {
        const code = localStorage.getItem("runProgram");
        if (!code) {
            toast({ title: "No code to save from Runner", status: "warning" });
            return;
        }
        if (!newRunnerName.trim()) {
            toast({ title: "Enter a name", status: "warning" });
            return;
        }
        const entry = { id: Date.now(), name: newRunnerName.trim(), code };
        const next = [...runnerList, entry];
        setRunnerList(next);
        saveList(runnerKey, next);
        toast({ title: "Saved in Runner", status: "success" });
        setNewRunnerName("");
    };
    const loadRunner = (prog) => {
        window.dispatchEvent(new CustomEvent("loadRunnerProgram", { detail: prog }));
        toast({ title: `"${prog.name}" loaded in Runner`, status: "info" });
        onClose();
    };
    const deleteRunner = (id) => {
        const next = runnerList.filter((p) => p.id !== id);
        setRunnerList(next);
        saveList(runnerKey, next);
        toast({ title: "Deleted", status: "info" });
    };

    const bg = useColorModeValue("white", "gray.800");
    const border = useColorModeValue("gray.200", "gray.600");

    return (
        <Drawer isOpen={isOpen} placement="right" size="xl" onClose={onClose}>
            <DrawerOverlay />
            <DrawerContent bg={bg}>
                <DrawerCloseButton />
                <DrawerHeader borderBottom="1px solid" borderColor={border}>
                    Manage Programs
                </DrawerHeader>
                <DrawerBody p={0}>
                    <Tabs isFitted>
                        <TabList mb="1em" bg={border}>
                            <Tab>Editor</Tab>
                            <Tab>Runner</Tab>
                        </TabList>
                        <TabPanels p={4}>
                            {/* ── Editor Tab ────────────────────────── */}
                            <TabPanel>
                                <VStack spacing={4} align="stretch">
                                    <HStack>
                                        <Input
                                            placeholder="New editor program name…"
                                            value={newEditorName}
                                            onChange={(e) => setNewEditorName(e.target.value)}
                                        />
                                        <IconButton
                                            colorScheme="green"
                                            icon={<FiSave />}
                                            aria-label="Save"
                                            onClick={saveNewEditor}
                                        />
                                    </HStack>
                                    <Divider />
                                    <VStack spacing={2} align="stretch">
                                        {editorList.length === 0 && (
                                            <Text color="gray.500" textAlign="center">
                                                No editor programs yet
                                            </Text>
                                        )}
                                        {editorList.map((p) => (
                                            <Box
                                                key={p.id}
                                                p={2}
                                                border="1px solid"
                                                borderColor={border}
                                                borderRadius="md"
                                            >
                                                <HStack justify="space-between">
                                                    {editId === p.id ? (
                                                        <HStack flex="1">
                                                            <Input
                                                                value={editName}
                                                                onChange={(e) => setEditName(e.target.value)}
                                                                size="sm"
                                                            />
                                                            <Button
                                                                size="sm"
                                                                onClick={() =>
                                                                    commitRename(editorKey, editorList, setEditorList)
                                                                }
                                                            >
                                                                OK
                                                            </Button>
                                                        </HStack>
                                                    ) : (
                                                        <Text flex="1">{p.name}</Text>
                                                    )}
                                                    <HStack spacing={1}>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => loadEditor(p)}
                                                        >
                                                            Load
                                                        </Button>
                                                        <IconButton
                                                            size="sm"
                                                            icon={<FiEdit2 />}
                                                            aria-label="Rename"
                                                            onClick={() => startRename(p)}
                                                        />
                                                        <IconButton
                                                            size="sm"
                                                            icon={<FiTrash2 />}
                                                            aria-label="Delete"
                                                            onClick={() => deleteEditor(p.id)}
                                                        />
                                                    </HStack>
                                                </HStack>
                                            </Box>
                                        ))}
                                    </VStack>
                                </VStack>
                            </TabPanel>

                            {/* ── Runner Tab ────────────────────────── */}
                            <TabPanel>
                                <VStack spacing={4} align="stretch">
                                    <HStack>
                                        <Input
                                            placeholder="New runner program name…"
                                            value={newRunnerName}
                                            onChange={(e) => setNewRunnerName(e.target.value)}
                                        />
                                        <IconButton
                                            colorScheme="green"
                                            icon={<FiSave />}
                                            aria-label="Save"
                                            onClick={saveNewRunner}
                                        />
                                    </HStack>
                                    <Divider />
                                    <VStack spacing={2} align="stretch">
                                        {runnerList.length === 0 && (
                                            <Text color="gray.500" textAlign="center">
                                                No runner programs yet
                                            </Text>
                                        )}
                                        {runnerList.map((p) => (
                                            <Box
                                                key={p.id}
                                                p={2}
                                                border="1px solid"
                                                borderColor={border}
                                                borderRadius="md"
                                            >
                                                <HStack justify="space-between">
                                                    {editId === p.id ? (
                                                        <HStack flex="1">
                                                            <Input
                                                                value={editName}
                                                                onChange={(e) => setEditName(e.target.value)}
                                                                size="sm"
                                                            />
                                                            <Button
                                                                size="sm"
                                                                onClick={() =>
                                                                    commitRename(runnerKey, runnerList, setRunnerList)
                                                                }
                                                            >
                                                                OK
                                                            </Button>
                                                        </HStack>
                                                    ) : (
                                                        <Text flex="1">{p.name}</Text>
                                                    )}
                                                    <HStack spacing={1}>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => loadRunner(p)}
                                                        >
                                                            Load
                                                        </Button>
                                                        <IconButton
                                                            size="sm"
                                                            icon={<FiEdit2 />}
                                                            aria-label="Rename"
                                                            onClick={() => startRename(p)}
                                                        />
                                                        <IconButton
                                                            size="sm"
                                                            icon={<FiTrash2 />}
                                                            aria-label="Delete"
                                                            onClick={() => deleteRunner(p.id)}
                                                        />
                                                    </HStack>
                                                </HStack>
                                            </Box>
                                        ))}
                                    </VStack>
                                </VStack>
                            </TabPanel>
                        </TabPanels>
                    </Tabs>
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    );
}
