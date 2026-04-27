import { toast } from "sonner";
import { NotificationToast } from "@/components/domain/notification-toast";
import type { NotificationPayload } from "@jits/shared/types/notification";

export function showNotification(payload: NotificationPayload): void {
  toast.custom((id) => <NotificationToast id={id} payload={payload} />, {
    duration: 5000,
  });
}
