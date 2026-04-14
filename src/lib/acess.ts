export function isReliever(user: any) {
  return user?.userType === "reliever";
}

export function isEdo(user: any) {
  return user?.userType === "edo";
}

export function isTaskraft(user: any) {
  return user?.userType === "taskraft";
}

export function canApprove(user: any) {
  return (
    user?.accessLevel === "power_user" ||
    user?.accessLevel === "superadmin"
  );
}

export function isAdmin(user: any) {
  return (
    user?.accessLevel === "admin" ||
    user?.accessLevel === "superadmin"
  );
}