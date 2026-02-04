/**
 * Shared utilities for test setup (integration and e2e)
 */

import { ChildProcess, execSync, spawn } from 'child_process';
import { createWriteStream } from 'fs';

/**
 * Check if port 7071 is already in use
 */
export function isPortInUse(): boolean {
  try {
    const result = execSync('lsof -i :7071', { encoding: 'utf-8' });
    return result.length > 0;
  } catch (_error) {
    // lsof returns exit code 1 when no process found
    return false;
  }
}

/**
 * Wait for Functions app to be ready
 */
export async function waitForFunctions(
  entryPoint: string = 'http://localhost:7071/',
  maxAttempts: number = 30
): Promise<void> {
  const url = `${entryPoint}api/health`;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log('✓ Functions app is ready');
        return;
      }
    } catch (_error) {
      // Keep trying
    }

    // Log progress every 10 attempts for longer waits
    if (maxAttempts > 30 && (i + 1) % 10 === 0) {
      console.log(`   Still waiting... (${i + 1}/${maxAttempts} attempts)`);
    }

    await new Promise((resolve) => setTimeout(resolve, maxAttempts > 30 ? 1000 : 2000));
  }

  throw new Error('Functions app failed to start within timeout');
}

/**
 * Start local Functions app
 */
export function startFunctions(
  logPath: string,
  errorLogPath: string,
  envVars: Record<string, string> = {}
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    console.log('⚡ Starting Functions app...');

    // Always check and kill any existing Functions process
    if (isPortInUse()) {
      console.log('   (Port 7071 in use, killing existing process...)');
      try {
        execSync('pkill -f "func start"', { stdio: 'ignore' });
        // Wait a moment for process to die
        execSync('sleep 1');
        console.log('   ✓ Existing process killed');
      } catch (_error) {
        // Ignore errors - process might already be dead
      }
    }

    console.log('   (Building TypeScript...)');

    // First build
    const buildProcess = spawn('npm', ['run', 'build'], {
      stdio: 'pipe',
      shell: true,
    });

    buildProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Build failed with code ${code}`));
        return;
      }

      console.log('✓ Build complete');
      console.log('   (Starting func host...)');
      console.log(`   (Logging to ${logPath} and ${errorLogPath})`);

      // Create log file streams
      const logStream = createWriteStream(logPath, { flags: 'w' });
      const errorLogStream = createWriteStream(errorLogPath, { flags: 'w' });

      // After build, start func with injected environment variables
      const functionsProcess = spawn('func', ['start'], {
        stdio: 'pipe',
        shell: true,
        detached: true, // Create new process group so we can kill all children
        env: {
          ...process.env,
          ...envVars,
        },
      });

      // Pipe streams to log files
      functionsProcess.stdout?.pipe(logStream);
      functionsProcess.stderr?.pipe(errorLogStream);

      // Return immediately - caller will use waitForFunctions() to verify readiness
      resolve(functionsProcess);
    });
  });
}

/**
 * Stop local Functions app
 */
export async function stopFunctions(functionsProcess: ChildProcess | null): Promise<void> {
  if (functionsProcess && functionsProcess.pid !== undefined) {
    console.log('⚡ Stopping Functions app...');

    const pid = functionsProcess.pid;

    try {
      // Kill the entire process group (func + all workers)
      process.kill(-pid, 'SIGTERM');
      console.log(`   Sent SIGTERM to process group -${pid}`);
    } catch (_error) {
      console.log(`   Failed to kill process group, trying individual process...`);
      try {
        functionsProcess.kill('SIGTERM');
      } catch (_e) {
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
      } catch (_e) {
        // Process is dead
        processStillAlive = false;
      }
    }

    // If still alive after graceful period, force kill
    if (processStillAlive) {
      console.log(`   Process still alive after ${maxWait}ms, sending SIGKILL...`);
      try {
        process.kill(-pid, 'SIGKILL');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (_e) {
        // Already dead or can't kill
      }
    }

    console.log('✓ Functions app stopped');
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

  process.on('SIGINT', () => signalHandler('SIGINT'));
  process.on('SIGTERM', () => signalHandler('SIGTERM'));
}
