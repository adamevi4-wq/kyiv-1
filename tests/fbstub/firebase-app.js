// Minimal stand-in for the real Firebase SDK module, same shape as what
// index.html imports — enough for the app's own init code to run without
// ever reaching a real network. Swapped in only by tests/smoke.mjs, which
// rewrites index.html's import specifiers to point here before serving it.
export function initializeApp(config) {
  return { name: "[STUB]", options: config };
}
