'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  Users,
  Building,
  Settings,
} from 'lucide-react';
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
} from './ui/sidebar';
import { useState } from 'react';

const navGroups = [
  {
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        isDashboard: true,
      },
    ],
  },
  {
    title: 'Management',
    items: [
      {
        href: '/people',
        label: 'People',
        icon: Users,
      },
      {
        href: '/accounting',
        label: 'Accounting',
        icon: Briefcase,
      },
      {
        href: '/compliance',
        label: 'Compliance',
        icon: ShieldCheck,
      },
      {
        href: '/invoicing',
        label: 'Invoicing',
        icon: FileText,
      },
    ],
  },
  {
    title: 'Settings',
    items: [
      {
        href: '/admin/users',
        label: 'Users',
        icon: Settings,
      },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);

  return (
    <>
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center gap-2">
          <Building className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg">BizCentral</span>
        </Link>
      </SidebarHeader>
      <SidebarContent
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
      >
        {navGroups.map((group, groupIndex) => (
          <SidebarGroup key={groupIndex}>
            {group.title && <SidebarGroupLabel>{group.title}</SidebarGroupLabel>}
            <SidebarMenu>
              {group.items.map((item: any, itemIndex) => {
                const isDashboardItem = item.isDashboard;
                const showDashboard = isDashboardItem && isSidebarHovered;

                if (isDashboardItem && !showDashboard && pathname !== item.href) {
                  return <div key={itemIndex} className="h-10" />; // Placeholder to maintain layout
                }

                return (
                  <SidebarMenuItem
                    key={itemIndex}
                    className={`transition-all duration-300 ${
                      isDashboardItem
                        ? showDashboard || pathname === item.href
                          ? 'opacity-100 translate-x-0'
                          : 'opacity-0 -translate-x-full absolute'
                        : ''
                    }`}
                  >
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </>
  );
}
