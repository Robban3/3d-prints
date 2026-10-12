from PIL import Image,ImageDraw
import json
jobs=json.load(open('tmp/aligned-product-images.json',encoding='utf-8'))
for slug in ['terra-vaxtkruka','flexi-drake']:
    items=[j for j in jobs if j['slug']==slug]
    rows=3 if slug=='terra-vaxtkruka' else 2
    sheet=Image.new('RGB',(1200,rows*320),'white');d=ImageDraw.Draw(sheet)
    for s in range(rows):
        names=[f'{slug}-c0-s{s}']+[j['file']+'-aligned' for j in items if j['sizeIndex']==s]
        for c,name in enumerate(names):
            im=Image.open('client/public/images/variants/'+name+'.webp');im.thumbnail((295,295));sheet.paste(im,(c*300,s*320));d.text((c*300,s*320+298),name,fill='black')
    sheet.save('tmp/'+slug+'-aligned-audit.jpg')
