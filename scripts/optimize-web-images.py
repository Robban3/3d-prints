"""Generate content-addressed responsive copies of public images (requires Pillow).

Only client/public/images is read; private uploads and customer files are excluded.
Original images are kept unchanged. Run after adding new public campaign images.
"""
from pathlib import Path
from hashlib import sha256
import json
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1]
public = root / 'client/public'
output = public / 'images/responsive'
output.mkdir(exist_ok=True)
mapping = {}
seen = set()
original_bytes = mobile_bytes = 0
for source in sorted((public / 'images').rglob('*')):
    if not source.is_file() or output in source.parents or source.suffix.lower() not in ('.png', '.webp', '.jpg', '.jpeg'):
        continue
    if 'brand' in source.parts:
        continue
    digest = sha256(source.read_bytes()).hexdigest()[:20]
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert('RGB')
        sizes = sorted(set(min(width, image.width) for width in (320, 640, 960, 1536)))
        candidates = []
        for width in sizes:
            name = f'{digest}-{width}.webp'
            target = output / name
            if name not in seen:
                image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS).save(target, 'WEBP', quality=78, method=6)
                seen.add(name)
            candidates.append(f'/images/responsive/{name} {width}w')
        mapping['/' + source.relative_to(public).as_posix()] = {
            'src': f'/images/responsive/{digest}-{sizes[-1]}.webp',
            'srcSet': ', '.join(candidates),
            'width': image.width, 'height': image.height,
        }
        original_bytes += source.stat().st_size
        mobile_bytes += (output / f'{digest}-{min(640, image.width)}.webp').stat().st_size
manifest = root / 'client/src/lib/responsive-images.json'
manifest.write_text(json.dumps(mapping, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'{len(mapping)} image paths, {len(seen)} unique files; original bytes {original_bytes}, 640px bytes {mobile_bytes}')
