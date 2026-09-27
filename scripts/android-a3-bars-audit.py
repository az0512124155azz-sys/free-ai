import hashlib, json, pathlib, re, subprocess, time, uuid
import xml.etree.ElementTree as ET

OUT=pathlib.Path('artifacts/android-a3-pr141-bars')
OUT.mkdir(parents=True,exist_ok=True)
PACKAGE='com.freeai.mobile'
ACTIVITY=PACKAGE+'/.MainActivity'
ACTION='com.freeai.mobile.FREEAI_RUNTIME_QA'
serials=[line.split()[0] for line in subprocess.check_output(['adb','devices'],text=True).splitlines()[1:] if line.endswith('\tdevice')]
if len(serials)!=1:
    raise RuntimeError('Expected exactly one emulator: '+repr(serials))
SERIAL=serials[0]
seq=0
last_xml=None

def adb(*args,binary=False,timeout=25):
    return subprocess.check_output(['adb','-s',SERIAL,*args],timeout=timeout,text=not binary)

def norm(value):
    return ' '.join(str(value or '').split()).strip()

def visible(node):
    b=list(map(int,re.findall(r'\d+',node.get('bounds',''))))
    return node.get('enabled')!='false' and len(b)==4 and b[2]>b[0] and b[3]>b[1]

def labels(node):
    return [norm(node.get(k,'')) for k in ('text','content-desc')]

def matches(nodes,title):
    prefix=title+' '
    return [n for n in nodes if visible(n) and any(v==title or v.startswith(prefix) for v in labels(n) if v)]

def dump(name,deadline=None):
    global seq,last_xml
    end=deadline or time.monotonic()+25
    seq+=1
    rootdir=OUT/'ui-dumps'/f'{seq:02d}-{name}-{uuid.uuid4().hex}'
    rootdir.mkdir(parents=True)
    last='no hierarchy'
    for attempt in range(1,6):
        if time.monotonic()>=end:
            break
        folder=rootdir/f'attempt-{attempt}'
        folder.mkdir()
        remote=f'/sdcard/freeai-bars-{uuid.uuid4().hex}.xml'
        try:
            subprocess.run(['adb','-s',SERIAL,'shell','rm','-f',remote],capture_output=True,timeout=8)
            gen=subprocess.run(['adb','-s',SERIAL,'shell','uiautomator','dump',remote],capture_output=True,timeout=12)
            read=subprocess.run(['adb','-s',SERIAL,'exec-out','cat',remote],capture_output=True,timeout=8)
            (folder/'dump.stdout').write_bytes(gen.stdout)
            (folder/'dump.stderr').write_bytes(gen.stderr)
            (folder/'raw.xml').write_bytes(read.stdout)
            diag=(gen.stdout+b'\n'+gen.stderr).decode(errors='replace')
            if gen.returncode or read.returncode or re.search(r'ERROR:|null root node|could not get idle state',diag,re.I):
                raise RuntimeError('dump failed')
            tree=ET.fromstring(read.stdout)
            nodes=list(tree.iter('node'))
            if tree.tag!='hierarchy' or not nodes:
                raise RuntimeError('invalid hierarchy')
            last_xml=str((folder/'raw.xml').relative_to(OUT))
            (folder/'accepted.json').write_text(json.dumps({
                'accepted':True,'attempt':attempt,'remotePath':remote,
                'sha256':hashlib.sha256(read.stdout).hexdigest(),'nodeCount':len(nodes)
            },indent=2))
            return nodes
        except Exception as exc:
            last=str(exc)
            (folder/'rejected.txt').write_text(last)
            if time.monotonic()<end:
                time.sleep(.5)
    raise RuntimeError(name+': '+last)

def wait(title,name,seconds=30):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        nodes=dump(name,end)
        if matches(nodes,title):
            return nodes
        time.sleep(.5)
    raise RuntimeError('missing '+title)

def qa_line(command):
    subprocess.run(['adb','-s',SERIAL,'logcat','-b','main','-c'],capture_output=True,timeout=8)
    subprocess.run(['adb','-s',SERIAL,'shell','am','broadcast','-a',ACTION,'-p',PACKAGE,'--es','command',command],check=True,capture_output=True,timeout=12)
    time.sleep(.8)
    text=adb('logcat','-b','main','-d','-s','FreeAIAndroidQA:I','*:S')
    lines=[line for line in text.splitlines() if command+':' in line]
    return lines[-1] if lines else ''

def qa_wait(command,*tokens,seconds=20):
    end=time.monotonic()+seconds
    last=''
    while time.monotonic()<end:
        last=qa_line(command)
        if all(token in last for token in tokens):
            return last
        time.sleep(.4)
    raise RuntimeError('QA command '+command+' missing '+repr(tokens)+' last='+last)

def shot(name):
    path=OUT/(name+'.png')
    path.write_bytes(adb('exec-out','screencap','-p',binary=True))
    dump(name)
    return path

apk=next(pathlib.Path('runtime-artifacts').rglob('free-ai-runtime-qa.apk'))
(OUT/'apk-sha256.txt').write_text(hashlib.sha256(apk.read_bytes()).hexdigest()+'\n')
(OUT/'device.txt').write_text(
    'release='+adb('shell','getprop','ro.build.version.release').strip()+'\n'+
    'sdk='+adb('shell','getprop','ro.build.version.sdk').strip()+'\n'+
    adb('shell','wm','size')
)

adb('install','-r',str(apk))
subprocess.run(['adb','-s',SERIAL,'logcat','-c'],capture_output=True)
adb('shell','am','force-stop',PACKAGE)
adb('shell','am','start','-W','-n',ACTIVITY)
wait('Free AI · Chat','launch',40)

qa_line('setThemeDark')
dark=qa_wait('audit','theme=dark','systemBars=dark')
shot('01-dark-chat')
(OUT/'dark-qa-state.txt').write_text(dark+'\n')
(OUT/'window-dark.txt').write_text(adb('shell','dumpsys','window'))

qa_line('setThemeLight')
light=qa_wait('audit','theme=light','systemBars=light')
shot('02-light-chat')
(OUT/'light-qa-state.txt').write_text(light+'\n')
(OUT/'window-light.txt').write_text(adb('shell','dumpsys','window'))

(OUT/'summary.json').write_text(json.dumps({
    'darkQa':dark,
    'lightQa':light,
    'acceptedFinalXml':last_xml
},indent=2,ensure_ascii=False))
(OUT/'crash.txt').write_text(adb('logcat','-b','crash','-d'))
(OUT/'logcat.txt').write_text(adb('logcat','-d'))

if 'theme=dark' not in dark or 'systemBars=dark' not in dark:
    raise SystemExit(1)
if 'theme=light' not in light or 'systemBars=light' not in light:
    raise SystemExit(1)
