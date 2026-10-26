import bpy,bmesh,json
from pathlib import Path
root=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Documents\Formlabb\3D-modeller')
bpy.ops.wm.open_mainfile(filepath=str(root/'Modeller/julkula-veckad-rod/Julkula-veckad-rod.blend'))
o=next(o for o in bpy.context.scene.objects if o.type=='MESH');bm=bmesh.new();bm.from_mesh(o.data)
bad=[e for e in bm.edges if not e.is_manifold]
print('BAD',[(len(e.link_faces),[list(v.co)for v in e.verts])for e in bad],flush=True)
flaps=[f for f in bm.faces if sum(e.is_boundary for e in f.edges)==2 and any(len(e.link_faces)>2 for e in f.edges)]
bmesh.ops.delete(bm,geom=flaps,context='FACES_ONLY')
wire=[e for e in bm.edges if not e.link_faces]
if wire:bmesh.ops.delete(bm,geom=wire,context='EDGES')
boundary=[e for e in bm.edges if e.is_boundary]
if boundary:bmesh.ops.holes_fill(bm,edges=boundary,sides=20)
microverts=list({v for e in bm.edges if not e.is_manifold for v in e.verts})
if microverts:bmesh.ops.remove_doubles(bm,verts=microverts,dist=.15)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces))
bad=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True)
assert bad==0,f'{bad} problem edges remain'
bm.to_mesh(o.data);bm.free();o.data.update()
obj=o;mesh=o.data;work=root/'Modeller/julkula-veckad-rod';out=root/'Leveranser/Julkula-veckad-rod'
bpy.ops.wm.save_as_mainfile(filepath=str(work/'Julkula-veckad-rod.blend'))
import zipfile,xml.etree.ElementTree as ET,struct
from mathutils import Vector
code=(Path(__file__).parent/'repair-pleated-bauble.py').read_text(encoding='utf8')
exec(code[code.index("core='http"):])
