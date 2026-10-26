from pathlib import Path
import sys,json,numpy as np
root=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Documents\Formlabb\3D-modeller\Modeller')
sys.path.insert(0,str(root/'jul-printberedning/deps'))
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
p=root/'julkula-veckad-rod'
d=np.load(p/'arbetsgeometri.npz');v=d['vertices'];f=d['faces']
e=np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);e.sort(axis=1)
u,c=np.unique(e,axis=0,return_counts=True)
g=coo_matrix((np.ones(len(u),dtype=np.uint8),(u[:,0],u[:,1])),shape=(len(v),len(v))).tocsr()
n,l=connected_components(g,directed=False)
counts=np.bincount(l);mn=np.full((n,3),np.inf);mx=np.full((n,3),-np.inf)
np.minimum.at(mn,l,v);np.maximum.at(mx,l,v)
t=v[f].astype(np.float64)
vol=np.einsum('ij,ij->i',t[:,0],np.cross(t[:,1],t[:,2]))/6
volumes=np.bincount(l[f[:,0]],weights=vol,minlength=n)
report={'boundary_edges':int((c==1).sum()),'nonmanifold_edges':int((c>2).sum()),'components':int(n),'largest':[{'id':int(i),'vertices':int(counts[i]),'bounds':[mn[i].tolist(),mx[i].tolist()],'signed_volume':float(volumes[i])}for i in np.argsort(counts)[-20:][::-1]]}
np.save(p/'component-labels.npy',l)
(p/'topologi.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report),flush=True)
