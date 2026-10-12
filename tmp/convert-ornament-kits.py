from PIL import Image
import json
for item in json.load(open('design-concepts/name-ornament-kit-prompts.json',encoding='utf-8')):
    Image.open(item['path']).convert('RGB').save('client/public/images/christmas/'+item['file']+'.webp','WEBP',quality=92)
