import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const APP_NAME = 'media-view';

export interface AppConfig {
  lastLibrary: string | null;
  recentLibraries: string[];
  port: number;
  ui: { theme: string };
}

const DEFAULTS: AppConfig = {
  lastLibrary: null,
  recentLibraries: [],
  port: 4321,
  ui: { theme: 'darkroom' },
};

const MAX_RECENT = 10;

/** App-level data dir (%APPDATA%\media-view). Overridable for tests. */
export function appDataDir(): string {
  if (process.env.MEDIA_VIEW_APPDATA) return process.env.MEDIA_VIEW_APPDATA;
  const base = process.env.APPDATA ?? path.join(os.homedir(), '.config');
  return path.join(base, APP_NAME);
}

function configPath(): string {
  return path.join(appDataDir(), 'config.json');
}

export function loadConfig(): AppConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8')) as Partial<AppConfig>;
    return { ...DEFAULTS, ...raw, ui: { ...DEFAULTS.ui, ...raw.ui } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveConfig(config: AppConfig): void {
  fs.mkdirSync(appDataDir(), { recursive: true });
  const file = configPath();
  fs.writeFileSync(file + '.tmp', JSON.stringify(config, null, 2));
  fs.renameSync(file + '.tmp', file);
}

export function updateConfig(change: (c: AppConfig) => void): AppConfig {
  const config = loadConfig();
  change(config);
  saveConfig(config);
  return config;
}

export function rememberLibrary(libraryPath: string): void {
  updateConfig((c) => {
    c.lastLibrary = libraryPath;
    c.recentLibraries = [libraryPath, ...c.recentLibraries.filter((p) => p.toLowerCase() !== libraryPath.toLowerCase())]
      .slice(0, MAX_RECENT);
  });
}
