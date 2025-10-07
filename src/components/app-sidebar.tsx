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

const navGroups = [
  {
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
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

  return (
    <>
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center gap-2">
          <Building className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg">BizCentral</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group, groupIndex) => (
          <SidebarGroup key={groupIndex}>
            {group.title && <SidebarGroupLabel>{group.title}</SidebarGroupLabel>}
            <SidebarMenu>
              {group.items.map((item, itemIndex) => (
                <SidebarMenuItem key={itemIndex}>
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
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </>
  );
}
