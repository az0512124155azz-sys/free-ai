import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const source=path.resolve('public/free-ai-logo.png');
const target=path.resolve('build/icon.png');

if(!fs.existsSync(source)){
  console.error('Missing public/free-ai-logo.png');
  process.exit(1);
}

fs.mkdirSync(path.dirname(target),{recursive:true});
await sharp(source)
  .resize(512,512,{fit:'contain'})
  .png()
  .toFile(target);

console.log('Prepared Free AI desktop icon from the supplied brand logo.');
