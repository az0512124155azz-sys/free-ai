import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TAG='v1.9.4';

if(process.platform!=='linux'){
  console.log('Linux Whisper preparation skipped on '+process.platform+'.');
  process.exit(0);
}

const root=process.cwd();
const outDir=path.join(root,'build','linux-whisper');
const out=path.join(outDir,'whisper-cli');
if(fs.existsSync(out)){
  fs.chmodSync(out,0o755);
  console.log('Linux whisper-cli already prepared.');
  process.exit(0);
}

const work=path.join(root,'build','.whisper-cpp-'+TAG);
const src=path.join(work,'src');
const build=path.join(work,'build');
fs.rmSync(work,{recursive:true,force:true});
fs.mkdirSync(work,{recursive:true});

function run(command,args,cwd=root){
  console.log('> '+command+' '+args.join(' '));
  execFileSync(command,args,{cwd,stdio:'inherit',env:process.env});
}

run('git',['clone','--depth','1','--branch',TAG,'https://github.com/ggml-org/whisper.cpp.git',src]);
run('cmake',[
  '-S',src,
  '-B',build,
  '-DCMAKE_BUILD_TYPE=Release',
  '-DBUILD_SHARED_LIBS=OFF',
  '-DWHISPER_BUILD_IS_DEV=OFF',
  '-DWHISPER_BUILD_TESTS=OFF',
  '-DWHISPER_BUILD_EXAMPLES=ON',
  '-DWHISPER_SDL2=OFF',
  '-DGGML_NATIVE=OFF',
  '-DGGML_OPENMP=OFF'
]);
run('cmake',['--build',build,'--config','Release','--target','whisper-cli','--parallel','2']);

const built=path.join(build,'bin','whisper-cli');
if(!fs.existsSync(built))throw new Error('whisper-cli build completed without the expected binary: '+built);
fs.mkdirSync(outDir,{recursive:true});
fs.copyFileSync(built,out);
fs.chmodSync(out,0o755);

const version=execFileSync(out,['--version'],{encoding:'utf8'}).trim();
if(!/whisper\.cpp version:\s*1\.9\.4\b/.test(version)||/-dev\b/.test(version)){
  throw new Error('Unexpected whisper-cli version: '+version);
}
const ldd=execFileSync('ldd',[out],{encoding:'utf8'});
if(/libgomp\.so/i.test(ldd)){
  throw new Error('Linux whisper-cli unexpectedly depends on libgomp; build must remain portable without host OpenMP runtime.');
}
console.log('Prepared Linux whisper-cli at '+out+' ('+version+')');
