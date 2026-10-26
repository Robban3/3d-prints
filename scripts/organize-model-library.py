"""Conservative, receipt-backed library cleanup. No version-number-only deletion."""
from pathlib import Path
import argparse, hashlib, json, zipfile, shutil, xml.etree.ElementTree as ET
from datetime import datetime
from model_library import LIBRARY

root = LIBRARY.resolve()
archive = root / 'Arkiv-inte-for-utskrift' / 'Rensning-2026-10-26'
model_ext = {'.stl', '.3mf', '.blend', '.f3d', '.step', '.stp', '.obj', '.glb'}
events = []

def checked(path):
    path = path.resolve()
    path.relative_to(root)
    if path == root:
        raise ValueError('Refusing library root')
    return path

def record(action, src, dst=None, reason=''):
    events.append(dict(action=action, source=str(src.relative_to(root)),
                       destination=str(dst.relative_to(root)) if dst else None, reason=reason))
    with (root / 'rensningsjournal-2026-10-26.jsonl').open('a', encoding='utf-8') as journal:
        journal.write(json.dumps(events[-1], ensure_ascii=False) + '\n')

def move(src, dst, reason):
    src, dst = checked(src), checked(dst)
    if not src.is_file(): return
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        if hashlib.sha256(src.read_bytes()).digest() != hashlib.sha256(dst.read_bytes()).digest():
            raise ValueError(f'Destination differs: {dst}')
        src.unlink()
        record('delete-identical-copy', src, dst, reason)
    else:
        src.rename(dst)
        record('move', src, dst, reason)

def archive_file(src, reason):
    try:
        move(src, archive / src.relative_to(root), reason)
    except OSError as error:
        record('unavailable-preserved', src, reason=str(error))

def archive_folder(relative, reason):
    try:
        folder = checked(root / relative)
    except OSError as error:
        record('unavailable-preserved', root / relative, reason=str(error))
        return
    if not folder.is_dir(): return
    for src in sorted(folder.rglob('*')):
        if src.is_file(): archive_file(src, reason)
    for sub in sorted(folder.rglob('*'), key=lambda p: len(p.parts), reverse=True):
        if sub.is_dir() and not any(sub.iterdir()): sub.rmdir()
    if not any(folder.iterdir()): folder.rmdir()

def verify_3mf(data):
    import io
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert z.testzip() is None
        assert any(b'<vertex ' in z.read(n) or b':vertex ' in z.read(n)
                   for n in z.namelist() if n.endswith('.model'))
        cfg = json.loads(z.read('Metadata/project_settings.config'))
        assert len(cfg.get('filament_colour', [])) >= 2, cfg.get('filament_colour')
        return cfg.get('filament_colour')

