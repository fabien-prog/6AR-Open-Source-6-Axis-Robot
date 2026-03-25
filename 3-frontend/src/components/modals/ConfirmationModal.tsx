// src/components/modals/ConfirmationModal.tsx
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConfirmationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;

  title: string;
  description: string;

  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
};

export default function ConfirmationModal({ isOpen, onClose, onConfirm, title, description, confirmText = "Confirm", cancelText = "Cancel", isDestructive = true }: ConfirmationModalProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>{cancelText}</AlertDialogCancel>

          <AlertDialogAction
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={cn(buttonVariants({ variant: isDestructive ? "destructive" : "default" }))}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
