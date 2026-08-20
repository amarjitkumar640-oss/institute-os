// @react-email/render's real render() always does `await import("react-dom/server")`
// internally, which Jest's CommonJS test transform can't handle without
// --experimental-vm-modules — a test-environment limitation only; real Node
// (tsx in dev, compiled CJS in prod) handles that dynamic import fine.
// Jest auto-applies a manual mock placed here for any node_modules package,
// no jest.mock() call needed — see https://jestjs.io/docs/manual-mocks#mocking-node-modules.
export async function render(): Promise<string> {
  return "<html><body>mocked-email-for-tests</body></html>";
}
