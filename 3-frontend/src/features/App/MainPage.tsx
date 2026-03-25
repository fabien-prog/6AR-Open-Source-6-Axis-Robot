import { useEffect, useState } from "react";
import { PiSlidersHorizontalBold, PiWarningCircleBold } from "react-icons/pi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

import RobotStudioTab from "@/features/Robot/RobotStudioTab";
import ProgramEditor from "@/features/Program/ProgramEditor";
import RunLogsView from "@/features/Runner/RunLogsView";
import SettingsTab from "@/features/Settings/SettingsTab";
import { useRobotStatus } from "@/contexts/robot";
import { useRobotCommands } from "@/contexts/robot/RobotCommandsContext";

function formatUptimeSeconds(msOrSeconds: number) {
  const s = msOrSeconds > 10_000 ? Math.floor(msOrSeconds / 1000) : Math.floor(msOrSeconds);
  return `${s}s`;
}

export default function MainPage() {
  const { stopAll } = useRobotCommands();
const { systemStatus, elapsedTime, connected } = useRobotStatus();
  const [view, setView] = useState<"robot" | "program" | "run">("robot");
  const [mounted, setMounted] = useState({ robot: true, program: false, run: false });

  const handleViewChange = (v: string) => {
    const key = v as keyof typeof mounted;
    setView(key);
    if (!mounted[key]) setMounted((prev) => ({ ...prev, [key]: true }));
  };

  useEffect(() => {
    const handler = () => handleViewChange("run");
    window.addEventListener("switchToRunTab", handler);
    return () => window.removeEventListener("switchToRunTab", handler);
  }, []);

  return (
    <div className="flex h-dvh w-dvw flex-col overflow-hidden text-foreground">
      {/* Header */}
      <header className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="truncate text-sm font-semibold md:text-base">6AR Robot Controller — V2</div>
            <Separator orientation="vertical" className="h-5" />

            <Badge variant={connected ? "default" : "destructive"}>{connected ? "Online" : "Offline"}</Badge>
            <Badge variant="secondary">Status: {systemStatus}</Badge>
            <Badge variant="outline">Uptime: {formatUptimeSeconds(elapsedTime)}</Badge>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Tabs value={view} onValueChange={handleViewChange} className="hidden md:block">
              <TabsList>
                <TabsTrigger value="robot">Robot</TabsTrigger>
                <TabsTrigger value="program">Program</TabsTrigger>
                <TabsTrigger value="run">Run</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="md:hidden">
              <Tabs value={view} onValueChange={handleViewChange}>
                <TabsList>
                  <TabsTrigger value="robot">Robot</TabsTrigger>
                  <TabsTrigger value="program">Prog</TabsTrigger>
                  <TabsTrigger value="run">Run</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="secondary" size="sm">
                  <PiSlidersHorizontalBold className="mr-2 h-4 w-4" />
                  Settings
                </Button>
              </SheetTrigger>

              <SheetContent side="right" className="min-w-[40vw] p-0 flex flex-col">
                <SheetHeader className="px-6 py-4 border-b">
                  <SheetTitle>Settings</SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto">
                  <SettingsTab />
                </div>
              </SheetContent>
            </Sheet>

            <Button variant="destructive" size="sm" onClick={stopAll}>
              <PiWarningCircleBold className="mr-2 h-4 w-4" />
              E-Stop
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <Tabs value={view} onValueChange={handleViewChange} className="h-full min-h-0 w-full">
          <TabsContent value="robot" className="m-0 h-full min-h-0 w-full overflow-hidden">
            <div className="h-full w-full min-h-0 overflow-hidden">
              <RobotStudioTab />
            </div>
          </TabsContent>
          <TabsContent value="program" className="m-0 h-full min-h-0 w-full overflow-hidden">
            {mounted.program && (
              <div className="h-full w-full min-h-0 overflow-hidden">
                <ScrollArea className="h-full min-h-0">
                  <div className="p-4">
                    <ProgramEditor />
                  </div>
                </ScrollArea>
              </div>
            )}
          </TabsContent>
          <TabsContent value="run" className="m-0 h-full min-h-0 w-full overflow-hidden">
            {mounted.run && (
              <div className="h-full w-full min-h-0 overflow-hidden">
                <RunLogsView />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
