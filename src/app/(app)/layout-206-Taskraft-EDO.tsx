// app/(app)/layout.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Users,
  ReceiptText,
  ShieldCheck,
  FileText,
  Settings,
} from "lucide-react";
import { PropsWithChildren } from "react";
import { getCurrentUser, hasAccess, SessionUser } from "@/lib/session";

/** ---------------- NAV CONFIG ---------------- */

type Access = "standard" | "power" | "admin" | "superadmin";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** minimum access level needed to SEE the item */
  minAccess: Access;
};

type NavSection = {
  heading?: string;
  items: NavItem[];
};

const DASHBOARD_SECTION: NavSection = {
  items: [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: LayoutGrid,
      minAccess: "power",
    },
  ],
};

const MANAGEMENT_SECTION: NavSection = {
  heading: "Management",
  items: [
    { href: "/people", label: "People", icon: Users, minAccess: "standard" },
    { href: "/accounting", label: "Accounting", icon: ReceiptText, minAccess: "power" },
    { href: "/compliance", label: "Compliance", icon: ShieldCheck, minAccess: "power" },
    { href: "/invoicing", label: "Invoicing", icon: FileText, minAccess: "standard" },
  ],
};

const SETTINGS_SECTION: NavSection = {
  heading: "Settings",
  items: [
    { href: "/admin", label: "Users", icon: Settings, minAccess: "admin" },
  ],
};

/** ---------------- RENDER HELPERS ---------------- */

function NavItemRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={[
        "flex items-center gap-2 px-3 py-2 text-sm rounded-xl transition-colors",
        active
          ? "bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]"
          : "text-[hsl(var(--sidebar-foreground))]/80 hover:text-[hsl(var(--sidebar-foreground))]",
      ].join(" ")}
      style={{ outlineColor: "hsl(var(--sidebar-ring))" }}
    >
      <Icon className="h-4 w-4" />
      <span>{item.label}</span>
    </Link>
  );
}

function NavSectionBlock({
  section,
  pathname,
  user,
  mutedHeading = false,
}: {
  section: NavSection;
  pathname: string;
  user: SessionUser;
  mutedHeading?: boolean;
}) {
  const visible = section.items.filter((i) => hasAccess(user, i.minAccess));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {section.heading ? (
        <div
          className={[
            "px-1 text-xs uppercase tracking-wide",
            mutedHeading
              ? "text-[hsl(var(--sidebar-foreground))]/50"
              : "text-[hsl(var(--sidebar-foreground))]/80",
          ].join(" ")}
        >
          {section.heading}
        </div>
      ) : null}

      <nav className="flex flex-col gap-1">
        {visible.map((i) => {
          const active =
            pathname === i.href || pathname.startsWith(i.href + "/");
          return <NavItemRow key={i.href} item={i} active={active} />;
        })}
      </nav>
    </div>
  );
}

/** ---------------- LAYOUT ---------------- */

export default function AppGroupLayout({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const user = getCurrentUser(); // swap to real auth later

  return (
    <div className="min-h-dvh grid grid-cols-1 md:grid-cols-[256px_1fr]">
      {/* Sidebar */}
      <aside
        className="flex flex-col gap-4 border-b md:border-b-0 md:border-r p-4"
        style={{
          backgroundColor: "hsl(var(--sidebar-background))",
          color: "hsl(var(--sidebar-foreground))",
          borderColor: "hsl(var(--sidebar-border))",
        }}
      >
        {/* Brand (stacked) */}
        <div className="px-1 flex flex-col items-start gap-2">
          {/* Put your logo in /public/logo.svg or /public/logo.png */}
          <img src="/logo.png" alt="Taskraft" className="h-7 w-auto" />
          <span className="text-lg font-semibold tracking-tight">BizCentral</span>
        </div>

        {/* Sections */}
        <NavSectionBlock section={DASHBOARD_SECTION} pathname={pathname} user={user} />
        <NavSectionBlock section={MANAGEMENT_SECTION} pathname={pathname} user={user} mutedHeading />
        <NavSectionBlock section={SETTINGS_SECTION} pathname={pathname} user={user} mutedHeading />

        {/* Signed-in badge (name only) */}
        <div className="mt-auto mb-2 px-1 text-xs text-[hsl(var(--sidebar-foreground))]/60">
          Signed in as <span className="font-medium">{user.name}</span>
          {/* re-enable these if you ever want them visible:
          <br />
          role: <code>{user.role}</code>, level: <code>{user.accessLevel}</code>
          */}
        </div>

        {/* Logout */}
        <div className="border-t pt-3" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <Link
            href="/logout"
            className="block px-3 py-2 text-sm rounded-xl text-[hsl(var(--sidebar-foreground))]/80 hover:text-[hsl(var(--sidebar-foreground))]"
          >
            Logout
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="p-6">{children}</main>
    </div>
  );
}
