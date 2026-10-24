"""Move the local model library out of the website repo, verifying every file."""
import argparse, concurrent.futures, hashlib, json, os, shutil, time, zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MODEL_EXT={'.blend','.stl','.3mf','.obj','.glb','.gltf','.fbx','.f3d','.step','.stp','.scad'}
OLD={**{f'haxans-gomma-blender-v{i}':'haxans-gomma-blender-v6' for i in range(1,6)},
     'jul-blender-v1':'jul-blender-v3','pepparkakshus-blender-v2':'pepparkakshus-blender-v3',
     'presentask-original-v1':'presentask-original-v3','presentask-original-v2':'presentask-original-v3',
     'presentask-v1':'presentask-variant-rak-v1','gravbiblioteket-fusion-v1':'gravbiblioteket-blender-v2'}

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(8*1024*1024),b''):h.update(block)
    return h.hexdigest()

def zip_models(p):
    try:
        with zipfile.ZipFile(p) as z:return any(Path(n).suffix.lower() in MODEL_EXT for n in z.namelist())
    except (OSError,zipfile.BadZipFile):return False

def files(folder):return [p for p in folder.rglob('*') if p.is_file()]

def plan(dest):
    base=ROOT/'models';allfiles=files(base)
    stale={};review=[]
    for old,new in OLD.items():
        olddir,newdir=base/old,base/new
        final=[p.stat().st_mtime for p in files(newdir) if p.suffix.lower() in MODEL_EXT]
        previous=[p.stat().st_mtime for p in files(olddir) if p.suffix.lower() in MODEL_EXT]
        if final and (not previous or max(previous)<=max(final)):stale[old]=new
        elif olddir.exists():review.append(old)
    exports=ROOT/'exports';extras=[]
    for p in exports.iterdir():
        if p.is_dir():
            fs=files(p)
            if any(q.suffix.lower() in MODEL_EXT or (q.suffix.lower()=='.zip' and zip_models(q)) for q in fs):extras.extend(fs)
        elif p.suffix.lower() in MODEL_EXT or (p.suffix.lower()=='.zip' and zip_models(p)):extras.append(p)
    keep=[];prune=[]
    for p in allfiles+extras:
        rel=p.relative_to(ROOT);parts=rel.parts;reason=None
        if parts[0]=='models':
            if parts[1] in stale:reason='ersatt av '+stale[parts[1]]
            if parts[1]=='infinity-vas-passform' and len(parts)>2 and parts[2]!='abstrakt-v8':reason='förkastad Nexo-version/arbetsfil; vald slutversion är abstrakt-v8'
        if p.suffix.lower().startswith('.blend') and p.suffix.lower()!='.blend':
            current=p.with_suffix('.blend')
            if current.exists() and current.stat().st_mtime>=p.stat().st_mtime:reason='äldre automatisk Blender-säkerhetskopia'
        if rel.as_posix().startswith('exports/starbowling-fodral/') or p.name=='presentask-v1-testmodell.zip':reason='ersatt prototyp'
        stat=p.stat();entry={'source':str(rel),'size':stat.st_size,'mtime_ns':stat.st_mtime_ns}
        if reason:entry['reason']=reason;prune.append(entry)
        else:
            entry['destination']=str(Path('Modeller' if parts[0]=='models' else 'Leveranser').joinpath(*parts[1:]));keep.append(entry)
    return {'created':time.strftime('%Y-%m-%d %H:%M:%S'),'source_root':str(ROOT),'destination_root':str(dest),'keep':keep,'prune':prune,'review':review}

