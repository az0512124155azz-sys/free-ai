import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';

const log=createWriteStream('desktop-build.log',{flags:'w'});
const command='npm run desktop:dist';
const child=spawn(command,{
  shell:true,
  env:process.env
});

for(const stream of [child.stdout,child.stderr]){
  stream.on('data',chunk=>{
    process.stdout.write(chunk);
    log.write(chunk);
  });
}

child.on('error',err=>{
  const text='Spawn error: '+(err?.stack||err?.message||String(err))+'\n';
  process.stderr.write(text);
  log.write(text);
  log.end(()=>process.exit(1));
});

child.on('close',code=>{
  log.end(()=>process.exit(code??1));
});
