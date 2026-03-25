import React, { memo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useViewerRefs } from "./ViewerContext";

type ViewPreset = "iso" | "top" | "bottom" | "front" | "back" | "right" | "left";

export const Overlays = memo(function Overlays() {
  const { focusView } = useViewerRefs();

  const handleFocus = useCallback(
    (view: ViewPreset) => (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      focusView(view);
    },
    [focusView],
  );

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-50 flex flex-col gap-2">
      <Card className="pointer-events-auto max-w-[260px] px-3 py-2 text-xs">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">View</span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <div className="flex gap-1">
              <span className="inline-block w-7" />
              <Button size="icon" variant="outline" className="h-7 min-w-20 rounded-full p-0 text-[10px] leading-none" onClick={handleFocus("top")} title="Top view (+Z)">
                Top
              </Button>
              <span className="inline-block w-7" />
            </div>

            <div className="flex gap-1">
              <Button size="icon" variant="outline" className="h-7 w-7 rounded-full p-0 text-[10px] leading-none" onClick={handleFocus("right")} title="Right view (+X)">
                R
              </Button>
              <Button size="icon" variant="default" className="h-7 w-7 rounded-md p-0 text-[10px] leading-none" onClick={handleFocus("iso")} title="Isometric view">
                ISO
              </Button>
              <Button size="icon" variant="outline" className="h-7 w-7 rounded-full p-0 text-[10px] leading-none" onClick={handleFocus("left")} title="Left view (-X)">
                L
              </Button>
            </div>

            <div className="flex gap-1">
              <span className="inline-block w-7" />
              <Button size="icon" variant="outline" className="h-7 min-w-20 p-0 text-[10px] leading-none" onClick={handleFocus("bottom")} title="Bottom view (-Z)">
                Bottom
              </Button>
              <span className="inline-block w-7" />
            </div>

            <div className="mt-1 flex gap-1">
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={handleFocus("front")} title="Front view (-Y)">
                Front
              </Button>
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={handleFocus("back")} title="Back view (+Y)">
                Back
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
});
