/*
 * Sage Payroll multi-company read-only bridge v2.
 * Run in DevTools Console on app.payroll.sageone.co.za.
 * GET requests only; no banking details or identity numbers are exported.
 */
(async function () {
  "use strict";

  const version = "15.03";
  const defaultAccountId = "d5c64865-85d8-49d0-bdf5-b10d00808753";
  const accountId = (prompt("Sage account ID:", defaultAccountId) || "").trim();
  const authInput = (prompt(
    "Paste the complete Sage Authorization request-header value.\n\n" +
    "It stays only in this browser tab."
  ) || "").trim();
  const authorization = /^Bearer\s+/i.test(authInput)
    ? authInput
    : authInput ? "Bearer " + authInput : "";

  if (!accountId || !authorization) {
    throw new Error("Account ID and Authorization are required.");
  }

  async function getJson(path, companyId, cycleId) {
    const headers = {
      Accept: "application/json, text/plain, */*",
      Authorization: authorization
    };
    if (companyId) headers["X-CompanyId"] = companyId;
    if (cycleId) headers["X-CycleId"] = cycleId;

    const response = await fetch(path, {
      method: "GET",
      credentials: "include",
      headers: headers,
      cache: "no-store"
    });
    if (!response.ok) {
      const body = await response.text().catch(function () { return ""; });
      throw new Error(response.status + " " + response.statusText + ": " + body.slice(0, 160));
    }
    return response.json();
  }

  function cell(value) {
    if (value === null || value === undefined) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function csv(rows, columns) {
    return [columns.map(cell).join(",")].concat(
      rows.map(function (row) {
        return columns.map(function (column) { return cell(row[column]); }).join(",");
      })
    ).join("\r\n");
  }

  function download(name, content) {
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  const statuses = await getJson(
    "/api/Account/GetCycleStatusByAccount?accountId=" + encodeURIComponent(accountId)
  );
  const pairs = statuses.filter(function (item) {
    return !item.isClosed && item.idCompany && item.idCycle;
  });

  if (!pairs.length) throw new Error("No open company/cycle pairs were returned.");

  const suggestedEnd = Math.min(10, pairs.length);
  const rangeText = (prompt(
    "Found " + pairs.length + " open company/cycle pairs.\n\n" +
    "Enter a range such as 1-" + suggestedEnd + ". Start with a small batch:",
    "1-" + suggestedEnd
  ) || "").trim();
  const match = /^(\d+)\s*-\s*(\d+)$/.exec(rangeText);
  if (!match) throw new Error("Enter a valid range such as 1-10.");

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start < 1 || end < start || end > pairs.length) {
    throw new Error("Range must be between 1 and " + pairs.length + ".");
  }

  const rows = [];
  const errors = [];

  for (let pairNumber = start; pairNumber <= end; pairNumber += 1) {
    const pair = pairs[pairNumber - 1];
    const companyId = pair.idCompany;
    const cycleId = pair.idCycle;
    console.log("Sage bridge: company " + pairNumber + "/" + pairs.length);

    let employees;
    try {
      employees = await getJson(
        "/" + version + "/api/employees/getemployeesforcycle/" +
        encodeURIComponent(cycleId) + "/null",
        companyId,
        cycleId
      );
    } catch (error) {
      errors.push({
        companyId: companyId,
        cycleId: cycleId,
        employeeCode: "",
        endpoint: "employeeList",
        error: error.message
      });
      continue;
    }

    for (let employeeIndex = 0; employeeIndex < employees.length; employeeIndex += 1) {
      const summary = employees[employeeIndex];
      const recordId = summary.employmentRecordId;
      const context = {
        companyId: companyId,
        cycleId: cycleId,
        employeeCode: summary.employeeCode || "",
        fullName: summary.fullName || summary.display || ""
      };

      if (!recordId) {
        errors.push(Object.assign({}, context, {
          endpoint: "employee",
          error: "Missing employmentRecordId"
        }));
        continue;
      }

      const encodedId = encodeURIComponent(recordId);
      const requests = [
        ["employee", "/" + version + "/api/employee/getEmployee?employmentRecordId=" + encodedId],
        ["payslip", "/" + version + "/api/payslip/getPayslip?employmentRecordId=" + encodedId],
        ["leave", "/" + version + "/api/leave/getEmployeeLeaveRules/" + encodedId +
          "/" + encodeURIComponent(cycleId) + "/" + encodeURIComponent(companyId)]
      ];

      const results = await Promise.allSettled(requests.map(function (request) {
        return getJson(request[1], companyId, cycleId);
      }));
      const data = {};

      results.forEach(function (result, index) {
        const endpoint = requests[index][0];
        if (result.status === "fulfilled") {
          data[endpoint] = result.value;
        } else {
          errors.push(Object.assign({}, context, {
            endpoint: endpoint,
            error: result.reason && result.reason.message
              ? result.reason.message
              : "Request failed"
          }));
        }
      });

      const employee = data.employee || {};
      const payslip = data.payslip || {};
      const leave = data.leave || {};

      rows.push({
        companyId: companyId,
        cycleId: cycleId,
        employmentRecordId: recordId,
        employeeCode: employee.employeeCode || summary.employeeCode || "",
        firstName: employee.firstName || summary.firstName || "",
        surname: employee.surname || summary.surname || "",
        employeeStatus: employee.employeeStatus || "",
        active: summary.filterFlag_IsActive,
        dateEngaged: employee.dateEngaged || "",
        dateTerminated: employee.dateTerminated || "",
        jobTitle: employee.jobTitle || "",
        defaultWorkingDays: employee.defaultWorkingDays == null
          ? leave.defaultWorkingDays
          : employee.defaultWorkingDays,
        monday: leave.monday,
        tuesday: leave.tuesday,
        wednesday: leave.wednesday,
        thursday: leave.thursday,
        friday: leave.friday,
        saturday: leave.saturday,
        sunday: leave.sunday,
        annualSalary: employee.annualSalary,
        earningsTotal: payslip.earningsTotal,
        deductionsTotal: payslip.deductionsTotal,
        companyContributionsTotal: payslip.companyContributionsTotal,
        fringeBenefitsTotal: payslip.fringeBenefitsTotal,
        netPay: payslip.nett,
        payrollPeriodId: payslip.periodId || "",
        earnings: payslip.earnings || [],
        deductions: payslip.deductions || [],
        companyContributions: payslip.companyContributions || [],
        leaveBalances: leave.employeeLeaveRules || []
      });
    }
  }

  const columns = [
    "companyId", "cycleId", "employmentRecordId", "employeeCode",
    "firstName", "surname", "employeeStatus", "active",
    "dateEngaged", "dateTerminated", "jobTitle", "defaultWorkingDays",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "annualSalary", "earningsTotal", "deductionsTotal",
    "companyContributionsTotal", "fringeBenefitsTotal", "netPay",
    "payrollPeriodId", "earnings", "deductions", "companyContributions", "leaveBalances"
  ];
  const errorColumns = [
    "companyId", "cycleId", "employeeCode", "fullName", "endpoint", "error"
  ];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const label = start + "-" + end;

  download("sage-multi-company-" + label + "-" + stamp + ".csv", csv(rows, columns));
  download("sage-multi-company-errors-" + label + "-" + stamp + ".csv", csv(errors, errorColumns));

  console.log(
    "Sage bridge complete: " + rows.length + " employees, " + errors.length + " errors."
  );
  alert(
    "Download complete.\n\nCompanies: " + label +
    "\nEmployees: " + rows.length +
    "\nErrors: " + errors.length
  );
})().catch(function (error) {
  console.error("Sage multi-company bridge failed:", error);
  alert("Sage multi-company bridge failed: " + error.message);
});
