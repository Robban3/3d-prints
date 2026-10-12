from PIL import Image,ImageDraw
import json
jobs=json.load(open('tmp/variant-jobs.json',encoding='utf-8'))
slugs=list(dict.fromkeys(j['slug'] for j in jobs))
for batch in range(3):
    items=[j for j in jobs if j['slug'] in slugs[batch*5:(batch+1)*5]]
    groups={}
    for j in items: groups.setdefault((j['slug'],j['size']),[]).append(j)
    sheet=Image.new('RGB',(1200,len(groups)*325),'white'); d=ImageDraw.Draw(sheet)
    for row,group in enumerate(groups.values()):
        for col,j in enumerate(group):
            im=Image.open('client/public/images/variants/'+j['file']+'.webp'); im.thumbnail((285,285)); sheet.paste(im,(col*300,row*325)); d.text((col*300,row*325+287),j['file'],fill='black'); d.text((col*300,row*325+303),j['color'],fill='black')
    sheet.save(f'tmp/variant-audit-{batch}.jpg')
