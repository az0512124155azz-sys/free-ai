import hashlib, json, pathlib, re, subprocess, time, uuid
import xml.etree.ElementTree as ET

OUT=pathlib.Path('artifacts/android-a3-pr141-visual')
OUT.mkdir(parents=True,exist_ok=True)
PACKAGE='com.freeai.mobile'
ACTIVITY=PACKAGE+'/.MainActivity'
ACTION='com.freeai.mobile.FREEAI_RUNTIME_QA'
serials=[line.split()[0] for line in subprocess.check_output(['adb','devices'],text=True).splitlines()[1:] if line.endswith('\tdevice')]
if len(serials)!=1:
    raise RuntimeError('Expected exactly one emulator: '+repr(serials))
SERIAL=serials[0]
rows=[]
seq=0
last_xml=None

def adb(*args,binary=False,timeout=25):
    return subprocess.check_output(['adb','-s',SERIAL,*args],timeout=timeout,text=not binary)

def norm(value):
    return ' '.join(str(value or '').split()).strip()

def labels(node):
    return [norm(node.get(k,'')) for k in ('text','content-desc')]

def bounds(node):
    return list(map(int,re.findall(r'\d+',node.get('bounds',''))))

def visible(node):
    b=bounds(node)
    return node.get('enabled')!='false' and len(b)==4 and b[2]>b[0] and b[3]>b[1]

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
        remote=f'/sdcard/freeai-a3-{uuid.uuid4().hex}.xml'
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

def tap(title,name):
    nodes=wait(title,name+'-before')
    node=matches(nodes,title)[0]
    x1,y1,x2,y2=bounds(node)
    x,y=(x1+x2)//2,(y1+y2)//2
    with (OUT/'taps.jsonl').open('a') as f:
        f.write(json.dumps({'target':title,'xml':last_xml,'bounds':node.get('bounds'),'center':[x,y]})+'\n')
    adb('shell','input','tap',str(x),str(y))
    time.sleep(.8)

def shot(name):
    (OUT/(name+'.png')).write_bytes(adb('exec-out','screencap','-p',binary=True))
    return dump(name)

def record(name,status,detail):
    rows.append({'name':name,'status':status,'detail':detail})
    (OUT/'results.json').write_text(json.dumps(rows,indent=2,ensure_ascii=False))
    print(status,name,detail,flush=True)

def qa_line(command):
    subprocess.run(['adb','-s',SERIAL,'logcat','-b','main','-c'],capture_output=True,timeout=8)
    subprocess.run(['adb','-s',SERIAL,'shell','am','broadcast','-a',ACTION,'-p',PACKAGE,'--es','command',command],check=True,capture_output=True,timeout=12)
    time.sleep(.7)
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

def webview_bounds(nodes):
    items=[n for n in nodes if n.get('class')=='android.webkit.WebView' and visible(n)]
    return bounds(items[0]) if items else None

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
initial=wait('Free AI · Chat','launch',40)
initial_bounds=webview_bounds(initial)
(OUT/'initial-webview-bounds.json').write_text(json.dumps({'bounds':initial_bounds},indent=2))
if initial_bounds and initial_bounds[1] <= 2:
    record('Edge-to-edge WebView top','PASS','WebView begins at screen top: '+str(initial_bounds))
else:
    record('Edge-to-edge WebView top','FAIL','WebView still inset from top: '+str(initial_bounds))

qa_line('setThemeDark')
dark_state=qa_wait('audit','theme=dark','systemBars=dark')
dark_nodes=shot('01-dark-chat')
(OUT/'dark-qa-state.txt').write_text(dark_state+'\n')
record('Dark theme QA state','PASS',dark_state)

tap('Free AI · Chat','open-dark-mode-menu')
menu=wait('Work','dark-mode-menu',20)
menu=shot('02-dark-mode-menu')
chat=matches(menu,'Chat')
work=matches(menu,'Work')
model=matches(menu,'Select model')
geom={'Chat':[bounds(n) for n in chat],'Work':[bounds(n) for n in work],'Select model':[bounds(n) for n in model]}
(OUT/'mode-bounds.json').write_text(json.dumps(geom,indent=2))
if chat and work and model:
    record('Dark mode menu visible','PASS','Chat, Work and Select model all visible in accepted UI tree')
else:
    record('Dark mode menu visible','FAIL',f'Chat={len(chat)} Work={len(work)} Select model={len(model)}')

tap('Work','select-work')
wait('Free AI · Work','work-active',20)
record('Chat to Work switch','PASS','Work became active from the open mode menu')

tap('Free AI · Work','open-work-mode-menu')
wait('Chat','work-menu',20)
shot('03-dark-work-menu')
tap('Chat','select-chat')
wait('Free AI · Chat','chat-active',20)
record('Work to Chat switch','PASS','Chat became active from the open mode menu')

qa_line('setThemeLight')
light_state=qa_wait('audit','theme=light','systemBars=light')
shot('04-light-chat')
(OUT/'light-qa-state.txt').write_text(light_state+'\n')
record('Light theme QA state','PASS',light_state)

(OUT/'window-dark-light.txt').write_text(adb('shell','dumpsys','window'))
(OUT/'summary.json').write_text(json.dumps({
    'initialWebViewBounds':initial_bounds,
    'darkQa':dark_state,
    'lightQa':light_state,
    'modeBounds':geom,
    'acceptedFinalXml':last_xml
},indent=2,ensure_ascii=False))
(OUT/'crash.txt').write_text(adb('logcat','-b','crash','-d'))
(OUT/'logcat.txt').write_text(adb('logcat','-d'))

if any(r['status']!='PASS' for r in rows):
    raise SystemExit(1)
