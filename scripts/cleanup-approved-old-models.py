"""Delete only the 291 archived files explicitly approved on 2026-10-24."""
import hashlib,json,time
from pathlib import Path

LIBRARY=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Documents\Formlabb\3D-modeller')
ARCHIVE=LIBRARY/'Tidigare-versioner-for-granskning'

def sha(path):
    h=hashlib.sha256()
    with path.open('rb')as f:
        for block in iter(lambda:f.read(8*1024*1024),b''):h.update(block)
    return h.hexdigest()

manifest=json.loads((LIBRARY/'flyttmanifest.json').read_text(encoding='utf8'))
approved=manifest['awaiting_cleanup']
if len(approved)!=291:raise ValueError('The approved scope must be exactly 291 files')
verified={e['source']:e for e in manifest['verified']}
targets=[];resolved_archive=ARCHIVE.resolve(strict=True)
for old in approved:
    record=verified[old['source']]
    path=LIBRARY/record['destination']
    if not path.resolve(strict=True).is_relative_to(resolved_archive):raise ValueError('Target outside approved archive')
    if not path.is_file() or path.is_symlink():raise ValueError('Not a regular archived file')
    if path.stat().st_size!=record['size'] or sha(path)!=record['sha256']:raise ValueError('Archived file changed since approval: '+str(path))
    targets.append((path,record))
actual={p.resolve()for p in ARCHIVE.rglob('*')if p.is_file()}
if actual!={p.resolve()for p,e in targets}:raise ValueError('Unexpected files in archive')
for required in ['Modeller/infinity-vas-passform/abstrakt-v8/Infinity-med-vas.blend',
                 'Modeller/infinity-vas-passform/abstrakt-v8/Infinity-med-vas-montering.3mf',
                 'Modeller/starbowling-salt-peppar/Salt-lock.stl',
                 'Modeller/starbowling-skylt/StarBowling-slutskylt-120x70x25-textur.stl']:
    if not (LIBRARY/required).is_file():raise ValueError('Current model missing: '+required)
receipt={'approved_on':'2026-10-24','user_approval':'Ja, radera de 291 listade äldre filerna',
         'files':[{k:e[k]for k in ['destination','size','sha256','reason']}for p,e in targets],
         'deleted_files':0,'deleted_bytes':0,'complete':False}
receipt_path=LIBRARY/'rensningskvitto.json'
# Record the exact, fully checked targets before deleting any file.
receipt_path.write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf8')
for path,record in targets:
    path.unlink();receipt['deleted_files']+=1;receipt['deleted_bytes']+=record['size']
    if receipt['deleted_files']%25==0:print('Deleted',receipt['deleted_files'],'of 291',flush=True)
for directory in sorted((p for p in ARCHIVE.rglob('*')if p.is_dir()),key=lambda p:len(p.parts),reverse=True):
    if not directory.resolve().is_relative_to(resolved_archive):raise ValueError('Unsafe directory')
    directory.rmdir()
ARCHIVE.rmdir()
receipt['complete']=True;receipt['completed_at']=time.strftime('%Y-%m-%d %H:%M:%S')
receipt_path.write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:receipt[k]for k in ['deleted_files','deleted_bytes','complete']},ensure_ascii=False),flush=True)
