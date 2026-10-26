import zipfile,xml.etree.ElementTree as E,numpy as np,json,io
from pathlib import Path
ROOT=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Documents\Formlabb\3D-modeller')
OUT=ROOT/'Modeller/julgranskulor-tvadelade-100mm';OUT.mkdir(parents=True,exist_ok=True)
src=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Desktop\modeller m3f')
for key,name in [('rod','Julkula - veckad (röd).3mf'),('gron','Julkula - vävd (grön).3mf')]:
 with zipfile.ZipFile(src/name)as z:data=z.read('3D/Objects/object_1.model')
 nv=data.count(b'<vertex ');nf=data.count(b'<triangle ');v=np.empty((nv,3),np.float32);f=np.empty((nf,3),np.int32);gold=np.zeros(nf,bool);vi=fi=0
 for _,e in E.iterparse(io.BytesIO(data),events=('end',)):
  if e.tag.endswith('vertex'):v[vi]=[float(e.get(a))for a in ['x','y','z']];vi+=1;e.clear()
  elif e.tag.endswith('triangle'):
   f[fi]=[int(e.get(a))for a in ['v1','v2','v3']];s=e.get('paint_color','4');gold[fi]=s.count('8')>max(s.count('4'),s.count('C'));fi+=1;e.clear()
 g=v[np.unique(f[gold])];print(key,nv,nf,'all bounds',v.min(0).tolist(),v.max(0).tolist(),'gold bounds',g.min(0).tolist(),g.max(0).tolist(),flush=True)
 np.savez_compressed(OUT/(key+'-kalla.npz'),vertices=v,faces=f,gold=gold)
 del data,v,f,g,gold
