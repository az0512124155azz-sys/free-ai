import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';

const log=createWriteStream('desktop-build.log',{flags:'w'});
const child=spawn(process.platform==='win32'?'npm.cmd':'npm',['run','desktop:dist'],{
  stdio:['ignore','pipe','pipe'],
  shell:false,
  env:process.env
});

for(const stream of [child.stdout,child.stderr]){
  stream.on('data',chunk=>{
    process.stdout.write(chunk);
    log.write(chunk);
  });
}

child.on('error',err=>{
  console.error(err);
  log.end();
  process.exit(1);
});

child.on('close',code=>{
  log.end();
  process.exit(code??1);
});
