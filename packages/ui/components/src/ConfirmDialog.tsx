import { Dialog, DialogBody, DialogFooter, Button, Intent } from "@blueprintjs/core";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  intent?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  intent = "primary",
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element {
  const intentValue = intent === "danger" ? Intent.DANGER : Intent.PRIMARY;

  return (
    <Dialog isOpen={isOpen} onClose={onCancel} title={title}>
      <DialogBody>
        <p>{message}</p>
      </DialogBody>
      <DialogFooter
        actions={
          <>
            <Button text={cancelLabel} onClick={onCancel} />
            <Button
              text={confirmLabel}
              intent={intentValue}
              onClick={onConfirm}
            />
          </>
        }
      />
    </Dialog>
  );
}
