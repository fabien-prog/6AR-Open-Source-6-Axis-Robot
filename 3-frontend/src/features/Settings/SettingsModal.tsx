// src/features/Settings/SettingsModal.tsx
import { memo } from "react";
import SettingsTab from "./SettingsTab";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const SettingsModal = memo(function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="settings-modal p-0 overflow-hidden">
        <DialogHeader className="border-b bg-muted/50 px-6 py-4">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        {/* inside-scroll body */}
        <div className="max-h-[90vh] overflow-y-auto">
          <SettingsTab />
        </div>
      </DialogContent>
    </Dialog>
  );
});

export default SettingsModal;
