import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const source=path.resolve('build/icon.svg');
const target=path.resolve('build/icon.png');

if(!fs.existsSync(source)){
  console.error('Missing build/icon.svg');
  process.exit(1);
}

fs.mkdirSync(path.dirname(target),{recursive:true});
await sharp(source,{density:384})
  .resize(1024,1024,{fit:'contain'})
  .png({compressionLevel:9})
  .toFile(target);

console.log('Prepared Free AI desktop icon from vector source.');
