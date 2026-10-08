// Renderiza el diseño vectorial propio. Requiere las dependencias de site instaladas.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(projectRoot, 'site/package.json'));
const sharp = require('sharp');
await sharp(path.join(projectRoot, 'site/public/social.svg')).png().toFile(path.join(projectRoot, 'site/public/social.png'));
console.log('Tarjeta social generada.');
