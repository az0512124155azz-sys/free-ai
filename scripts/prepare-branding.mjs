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
await sharp(source,{density:384})
  .resize(512,512,{fit:'contain'})
  .png()
  .toFile(target);

console.log('Prepared Free AI desktop icon from the vector brand source.');
