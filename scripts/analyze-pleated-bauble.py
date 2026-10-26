import zipfile,xml.etree.ElementTree as ET,collections,json,sys,time
from pathlib import Path
import numpy as np
SRC=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Desktop\modeller m3f\Julkula - veckad (röd).3mf')
OUT=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Documents\Formlabb\3D-modeller\Modeller\julkula-veckad-rod')
OUT.mkdir(parents=True,exist_ok=True)
V=np.empty((1196018,3),dtype=np.float32);F=np.empty((2393044,3),dtype=np.int32)
vi=fi=0;attrs=collections.Counter();color=[]
with zipfile.ZipFile(SRC)as z:
 for _,e in ET.iterparse(z.open('3D/Objects/object_1.model'),events=('end',)):
  name=e.tag.rsplit('}',1)[-1]
  if name=='vertex':V[vi]=[float(e.get(k))for k in ['x','y','z']];vi+=1;e.clear()
  elif name=='triangle':
   F[fi]=[int(e.get(k))for k in ['v1','v2','v3']];fi+=1
   paint={k:v for k,v in e.attrib.items()if k not in ['v1','v2','v3']};attrs.update([str(paint)])
   e.clear()
print('Parsed',vi,fi,'paint attributes',attrs.most_common(8),flush=True)
T=V[F];lo=T[:,:,2].min(1);hi=T[:,:,2].max(1)
report={'bounds_mm':[V.min(0).tolist(),V.max(0).tolist()],'vertices':vi,'triangles':fi,'paint_attributes':attrs.most_common(8),'slice_crossings':{str(h):int(((lo<h)&(hi>h)).sum())for h in [1,20,40,60,61.3,61.5,61.7,61.9,62.1,70,80,90,95,99]}}
sys.path.insert(0,str(OUT.parent/'jul-printberedning/deps'))
try:
 from scipy.sparse import coo_matrix
 from scipy.sparse.csgraph import connected_components
 rows=np.concatenate([F[:,0],F[:,1],F[:,2]]);cols=np.concatenate([F[:,1],F[:,2],F[:,0]])
 graph=coo_matrix((np.ones(len(rows),dtype=np.uint8),(rows,cols)),shape=(len(V),len(V))).tocsr()
 count,labels=connected_components(graph,directed=False)
 report['components']=[]
 for i in range(count):
  a=V[labels==i];report['components'].append({'id':i,'vertices':len(a),'bounds_mm':[a.min(0).tolist(),a.max(0).tolist()]})
 np.save(OUT/'component-labels.npy',labels)
except ImportError as error:report['component_check_error']=str(error)
np.savez_compressed(OUT/'arbetsgeometri.npz',vertices=V,faces=F)
(OUT/'originalkontroll.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False),flush=True)
