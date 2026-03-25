// src/features/Runner/ProgramManagerDrawer.tsx
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FiTrash2, FiEdit2, FiSave } from "react-icons/fi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type EditorEntry = { id: number; name: string; state: any };
type RunnerEntry = { id: number; name: string; code: string };

function loadList<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function saveList<T>(key: string, list: T[]) {
  localStorage.setItem(key, JSON.stringify(list));
}

type Props = {
  isOpen: boolean;
  onClose: () => void;

  editorKey?: string;
  runnerKey?: string;
};

export default function ProgramManagerDrawer({ isOpen, onClose, editorKey = "programEditorPrograms", runnerKey = "runLogsPrograms" }: Props) {
  const [tab, setTab] = useState<"editor" | "runner">("editor");

  const [editorList, setEditorList] = useState<EditorEntry[]>([]);
  const [runnerList, setRunnerList] = useState<RunnerEntry[]>([]);

  const [newEditorName, setNewEditorName] = useState("");
  const [newRunnerName, setNewRunnerName] = useState("");

  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  // reload lists whenever drawer opens
  useEffect(() => {
    if (!isOpen) return;

    setEditorList(loadList<EditorEntry>(editorKey));
    setRunnerList(loadList<RunnerEntry>(runnerKey));
    setNewEditorName("");
    setNewRunnerName("");
    setEditId(null);
    setEditName("");
    setTab("editor");
  }, [isOpen, editorKey, runnerKey]);

  const isEditing = useMemo(() => editId != null, [editId]);

  const startRename = (id: number, name: string) => {
    setEditId(id);
    setEditName(name);
  };

  const commitRename = () => {
    const name = editName.trim();
    if (!name || editId == null) return;

    if (tab === "editor") {
      const next = editorList.map((p) => (p.id === editId ? { ...p, name } : p));
      setEditorList(next);
      saveList(editorKey, next);
    } else {
      const next = runnerList.map((p) => (p.id === editId ? { ...p, name } : p));
      setRunnerList(next);
      saveList(runnerKey, next);
    }

    toast.success("Renamed");
    setEditId(null);
    setEditName("");
  };

  // --- Editor tab actions ---
  const saveNewEditor = () => {
    const raw = localStorage.getItem("programProject");
    if (!raw) {
      toast.warning("No program to save from Editor");
      return;
    }
    const name = newEditorName.trim();
    if (!name) {
      toast.warning("Enter a name");
      return;
    }

    let state: any;
    try {
      state = JSON.parse(raw);
    } catch {
      toast.error("Editor programProject is not valid JSON");
      return;
    }

    const entry: EditorEntry = { id: Date.now(), name, state };
    const next = [...editorList, entry];
    setEditorList(next);
    saveList(editorKey, next);
    toast.success("Saved in Editor");
    setNewEditorName("");
  };

  const loadEditor = (prog: EditorEntry) => {
    window.dispatchEvent(new CustomEvent("loadEditorProgram", { detail: prog }));
    toast.info(`"${prog.name}" loaded in Editor`);
    onClose();
  };

  const deleteEditor = (id: number) => {
    const next = editorList.filter((p) => p.id !== id);
    setEditorList(next);
    saveList(editorKey, next);
    toast.info("Deleted");
  };

  // --- Runner tab actions ---
  const saveNewRunner = () => {
    const code = localStorage.getItem("runProgram");
    if (!code) {
      toast.warning("No code to save from Runner");
      return;
    }
    const name = newRunnerName.trim();
    if (!name) {
      toast.warning("Enter a name");
      return;
    }

    const entry: RunnerEntry = { id: Date.now(), name, code };
    const next = [...runnerList, entry];
    setRunnerList(next);
    saveList(runnerKey, next);
    toast.success("Saved in Runner");
    setNewRunnerName("");
  };

  const loadRunner = (prog: RunnerEntry) => {
    window.dispatchEvent(new CustomEvent("loadRunnerProgram", { detail: prog }));
    toast.info(`"${prog.name}" loaded in Runner`);
    onClose();
  };

  const deleteRunner = (id: number) => {
    const next = runnerList.filter((p) => p.id !== id);
    setRunnerList(next);
    saveList(runnerKey, next);
    toast.info("Deleted");
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[520px] sm:w-[620px] p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Manage Programs</SheetTitle>
        </SheetHeader>

        <div className="p-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="editor">Editor</TabsTrigger>
              <TabsTrigger value="runner">Runner</TabsTrigger>
            </TabsList>

            {/* ---------------- Editor ---------------- */}
            <TabsContent value="editor" className="mt-4 space-y-4">
              <div className="flex items-center gap-2">
                <Input placeholder="New editor program name…" value={newEditorName} onChange={(e) => setNewEditorName(e.target.value)} />
                <Button variant="secondary" onClick={saveNewEditor}>
                  <FiSave className="mr-2 h-4 w-4" />
                  Save
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                {editorList.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">No editor programs yet</div>
                ) : (
                  editorList.map((p) => (
                    <div key={p.id} className="rounded-md border bg-background p-2">
                      <div className="flex items-center justify-between gap-2">
                        {editId === p.id ? (
                          <div className="flex flex-1 items-center gap-2">
                            <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9" />
                            <Button size="sm" onClick={commitRename}>
                              OK
                            </Button>
                          </div>
                        ) : (
                          <div className="flex-1 truncate text-sm">{p.name}</div>
                        )}

                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="secondary" onClick={() => loadEditor(p)}>
                            Load
                          </Button>

                          <Button size="sm" variant="outline" onClick={() => startRename(p.id, p.name)} disabled={isEditing && editId !== p.id}>
                            <FiEdit2 className="h-4 w-4" />
                          </Button>

                          <Button size="sm" variant="destructive" onClick={() => deleteEditor(p.id)}>
                            <FiTrash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* ---------------- Runner ---------------- */}
            <TabsContent value="runner" className="mt-4 space-y-4">
              <div className="flex items-center gap-2">
                <Input placeholder="New runner program name…" value={newRunnerName} onChange={(e) => setNewRunnerName(e.target.value)} />
                <Button variant="secondary" onClick={saveNewRunner}>
                  <FiSave className="mr-2 h-4 w-4" />
                  Save
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                {runnerList.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">No runner programs yet</div>
                ) : (
                  runnerList.map((p) => (
                    <div key={p.id} className="rounded-md border bg-background p-2">
                      <div className="flex items-center justify-between gap-2">
                        {editId === p.id ? (
                          <div className="flex flex-1 items-center gap-2">
                            <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9" />
                            <Button size="sm" onClick={commitRename}>
                              OK
                            </Button>
                          </div>
                        ) : (
                          <div className="flex-1 truncate text-sm">{p.name}</div>
                        )}

                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="secondary" onClick={() => loadRunner(p)}>
                            Load
                          </Button>

                          <Button size="sm" variant="outline" onClick={() => startRename(p.id, p.name)} disabled={isEditing && editId !== p.id}>
                            <FiEdit2 className="h-4 w-4" />
                          </Button>

                          <Button size="sm" variant="destructive" onClick={() => deleteRunner(p.id)}>
                            <FiTrash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