def main():
    # Restore the verified current delivery from its package if its folder is missing.
    delivery = root / 'Leveranser/StarBowling-kropp-100mm'
    package = root / 'Leveranser/StarBowling-kropp-100mm.zip'
    if not package.exists(): package = archive / 'Leveranser/StarBowling-kropp-100mm.zip'
    names = ['Saltkar_kropp-100mm_med-lock.3mf', 'Pepparkar_kropp-100mm_med-lock.3mf']
    with zipfile.ZipFile(package) as z:
        report = json.loads(z.read('kontroll.json'))
        for key in ['Salt', 'Peppar']:
            assert report[key]['body_dimensions_mm'] == [47.54, 47.54, 100]
        for name in names:
            data = z.read(name)
            colors = verify_3mf(data)
            dst = checked(delivery / name)
            if not dst.exists():
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.write_bytes(data)
                record('restore-current', dst, reason=f'Verified 100 mm body, palette {colors}')
            else: verify_3mf(dst.read_bytes())
        for name in ['kontroll.json', 'kropp-och-lock.png', 'monterade-kropp-100mm.png']:
            dst = delivery / name
            if not dst.exists(): dst.write_bytes(z.read(name))
        # STL alternatives are working exports, not competing print deliveries.
        for name in z.namelist():
            if name.endswith('.stl'):
                dst = checked(root / 'Modeller/starbowling-salt-peppar-kropp-100mm/STL-alternativ' / name)
                dst.parent.mkdir(parents=True, exist_ok=True)
                if not dst.exists(): dst.write_bytes(z.read(name))
    for src in list(delivery.glob('*.stl')):
        move(src, root / 'Modeller/starbowling-salt-peppar-kropp-100mm/STL-alternativ' / src.name,
             'Colorless STL alternative; use the two color 3MF deliveries')
    # Confirmed superseded products; retain history outside active folders.
    for rel, why in [
        ('Modeller/starbowling-salt-peppar', 'Replaced by 100 mm BODY and corrected text'),
        ('Modeller/julkula-veckad-rod', 'Replaced by two-piece 100 mm red bauble'),
        ('Leveranser/Julkula-veckad-rod', 'Replaced by two-piece 100 mm red bauble'),
        ('Leveranser/julmodeller-fargkorrigerade-v2', 'Same eight products now have geometry-reviewed v4 deliveries'),
    ]: archive_folder(rel, why)
    # Mixed package also contains current drink sticks and sign: only remove old shakers.
    mixed = root / 'Leveranser/starbowling-alla-stl'
    for name in ['Salt-behallare.stl', 'Salt-lock.stl', 'Peppar-behallare.stl', 'Peppar-lock.stl']:
        archive_file(mixed / name, 'Old small shaker; replaced by 100 mm BODY')
    # Old elf color iterations are explicitly superseded by the manual v4 mapping.
    elf = root / 'Modeller/alv-blender-v1/fargoverforing'
    if (elf / 'Alv-manuellt-ritade-fargfalt-v4.3mf').exists() and (elf / 'Alv-forbattrad-8-farger-v4.blend').exists():
        for name in ['Alv-forbattrad-8-farger-rena-kanter.3mf', 'Alv-forbattrad-8-farger-v3.3mf',
                     'Alv-forbattrad-8-farger.3mf', 'Alv-forbattrad-8-farger-v3.blend', 'Alv-forbattrad-8-farger.blend']:
            archive_file(elf / name, 'Replaced by manual color fields v4; originals preserved')
    # Bauble print folder contains exactly four one-part, one-color 3MFs.
    balls = root / 'Leveranser/Julgranskulor-tvadelade-100mm'
    for src in list(balls.glob('*.3mf')):
        if src.name.endswith('-2-delar.3mf'):
            move(src, root / 'Modeller/julgranskulor-tvadelade-100mm/Bambu-projekt' / src.name,
                 'Combined overview; print individual body and gold top files from Leveranser')
    for src in list(balls.glob('*.stl')):
        move(src, root / 'Modeller/julgranskulor-tvadelade-100mm/STL-alternativ' / src.name,
             'Colorless alternative; avoid mixing with color print projects')
    # Archive redundant ZIP bundles which reintroduce old files into print folders.
    for name in ['StarBowling-kropp-100mm.zip', 'StarBowling-alla-STL.zip', 'Julgranskulor-tvadelade-100mm.zip']:
        archive_file(root / 'Leveranser' / name, 'Expanded current files available; package contains competing alternatives')
    # Global safe cleanup: Blender backups only when the main file is present and newer.
    for group in ['Modeller', 'Leveranser']:
        for src in list((root / group).rglob('*')):
            if src.is_file() and src.suffix.lower() in {'.blend1', '.blend2'}:
                current = src.with_suffix('.blend')
                if current.exists() and current.stat().st_mtime >= src.stat().st_mtime:
                    archive_file(src, 'Older automatic Blender backup with newer main project retained')
    # Delete only byte-identical, same-named 3D copies within one product folder.
    for product in list((root / 'Modeller').iterdir()):
        if not product.is_dir(): continue
        groups = {}
        for src in product.rglob('*'):
            if src.is_file() and src.suffix.lower() in model_ext:
                groups.setdefault((src.name.lower(), src.stat().st_size), []).append(src)
        for candidates in groups.values():
            if len(candidates) < 2: continue
            seen = {}
            for src in sorted(candidates, key=lambda p: (len(p.parts), str(p))):
                digest = hashlib.sha256(src.read_bytes()).hexdigest()
                if digest in seen:
                    checked(src).unlink()
                    record('delete-identical-copy', src, seen[digest], 'SHA-256 identical, same product and filename')
                else: seen[digest] = src
    delivery.joinpath('LAS-MIG.txt').write_text(
        'ANVÄND ENDAST DESSA TVÅ 3MF-FILER FÖR SALT OCH PEPPAR:\n'
        + '\n'.join(names) + '\n\nKropp: 47,54 × 47,54 × 100 mm. Med lock: cirka 115,35 mm högt.\n'
        'Kropp och lock ingår i varje fil. Färger och omgjord text ingår.\n'
        'Öppna som projekt i Bambu Studio och koppla färgerna till rätt filament.\n'
        'STL-alternativ ligger under Modeller; äldre små kar ligger i Arkiv-inte-for-utskrift.\n', encoding='utf-8')
    balls.joinpath('LAS-MIG.txt').write_text(
        'FYRA UTSKRIFTSFILER: röd kula, dess guldtopp, grön kula, dess guldtopp.\n'
        'Öppna respektive 3MF som PROJEKT för att få färgen. Import av geometri till ett annat projekt kan byta färg.\n'
        'Varje fil innehåller en separat fysisk del. Kroppens diameter är 100 mm.\n'
        'Guldtoppen inklusive öglan ska skrivas ut helt i guld och limmas på kroppen.\n'
        'Kombinerade översikter och STL-alternativ finns under Modeller/julgranskulor-tvadelade-100mm.\n', encoding='utf-8')
    links = [f'- [Saltkar – NY kropp 100 mm](Leveranser/StarBowling-kropp-100mm/{names[0]})',
             f'- [Pepparkar – NY kropp 100 mm](Leveranser/StarBowling-kropp-100mm/{names[1]})']
    for p in sorted(balls.glob('*.3mf')):
        links.append(f'- [{p.stem}](Leveranser/Julgranskulor-tvadelade-100mm/{p.name})')
    rest = []
    for group in ['Leveranser', 'Modeller']:
        for product in sorted((root / group).iterdir()):
            if not product.is_dir(): continue
            files = [p for p in product.rglob('*') if p.is_file() and p.suffix.lower() in model_ext]
            if files: rest.append(f'- {group}/{product.name}: {len(files)} modellfiler')
    (root / 'START-HAR-AKTUELLA-FILER.md').write_text(
        '# Aktuella utskriftsfiler\n\nSalt/peppar: använd de två filerna nedan. Kroppen är 100 mm, inte hela karet.\n\n'
        + '\n'.join(links) + '\n\n## Övriga produkter\n\n' + '\n'.join(rest)
        + '\n\nModeller innehåller redigerbara arbetsprojekt och alternativa format. Leveranser innehåller utskriftsleveranser.\n'
        'Arkiv-inte-for-utskrift innehåller bortsorterade äldre versioner och paket; använd dem inte för produktion.\n'
        'Unika designvarianter och delar har bevarats; versionsnummer ensamt har inte använts för radering.\n', encoding='utf-8')
    receipt = root / 'rensningskvitto-2026-10-26.json'
    receipt.write_text(json.dumps(dict(date=datetime.now().isoformat(), actions=events), ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(actions=len(events), deleted_identical=sum(e['action']=='delete-identical-copy' for e in events),
                          receipt=str(receipt), current_salt=str(delivery/names[0]), current_pepper=str(delivery/names[1])), ensure_ascii=False))

if __name__ == '__main__': main()
