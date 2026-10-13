import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

/**
 * Packs apps/web/dist into release/deep-reef-web-<commit>.zip for upload to cPanel.
 *
 * Written by hand on purpose (no dependency):
 * - entries carry Unix permissions, 755 for directories and 644 for files, so they are
 *   right after extraction on the server whatever the umask or the OS the zip was made on;
 * - paths always use "/". Windows tools such as PowerShell 5's Compress-Archive write "\",
 *   which Linux extractors treat as part of the file name;
 * - the output is deterministic (sorted entries, fixed timestamp), so the same build
 *   always produces the same archive.
 */

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const DIST = here('../dist');
const RELEASE = here('../../../release');

const DIR_MODE = 0o040755;
const FILE_MODE = 0o100644;
// 2020-01-01 00:00 in MS-DOS format: a fixed date keeps archives reproducible.
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

interface Entry {
  readonly name: string;
  readonly mode: number;
  readonly data: Buffer;
}

function collect(dir: string): Entry[] {
  const entries: Entry[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      const zipName = relative(DIST, path).split(sep).join('/');
      if (statSync(path).isDirectory()) {
        entries.push({ name: `${zipName}/`, mode: DIR_MODE, data: Buffer.alloc(0) });
        walk(path);
      } else {
        entries.push({ name: zipName, mode: FILE_MODE, data: readFileSync(path) });
      }
    }
  };
  walk(dir);
  return entries;
}

function zip(entries: readonly Entry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const isDir = entry.name.endsWith('/');
    const compressed = isDir ? entry.data : deflateRawSync(entry.data, { level: 9 });
    const method = isDir ? 0 : 8;
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, so external attributes are Unix modes
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((entry.mode << 16) | (isDir ? 0x10 : 0)) >>> 0, 38); // Unix mode + MS-DOS dir flag
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function commitTag(): string {
  const sha = execSync('git rev-parse --short HEAD').toString().trim();
  const dirty = execSync('git status --porcelain').toString().trim() !== '';
  return dirty ? `${sha}-dirty` : sha;
}

const entries = collect(DIST);
if (!entries.some((e) => e.name === 'index.html'))
  throw new Error('apps/web/dist has no index.html: run the build first');
if (!entries.some((e) => e.name === '.htaccess')) throw new Error('apps/web/dist has no .htaccess');

mkdirSync(RELEASE, { recursive: true });
const out = join(RELEASE, `deep-reef-web-${commitTag()}.zip`);
writeFileSync(out, zip(entries));
const files = entries.filter((e) => !e.name.endsWith('/')).length;
console.log(`wrote ${out} (${files} files, directories 755, files 644)`);
