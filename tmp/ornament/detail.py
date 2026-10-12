import numpy as np
from PIL import Image,ImageDraw
from pathlib import Path
D=np.dtype([('n','<f4',3),('v','<f4',(3,3)),('a','<u2')])
for name,axes,depth in [('Starlit Snowy Pines_1791734628',(0,2),1),('Winter Forest Lantern_1791734916',(1,2),0)]:
 p=Path('C:/Users/robvan/Downloads')/('Meshy_AI_'+name+'_texture.stl');a=np.fromfile(p,dtype=D,offset=84);v=a['v'].reshape(-1,3);lo=v.min(0);hi=v.max(0);print(name,'bounds',lo.tolist(),hi.tolist())
 xy=v[:,axes];scale=1400/max((hi-lo)[list(axes)]);uv=((xy-(lo+hi)[list(axes)]/2)*scale+[800,800]).astype(int);uv[:,1]=1600-uv[:,1]; order=np.argsort(v[:,depth]);uv=uv[order]; n=a['n'].repeat(3,axis=0)[order]; shade=np.clip(150+90*n[:,depth],50,240).astype('uint8');tile=np.full((1600,1600,3),245,dtype='uint8');tile[uv[:,1],uv[:,0],:]=shade[:,None];Image.fromarray(tile).save(Path('tmp/ornament')/(name+'_detail.png'))
