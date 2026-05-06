import Link from "next/link";
import { ChevronRight, Bell, Video, MessageSquare, HelpCircle } from "lucide-react";

export function SettingsContent() {
  return (
    <div className="flex flex-col gap-6 animate-page-in">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Notifications</h3>
        <div className="flex flex-col gap-1">
          <SettingsLink href="/settings/notifications" icon={Bell} label="Notification Preferences" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">General</h3>
        <div className="flex flex-col gap-1">
          <SettingsLink href="/settings/video" icon={Video} label="Video Settings" />
          <SettingsLink href="/settings/feedback" icon={MessageSquare} label="Feedback" />
          <SettingsLink href="/settings/help" icon={HelpCircle} label="Help & Support" />
        </div>
      </div>
    </div>
  );
}

function SettingsLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-border border-l-2 border-l-blue-500 px-4 py-3.5 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
