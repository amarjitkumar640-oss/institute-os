// Server-side phone masking — teachers see everyone else's phone numbers
// partially masked; admin/frontdesk always see the real number. Masking
// happens here, before the response leaves the API, not client-side, so the
// real digits never reach a device that shouldn't have them.

export function maskPhone(phone: string): string;
export function maskPhone(phone: string | null): string | null;
export function maskPhone(phone: string | null): string | null {
  if (!phone) return phone;
  if (phone.length <= 5) return "X".repeat(phone.length);
  return phone.slice(0, 5) + "X".repeat(phone.length - 5);
}

export function shouldMaskPhoneForRole(role: string | undefined): boolean {
  return role === "teacher";
}

// Masks the given string-valued fields on `obj` in place (shallow copy) when
// `shouldMask` is true; returns `obj` unchanged otherwise.
export function maskPhoneFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[],
  shouldMask: boolean,
): T {
  if (!shouldMask) return obj;
  const copy = { ...obj };
  for (const field of fields) {
    const value = copy[field];
    if (typeof value === "string") {
      (copy as Record<keyof T, unknown>)[field] = maskPhone(value);
    }
  }
  return copy;
}
