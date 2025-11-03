// src/lib/session.ts

// Business persona (from your "User Types" sheet)
export type UserRole =
  | "super_admin"       // Taskraft-level, full system
  | "admin_user"        // Admin user of a business/entity
  | "supervisor"        // Manages subordinates, approves leave
  | "standard_user"     // Normal employee
  | "client"            // The business owner / EDO
  | "client_employee"   // Works for the client/EDO (e.g. driver, timesheets)
  | "supplier";         // External supplier / reliever / maintenance invoice

// Access tier (from your "User Access Levels" sheet columns)
export type AccessLevel =
  | "standard"     // Standard User
  | "power"        // Power User
  | "admin"        // Admin
  | "superadmin";  // Super Admin

export type SessionUser = {
  id: string;
  name: string;

  // role = the row in your sheet ("Supervisor", "Client", etc.)
  role: UserRole;

  // accessLevel = highest column they qualify for in your sheet.
  // e.g. Supervisor -> "power", Client -> "power", Supplier -> "power",
  // Admin User -> "admin", Super Admin -> "superadmin"
  accessLevel: AccessLevel;

  // org scoping
  companyId?: string;          // which business they're tied to (EDO, etc.)
  managesCompanyIds?: string[]; // supervisor/admin_user: who they can manage
};

// 🔐 MOCK SESSION
// Later we replace this with Firebase Auth + Firestore user doc + custom claims.
export function getCurrentUser(): SessionUser {
  // EXAMPLES (flip these manually while developing):
  //
  // return {
  //   id: "u001",
  //   name: "Sarah (Super Admin)",
  //   role: "super_admin",
  //   accessLevel: "superadmin",
  // };

  // return {
  //   id: "u002",
  //   name: "Lebo (Admin User)",
  //   role: "admin_user",
  //   accessLevel: "admin",
  //   managesCompanyIds: ["biz-001"],
  // };

  // return {
  //   id: "u003",
  //   name: "Kamo (Supervisor)",
  //   role: "supervisor",
  //   accessLevel: "power",
  //   companyId: "biz-001",
  //   managesCompanyIds: ["biz-001"],
  // };

  // return {
  //   id: "u004",
  //   name: "Driver Reliever",
  //   role: "client_employee",
  //   accessLevel: "standard",
  //   companyId: "biz-001",
  // };

  // return {
  //   id: "u005",
  //   name: "EDO Owner",
  //   role: "client",
  //   accessLevel: "power",
  //   companyId: "biz-001",
  // };

  return {
    id: "u006",
    name: "External Supplier",
    role: "supplier",
    accessLevel: "power",
    companyId: "biz-001",
  };
}

/**
 * helper to compare access levels
 * "superadmin" > "admin" > "power" > "standard"
 */
const ACCESS_RANK: Record<AccessLevel, number> = {
  standard: 1,
  power: 2,
  admin: 3,
  superadmin: 4,
};

// Can this user see something that requires `minLevel`?
export function hasAccess(user: SessionUser, minLevel: AccessLevel) {
  return ACCESS_RANK[user.accessLevel] >= ACCESS_RANK[minLevel];
}
