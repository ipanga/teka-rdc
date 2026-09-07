/// Normalize a DRC phone number to the API's canonical form `+243XXXXXXXXX`.
///
/// Accepted input shapes (spaces, dots, dashes, parentheses are ignored):
///
///   9 digits                          990000001        → +243990000001
///   10 digits, leading 0              0990000001       → +243990000001
///   243 + 9 digits (with/without +)   +243990000001    → +243990000001
///   00243 + 9 digits                  00243990000001   → +243990000001
///   anything else                                      → null (caller surfaces
///                                                        a validation error)
///
/// The 9 national digits must start with 8 or 9 (DRC mobile ranges).
///
/// One rule for every surface (PR D2, 2026-09-07): the API applies it on write
/// for recipient phones, buyer-web and this app apply it in their inputs.
/// Mirror of `packages/shared/src/utils/phone.ts` — keep both in sync.
String? normalizeDrcPhone(String input) {
  final trimmed = input.trim();
  if (trimmed.isEmpty) return null;
  final body = trimmed.startsWith('+') ? trimmed.substring(1) : trimmed;
  if (!RegExp(r'^[0-9\s().-]+$').hasMatch(body)) return null;
  final digits = body.replaceAll(RegExp(r'\D'), '');

  String? national;
  if (digits.length == 9) {
    national = digits;
  } else if (digits.length == 10 && digits.startsWith('0')) {
    national = digits.substring(1);
  } else if (digits.length == 12 && digits.startsWith('243')) {
    national = digits.substring(3);
  } else if (digits.length == 14 && digits.startsWith('00243')) {
    national = digits.substring(5);
  }
  if (national == null) return null;
  if (!RegExp(r'^[89]\d{8}$').hasMatch(national)) return null;
  return '+243$national';
}
