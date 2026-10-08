#!/usr/bin/env node
/*
 * 打包脚本（无第三方依赖）：node scripts/pack.mjs
 *
 * 生成：
 *   dist/ghwho-edge-<version>.zip     —— 去掉 browser_specific_settings，避免 Edge 报“无法识别的清单键”警告
 *   dist/ghwho-firefox-<version>.zip  —— 原样 manifest
 *
 * 之所以不用 PowerShell 的 Compress-Archive：Windows PowerShell 5.1 生成的 zip
 * 路径分隔符是反斜杠，addons.mozilla.org 会拒绝。
 */
import { deflateRawSync } from 'node:zlib';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE = ['manifest.json', 'src', 'popup', 'icons'];
const IGNORE = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/i;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function walk(path) {
  const abs = join(ROOT, path);
  if (statSync(abs).isFile()) return [path];
  return readdirSync(abs).flatMap((name) => walk(join(path, name)));
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/* 最小 zip 写入器：deflate 压缩、UTF-8 文件名、正斜杠路径 */
function zip(entries) {
  const { time, date } = dosDateTime(new Date());
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 文件名
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const files = INCLUDE.flatMap(walk)
  .map((p) => relative(ROOT, join(ROOT, p)).split(sep).join('/'))
  .filter((p) => !IGNORE.test(p))
  .sort();

function build(target, transformManifest) {
  const entries = files.map((name) => {
    if (name === 'manifest.json') {
      const m = transformManifest(structuredClone(manifest));
      return { name, data: Buffer.from(`${JSON.stringify(m, null, 2)}\n`, 'utf8') };
    }
    return { name, data: readFileSync(join(ROOT, name)) };
  });
  const out = join(ROOT, 'dist', `ghwho-${target}-${manifest.version}.zip`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, zip(entries));
  console.log(`✔ ${relative(ROOT, out)}  (${entries.length} files)`);
}

build('edge', (m) => {
  delete m.browser_specific_settings;
  return m;
});
build('firefox', (m) => m);
