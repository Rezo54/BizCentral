'use client';

import Link from 'next/link';

import {
    useEffect,
    useState,
} from 'react';

import {
    useRouter,
} from 'next/navigation';

import {
    CalendarDays,
    ChevronRight,
    CircleUserRound,
    Clock3,
    FileText,
    Home,
    LogOut,
    ReceiptText,
    UserRound,
} from 'lucide-react';

import {
    Button,
} from '@/components/ui/button';

// =====================================================
// TYPES
// =====================================================

type EmployeeSession = {
    id: string;
    name: string;
    surname: string;
    occupation: string;
    businessName: string;
    edoId: string;
};

// =====================================================
// SERVICE CARD
// =====================================================

type ServiceCardProps = {
    title: string;
    description: string;
    icon: React.ReactNode;
    href: string;
    disabled?: boolean;
};

function ServiceCard({
    title,
    description,
    icon,
    href,
    disabled = false,
}: ServiceCardProps) {

    const card = (
        <div
            className={[
                'group flex min-h-[138px] flex-col justify-between',
                'rounded-2xl border bg-background p-4 shadow-sm',
                'transition-all duration-200',
                disabled
                    ? 'cursor-default opacity-60'
                    : 'active:scale-[0.98] hover:border-primary/30 hover:shadow-md',
            ].join(' ')}
        >
            <div className="flex items-start justify-between">

                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {icon}
                </div>

                {!disabled && (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}

            </div>

            <div className="mt-4">

                <h3 className="text-[15px] font-semibold leading-tight">
                    {title}
                </h3>

                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {description}
                </p>

            </div>

        </div>
    );

    if (disabled) {
        return card;
    }

    return (
        <Link
            href={href}
            className="block"
        >
            {card}
        </Link>
    );
}

// =====================================================
// MOBILE NAV ITEM
// =====================================================

type MobileNavItemProps = {
    label: string;
    icon: React.ReactNode;
    active?: boolean;
};

function MobileNavItem({
    label,
    icon,
    active = false,
}: MobileNavItemProps) {

    return (
        <button
            type="button"
            disabled={!active}
            className={[
                'flex min-w-0 flex-1 flex-col items-center justify-center gap-1',
                'px-1 py-2 text-[11px]',
                active
                    ? 'font-medium text-primary'
                    : 'text-muted-foreground opacity-55',
            ].join(' ')}
        >
            {icon}

            <span className="truncate">
                {label}
            </span>
        </button>
    );
}

// =====================================================
// PAGE
// =====================================================

export default function StaffPortalPage() {

    const router =
        useRouter();

    const [employee, setEmployee] =
        useState<EmployeeSession | null>(
            null
        );

    const [isLoading, setIsLoading] =
        useState(true);

    // =================================================
    // LOAD AUTHENTICATED EMPLOYEE
    // =================================================

    useEffect(() => {

        let active = true;

        async function loadSession() {

            try {

                const response =
                    await fetch(
                        '/api/staff/session',
                        {
                            method: 'GET',
                            credentials: 'include',
                            cache: 'no-store',
                        }
                    );

                const data =
                    await response.json();

                if (
                    !response.ok ||
                    data?.authenticated !== true ||
                    !data?.employee
                ) {

                    router.replace(
                        '/stafflogin'
                    );

                    return;
                }

                if (active) {
                    setEmployee(
                        data.employee
                    );
                }

            } catch {

                router.replace(
                    '/stafflogin'
                );

            } finally {

                if (active) {
                    setIsLoading(false);
                }
            }
        }

        loadSession();

        return () => {
            active = false;
        };

    }, [router]);

    // =================================================
    // LOGOUT
    // =================================================

    async function handleLogout() {

        try {

            await fetch(
                '/api/staff/logout',
                {
                    method: 'POST',
                    credentials: 'include',
                }
            );

        } finally {

            router.replace(
                '/stafflogin'
            );

            router.refresh();
        }
    }

    // =================================================
    // DATE
    // =================================================

    const today =
        new Intl.DateTimeFormat(
            'en-ZA',
            {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            }
        ).format(new Date());

    // =================================================
    // SESSION LOADING
    //
    // Do not render employee information until the
    // authenticated session has been confirmed.
    // =================================================

    if (
        isLoading ||
        !employee
    ) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-muted/30">

                <div className="text-center">

                    <div
                        className="
                            mx-auto h-8 w-8
                            animate-spin rounded-full
                            border-2 border-muted
                            border-t-primary
                        "
                    />

                    <p className="mt-4 text-sm text-muted-foreground">
                        Loading Employee Portal...
                    </p>

                </div>

            </div>
        );
    }

    // =================================================
    // DISPLAY NAME
    // =================================================

    const fullName =
        [
            employee.name,
            employee.surname,
        ]
            .filter(Boolean)
            .join(' ');

    // =================================================
    // UI
    // =================================================

    return (
        <div className="min-h-screen bg-muted/30 pb-24 md:pb-8">

            {/* =============================================
                BIZCENTRAL TOP BANNER
            ============================================= */}

            <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0d172d]">

                <div className="mx-auto flex h-[76px] max-w-5xl items-center justify-between px-5 sm:px-6">

                    <div className="min-w-0">

                        {/* BizCentral Logo */}

                        <div className="flex items-center font-bold leading-none text-white">

                            <span className="mr-[-2px] text-xl">
                                Bi
                            </span>

                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                className="relative top-[2px] inline-block rotate-[-383deg] scale-x-[-1]"
                                style={{
                                    filter:
                                        'drop-shadow(0 0 4px #facc15)',
                                }}
                                aria-hidden="true"
                            >
                                <path
                                    d="
                                        M4 8
                                        L20 1
                                        L10 10
                                        L22 14
                                        L5 21
                                        L14 11
                                        L4 10
                                        Z
                                    "
                                    fill="#facc15"
                                />
                            </svg>

                            <span className="ml-[-2px] text-xl">
                                Central
                            </span>

                        </div>

                        <p className="mt-1.5 text-sm font-semibold text-white">
                            Employee Portal
                        </p>

                    </div>

                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleLogout}
                        className="
                            ml-3 shrink-0 gap-2
                            text-white/80
                            hover:bg-white/10
                            hover:text-white
                        "
                    >
                        <LogOut className="h-5 w-5" />

                        <span className="hidden sm:inline">
                            Sign Out
                        </span>
                    </Button>

                </div>

            </header>

            {/* =============================================
                CONTENT
            ============================================= */}

            <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-8">

                {/* =========================================
                    WELCOME
                ========================================= */}

                <section className="flex items-center gap-3">

                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:h-14 sm:w-14">

                        <UserRound className="h-6 w-6 sm:h-7 sm:w-7" />

                    </div>

                    <div className="min-w-0">

                        <p className="text-xs text-muted-foreground sm:text-sm">
                            Welcome back
                        </p>

                        <h2 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
                            {fullName || 'Employee'}
                        </h2>

                        <p className="truncate text-xs text-muted-foreground sm:text-sm">
                            {employee.businessName}
                        </p>

                        {employee.occupation && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {employee.occupation}
                            </p>
                        )}

                    </div>

                </section>

                {/* =========================================
                    TODAY STATUS
                ========================================= */}

                <section className="mt-6 sm:mt-8">

                    <div className="mb-3 flex items-center gap-2">

                        <CalendarDays className="h-4 w-4 text-muted-foreground" />

                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            Today
                        </p>

                    </div>

                    <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-5">

                        <div className="flex items-start justify-between gap-4">

                            <div className="min-w-0">

                                <p className="text-xs text-muted-foreground sm:text-sm">
                                    Attendance Status
                                </p>

                                <div className="mt-2 flex items-center gap-2">

                                    <span className="relative flex h-3 w-3">

                                        <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-20" />

                                        <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />

                                    </span>

                                    <span className="text-lg font-semibold">
                                        Present
                                    </span>

                                </div>

                            </div>

                            <div className="shrink-0 text-right">

                                <p className="max-w-[145px] text-xs leading-5 text-muted-foreground sm:max-w-none sm:text-sm">
                                    {today}
                                </p>

                            </div>

                        </div>

                        <div className="mt-4 border-t pt-3">

                            <p className="text-xs leading-5 text-muted-foreground">
                                Attendance is managed by your employer.
                            </p>

                        </div>

                    </div>

                </section>

                {/* =========================================
                    EMPLOYEE SERVICES
                ========================================= */}

                <section className="mt-7 sm:mt-9">

                    <div className="mb-4">

                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                            Employee
                        </p>

                        <h2 className="mt-1 text-lg font-semibold">
                            My Services
                        </h2>

                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">

                        <ServiceCard
                            title="Payslips"
                            description="View and download payslips."
                            href="/staffportal/payslips"
                            icon={
                                <ReceiptText className="h-5 w-5" />
                            }
                            disabled
                        />

                        <ServiceCard
                            title="Attendance"
                            description="View your attendance history."
                            href="/staffportal/attendance"
                            icon={
                                <Clock3 className="h-5 w-5" />
                            }
                            disabled
                        />

                        <ServiceCard
                            title="Leave"
                            description="Apply and view requests."
                            href="/staffportal/leave"
                            icon={
                                <FileText className="h-5 w-5" />
                            }
                            disabled
                        />

                        <ServiceCard
                            title="My Profile"
                            description="View your employee details."
                            href="/staffportal/profile"
                            icon={
                                <CircleUserRound className="h-5 w-5" />
                            }
                            disabled
                        />

                    </div>

                </section>

                {/* =========================================
                    RECENT ACTIVITY
                ========================================= */}

                <section className="mt-7 sm:mt-9">

                    <h2 className="mb-4 text-lg font-semibold">
                        Recent Activity
                    </h2>

                    <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">

                        <div className="flex gap-3 p-4">

                            <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />

                            <div className="min-w-0">

                                <p className="text-sm font-medium">
                                    Employee Portal ready
                                </p>

                                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                    Your employee services and recent activity
                                    will appear here.
                                </p>

                            </div>

                        </div>

                    </div>

                </section>

                {/* =========================================
                    PRIVACY
                ========================================= */}

                <section className="mt-6">

                    <div className="rounded-xl border bg-background/60 px-4 py-3">

                        <p className="text-xs leading-5 text-muted-foreground">
                            Your Employee Portal is private. Only information
                            linked to your authenticated employee account will
                            be displayed.
                        </p>

                    </div>

                </section>

            </main>

            {/* =============================================
                MOBILE BOTTOM NAVIGATION

                Other destinations remain disabled until
                their protected staff routes are built.
            ============================================= */}

            <nav
                className="
                    fixed inset-x-0 bottom-0 z-40
                    border-t bg-background/95 backdrop-blur
                    md:hidden
                "
            >
                <div
                    className="
                        mx-auto flex h-16 max-w-lg items-stretch
                        px-2
                        pb-[env(safe-area-inset-bottom)]
                    "
                >

                    <MobileNavItem
                        label="Home"
                        active
                        icon={
                            <Home className="h-5 w-5" />
                        }
                    />

                    <MobileNavItem
                        label="Attendance"
                        icon={
                            <Clock3 className="h-5 w-5" />
                        }
                    />

                    <MobileNavItem
                        label="Leave"
                        icon={
                            <FileText className="h-5 w-5" />
                        }
                    />

                    <MobileNavItem
                        label="Profile"
                        icon={
                            <CircleUserRound className="h-5 w-5" />
                        }
                    />

                </div>

            </nav>

        </div>
    );
}