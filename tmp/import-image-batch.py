from pathlib import Path
from PIL import Image
sources=[]
for entry in sources:
 out=Path('client/public/images')/entry['folder']/(entry['name']+'.webp')
 out.parent.mkdir(parents=True,exist_ok=True)
 if not out.exists():
  Image.open(entry['path']).convert('RGB').save(out,quality=90)
  print(entry['name'])
Image.open('client/public/images/campaign/julkollektionen-banner.png').convert('RGB').save('client/public/images/campaign/julkollektionen-banner.webp',quality=92)