def run(manifest,preserve_old=True,label='flytt'):
    if preserve_old:
        manifest['awaiting_cleanup']=manifest['prune']
        for entry in manifest['prune']:
            parts=Path(entry['source']).parts
            manifest['keep'].append({**entry,'destination':str(Path('Tidigare-versioner-for-granskning')/Path(*parts))})
        manifest['prune']=[]
    dest=Path(manifest['destination_root'])
    if not dest.is_absolute():raise ValueError('Destination must be absolute')
    dest.mkdir(parents=True,exist_ok=True)
    # Never overwrite any differing destination file.
    for e in manifest['keep']:
        p=ROOT/e['source'];q=dest/e['destination']
        if p.resolve().is_relative_to(dest.resolve()) or not p.resolve().is_relative_to(ROOT.resolve()):raise ValueError('Unsafe source')
        st=p.stat()
        if (st.st_size,st.st_mtime_ns)!=(e['size'],e['mtime_ns']):raise ValueError('Source changed since inventory: '+str(p))
        if q.exists() and digest(p)!=digest(q):raise FileExistsError('Different destination file: '+str(q))
    completed=[];copied_bytes=0
    # Create directories serially: the redirected SMB folder may report access
    # denied when multiple mkdir requests race for the same new directory.
    directories=sorted({(dest/e['destination']).parent for e in manifest['keep']},key=lambda p:len(p.parts))
    for directory in directories:
        for attempt in range(4):
            try:directory.mkdir(parents=True,exist_ok=True);break
            except PermissionError:
                if directory.is_dir():break
                if attempt==3:raise
                time.sleep(1)
    def copy(e):
        src=ROOT/e['source'];dst=dest/e['destination']
        if not dst.exists():shutil.copy2(src,dst)
        a=digest(src);b=digest(dst)
        if a!=b:raise IOError('Verification failed: '+str(src))
        return {**e,'sha256':a}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures=[pool.submit(copy,e) for e in manifest['keep']]
        for future in concurrent.futures.as_completed(futures):
            e=future.result();completed.append(e);copied_bytes+=e['size']
            if len(completed)%20==0 or len(completed)==len(futures):
                print(json.dumps({'verified_files':len(completed),'total_files':len(futures),'verified_GB':round(copied_bytes/1e9,2)}),flush=True)
    manifest['verified']=completed
    (dest/(label+'manifest.json')).write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    # Check EVERY source again before deleting ANY original, including stale versions.
    for e in manifest['keep']+manifest['prune']:
        p=ROOT/e['source'];st=p.stat()
        if (st.st_size,st.st_mtime_ns)!=(e['size'],e['mtime_ns']):raise ValueError('Source changed during copy: '+str(p))
        if not p.resolve().is_relative_to(ROOT.resolve()) or p.relative_to(ROOT).parts[0] not in ('models','exports'):raise ValueError('Unsafe delete')
    for e in manifest['keep']+manifest['prune']:(ROOT/e['source']).unlink()
    for root in [ROOT/'models',ROOT/'exports']:
        for p in sorted((p for p in root.rglob('*') if p.is_dir()),key=lambda p:len(p.parts),reverse=True):
            try:p.rmdir()
            except OSError:pass
    try:(ROOT/'models').rmdir()
    except OSError:pass
    summary={'destination':str(dest),'moved_files':len(completed),'moved_bytes':copied_bytes,'discarded_files':len(manifest['prune']),'discarded_bytes':sum(e['size'] for e in manifest['prune']),'archived_old_files':len(manifest.get('awaiting_cleanup',[])),'review':manifest['review'],'complete':True}
    (dest/(label+'resultat.json')).write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(summary,ensure_ascii=False),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--destination',type=Path);parser.add_argument('--plan',type=Path,required=True);parser.add_argument('--run',action='store_true');parser.add_argument('--preserve-old',action='store_true');parser.add_argument('--label',default='flytt');args=parser.parse_args()
    if not args.label.replace('-','').isalnum():raise ValueError('Unsafe report label')
    # Relocation never permanently discards superseded files. Cleanup is a
    # separate, explicitly reviewed action after the move is complete.
    if args.run:run(json.loads(args.plan.read_text(encoding='utf8')),True,args.label)
    else:
        manifest=plan(args.destination);args.plan.parent.mkdir(parents=True,exist_ok=True);args.plan.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
        print(json.dumps({'keep_files':len(manifest['keep']),'keep_GB':round(sum(e['size']for e in manifest['keep'])/1e9,2),'prune_files':len(manifest['prune']),'prune_GB':round(sum(e['size']for e in manifest['prune'])/1e9,2),'review':manifest['review']},ensure_ascii=False))
