import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The app's own files (the built web app, migrations, package.json). From source they're in the
 * repo; `npm run package` bundles the server into one file next to them and defines `__BUNDLED__`.
 */

declare const __BUNDLED__: boolean | undefined;

const here = path.dirname(fileURLToPath(import.meta.url));
const bundled = typeof __BUNDLED__ !== 'undefined';

/** The repo root, or the packaged app folder. */
export const APP_DIR = bundled ? here : path.resolve(here, '../../..');

export const WEB_DIST = path.join(APP_DIR, 'web', 'dist');
export const MIGRATIONS_DIR = bundled ? path.join(APP_DIR, 'migrations') : path.join(APP_DIR, 'server', 'src', 'db', 'migrations');
export const ROOT_PACKAGE = path.join(APP_DIR, 'package.json');
