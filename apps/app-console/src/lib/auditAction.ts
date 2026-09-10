/**
 * Presentation helpers for audit log actions.
 *
 * Actions reach the console in two shapes: the dotted `<resource>.<verb>`
 * form written by `writeAuditLog` ("object.create") and the bare verb written
 * by `AuditLogger` ("CREATE").  Both must colour the same way, so the verb is
 * what presentation keys off.
 */

/** Blueprint's `Intent`, as a plain union so this module stays UI-free. */
export type AuditActionIntent =
  | "none"
  | "primary"
  | "success"
  | "warning"
  | "danger";

/** The verb of an audit action, upper-cased, whether bare or dotted. */
export function auditActionVerb(action: string): string {
  const dot = action.lastIndexOf(".");
  return (dot === -1 ? action : action.slice(dot + 1)).toUpperCase();
}

/** Tag colour for an audit action. */
export function intentForAction(action: string): AuditActionIntent {
  switch (auditActionVerb(action)) {
    case "CREATE":
      return "success";
    case "UPDATE":
      return "primary";
    case "DELETE":
      return "danger";
    case "EXECUTE":
      return "warning";
    default:
      return "none";
  }
}
