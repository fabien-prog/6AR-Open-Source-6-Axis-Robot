import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three-stdlib";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

import type { ExtraModelProps } from "@/features/Robot/ExtraModel";

type Unit = "mm" | "cm" | "m" | "in" | "ft";

const FACTORS: Record<Unit, number> = {
  mm: 1000,
  cm: 100,
  m: 1,
  in: 39.3701,
  ft: 3.28084,
};

function num(s: string, fallback = 0) {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : fallback;
}

export default function AddStlDialog({ onAdd }: { onAdd: (extra: ExtraModelProps) => void }) {
  const [open, setOpen] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [unit, setUnit] = useState<Unit>("mm");
  const [scaleOverride, setScaleOverride] = useState("");

  const [bbox, setBbox] = useState({ x: 0, y: 0, z: 0 });

  const [posX, setPosX] = useState("0");
  const [posY, setPosY] = useState("0");
  const [posZ, setPosZ] = useState("0");

  const [rotX, setRotX] = useState("0");
  const [rotY, setRotY] = useState("0");
  const [rotZ, setRotZ] = useState("0");

  const scale = useMemo(() => {
    // default: convert STL-units to meters
    const defaultScale = 1 / FACTORS[unit];
    const o = num(scaleOverride, NaN);
    return Number.isFinite(o) ? o : defaultScale;
  }, [unit, scaleOverride]);

  // Compute bbox when file changes
  useEffect(() => {
    if (!file) {
      setBbox({ x: 0, y: 0, z: 0 });
      return;
    }

    const url = URL.createObjectURL(file);
    const loader = new STLLoader();

    loader.load(
      url,
      (geom) => {
        geom.computeBoundingBox();
        const size = new THREE.Vector3();
        geom.boundingBox?.getSize(size);
        setBbox({ x: size.x, y: size.y, z: size.z });
        URL.revokeObjectURL(url);
      },
      undefined,
      () => URL.revokeObjectURL(url),
    );
  }, [file]);

  const handleAdd = () => {
    if (!file) return;

    const url = URL.createObjectURL(file);

    const posMeters: [number, number, number] = [num(posX) * scale, num(posY) * scale, num(posZ) * scale];

    const rotRad: [number, number, number] = [THREE.MathUtils.degToRad(num(rotX)), THREE.MathUtils.degToRad(num(rotY)), THREE.MathUtils.degToRad(num(rotZ))];

    onAdd({
      url,
      position: posMeters,
      rotation: rotRad,
      scale: 1, // we already baked scale into position; keep mesh scale separate (or set this to scale if you prefer)
    });

    toast.success("STL added");
    setOpen(false);
  };

  const rawDims = `${bbox.x.toFixed(2)} × ${bbox.y.toFixed(2)} × ${bbox.z.toFixed(2)} (${unit})`;
  const metersDims = `${(bbox.x / FACTORS[unit]).toFixed(3)} × ${(bbox.y / FACTORS[unit]).toFixed(3)} × ${(bbox.z / FACTORS[unit]).toFixed(3)} (m)`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Add STL
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add STL Object</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>STL File</Label>
            <Input type="file" accept=".stl" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Units</Label>
              <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                <option value="mm">Millimeters</option>
                <option value="cm">Centimeters</option>
                <option value="m">Meters</option>
                <option value="in">Inches</option>
                <option value="ft">Feet</option>
              </select>
            </div>

            <div className="col-span-2 space-y-2">
              <Label>Manual Scale Override</Label>
              <Input value={scaleOverride} onChange={(e) => setScaleOverride(e.target.value)} placeholder={(1 / FACTORS[unit]).toFixed(6)} />
              <div className="text-xs text-muted-foreground">Leave blank to use 1 / {FACTORS[unit]}.</div>
            </div>
          </div>

          <Separator />

          {file && (
            <div className="rounded-md border p-3 text-sm">
              <div className="font-semibold">Dimensions</div>
              <div className="mt-1 text-muted-foreground">Raw: {rawDims}</div>
              <div className="text-muted-foreground">Meters: {metersDims}</div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Pos X ({unit})</Label>
              <Input value={posX} onChange={(e) => setPosX(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Pos Y ({unit})</Label>
              <Input value={posY} onChange={(e) => setPosY(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Pos Z ({unit})</Label>
              <Input value={posZ} onChange={(e) => setPosZ(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Rot X (°)</Label>
              <Input value={rotX} onChange={(e) => setRotX(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Rot Y (°)</Label>
              <Input value={rotY} onChange={(e) => setRotY(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Rot Z (°)</Label>
              <Input value={rotZ} onChange={(e) => setRotZ(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!file}>
            Add to Scene
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
