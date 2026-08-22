/*
 * Sage Business Cloud Payroll SA - temporary read-only data bridge
 * Run this file's contents from DevTools Console while logged into:
 * https://app.payroll.sageone.co.za/
 *
 * It only performs GET requests. It does not create or update payroll records.
 */
(async () => {
  "use strict";

  const API_VERSION = "15.03";
  const CONCURRENCY = 3;

  const cleanId = (value) => (value || "").trim();
  const isGuid = (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

  const companyId = cleanId(prompt("Paste the Sage X-CompanyId value:"));
  const cycleId = cleanId(prompt("Paste the Sage X-CycleId value:"));

  if (!isGuid(companyId) || !isGuid(cycleId)) {
    throw new Error("A valid Sage Company ID and Cycle ID are required.");
  }

  const includeIdNumbers = confirm(
    "Include full employee ID numbers in the integrity CSV?\n\n" +
    "Select Cancel to mask them. Banking details are always excluded."
  );

  const headers = {
    Accept: "application/json, text/plain, */*",
    "X-CompanyId": companyId,
    "X-CycleId": cycleId,
  };

  async function getJson(path) {
    const response = await fetch(path, {
      method: "GET",
      credentials: "include",
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 250)}`);
    }

    return response.json();
  }

  function maskId(value) {
    const text = String(value || "");
    if (!text) return "";
    if (includeIdNumbers) return text;
    return text.length <= 4 ? "****" : `${"*".repeat(text.length - 4)}${text.slice(-4)}`;
  }

  function omitSensitiveEmployeeFields(employee) {
    if (!employee || typeof employee !== "object") return employee;

    const blocked = new Set([
      "accountNumber",
      "accountHolderName",
      "accountHolderRelationship",
      "bankName",
      "branchCode",
      "branchName",
      "typeOfAccount",
    ]);

    const output = {};
    for (const [key, value] of Object.entries(employee)) {
      if (blocked.has(key)) continue;
      if (key === "identityNumber") {
        output[key] = maskId(value);
      } else {
        output[key] = value;
      }
    }
    return output;
  }

  function csvCell(value) {
    if (value === null || value === undefined) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  function toCsv(rows, columns) {
    const header = columns.map(csvCell).join(",");
    const body = rows.map((row) => columns.map((column) => csvCell(row[column])).join(","));
    return [header, ...body].join("\r\n");
  }

  function download(name, data, type) {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function leaveRowsFor(record) {
    const employee = record.employeeSummary || {};
    const rules = record.leave?.employeeLeaveRules || [];

    return rules.flatMap((group) => {
      const definition = group.leaveDefinition || {};
      const balances = group.leaveRules || [];

      if (!balances.length) {
        return [{
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          leaveType: definition.name || definition.description || "",
          openingBalance: "",
          accrued: "",
          taken: "",
          planned: "",
          closingBalance: "",
          closingIncludingPlanned: "",
          cycleEntitlement: "",
          periodAccrual: "",
          cycleStartDate: "",
          cycleEndDate: "",
        }];
      }

      return balances.map((balance) => ({
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        leaveType:
          definition.name ||
          definition.description ||
          balance.ruleDescription ||
          "",
        openingBalance: balance.openingBalance,
        accrued:
          Number(balance.closingBalance || 0) -
          Number(balance.openingBalance || 0) +
          Number(balance.taken || 0),
        taken: balance.taken,
        planned: balance.planned,
        closingBalance: balance.closingBalance,
        closingIncludingPlanned: balance.closingBalanceIncludingPlanned,
        cycleEntitlement: balance.cycleEntitlement,
        periodAccrual: balance.periodAccrual,
        cycleStartDate: balance.cycleStartDate,
        cycleEndDate: balance.cycleEndDate,
      }));
    });
  }

  function transactionRowsFor(record) {
    const employee = record.employeeSummary || {};
    const payslip = record.payslip || {};
    const groups = [
      ["earning", payslip.earnings || []],
      ["deduction", payslip.deductions || []],
      ["companyContribution", payslip.companyContributions || []],
      ["fringeBenefit", payslip.fringeBenefits || []],
    ];

    return groups.flatMap(([transactionType, entries]) =>
      entries.map((entry) => ({
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        periodId: payslip.periodId || "",
        transactionType,
        description:
          entry.description ||
          entry.transactionDefinitionDescription ||
          entry.name ||
          "",
        amount: entry.amount,
      }))
    );
  }

  const employeeList = await getJson(
    `/${API_VERSION}/api/employees/getemployeesforcycle/${encodeURIComponent(cycleId)}/null`
  );

  if (!Array.isArray(employeeList)) {
    throw new Error("Sage employee-list response was not an array.");
  }

  console.log(`Sage Data Bridge: found ${employeeList.length} employee records.`);

  const records = new Array(employeeList.length);
  let cursor = 0;

  async function worker() {
    while (cursor < employeeList.length) {
      const index = cursor++;
      const summary = employeeList[index];
      const employmentRecordId = summary.employmentRecordId;

      if (!employmentRecordId) {
        records[index] = {
          employeeSummary: summary,
          errors: ["Missing employmentRecordId"],
        };
        continue;
      }

      const encodedRecordId = encodeURIComponent(employmentRecordId);
      const endpoints = {
        employee: `/${API_VERSION}/api/employee/getEmployee?employmentRecordId=${encodedRecordId}`,
        payslip: `/${API_VERSION}/api/payslip/getPayslip?employmentRecordId=${encodedRecordId}`,
        leave:
          `/${API_VERSION}/api/leave/getEmployeeLeaveRules/${encodedRecordId}/` +
          `${encodeURIComponent(cycleId)}/${encodeURIComponent(companyId)}`,
      };

      const settled = await Promise.allSettled([
        getJson(endpoints.employee),
        getJson(endpoints.payslip),
        getJson(endpoints.leave),
      ]);

      const errors = [];
      const names = ["employee", "payslip", "leave"];
      const data = {};

      settled.forEach((result, resultIndex) => {
        const name = names[resultIndex];
        if (result.status === "fulfilled") {
          data[name] =
            name === "employee"
              ? omitSensitiveEmployeeFields(result.value)
              : result.value;
        } else {
          errors.push(`${name}: ${result.reason?.message || "request failed"}`);
        }
      });

      records[index] = {
        employeeSummary: summary,
        ...data,
        errors,
      };

      console.log(
        `Sage Data Bridge: ${index + 1}/${employeeList.length} - ` +
        `${summary.display || summary.fullName || summary.employeeCode || employmentRecordId}`
      );
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, employeeList.length || 1) }, worker)
  );

  const employeeRows = records.map((record) => {
    const summary = record.employeeSummary || {};
    const employee = record.employee || {};
    const payslip = record.payslip || {};
    const leave = record.leave || {};

    return {
      employeeCode: employee.employeeCode || summary.employeeCode || "",
      firstName: employee.firstName || summary.firstName || "",
      surname: employee.surname || summary.surname || "",
      identityNumber: maskId(employee.identityNumber),
      employmentRecordId: summary.employmentRecordId || "",
      employeeStatus: employee.employeeStatus || "",
      active: summary.filterFlag_IsActive,
      currentTaxYear: summary.filterFlag_IsInCurrentTY,
      dateEngaged: employee.dateEngaged || "",
      dateTerminated: employee.dateTerminated || "",
      jobTitle: employee.jobTitle || "",
      defaultWorkingDays: employee.defaultWorkingDays ?? leave.defaultWorkingDays ?? "",
      monday: leave.monday,
      tuesday: leave.tuesday,
      wednesday: leave.wednesday,
      thursday: leave.thursday,
      friday: leave.friday,
      saturday: leave.saturday,
      sunday: leave.sunday,
      annualSalary: employee.annualSalary ?? "",
      earningsTotal: payslip.earningsTotal ?? "",
      deductionsTotal: payslip.deductionsTotal ?? "",
      companyContributionsTotal: payslip.companyContributionsTotal ?? "",
      fringeBenefitsTotal: payslip.fringeBenefitsTotal ?? "",
      netPay: payslip.nett ?? "",
      payrollPeriodId: payslip.periodId || "",
      errors: (record.errors || []).join(" | "),
    };
  });

  const payrollRows = records.flatMap(transactionRowsFor);
  const leaveRows = records.flatMap(leaveRowsFor);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  download(
    `sage-integrity-employees-${timestamp}.csv`,
    toCsv(employeeRows, [
      "employeeCode",
      "firstName",
      "surname",
      "identityNumber",
      "employmentRecordId",
      "employeeStatus",
      "active",
      "currentTaxYear",
      "dateEngaged",
      "dateTerminated",
      "jobTitle",
      "defaultWorkingDays",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
      "annualSalary",
      "earningsTotal",
      "deductionsTotal",
      "companyContributionsTotal",
      "fringeBenefitsTotal",
      "netPay",
      "payrollPeriodId",
      "errors",
    ]),
    "text/csv;charset=utf-8"
  );

  download(
    `sage-integrity-payroll-${timestamp}.csv`,
    toCsv(payrollRows, [
      "employeeCode",
      "fullName",
      "periodId",
      "transactionType",
      "description",
      "amount",
    ]),
    "text/csv;charset=utf-8"
  );

  download(
    `sage-integrity-leave-${timestamp}.csv`,
    toCsv(leaveRows, [
      "employeeCode",
      "fullName",
      "leaveType",
      "openingBalance",
      "accrued",
      "taken",
      "planned",
      "closingBalance",
      "closingIncludingPlanned",
      "cycleEntitlement",
      "periodAccrual",
      "cycleStartDate",
      "cycleEndDate",
    ]),
    "text/csv;charset=utf-8"
  );

  download(
    `sage-integrity-raw-${timestamp}.json`,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        apiVersion: API_VERSION,
        companyId,
        cycleId,
        employeeCount: records.length,
        records,
      },
      null,
      2
    ),
    "application/json;charset=utf-8"
  );

  console.log(
    "Sage Data Bridge complete. Four read-only files were downloaded: " +
    "employee integrity, payroll transactions, leave balances, and sanitized raw JSON."
  );
})().catch((error) => {
  console.error("Sage Data Bridge failed:", error);
  alert(`Sage Data Bridge failed: ${error.message}`);
});
