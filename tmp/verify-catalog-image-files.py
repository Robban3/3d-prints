from PIL import Image
from pathlib import Path
bad=[]
for p in Path('tmp/catalog-image-audit').glob('*.webp'):
    try:
        with Image.open(p) as im: im.verify()
    except Exception as e: bad.append((p.name,str(e)))
print({'decoded_images':len(list(Path('tmp/catalog-image-audit').glob('*.webp'))),'failures':bad})
