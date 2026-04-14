import { ShieldAlert } from "lucide-react";

export default function NoAccess({
  title = "Access restricted",
  hint,
}: {
  title?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/40 p-6 text-sm">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" />
        <div>
          <div className="font-medium">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            You don&apos;t have permission to view this page.
            {hint ? <> {hint}</> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
