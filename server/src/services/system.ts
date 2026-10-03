import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMAGE_EXTENSIONS, type AboutInfo } from '@media-view/shared';
import { getLogDir } from '../lib/log.ts';
import { openInExplorer, powershell } from '../lib/windows.ts';

/** Windows dialogs via PowerShell; Electron implementations replace these later (technical doc §14). */

export async function pickFolder(description: string): Promise<string | null> {
  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    $owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }
    $d = New-Object System.Windows.Forms.FolderBrowserDialog
    $d.Description = $env:MV_DIALOG_TITLE
    $d.UseDescriptionForTitle = $true
    $d.ShowNewFolderButton = $true
    if ($d.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write($d.SelectedPath) }
    $owner.Dispose()`;
  process.env.MV_DIALOG_TITLE = description;
  const selected = await powershell(script);
  return selected || null;
}

export function openLogsFolder(): boolean {
  const dir = getLogDir();
  if (!dir || !fs.existsSync(dir)) return false;
  openInExplorer(dir);
  return true;
}

const rootPackage = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../package.json');

export function about(): AboutInfo {
  const pkg = JSON.parse(fs.readFileSync(rootPackage, 'utf8')) as { version: string; releaseDate?: string };
  return {
    name: 'media-view',
    version: pkg.version,
    releaseDate: pkg.releaseDate ?? 'unreleased',
    credits: 'Felipe, with Claude',
    formats: { images: IMAGE_EXTENSIONS, videos: [], audio: [], texts: [] },
  };
}

/** Windows file picker for images (multi-select). Returns absolute paths; empty when cancelled. */
export async function pickFiles(title: string): Promise<string[]> {
  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    $owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }
    $d = New-Object System.Windows.Forms.OpenFileDialog
    $d.Title = $env:MV_DIALOG_TITLE
    $d.Multiselect = $true
    $d.Filter = 'Images|*.jpg;*.jpeg;*.jfif;*.png;*.gif;*.webp;*.svg;*.avif|All files|*.*'
    if ($d.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write(($d.FileNames -join [char]10)) }
    $owner.Dispose()`;
  process.env.MV_DIALOG_TITLE = title;
  const out = await powershell(script);
  return out ? out.split('\n').map((p) => p.trim()).filter(Boolean) : [];
}

/** The Windows "Open with" dialog for a file (path passed as an argument, never through a shell string). */
export function openWith(file: string): void {
  execFile('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', file], { windowsHide: false }, () => {
    // rundll32 reports nothing useful; the dialog is the feedback.
  });
}
