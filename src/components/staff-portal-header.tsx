'use client';

import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

type StaffPortalHeaderProps = {
  onLogout?: () => void | Promise<void>;
};

export function StaffPortalHeader({ onLogout }: StaffPortalHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0d172d] shadow-sm">
      <div className="mx-auto flex h-[76px] max-w-5xl items-center justify-between px-5 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center font-bold leading-none text-white">
            <span className="mr-[-2px] text-xl">Bi</span>
            <svg width="24" height="24" viewBox="0 0 24 24" className="inline-block" aria-hidden="true">
              <path d="M4 8 L20 1 L10 10 L22 14 L5 21 L14 11 L4 10 Z" fill="#facc15" />
            </svg>
            <span className="ml-[-2px] text-xl">Central</span>
          </div>
          <p className="mt-1.5 text-sm font-semibold text-white">Employee Portal</p>
        </div>
        {onLogout && (
          <Button type="button" variant="ghost" size="sm" onClick={onLogout} className="ml-3 shrink-0 gap-2 text-white/80 hover:bg-white/10 hover:text-white">
            <LogOut className="h-5 w-5" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        )}
      </div>
    </header>
  );
}
