// src/components/modals/ReusableModal.tsx
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ReusableModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;

  /** Optional footer area */
  footerButtons?: React.ReactNode;

  /** Tailwind sizing helper (defaults to ~600px like your Chakra version) */
  sizeClassName?: string; // e.g. "max-w-sm", "max-w-lg", "max-w-2xl"

  /** Centered is always true with Dialog; kept for API compat */
  isCentered?: boolean;

  /** if you want inside-scroll behavior */
  scrollBehavior?: "inside" | "outside";
};

export default function ReusableModal({ isOpen, onClose, title, children, footerButtons, sizeClassName = "max-w-[600px]", scrollBehavior = "inside" }: ReusableModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={`p-0 overflow-hidden ${sizeClassName}`}>
        <DialogHeader className="border-b bg-muted/40 px-6 py-4">
          <DialogTitle className="text-base font-medium">{title}</DialogTitle>
        </DialogHeader>

        {/* Body */}
        <div className={scrollBehavior === "inside" ? "max-h-[70vh] overflow-y-auto bg-background px-6 py-4" : "bg-background px-6 py-4"}>{children}</div>

        {/* Footer */}
        {footerButtons ? <div className="border-t bg-background px-6 py-4">{footerButtons}</div> : null}
      </DialogContent>
    </Dialog>
  );
}
