/**
 * Shared utilities for test setup (integration and e2e)
 */

import { ChildProcess, execSync, spawn } from "child_process";
import { createWriteStream } from "fs";

/**
 * Check if port 7071 is already in use
 */
export function isPortInUse(): boolean {
  try {
    const result = execSync("lsof -i :7071", { encoding: "utf-8" });
    return result.length > 0;
  } catch (error) {
    // lsof returns exit code 1 when no process found
    return false;
  }
}

/**
 * Wait for Functions app to be ready
 */
export async function waitForFunctions(
  url: string = "http://localhost:7071/api/helloWorld",
  maxAttempts: number = 30
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log("✓ Functions app is ready");
        return;
      }
    } catch (error) {
      // Keep trying
    }

    // Log progress every 10 attempts for longer waits
    if (maxAttempts > 30 && (i + 1) % 10 === 0) {
      console.log(`   Still waiting... (${i + 1}/${maxAttempts} attempts)`);
    }

    await new Promise((resolve) => setTimeout(resolve, maxAttempts > 30 ? 1000 : 2000));
  }

  throw new Error("Functions app failed to start within timeout");
}

/**
 * Start local Functions app
 */
export function startFunctions(
  logPath: string,
  errorLogPath: string,
  checkIfRunning: boolean = false
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    console.log("⚡ Starting Functions app...");

    // Check if already running (e2e mode)
    if (checkIfRunning && isPortInUse()) {
      console.log("   ℹ Functions already running on port 7071");
      resolve(null as any); // Return null to indicate no process was started
      return;
    }

    console.log("   (Building TypeScript...)");

    // First build
    const buildProcess = spawn("npm", ["run", "build"], {
      stdio: "pipe",
      shell: true,
    });

    buildProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Build failed with code ${code}`));
        return;
      }

      console.log("✓ Build complete");
      console.log("   (Starting func host...)");
      console.log(`   (Logging to ${logPath} and ${errorLogPath})`);

      // Create log file streams
      const logStream = createWriteStream(logPath, { flags: "w" });
      const errorLogStream = createWriteStream(errorLogPath, { flags: "w" });

      // After build, start func
      const functionsProcess = spawn("func", ["start"], {
        stdio: "pipe",
        shell: true,
        detached: true, // Create new process group so we can kill all children
      });

      let output = "";
      let resolved = false;

      functionsProcess.stdout?.on("data", (data) => {
        const text = data.toString();
        output += text;
        logStream.write(text);

        // Look for "Host started" or similar message
        if (
          !resolved &&
          (text.includes("Host lock lease acquired") ||
            text.includes("Worker process started") ||
            text.includes("Job host started") ||
            text.includes("Host started"))
        ) {
          resolved = true;
          resolve(functionsProcess);
        }
      });

      functionsProcess.stderr?.on("data", (data) => {
        const text = data.toString();
        output += text;
        errorLogStream.write(text);
      });

      // Fallback timeout - different for integration vs e2e
      const timeout = checkIfRunning ? 20000 : 10000;
      setTimeout(() => {
        if (!resolved) {
          console.log(`   (Timeout reached after ${timeout / 1000}s, assuming Functions started)`);
          if (checkIfRunning) {
            console.log("   (Will verify with health check...)");
          }
          resolved = true;
          resolve(functionsProcess);
        }
      }, timeout);
    });
  });
}

/**
 * Stop local Functions app
 */
export async function stopFunctions(functionsProcess: ChildProcess | null): Promise<void> {
  if (functionsProcess && functionsProcess.pid !== undefined) {
    console.log("⚡ Stopping Functions app...");

    const pid = functionsProcess.pid;

    try {
      // Kill the entire process group (func + all workers)
      process.kill(-pid, "SIGTERM");
      console.log(`   Sent SIGTERM to process group -${pid}`);
    } catch (error) {
      console.log(`   Failed to kill process group, trying individual process...`);
      try {
        functionsProcess.kill("SIGTERM");
      } catch (e) {
        // Might already be dead
      }
    }

    // Wait up to 5 seconds for graceful shutdown
    const maxWait = 5000;
    const startTime = Date.now();
    let processStillAlive = true;

    while (processStillAlive && Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      try {
        // Check if process still exists (kill with signal 0 doesn't kill, just checks)
        process.kill(-pid, 0);
        processStillAlive = true;
      } catch (e) {
        // Process is dead
        processStillAlive = false;
      }
    }

    // If still alive after graceful period, force kill
    if (processStillAlive) {
      console.log(`   Process still alive after ${maxWait}ms, sending SIGKILL...`);
      try {
        process.kill(-pid, "SIGKILL");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (e) {
        // Already dead or can't kill
      }
    }

    console.log("✓ Functions app stopped");
  }
}

/**
 * Register signal handlers for graceful cleanup
 */
export function registerSignalHandlers(cleanupFn: () => Promise<void>): void {
  const signalHandler = async (signal: string) => {
    console.log(`\n⚠️  Received ${signal}, cleaning up...`);
    await cleanupFn();
    process.exit(0);
  };

  process.on("SIGINT", () => signalHandler("SIGINT"));
  process.on("SIGTERM", () => signalHandler("SIGTERM"));
}
