import { spawn } from "node:child_process";
import process from "node:process";

const port = 8081;
const projectUrl = `http://127.0.0.1:${port}`;
const devClientUrl = `exp+tagit://expo-development-client/?url=${encodeURIComponent(projectUrl)}`;

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      ...options,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });

const waitForMetro = async () => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${projectUrl}/status`);
      if (response.ok) return;
    } catch {
      // Metro is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Metro did not become ready on port 8081");
};

const metro = spawn(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "expo", "start", "--dev-client", "--localhost", "--clear"],
  {
    stdio: "inherit",
    shell: false,
    env: { ...process.env, HOST: "127.0.0.1" },
  },
);

const stopMetro = () => {
  if (!metro.killed) metro.kill("SIGINT");
};
process.once("SIGINT", () => {
  stopMetro();
  process.exit(130);
});
process.once("SIGTERM", () => {
  stopMetro();
  process.exit(143);
});

try {
  await waitForMetro();
  await run("adb", ["reverse", `tcp:${port}`, `tcp:${port}`]);
  await run("adb", [
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    devClientUrl,
  ]);
  await new Promise((resolve) => metro.once("exit", resolve));
} catch (error) {
  stopMetro();
  console.error(error.message);
  process.exitCode = 1;
}
