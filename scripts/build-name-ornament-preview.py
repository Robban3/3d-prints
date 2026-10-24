"""Render the supplied ornament with an empty name area for the storefront preview.
Run with bundled Python to prepare the mesh; run with Blender to render it.
"""
from pathlib import Path
import sys,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from model_library import model_source
ROOT=Path(__file__).resolve().parent.parent
WORK=ROOT/'tmp/name-ornament-preview'
WORK.mkdir(parents=True,exist_ok=True)
if '--render' not in sys.argv:
 sys.path.insert(0,str(model_source('models/julgranskula/work/deps')))
 import manifold3d as mf
 for name,source in [('name','models/emma-meshy-ogla-v1/Emma-med-ogla.npz'),('christmas','models/var-forsta-jul-meshy-v1/Var-forsta-jul-korrigerad.npz')]:
  d=np.load(model_source(source))
  m=mf.Manifold(mf.Mesh64(np.array(d['vertices'],dtype=np.float64,copy=True,order='C'),np.array(d['faces'],dtype=np.uint64,copy=True,order='C')))
  circle=mf.Manifold.cylinder(10,19.95,19.95,160).rotate((90,0,0)).translate((0,5,22.1))
  if name=='name':
   slab=mf.Manifold.cube((50,10,18.3)).translate((-25,-5,16.7))
   protect=mf.Manifold.cube((12,10,18)).translate((-6,-5,0));cut=(circle^slab)-protect
  else:
   pts=[(-25,19.5),(3,19.5),(3,14),(25,14),(25,35.5),(-25,35.5)]
   slab=mf.CrossSection([np.array(pts)]).extrude(10).rotate((90,0,0)).translate((0,5,0));cut=circle^slab
  blank=m-cut
  q=blank.to_mesh64();np.savez_compressed(WORK/(name+'-base.npz'),vertices=q.vert_properties[:,:3],faces=q.tri_verts)
else:
 import bpy
 bpy.ops.wm.open_mainfile(filepath=str(model_source('models/emma-meshy-ogla-v1/inspection.blend')))
 o=bpy.data.objects['Original från användarens STL'];mat=o.data.materials[0];bpy.data.objects.remove(o,do_unlink=True)
 scene=bpy.context.scene;scene.cycles.samples=24;scene.render.resolution_x=1100;scene.render.resolution_y=1200
 for name in ('name','christmas'):
  d=np.load(WORK/(name+'-base.npz'));me=bpy.data.meshes.new('Blank ornament');me.from_pydata(d['vertices'].tolist(),[],d['faces'].tolist());me.materials.append(mat);o=bpy.data.objects.new('Blank ornament',me);bpy.context.scene.collection.objects.link(o)
  scene.render.filepath=str(WORK/(name+'-base.png'));bpy.ops.render.render(write_still=True);bpy.data.objects.remove(o,do_unlink=True)
