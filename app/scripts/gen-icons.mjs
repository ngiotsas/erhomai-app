import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'public', 'icons');
await mkdir(outDir, { recursive: true });

const targets = [
  { src: 'icon.svg', name: 'icon-192.png', size: 192 },
  { src: 'icon.svg', name: 'icon-512.png', size: 512 },
  { src: 'icon-maskable.svg', name: 'icon-maskable-512.png', size: 512 },
  { src: 'icon.svg', name: 'apple-touch-icon.png', size: 180 },
];

for (const t of targets) {
  await sharp(path.join(root, 'public', t.src))
    .resize(t.size, t.size)
    .png()
    .toFile(path.join(outDir, t.name));
  console.log(`wrote ${t.name}`);
}
