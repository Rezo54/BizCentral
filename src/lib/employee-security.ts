// src/lib/employee-security.ts

import crypto from 'crypto';

// =====================================================
// CELLPHONE NORMALISATION
// =====================================================

export function normalizeCellphone(
  cellphone: string
): string {

  let value =
    cellphone.replace(/\D/g, '');

  // Convert South African local format:
  // 0821234567
  //
  // to international format:
  // 27821234567

  if (
    value.length === 10 &&
    value.startsWith('0')
  ) {
    value =
      '27' + value.substring(1);
  }

  return value;
}


// =====================================================
// INTERNATIONAL → LOCAL CELLPHONE
// =====================================================

export function cellphoneToLocal(
  cellphone: string
): string {

  const value =
    normalizeCellphone(cellphone);

  // 27821234567
  // becomes
  // 0821234567

  if (
    value.length === 11 &&
    value.startsWith('27')
  ) {
    return (
      '0' +
      value.substring(2)
    );
  }

  return value;
}


// =====================================================
// HMAC-SHA-256
// EMPLOYEE ID VERIFICATION
// =====================================================

export function createIdVerificationHash(
  employeeId: string,
  idLastSix: string
): string {

  const secret =
    process.env.EMPLOYEE_ID_HMAC_SECRET;

  if (!secret) {
    throw new Error(
      'Missing EMPLOYEE_ID_HMAC_SECRET'
    );
  }

  // Clean the values before hashing.

  const cleanEmployeeId =
    employeeId.trim();

  const cleanIdLastSix =
    idLastSix.replace(/\D/g, '');

  if (!cleanEmployeeId) {
    throw new Error(
      'Employee ID is required for HMAC generation.'
    );
  }

  if (
    !/^\d{6}$/.test(
      cleanIdLastSix
    )
  ) {
    throw new Error(
      'ID verification value must contain exactly 6 digits.'
    );
  }

  return crypto
    .createHmac(
      'sha256',
      secret
    )
    .update(
      `${cleanEmployeeId}:${cleanIdLastSix}`,
      'utf8'
    )
    .digest('hex');
}


// =====================================================
// CONSTANT-TIME HASH COMPARISON
// =====================================================

export function safeHashCompare(
  firstHash: string,
  secondHash: string
): boolean {

  try {

    const first =
      Buffer.from(
        firstHash,
        'hex'
      );

    const second =
      Buffer.from(
        secondHash,
        'hex'
      );

    // timingSafeEqual requires
    // equal-length buffers.

    if (
      first.length !==
      second.length
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      first,
      second
    );

  } catch {

    return false;

  }
}