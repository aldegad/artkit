#!/usr/bin/env node

import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";

const DEFAULT_PORT = 3005;
const MAX_PORT_SCAN = 50;

function parsePreferredPort() {
  const raw = process.env.PORT;
  const parsed = Number(raw);

  if (!raw || !Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return DEFAULT_PORT;
  }

  return parsed;
}

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "0.0.0.0");
  });
}

async function findAvailablePort(preferredPort) {
  for (let offset = 0; offset <= MAX_PORT_SCAN; offset += 1) {
    const port = preferredPort + offset;
    if (port > 65535) break;

    const isAvailable = await checkPortAvailable(port);
    if (isAvailable) return port;
  }

  return 0;
}

async function main() {
  const preferredPort = parsePreferredPort();
  const selectedPort = await findAvailablePort(preferredPort);
  const portArg = String(selectedPort || preferredPort);

  if (selectedPort && selectedPort !== preferredPort) {
    console.warn(
      `Port ${preferredPort} is in use, using available port ${selectedPort} instead.`,
    );
  } else if (!selectedPort) {
    console.warn(
      `Could not find an available port near ${preferredPort}. Falling back to Next.js port selection.`,
    );
  }

  const nextBin = path.resolve("node_modules", "next", "dist", "bin", "next");
  const args = [nextBin, "dev", "--port", portArg, ...process.argv.slice(2)];
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
