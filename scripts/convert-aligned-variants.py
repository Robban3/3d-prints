from PIL import Image
import json,sys
from pathlib import Path
for item in json.load(open(sys.argv[1],encoding='utf-8')):
    source=Image.open(item['path']).convert('RGB')
    source.save(Path('client/public/images/variants')/(item['file']+'-aligned.webp'),'WEBP',quality=92)
