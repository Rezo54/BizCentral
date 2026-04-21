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
import { PropsWithChildren, useEffect, useState } from "react";
import { getCurrentUser, hasAccess, SessionUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { getAuth, signOut } from "firebase/auth";

/** ---------- Types & Nav Config ---------- */

type Access = "standard" | "power_user" | "admin" | "superadmin";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
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
      minAccess: "power_user",
    },
  ],
};

const MANAGEMENT_SECTION: NavSection = {
  heading: "Management",
  items: [
    { href: "/people", label: "People", icon: Users, minAccess: "standard" },
    { href: "/accounting", label: "Accounting", icon: ReceiptText, minAccess: "power_user" },
    { href: "/compliance", label: "Compliance", icon: ShieldCheck, minAccess: "power_user" },
    { href: "/invoicing", label: "Invoicing", icon: FileText, minAccess: "standard" },
  ],
};

const SETTINGS_SECTION: NavSection = {
  heading: "Admin Settings",
  items: [
    {
      href: "/admin/users",
      label: "Users",
      icon: Settings,
      minAccess: "admin",
    },
    {
      href: "/admin/upload-edo",
      label: "Upload EDO Data",
      icon: FileText,
      minAccess: "admin",
    },
    {
      href: "/admin/upload-reliever",
      label: "Upload Relievers",
      icon: FileText,
      minAccess: "admin",
    },
  ],
};

/** ---------- Render Helpers ---------- */

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
      {section.heading && (
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
      )}

      <nav className="flex flex-col gap-1">
        {visible.map((i) => {
          const active =
            pathname === i.href ||
            (pathname.startsWith(i.href + "/") &&
              !pathname.includes("/admin/upload-edo") &&
              !pathname.includes("/admin/upload-reliever"));

          return <NavItemRow key={i.href} item={i} active={active} />;
        })}
      </nav>
    </div>
  );
}

/** ---------- Layout ---------- */

export default function AppGroupLayout({ children }: PropsWithChildren) {
  const pathname = usePathname();

  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const u = await getCurrentUser();
      setUser(u);
      setLoading(false);
    }
    loadUser();
  }, []);

  if (loading) return null;
  if (!user) return null;

  return (
    <div className="min-h-dvh flex">

      {/* 🔥 FIXED SIDEBAR */}
      <aside
        className="hidden md:flex fixed left-0 top-0 h-screen w-64 flex-col gap-4 border-r p-4"
        style={{
          backgroundColor: "hsl(var(--sidebar-background))",
          color: "hsl(var(--sidebar-foreground))",
          borderColor: "hsl(var(--sidebar-border))",
        }}
      >
        {/* Brand */}
        <div className="px-1 flex flex-col items-start gap-2">
          <img src="/logo.png" alt="Taskraft" className="h-7 w-auto" />
          <span className="flex items-center gap-1 font-bold">
            Bi
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              className="inline-block relative top-[2px] rotate-[-339deg]"
              style={{ filter: "drop-shadow(0 0 4px #facc15)" }}
            >
              <path
                d="M4 8 L20 1 L10 10 L22 14 L5 21 L14 11 L4 10 Z"
                fill="#facc15"
              />
            </svg>
            Central
          </span>
        </div>

        {/* 🔥 SCROLLABLE MENU */}
        <div className="flex-1 overflow-y-auto space-y-4">
          <NavSectionBlock section={DASHBOARD_SECTION} pathname={pathname} user={user} />
          <NavSectionBlock section={MANAGEMENT_SECTION} pathname={pathname} user={user} mutedHeading />
          <NavSectionBlock section={SETTINGS_SECTION} pathname={pathname} user={user} mutedHeading />
        </div>

        {/* Signed-in */}
        <div className="px-1 text-xs text-[hsl(var(--sidebar-foreground))]/60">
          Signed in as <span className="font-medium">{user.name}</span>
        </div>

        {/* 🔥 LOGOUT LOCKED BOTTOM */}
        <div className="pt-4">
          <Button
            variant="outline"
            className="w-full text-muted-foreground hover:text-foreground"
            onClick={async () => {
              try {
                const auth = getAuth();
                await signOut(auth);
              } catch (e) {
                console.error("Logout failed", e);
              }

              window.location.href = "/";
            }}
          >
            Logout
          </Button>
        </div>
      </aside>

      {/* 🔥 MAIN CONTENT */}
      <main className="flex-1 p-6 md:ml-64">
        {children}
      </main>
    </div>
  );
}