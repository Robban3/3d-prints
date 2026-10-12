import numpy as np
from PIL import Image, ImageDraw
from pathlib import Path
files=list(Path('C:/Users/robvan/Downloads').glob('Meshy_AI_*_179173*_texture.stl'))
dtype=np.dtype([('n','<f4',3),('v','<f4',(3,3)),('a','<u2')])
for p in files:
 if not any(s in p.name for s in ['Snowy Pines','Forest Lantern','Ivory Bowl']):continue
 a=np.fromfile(p,dtype=dtype,offset=84); v=a['v'].reshape(-1,3); v=v[::2]; lo=v.min(0); hi=v.max(0)
 out=Image.new('RGB',(1500,550),'#f0f0f0'); draw=ImageDraw.Draw(out)
 for j,(axes,depth,label) in enumerate([((0,2),1,'XZ'),((1,2),0,'YZ'),((0,1),2,'XY')]):
  xy=v[:,axes]; scale=440/max((hi-lo)[list(axes)]); uv=((xy-(lo+hi)[list(axes)]/2)*scale+[250,270]).astype(int); uv[:,1]=540-uv[:,1]
  order=np.argsort(v[:,depth]); uv=uv[order]; colors=a['n'].repeat(3,axis=0)[::2][order]; shade=np.clip(140+80*colors[:,depth],60,230).astype('uint8'); tile=np.full((550,500,3),240,dtype='uint8'); tile[uv[:,1],uv[:,0],:]=shade[:,None];out.paste(Image.fromarray(tile),(500*j,0));draw.text((500*j+10,10),label,fill='black')
 draw.text((10,525),p.name+' dimensions '+str(hi-lo),fill='black');out.save(Path('tmp/ornament')/(p.stem+'.png'))
