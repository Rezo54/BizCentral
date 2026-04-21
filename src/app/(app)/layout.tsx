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
    { href: "/admin/users", label: "Users", icon: Settings, minAccess: "admin" },
    { href: "/admin/upload-edo", label: "Upload EDO Data", icon: FileText, minAccess: "admin" },
    { href: "/admin/upload-reliever", label: "Upload Relievers", icon: FileText, minAccess: "admin" },
  ],
};

/** ---------- Nav Row ---------- */

function NavItemRow({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={[
        "flex items-center gap-2 px-3 py-2 text-sm rounded-xl transition-colors",
        active
          ? "bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]"
          : "text-[hsl(var(--sidebar-foreground))]/80 hover:text-[hsl(var(--sidebar-foreground))]",
      ].join(" ")}
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
  onItemClick,
}: {
  section: NavSection;
  pathname: string;
  user: SessionUser;
  onItemClick?: () => void;
}) {
  const visible = section.items.filter((i) => hasAccess(user, i.minAccess));
  if (!visible.length) return null;

  return (
    <div className="space-y-2">
      {section.heading && (
        <div className="px-1 text-xs uppercase tracking-wide text-[hsl(var(--sidebar-foreground))]/60">
          {section.heading}
        </div>
      )}

      <nav className="flex flex-col gap-1">
        {visible.map((i) => {
          const active = pathname.startsWith(i.href);
          return (
            <NavItemRow
              key={i.href}
              item={i}
              active={active}
              onClick={onItemClick}
            />
          );
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const u = await getCurrentUser();
      setUser(u);
      setLoading(false);
    }
    loadUser();
  }, []);

  if (loading || !user) return null;

  return (
    <div className="min-h-dvh flex">

      {/* 🔥 MOBILE HEADER */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between p-4 border-b bg-white">
        <button onClick={() => setMenuOpen(true)}>☰</button>
        <span className="font-bold">BizCentral</span>
      </div>

      {/* 🔥 SIDEBAR */}
      <aside
        className={`
          fixed top-0 left-0 h-screen w-64 flex flex-col gap-4 border-r p-4 z-50
          transform transition-transform duration-300
          ${menuOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
        `}
        style={{
          backgroundColor: "hsl(var(--sidebar-background))",
          color: "hsl(var(--sidebar-foreground))",
        }}
      >
        {/* CLOSE BUTTON (MOBILE) */}
        <button
          className="md:hidden text-right mb-2"
          onClick={() => setMenuOpen(false)}
        >
          ✕ Close
        </button>

        {/* Brand */}
        <div className="flex flex-col gap-2">
  
        {/* 🔥 LOGO (CENTERED + BIGGER) */}
        <div className="flex justify-center mb-2">
          <img
            src="/logo.png"
            className="h-10 max-w-[150px] object-contain"
          />
        </div>

        {/* 🔥 TITLE (LEFT ALIGNED) */}
        <span className="flex items-center gap-1 font-bold">
          Bi
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            className="inline-block relative top-[2px] rotate-[-359deg] scale-x-[-1]"
            style={{ filter: "drop-shadow(0 0 4px #facc15)" }}
          >
            <path
              d="M4 8 
                L20 1 
                L10 10              
                L22 14 
                L5 21 
                L14 11 
                L4 10 Z"
              fill="#facc15"
            />
          </svg>
          Central
        </span>

      </div>

        {/* NAV */}
        <div className="flex-1 overflow-y-auto space-y-4">
          <NavSectionBlock section={DASHBOARD_SECTION} pathname={pathname} user={user} onItemClick={() => setMenuOpen(false)} />
          <NavSectionBlock section={MANAGEMENT_SECTION} pathname={pathname} user={user} onItemClick={() => setMenuOpen(false)} />
          <NavSectionBlock section={SETTINGS_SECTION} pathname={pathname} user={user} onItemClick={() => setMenuOpen(false)} />
        </div>

        {/* USER */}
        <div className="text-xs">
          Signed in as <b>{user.name}</b>
        </div>

        {/* LOGOUT */}
        <Button
          onClick={async () => {
            await signOut(getAuth());
            window.location.href = "/";
          }}
        >
          Logout
        </Button>
      </aside>

      {/* 🔥 OVERLAY */}
      {menuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* 🔥 MAIN */}
      <main className="flex-1 p-6 md:ml-64 mt-16 md:mt-0">
        {children}
      </main>
    </div>
  );
}