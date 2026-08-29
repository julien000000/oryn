export type NotifyType = "info" | "success" | "error";

export function notify(message: string, type: NotifyType = "info") {
  window.dispatchEvent(new CustomEvent("nexus-notify", { detail: { message, type } }));
}
