import bpy,bmesh,numpy as np,json,zipfile,xml.etree.ElementTree as ET,struct
from pathlib import Path
from mathutils.bvhtree import BVHTree
from mathutils import Vector
root=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Documents\Formlabb\3D-modeller')
work=root/'Modeller/julkula-veckad-rod';out=root/'Leveranser/Julkula-veckad-rod';out.mkdir(parents=True,exist_ok=True)
src=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Desktop\modeller m3f\Julkula - veckad (röd).3mf')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
d=np.load(work/'arbetsgeometri.npz');v=d['vertices'];f=d['faces']
m=bpy.data.meshes.new('Original');m.from_pydata(v.tolist(),[],f.tolist());m.update()
obj=bpy.data.objects.new('Julkula veckad – reparerad',m);bpy.context.collection.objects.link(obj);bpy.context.view_layer.objects.active=obj;obj.select_set(True)
print('Original mesh ready',flush=True)
tree=BVHTree.FromPolygons(v.tolist(),f.tolist(),all_triangles=True)
colors=np.zeros(len(f),dtype=np.uint8);i=0
with zipfile.ZipFile(src)as z:
 for _,e in ET.iterparse(z.open('3D/Objects/object_1.model'),events=('end',)):
  if e.tag.endswith('triangle'):
   s=e.get('paint_color','4');colors[i]=1 if s.count('8')>s.count('4')else 0;i+=1;e.clear()
rem=obj.modifiers.new('Reparera sammanhängande yta 0.12 mm','REMESH');rem.mode='VOXEL';rem.voxel_size=.12;rem.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=rem.name)
print('Voxel repair',len(obj.data.vertices),len(obj.data.polygons),flush=True)
dec=obj.modifiers.new('Bevara formen med färre trianglar','DECIMATE');dec.ratio=.06
bpy.ops.object.modifier_apply(modifier=dec.name)
print('Simplified',len(obj.data.polygons),flush=True)
tri=obj.modifiers.new('Triangulera','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
for name,col in [('Julkuleröd',(.48,.008,.018,1)),('Guld',(.8,.55,.12,1))]:
 mat=bpy.data.materials.new(name);mat.diffuse_color=col;obj.data.materials.append(mat)
for p in obj.data.polygons:
 hit=tree.find_nearest(p.center)
 if hit and hit[2]is not None:p.material_index=int(colors[hit[2]])
print('Colors transferred',flush=True)
bm=bmesh.new();bm.from_mesh(obj.data);bad=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True);bm.free()
bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=.001
for a in bpy.context.screen.areas:
 if a.type=='VIEW_3D':
  a.spaces.active.region_3d.view_distance=160;a.spaces.active.region_3d.view_location=Vector((41,-41,50));a.spaces.active.shading.color_type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(work/'Julkula-veckad-rod.blend'))
mesh=obj.data
core='http://schemas.microsoft.com/3dmanufacturing/core/2015/02';material='http://schemas.microsoft.com/3dmanufacturing/material/2015/02'
ET.register_namespace('',core);ET.register_namespace('m',material)
model=ET.Element('{'+core+'}model',{'unit':'millimeter','{http://www.w3.org/XML/1998/namespace}lang':'sv-SE'})
r=ET.SubElement(model,'{'+core+'}resources');cg=ET.SubElement(r,'{'+material+'}colorgroup',{'id':'1'})
for c in ['#B00018FF','#D9A735FF']:ET.SubElement(cg,'{'+material+'}color',{'color':c})
o=ET.SubElement(r,'{'+core+'}object',{'id':'2','type':'model','name':'Julkula veckad röd reparerad'});me=ET.SubElement(o,'{'+core+'}mesh');vs=ET.SubElement(me,'{'+core+'}vertices')
for vert in mesh.vertices:ET.SubElement(vs,'{'+core+'}vertex',dict(zip(['x','y','z'],[f'{x:.6f}'for x in vert.co])))
ts=ET.SubElement(me,'{'+core+'}triangles')
for p in mesh.polygons:ET.SubElement(ts,'{'+core+'}triangle',{'v1':str(p.vertices[0]),'v2':str(p.vertices[1]),'v3':str(p.vertices[2]),'pid':'1','p1':str(p.material_index)})
build=ET.SubElement(model,'{'+core+'}build');ET.SubElement(build,'{'+core+'}item',{'objectid':'2'})
with zipfile.ZipFile(out/'Julkula-veckad-rod-reparerad.3mf','w',zipfile.ZIP_DEFLATED)as z:
 z.writestr('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')
 z.writestr('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')
 z.writestr('3D/3dmodel.model',ET.tostring(model,encoding='utf-8',xml_declaration=True))
with open(out/'Julkula-veckad-rod-reparerad.stl','wb')as fp:
 fp.write(b'Formlabb repaired pleated bauble'.ljust(80,b'\0'));fp.write(struct.pack('<I',len(mesh.polygons)))
 for p in mesh.polygons:fp.write(struct.pack('<12fH',*p.normal,*mesh.vertices[p.vertices[0]].co,*mesh.vertices[p.vertices[1]].co,*mesh.vertices[p.vertices[2]].co,0))
report={'nonmanifold_edges':bad,'volume_mm3':volume,'vertices':len(mesh.vertices),'triangles':len(mesh.polygons),'voxel_mm':.12,'note':'Repaired copy. Surface colors projected from original; printer settings must be selected and sliced in Bambu Studio.'}
(out/'kontroll.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report),flush=True)
scene=bpy.context.scene
scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL';scene.display.shading.show_cavity=True
scene.render.resolution_x=1000;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.film_transparent=True
camdata=bpy.data.cameras.new('Kontrollkamera');cam=bpy.data.objects.new('Kontrollkamera',camdata);bpy.context.collection.objects.link(cam);cam.location=(145,-210,115)
cam.rotation_euler=(Vector((41,-41,49))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=120;scene.camera=cam
scene.render.filepath=str(out/'Julkula-veckad-rod-kontroll.png');bpy.ops.render.render(write_still=True)
