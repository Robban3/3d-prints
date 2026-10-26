import bpy,bmesh,math,zipfile,json,struct,xml.etree.ElementTree as ET
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Documents\Formlabb\3D-modeller')
SRC=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Desktop\Star Bowling')
WORK=ROOT/'Modeller/starbowling-salt-peppar-kropp-100mm';OUT=ROOT/'Leveranser/StarBowling-kropp-100mm'
WORK.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
NS='http://schemas.microsoft.com/3dmanufacturing/core/2015/02';ET.register_namespace('',NS)
ET.register_namespace('p','http://schemas.microsoft.com/3dmanufacturing/production/2015/06')
S=100/157.75;F=S/.549534318
mats=[]
for name,c in [('Elfenben',(.88,.82,.7,1)),('Marinbla',(.015,.035,.09,1)),('Rod',(.7,.012,.008,1))]:
 m=bpy.data.materials.new(name);m.diffuse_color=c;mats.append(m)
def load(z,path):
 r=ET.fromstring(z.read(path));v=np.array([[float(t.get(k))for k in ['x','y','z']]for t in r.findall('.//{*}vertex')]);ts=r.findall('.//{*}triangle');f=[[int(t.get(k))for k in ['v1','v2','v3']]for t in ts]
 colors=[]
 for t in ts:
  p=t.get('paint_color','4');scores=[p.count('4'),p.count('8'),p.count('C')];colors.append(int(np.argmax(scores)))
 return v,f,colors
def mesh(name,v,f,colors=None):
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
 for m in mats:me.materials.append(m)
 for p in me.polygons:p.material_index=colors[p.index]if colors is not None else 0;p.use_smooth=True
 return o
def boolean(o,tool,operation):
 bpy.context.view_layer.objects.active=o;mod=o.modifiers.new(operation,'BOOLEAN');mod.operation=operation;mod.solver='EXACT';mod.object=tool;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(tool,do_unlink=True)
def topology(o):
 bm=bmesh.new();bm.from_mesh(o.data);bad=sum(not e.is_manifold for e in bm.edges);vol=bm.calc_volume();bm.free();return {'nonmanifold_edges':bad,'volume_mm3':vol}
