import hashlib, json, pathlib, re, subprocess, time, uuid
import xml.etree.ElementTree as ET

OUT=pathlib.Path('artifacts/android-a3-pr141-mode-menu')
OUT.mkdir(parents=True,exist_ok=True)
PACKAGE='com.freeai.mobile'
ACTIVITY=PACKAGE+'/.MainActivity'
SERIAL=[line.split()[0] for line in subprocess.check_output(['adb','devices'],text=True).splitlines()[1:] if line.endswith('\tdevice')][0]
rows=[]
seq=0
last_xml=None

def adb(*args,binary=False,timeout=25):
    return subprocess.check_output(['adb','-s',SERIAL,*args],timeout=timeout,text=not binary)

def labels(node):
    return [' '.join(str(node.get(k,'')).split()).strip() for k in ('text','content-desc')]

def visible(node):
    b=list(map(int,re.findall(r'\d+',node.get('bounds',''))))
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
        folder=rootdir/f'attempt-{attempt}'; folder.mkdir()
        remote=f'/sdcard/freeai-a3-{uuid.uuid4().hex}.xml'
        try:
            subprocess.run(['adb','-s',SERIAL,'shell','rm','-f',remote],capture_output=True,timeout=8)
            gen=subprocess.run(['adb','-s',SERIAL,'shell','uiautomator','dump',remote],capture_output=True,timeout=12)
            read=subprocess.run(['adb','-s',SERIAL,'exec-out','cat',remote],capture_output=True,timeout=8)
            (folder/'dump.stdout').write_bytes(gen.stdout); (folder/'dump.stderr').write_bytes(gen.stderr); (folder/'raw.xml').write_bytes(read.stdout)
            diag=(gen.stdout+b'\n'+gen.stderr).decode(errors='replace')
            if gen.returncode or read.returncode or re.search(r'ERROR:|null root node|could not get idle state',diag,re.I): raise RuntimeError('dump failed')
            tree=ET.fromstring(read.stdout); nodes=list(tree.iter('node'))
            if tree.tag!='hierarchy' or not nodes: raise RuntimeError('invalid hierarchy')
            last_xml=str((folder/'raw.xml').relative_to(OUT))
            (folder/'accepted.json').write_text(json.dumps({'accepted':True,'attempt':attempt,'sha256':hashlib.sha256(read.stdout).hexdigest(),'nodeCount':len(nodes)},indent=2))
            return nodes
        except Exception as exc:
            last=str(exc); (folder/'rejected.txt').write_text(last)
            if time.monotonic()<end: time.sleep(.5)
    raise RuntimeError(name+': '+last)

def wait(title,name,seconds=30):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        nodes=dump(name,end)
        if matches(nodes,title): return nodes
        time.sleep(.5)
    raise RuntimeError('missing '+title)

def bounds(node):
    return list(map(int,re.findall(r'\d+',node.get('bounds',''))))

def tap(title,name):
    nodes=wait(title,name+'-before')
    node=matches(nodes,title)[0]
    x1,y1,x2,y2=bounds(node); x,y=(x1+x2)//2,(y1+y2)//2
    with (OUT/'taps.jsonl').open('a') as f: f.write(json.dumps({'target':title,'xml':last_xml,'bounds':node.get('bounds'),'center':[x,y]})+'\n')
    adb('shell','input','tap',str(x),str(y)); time.sleep(.8)

def shot(name):
    (OUT/(name+'.png')).write_bytes(adb('exec-out','screencap','-p',binary=True))
    return dump(name)

def record(name,status,detail):
    rows.append({'name':name,'status':status,'detail':detail})
    (OUT/'results.json').write_text(json.dumps(rows,indent=2))
    print(status,name,detail,flush=True)

apk=next(pathlib.Path('runtime-artifacts').rglob('free-ai-runtime-qa.apk'))
(OUT/'apk-sha256.txt').write_text(hashlib.sha256(apk.read_bytes()).hexdigest()+'\n')
adb('install','-r',str(apk))
subprocess.run(['adb','-s',SERIAL,'logcat','-c'],capture_output=True)
adb('shell','am','force-stop',PACKAGE)
adb('shell','am','start','-W','-n',ACTIVITY)
wait('Free AI · Chat','launch',40)

tap('Free AI · Chat','open-chat-work')
menu=wait('Work','mode-menu')
menu=shot('01-mode-menu')
chat=matches(menu,'Chat'); work=matches(menu,'Work'); model=matches(menu,'Select model')
if chat and work and model:
    record('Menu nodes visible','PASS','Chat, Work and Select model are all present')
else:
    record('Menu nodes visible','FAIL',f'Chat={len(chat)} Work={len(work)} Select model={len(model)}')
geom={'Chat':[bounds(n) for n in chat],'Work':[bounds(n) for n in work],'Select model':[bounds(n) for n in model]}
(OUT/'bounds.json').write_text(json.dumps(geom,indent=2))

tap('Work','select-work')
wait('Free AI · Work','work-active',20)
record('Chat to Work','PASS','Work became active after tapping the menu item')

tap('Free AI · Work','open-work-menu')
wait('Chat','work-menu')
shot('02-work-menu')
tap('Chat','select-chat')
wait('Free AI · Chat','chat-active',20)
record('Work to Chat','PASS','Chat became active after tapping the menu item')

(OUT/'crash.txt').write_text(adb('logcat','-b','crash','-d'))
(OUT/'logcat.txt').write_text(adb('logcat','-d'))
if any(r['status']!='PASS' for r in rows): raise SystemExit(1)
