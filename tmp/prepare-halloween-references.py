from PIL import Image
from pathlib import Path
out=Path('tmp/halloween-product-references');out.mkdir(exist_ok=True)
u=Image.open('design-concepts/halloween-12-designkoncept.png')
names=['portalpumpan','spokduon','korpens-vas','manskugga','haxans-gomma','gravbiblioteket','skuggkatten','pumpatornet','spokporten','midnattsgomman','runolyktan','ritualbrickan']
xs=[(8,254),(262,509),(517,763),(771,1017)];ys=[(101,498),(555,936),(996,1374)]
for i,name in enumerate(names):
    x=xs[i%4];y=ys[i//4];u.crop((x[0],y[0],x[1],y[1])).save(out/(name+'.png'))
c=Image.open('design-concepts/halloween-5-klassiker.png')
for name,box in [('ribbad-pumpa',(23,170,415,614)),('spoket-boo',(440,170,814,614)),('fladdermus-3-pack',(840,170,1231,615)),('dodskallekruka',(23,683,616,1174)),('spindelnat-4-pack',(638,683,1232,1174))]:
    c.crop(box).save(out/(name+'.png'))
