import { Intent, OverlayToaster, type ToasterInstance } from "@blueprintjs/core";

let toasterInstance: ToasterInstance | null = null;

function getToaster(): ToasterInstance {
  if (!toasterInstance) {
    toasterInstance = OverlayToaster.create({
      position: "top",
    });
  }
  return toasterInstance;
}

/** Show a success toast (auto-dismiss after 3s). */
export function showSuccess(message: string): void {
  getToaster().show({
    message,
    intent: Intent.SUCCESS,
    icon: "tick-circle",
    timeout: 3000,
  });
}

/** Show an error toast (auto-dismiss after 5s). */
export function showError(message: string): void {
  getToaster().show({
    message,
    intent: Intent.DANGER,
    icon: "error",
    timeout: 5000,
  });
}

/** Show a warning toast (auto-dismiss after 5s). */
export function showWarning(message: string): void {
  getToaster().show({
    message,
    intent: Intent.WARNING,
    icon: "warning-sign",
    timeout: 5000,
  });
}

/** Show an informational toast (auto-dismiss after 3s). */
export function showInfo(message: string): void {
  getToaster().show({
    message,
    intent: Intent.PRIMARY,
    icon: "info-sign",
    timeout: 3000,
  });
}
