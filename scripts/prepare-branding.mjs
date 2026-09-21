import fs from 'node:fs';
import path from 'node:path';

const source=path.resolve('build/icon.png.b64');
const target=path.resolve('build/icon.png');

if(!fs.existsSync(source)){
  console.error('Missing build/icon.png.b64');
  process.exit(1);
}

const base64=fs.readFileSync(source,'utf8').trim();
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.writeFileSync(target,Buffer.from(base64,'base64'));
console.log('Prepared Free AI desktop icon.');
