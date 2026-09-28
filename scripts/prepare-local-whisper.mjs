import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TAG='v1.9.4';
const supported=process.platform==='linux'||process.platform==='darwin';

if(!supported){
  console.log('Local Whisper preparation skipped on '+process.platform+'.');
  process.exit(0);
}

const platformLabel=process.platform==='darwin'?'macOS':'Linux';
const root=process.cwd();
const buildFolder=process.platform==='darwin'?'macos-whisper':'linux-whisper';
const outDir=path.join(root,'build',buildFolder);
const out=path.join(outDir,'whisper-cli');
if(fs.existsSync(out)){
  fs.chmodSync(out,0o755);
  console.log(platformLabel+' whisper-cli already prepared.');
  process.exit(0);
}

const work=path.join(root,'build','.whisper-cpp-'+TAG+'-'+process.platform);
const src=path.join(work,'src');
const build=path.join(work,'build');
fs.rmSync(work,{recursive:true,force:true});
fs.mkdirSync(work,{recursive:true});

function run(command,args,cwd=root){
  console.log('> '+command+' '+args.join(' '));
  execFileSync(command,args,{cwd,stdio:'inherit',env:process.env});
}

run('git',['clone','--depth','1','--branch',TAG,'https://github.com/ggml-org/whisper.cpp.git',src]);
const configure=[
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
];
if(process.platform==='darwin')configure.push('-DGGML_METAL=ON');
run('cmake',configure);
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

if(process.platform==='linux'){
  const ldd=execFileSync('ldd',[out],{encoding:'utf8'});
  if(/libgomp\.so/i.test(ldd)){
    throw new Error('Linux whisper-cli unexpectedly depends on libgomp; build must remain portable without host OpenMP runtime.');
  }
}else{
  const fileInfo=execFileSync('file',[out],{encoding:'utf8'});
  if(!/Mach-O/.test(fileInfo))throw new Error('macOS whisper-cli is not a Mach-O executable: '+fileInfo);
  const links=execFileSync('otool',['-L',out],{encoding:'utf8'});
  if(/\/opt\/homebrew|\/usr\/local|\.whisper-cpp-/i.test(links)){
    throw new Error('macOS whisper-cli has a non-system build-time dependency:\n'+links);
  }
}

console.log('Prepared '+platformLabel+' whisper-cli at '+out+' ('+version+')');
