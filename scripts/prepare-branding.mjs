import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const source=path.resolve('build/free-ai-symbol.svg');
const target=path.resolve('build/icon.png');

if(!fs.existsSync(source)){
  console.error('Missing build/free-ai-symbol.svg');
  process.exit(1);
}

fs.mkdirSync(path.dirname(target),{recursive:true});
await sharp(source)
  .resize(1024,1024,{fit:'contain'})
  .png()
  .toFile(target);

console.log('Prepared 1024px Free AI desktop fallback icon from the canonical supplied SVG.');
