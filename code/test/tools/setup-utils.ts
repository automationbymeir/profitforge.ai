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
 * Kill process using port 7071 and wait for it to be free
 */
function killPortAndWait(maxAttempts: number = 10): void {
  // If port is already free, return immediately
  if (!isPortInUse()) {
    return;
  }

  console.log('   (Port 7071 in use, attempting to free it...)');

  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Get PIDs using the port
      const pids = execSync('lsof -ti :7071 2>/dev/null || true', { encoding: 'utf-8' }).trim();

      if (!pids) {
        console.log('   ✓ Port 7071 is now free');
        return;
      }

      if (i === 0) {
        console.log(`   Found process(es) using port: ${pids.split('\n').join(', ')}`);
      }

      // Kill all processes using the port (escalating signals)
      const signal = i < 3 ? 'TERM' : 'KILL';
      execSync(`lsof -ti :7071 | xargs -r kill -${signal} 2>/dev/null || true`, {
        stdio: 'ignore',
      });

      // Also try killing func processes
      execSync(`pkill -${signal === 'TERM' ? '' : '9 '}-f "func start" 2>/dev/null || true`, {
        stdio: 'ignore',
      });

      // Wait for processes to die
      execSync('sleep 1');

      // Check if port is now free
      if (!isPortInUse()) {
        console.log('   ✓ Port 7071 is now free');
        return;
      }
    } catch (_error) {
      // Continue trying
    }

    // Log progress
    if (i > 2) {
      console.log(`   Still trying to free port (attempt ${i + 1}/${maxAttempts})...`);
    }

    // Wait before retry
    if (i < maxAttempts - 1) {
      execSync('sleep 2');
    }
  }

  // Last resort: show what's using the port and throw
  console.error('\n❌ Unable to free port 7071. Processes still using it:');
  try {
    const details = execSync('lsof -i :7071', { encoding: 'utf-8' });
    console.error(details);
  } catch (_e) {
    console.error('   (Could not determine which process is using the port)');
  }

  throw new Error(
    'Failed to free port 7071 after multiple attempts. ' +
      'Please manually kill the process: sudo lsof -ti :7071 | xargs kill -9'
  );
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

    // Kill any existing process and wait for port to be free
    try {
      killPortAndWait();
    } catch (error) {
      reject(error);
      return;
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
