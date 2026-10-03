import { execFile, execFileSync } from 'node:child_process';

const isWindows = process.platform === 'win32';

/** Mark a file or folder hidden (attrib +h). No-op off Windows, where dot-names are already hidden. */
export function hide(target: string): void {
  if (!isWindows) return;
  try {
    execFileSync('attrib', ['+h', target], { windowsHide: true, stdio: 'ignore' });
  } catch {
    // Cosmetic only; never fail an operation because of it.
  }
}

/** Run a PowerShell script (STA, for WinForms dialogs) and return its trimmed stdout. */
export function powershell(script: string): Promise<string> {
  const prelude = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;';
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', prelude + script],
      { windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout.trim())),
    );
  });
}

/** Open a folder in Explorer (path passed as an argument, never through a shell string). */
export function openInExplorer(target: string): void {
  execFile(isWindows ? 'explorer.exe' : 'xdg-open', [target], { windowsHide: true }, () => {
    // explorer.exe exits with code 1 even on success; nothing to report.
  });
}
