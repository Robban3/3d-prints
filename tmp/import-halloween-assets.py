from PIL import Image,ImageDraw
from pathlib import Path
import json
items=json.load(open('design-concepts/halloween-catalog-images.json',encoding='utf-8'))
sheet=Image.new('RGB',(1500,1280),'white'); d=ImageDraw.Draw(sheet)
for i,item in enumerate(items):
    im=Image.open(item['path']).convert('RGB'); im.thumbnail((1536,1536))
    target=Path(item['asset']);target.parent.mkdir(parents=True,exist_ok=True);im.save(target,'WEBP',quality=92)
    if i<17:
        im.thumbnail((290,290));x=i%5*300;y=i//5*320;sheet.paste(im,(x,y));d.text((x,y+292),item['slug'],fill='black')
sheet.save('design-concepts/halloween-catalog-contact-sheet.jpg')