font=bpy.data.fonts.load('C:/Windows/Fonts/arialbd.ttf')
reports={};products=[]
for title,source,base,ink,label,holes,x in [('Salt','Saltkar',0,1,'SALT',3,-34),('Peppar','Pepparkar',1,0,'PEPPAR',4,34)]:
 with zipfile.ZipFile(SRC/(source+'_100mm med lock.3mf'))as z:
  raw,faces,colors=load(z,'3D/Objects/object_1.model');cv,cf,cc=load(z,'3D/Objects/object_2.model')
 v=np.column_stack([raw[:,0]*S,raw[:,2]*S,(-raw[:,1]+78.875)*S]);r=np.linalg.norm(v[:,:2],axis=1)
 # Measure the unlettered back of the supplied model, preserving its silhouette.
 bins={}
 for pt,rr in zip(v,r):
  if pt[1]>0 and pt[2]<63:
   key=round(float(pt[2]),3);bins[key]=max(bins.get(key,0),float(rr))
 zz=np.array(sorted(bins));rr=np.array([bins[k]for k in zz]);rr*=23.77/rr.max()
 def radius(z):return float(np.interp(z,zz,rr))
 upper=mesh(title+' kropp',v.tolist(),faces,colors)
 bpy.ops.mesh.primitive_cube_add(size=2,location=(0,0,81));cut=bpy.context.object;cut.scale=(50,50,23)
 bpy.context.view_layer.objects.active=cut;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 boolean(upper,cut,'INTERSECT')
 N=192;path=[(0,0)]+[(float(z),radius(z))for z in np.arange(0,60.001,.25)]+[(60,radius(60)-2.55)]+[(float(z),radius(z)-2.55)for z in np.arange(59.75,2.99,-.25)]+[(3,0)]
 verts=[];rings=[];ff=[]
 for z,rad in path:
  if rad==0:rings.append([len(verts)]);verts.append((0,0,z));continue
  rings.append(list(range(len(verts),len(verts)+N)));verts.extend([(rad*math.cos(2*math.pi*j/N),rad*math.sin(2*math.pi*j/N),z)for j in range(N)])
 for a,b in zip(rings,rings[1:]+rings[:1]):
  if len(a)==len(b)==1:continue
  for j in range(N):
   k=(j+1)%N
   ff.append((a[0],b[k],b[j])if len(a)==1 else (a[j],a[k],b[0])if len(b)==1 else(a[j],a[k],b[k],b[j]))
 lower=mesh('Ren textyta',verts,ff,[base]*len(ff));bm=bmesh.new();bm.from_mesh(lower.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(lower.data);bm.free()
 boolean(upper,lower,'UNION')
 for p in upper.data.polygons:
  p.material_index=(2 if title=='Salt'else 0)if(73<=p.center.z<=78.5 or 84<=p.center.z<=89.2)else base
 text_objects=[];row_reports=[]
 for string,size,zbase,gap in [('STAR BOWLING',6.4,45,1.0),(label,7.0,39,1.2)]:
  glyphs=[];widths=[]
  for ch in string:
   if ch==' ':glyphs.append(None);widths.append(2.4);continue
   cu=bpy.data.curves.new(ch,'FONT');cu.body=ch;cu.font=font;cu.size=size;cu.extrude=.4;cu.bevel_depth=.025;cu.bevel_resolution=1;cu.resolution_u=8
   o=bpy.data.objects.new(title+' '+ch,cu);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);upper.select_set(False);bpy.ops.object.convert(target='MESH');o.select_set(False)
   for m in mats:o.data.materials.append(m)
   for p in o.data.polygons:p.material_index=ink
   coords=np.array([list(t.co)for t in o.data.vertices]);width=float(coords[:,0].max()-coords[:,0].min());xmin=float(coords[:,0].min())
   for t in o.data.vertices:t.co.x-=xmin
   glyphs.append(o);widths.append(width)
  total=sum(widths)+gap*(len(string)-1);cursor=-total/2
  for o,w in zip(glyphs,widths):
   if o:
    for t in o.data.vertices:
     arc=cursor+t.co.x;angle=arc/radius(zbase+2);height=zbase+t.co.y+(2*math.cos(angle)if string=='STAR BOWLING'else 0);rad=radius(height)+.2+t.co.z
     t.co=(rad*math.sin(angle),-rad*math.cos(angle),height)
    text_objects.append(o)
   cursor+=w+gap
  row_reports.append({'text':string,'glyph_gap_mm':gap,'font_size_mm':size,'arc_width_mm':total,'relief_mm':.6,'embed_mm':.2})
 bpy.ops.object.select_all(action='DESELECT')
 for o in text_objects:o.select_set(True)
 bpy.context.view_layer.objects.active=text_objects[0];bpy.ops.object.join();lettering=bpy.context.object
 boolean(upper,lettering,'UNION')
 capv=cv*F;capv[:,2]-=capv[:,2].min();cap=mesh(title+' lock',capv.tolist(),cf,[base]*len(cf))
 bottom_seat=(88.91032791138-11.0896721)*F
 rep={'body_dimensions_mm':[47.54,47.54,100],'scale_from_supplied_body':F,'cap_dimensions_mm':(capv.max(0)-capv.min(0)).tolist(),'assembled_height_mm':bottom_seat+float(capv[:,2].max()),'cap_seat_mm':bottom_seat,'holes':holes,'text':row_reports,'body':topology(upper),'cap':topology(cap)}
 assert rep['body']['nonmanifold_edges']==0,rep
 assert rep['cap']['nonmanifold_edges']==0,rep
 # Export the exact new meshes into the supplied Bambu package, retaining filament slots.
 def object_xml(o,oid):
  o.data.calc_loop_triangles();model=ET.Element('{'+NS+'}model',{'unit':'millimeter','xmlns:p':'http://schemas.microsoft.com/3dmanufacturing/production/2015/06','requiredextensions':'p'});res=ET.SubElement(model,'{'+NS+'}resources');obj=ET.SubElement(res,'{'+NS+'}object',{'id':str(oid),'type':'model'});me=ET.SubElement(obj,'{'+NS+'}mesh');vs=ET.SubElement(me,'{'+NS+'}vertices');ts=ET.SubElement(me,'{'+NS+'}triangles')
  for vtx in o.data.vertices:ET.SubElement(vs,'{'+NS+'}vertex',dict(zip(['x','y','z'],[f'{a:.7f}'for a in vtx.co])))
  for t in o.data.loop_triangles:
   idx=o.data.polygons[t.polygon_index].material_index;paint=['4','8','0C'][idx]
   ET.SubElement(ts,'{'+NS+'}triangle',{'v1':str(t.vertices[0]),'v2':str(t.vertices[1]),'v3':str(t.vertices[2]),'paint_color':paint})
  return ET.tostring(model,encoding='utf8',xml_declaration=True),len(o.data.loop_triangles)
 bx,bc=object_xml(upper,3);cx,ct=object_xml(cap,1)
 with zipfile.ZipFile(SRC/(source+'_100mm med lock.3mf'))as orig,zipfile.ZipFile(OUT/(source+'_kropp-100mm_med-lock.3mf'),'w',zipfile.ZIP_DEFLATED)as dest:
  for name in orig.namelist():
   if name.startswith('Metadata/')and(name.endswith('.png')or'.gcode'in name or name.endswith('.md5')):continue
   data=orig.read(name)
   if name=='3D/Objects/object_1.model':data=bx
   elif name=='3D/Objects/object_2.model':data=cx
   elif name=='3D/3dmodel.model':
    node=ET.fromstring(data)
    for item in node.findall('./{*}build/{*}item'):item.set('transform','1 0 0 0 1 0 0 0 1 '+('70 100 0'if item.get('objectid')=='4'else'125 100 0'))
    data=ET.tostring(node,encoding='utf8',xml_declaration=True)
   elif name=='Metadata/model_settings.config':
    node=ET.fromstring(data)
    for ob in node.findall('./object'):
     oid=ob.get('id');count=bc if oid=='4'else ct;partname=title+(' kropp 100 mm'if oid=='4'else' anpassat lock')
     for el in ob.iter():
      if 'face_count'in el.attrib:el.set('face_count',str(count))
      if el.get('key')=='name':el.set('value',partname)
    for el in node.findall('./assemble/assemble_item'):
     if 'volume_id'not in el.attrib:el.set('transform','1 0 0 0 1 0 0 0 1 70 100 '+('0'if el.get('object_id')=='4'else str(bottom_seat)))
    data=ET.tostring(node,encoding='utf8',xml_declaration=True)
   dest.writestr(name,data)
 for o,kind in [(upper,'kropp'),(cap,'lock')]:
  o.data.calc_loop_triangles()
  with open(OUT/(title+'-'+kind+'.stl'),'wb')as fp:
   fp.write(b'Star Bowling body 100 mm'.ljust(80,b'\0'));fp.write(struct.pack('<I',len(o.data.loop_triangles)))
   for t in o.data.loop_triangles:
    a,b,c=[o.data.vertices[j].co for j in t.vertices];n=(b-a).cross(c-a).normalized();fp.write(struct.pack('<12fH',*n,*a,*b,*c,0))
 cap.location.z=bottom_seat;upper.location.x=x;cap.location.x=x
 reports[title]=rep;products.append((upper,cap))
 print(title,json.dumps(rep),flush=True)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=.001;scene.unit_settings.length_unit='MILLIMETERS';scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.color_type='MATERIAL';scene.display.shading.light='STUDIO';scene.display.shading.show_cavity=True
scene.render.resolution_x=1500;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
bpy.ops.object.camera_add(location=(0,-310,160));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,57))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=155;scene.camera=cam
for sc in bpy.data.screens:
 for a in sc.areas:
  if a.type=='VIEW_3D':a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.shading.color_type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'StarBowling-kropp-100mm.blend'))
scene.render.filepath=str(OUT/'monterade-kropp-100mm.png');bpy.ops.render.render(write_still=True)
for b,c in products:c.location.z+=20;c.location.x+=20
scene.render.filepath=str(OUT/'kropp-och-lock.png');bpy.ops.render.render(write_still=True)
(OUT/'kontroll.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf8')
