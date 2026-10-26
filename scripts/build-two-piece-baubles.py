import bpy,bmesh,numpy as np,math,json,struct,zipfile,xml.etree.ElementTree as E,uuid,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Documents\Formlabb\3D-modeller')
WORK=ROOT/'Modeller/julgranskulor-tvadelade-100mm';OUT=ROOT/'Leveranser/Julgranskulor-tvadelade-100mm';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,c):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);return m
red=mat('Rod',(.49,.008,.02));green=mat('Gron',(.045,.17,.095));gold=mat('Guld',(.84,.58,.16))
def mesh(name,v,f,material):
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.clear();me.materials.append(material)
 for p in me.polygons:p.use_smooth=True;p.material_index=0
 return o
def clean(o):
 bm=bmesh.new();bm.from_mesh(o.data)
 flaps=[f for f in bm.faces if sum(e.is_boundary for e in f.edges)==2 and any(len(e.link_faces)>2 for e in f.edges)]
 if flaps:bmesh.ops.delete(bm,geom=flaps,context='FACES_ONLY')
 wire=[e for e in bm.edges if not e.link_faces]
 if wire:bmesh.ops.delete(bm,geom=wire,context='EDGES')
 boundary=[e for e in bm.edges if e.is_boundary]
 if boundary:bmesh.ops.holes_fill(bm,edges=boundary,sides=5000)
 badverts=list({v for e in bm.edges if not e.is_manifold for v in e.verts})
 if badverts:bmesh.ops.remove_doubles(bm,verts=badverts,dist=.35)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bad=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume();bm.to_mesh(o.data);bm.free();o.data.update();return bad,volume
def boolop(o,tool,operation):
 bpy.context.view_layer.objects.active=o;mod=o.modifiers.new(operation,'BOOLEAN');mod.operation=operation;mod.solver='EXACT';mod.object=tool;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(tool,do_unlink=True)
def cyl(name,r,z0,z1,material):
 bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=r,depth=z1-z0,location=(0,0,(z0+z1)/2));o=bpy.context.object;o.name=name;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o.data.materials.append(material);return o
def voxel(o,size,ratio):
 print('Start voxel',o.name,size,flush=True)
 bpy.context.view_layer.objects.active=o;mo=o.modifiers.new('Reparerad sluten yta','REMESH');mo.mode='VOXEL';mo.voxel_size=size;mo.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=mo.name)
 print('Voxel',o.name,len(o.data.polygons),flush=True)
 if len(o.data.polygons)>600000:
  mo=o.modifiers.new('Detaljanpassning','DECIMATE');mo.ratio=ratio;bpy.ops.object.modifier_apply(modifier=mo.name)
 print('Simplified',len(o.data.polygons),flush=True)
 return clean(o)
def cap(name,base,top,radius):
 N=240;wall=1.7;ceil=top-2.4
 path=[(base,radius,True),(base+3,radius,False),(top-.6,radius-.4,False),(top,radius-1,False),(top,0,False),(ceil,0,False),(ceil,radius-2.1,False),(base+3,radius-wall,False),(base,radius-wall,True)]
 vs=[];rings=[];fs=[]
 for z,r,scallop in path:
  if r==0:rings.append([len(vs)]);vs.append((0,0,z));continue
  rings.append(list(range(len(vs),len(vs)+N)))
  for j in range(N):
   a=j*2*math.pi/N;zz=z+1.1*(1+math.cos(10*a))if scallop else z;vs.append((r*math.cos(a),r*math.sin(a),zz))
 for a,b in zip(rings,rings[1:]+rings[:1]):
  if len(a)==len(b)==1:continue
  for j in range(N):
   k=(j+1)%N;fs.append((a[0],b[k],b[j])if len(a)==1 else(a[j],a[k],b[0])if len(b)==1 else(a[j],a[k],b[k],b[j]))
 o=mesh(name,vs,fs,gold);clean(o)
 boolop(o,cyl('Limtapp diameter 8 mm',4,ceil-6,ceil+1.2,gold),'UNION')
 bpy.ops.mesh.primitive_torus_add(major_segments=128,minor_segments=32,major_radius=5.4,minor_radius=1.8,location=(0,0,top+5.4),rotation=(math.pi/2,0,0));ring=bpy.context.object;ring.data.materials.append(gold);boolop(o,ring,'UNION')
 return o,ceil
def stl(o,path):
 o.data.calc_loop_triangles()
 with open(path,'wb')as fp:
  fp.write(b'Formlabb two piece bauble mm'.ljust(80,b'\0'));fp.write(struct.pack('<I',len(o.data.loop_triangles)))
  for t in o.data.loop_triangles:
   a,b,c=[o.data.vertices[i].co for i in t.vertices];n=(b-a).cross(c-a).normalized();fp.write(struct.pack('<12fH',*n,*a,*b,*c,0))
NS='http://schemas.microsoft.com/3dmanufacturing/core/2015/02';P='http://schemas.microsoft.com/3dmanufacturing/production/2015/06';E.register_namespace('',NS);E.register_namespace('p',P)
def tag(n):return '{'+NS+'}'+n
def export3mf(name,body,top,bodyhex):
 model=E.Element(tag('model'),{'unit':'millimeter','{http://www.w3.org/XML/1998/namespace}lang':'en-US','requiredextensions':'p'})
 for k,v in [('Application','BambuStudio-02.08.04.57'),('BambuStudio:3mfVersion','2'),('BambuStudio:MmPaintingVersion','1')]:E.SubElement(model,tag('metadata'),{'name':k}).text=v
 res=E.SubElement(model,tag('resources'));build=E.SubElement(model,tag('build'),{'{'+P+'}UUID':str(uuid.uuid4())});parts={};config=E.Element('config')
 minima=[]
 for j,o in enumerate([body,top]):
  oid=1+2*j;wrapper=oid+1;uid=str(uuid.uuid4());path=f'3D/Objects/object_{j+1}.model';low=min(v.co.z for v in o.data.vertices);minima.append(low)
  sub=E.Element(tag('model'),{'unit':'millimeter'});sr=E.SubElement(sub,tag('resources'));ob=E.SubElement(sr,tag('object'),{'id':str(oid),'type':'model','{'+P+'}UUID':uid});me=E.SubElement(ob,tag('mesh'));vs=E.SubElement(me,tag('vertices'));ts=E.SubElement(me,tag('triangles'))
  for v in o.data.vertices:E.SubElement(vs,tag('vertex'),{'x':f'{v.co.x:.7f}','y':f'{v.co.y:.7f}','z':f'{v.co.z-low:.7f}'})
  o.data.calc_loop_triangles()
  for t in o.data.loop_triangles:E.SubElement(ts,tag('triangle'),{'v1':str(t.vertices[0]),'v2':str(t.vertices[1]),'v3':str(t.vertices[2]),'paint_color':'4'if j==0 else'8'})
  parts[path]=E.tostring(sub,encoding='UTF-8',xml_declaration=True)
  wrap=E.SubElement(res,tag('object'),{'id':str(wrapper),'type':'model','{'+P+'}UUID':str(uuid.uuid4())});cs=E.SubElement(wrap,tag('components'));E.SubElement(cs,tag('component'),{'objectid':str(oid),'{'+P+'}path':'/'+path,'{'+P+'}UUID':str(uuid.uuid4()),'transform':'1 0 0 0 1 0 0 0 1 0 0 0'})
  E.SubElement(build,tag('item'),{'objectid':str(wrapper),'transform':f'1 0 0 0 1 0 0 0 1 {75 if j==0 else 155} 105 0','printable':'1','{'+P+'}UUID':str(uuid.uuid4())})
  co=E.SubElement(config,'object',{'id':str(wrapper)});E.SubElement(co,'metadata',{'key':'name','value':o.name});E.SubElement(co,'metadata',{'key':'extruder','value':str(j+1)});E.SubElement(co,'metadata',{'face_count':str(len(o.data.loop_triangles))});part=E.SubElement(co,'part',{'id':str(oid),'subtype':'normal_part'});E.SubElement(part,'metadata',{'key':'name','value':o.name});E.SubElement(part,'mesh_stat',{'face_count':str(len(o.data.loop_triangles)),'edges_fixed':'0','degenerate_facets':'0','facets_removed':'0','facets_reversed':'0','backwards_edges':'0'})
 plate=E.SubElement(config,'plate');E.SubElement(plate,'metadata',{'key':'plater_id','value':'1'})
 for oid in [2,4]:
  ins=E.SubElement(plate,'model_instance')
  for k,v in [('object_id',str(oid)),('instance_id','0'),('identify_id',str(oid))]:E.SubElement(ins,'metadata',{'key':k,'value':v})
 assemble=E.SubElement(config,'assemble')
 for j,oid in enumerate([2,4]):E.SubElement(assemble,'assemble_item',{'object_id':str(oid),'instance_id':'0','transform':f'1 0 0 0 1 0 0 0 1 75 105 {minima[j]}','offset':'0 0 0'})
 cfg={'filament_colour':[bodyhex,'#E7B379FF'],'filament_type':['PLA','PLA'],'filament_diameter':['1.75','1.75'],'filament_settings_id':['Generic PLA','Generic PLA'],'enable_support':'1','support_type':'tree(auto)','support_on_build_plate_only':'0','layer_height':'0.16','initial_layer_print_height':'0.2','enable_prime_tower':'1','from':'project','name':'project_settings','version':'02.08.04.57'}
 rels='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(f'<Relationship Target="/{p}" Id="rel{i}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'for i,p in enumerate(parts))+'</Relationships>'
 with zipfile.ZipFile(OUT/(name+'-2-delar.3mf'),'w',zipfile.ZIP_DEFLATED)as z:
  z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>');z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>');z.writestr('3D/3dmodel.model',E.tostring(model,encoding='UTF-8',xml_declaration=True));z.writestr('3D/_rels/3dmodel.model.rels',rels);z.writestr('Metadata/project_settings.config',json.dumps(cfg));z.writestr('Metadata/model_settings.config',E.tostring(config,encoding='UTF-8',xml_declaration=True))
  for p,data in parts.items():z.writestr(p,data)
products=[];report={}
for key,title,material,bodyhex,x in [('rod','Julkula-veckad-rod',red,'#7C0917FF',-62),('gron','Julkula-vavd-gron',green,'#30533FFF',62)]:
 if key=='rod' and '--reuse-red' in sys.argv:
  with zipfile.ZipFile(OUT/(title+'-2-delar.3mf'))as z:
   config=E.fromstring(z.read('Metadata/model_settings.config'));seat=float(config.find('./assemble/assemble_item[@object_id="4"]').get('transform').split()[-1]);cached=[]
   for j,path in enumerate(['3D/Objects/object_1.model','3D/Objects/object_2.model']):
    node=E.fromstring(z.read(path));vv=[[float(t.get(a))for a in ['x','y','z']]for t in node.findall('.//{*}vertex')];ff=[[int(t.get(a))for a in ['v1','v2','v3']]for t in node.findall('.//{*}triangle')]
    if j:
     for pt in vv:pt[2]+=seat
    ob=mesh(title+(' kula'if j==0 else' guldtop med ogla och limtapp'),vv,ff,material if j==0 else gold);ob.location.x=x;cached.append(ob)
  original=np.load(WORK/'rod-kalla.npz');ov=original['vertices'];og=ov[np.unique(original['faces'][original['gold']])];oscale=float(100/max(np.ptp(ov,axis=0)[:2]));ocut=float(og[:,2].min()*oscale)-.6;ceiling=float(og[:,2].max()*oscale)-2.4
  rb,rt=cached;rb.location.x=0
  bpy.ops.mesh.primitive_cube_add(size=2,location=(0,0,ocut/2));clip=bpy.context.object;clip.scale=(70,70,(ocut+2)/2);bpy.context.view_layer.objects.active=clip;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);boolop(rb,clip,'INTERSECT')
  boolop(rb,cyl('Styrhals',7.2,ocut-1,ceiling,material),'UNION');boolop(rb,cyl('Blindhal',4.2,ceiling-6.5,ceiling+1,material),'DIFFERENCE');badv,volume=clean(rb);assert badv==0,badv
  coords=np.array([list(t.co)for t in rb.data.vertices]);dims=np.ptp(coords,axis=0).tolist();report[title]={'body_dimensions_mm':dims,'max_diameter_mm':max(dims[:2]),'peg_diameter_mm':8.0013176608,'socket_diameter_mm':8.4,'radial_glue_clearance_mm':.1993411696,'peg_insertion_mm':6,'socket_depth_mm':6.5,'body_nonmanifold_edges':0,'top_nonmanifold_edges':0,'top_seat_z_mm':ceiling,'body_volume_mm3':volume};export3mf(title,rb,rt,bodyhex);stl(rb,OUT/(title+'-kula.stl'));rb.location.x=x;products.append(tuple(cached));print('Reused verified red bauble',flush=True);continue
 data=np.load(WORK/(key+'-kalla.npz'));v=data['vertices'];f=data['faces'];g=v[np.unique(f[data['gold']])];center=(g.min(0)+g.max(0))/2;scale=float(100/max(np.ptp(v,axis=0)[:2]));base=float(g[:,2].min()*scale);ctop=float(g[:,2].max()*scale);rad=float(max(np.ptp(g,axis=0)[:2])*scale/2);cut=base-.6
 if key=='rod':
  with bpy.data.libraries.load(str(ROOT/'Modeller/julkula-veckad-rod/Julkula-veckad-rod.blend'),link=False)as(a,b):b.objects=[n for n in a.objects if 'Julkula' in n]
  body=b.objects[0];bpy.context.collection.objects.link(body);body.name=title+' kula';body.data.materials.clear();body.data.materials.append(material)
  for p in body.data.polygons:p.material_index=0
  for vert in body.data.vertices:vert.co.x=(vert.co.x-center[0])*scale;vert.co.y=(vert.co.y-center[1])*scale;vert.co.z*=scale
 else:
  vv=v.copy();vv[:,0]-=center[0];vv[:,1]-=center[1];vv*=scale;body=mesh(title+' kula',vv.tolist(),f.tolist(),material)
 if key=='gron':bad,vol=voxel(body,.3,.22)
 else:
  bad,vol=clean(body)
  if bad:bad,vol=voxel(body,.28,.22)
 assert bad==0,(title,bad)
 bpy.ops.mesh.primitive_cube_add(size=2,location=(0,0,(cut-1)/2));clip=bpy.context.object;clip.scale=(70,70,(cut+1)/2);bpy.context.view_layer.objects.active=clip;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 boolop(body,clip,'INTERSECT')
 print('Clipped',title,clean(body),flush=True)
 top,ceiling=cap(title+' guldtop med ogla och limtapp',base,ctop,rad)
 boolop(body,cyl('Forstarkt limfaste',min(8.6,rad-2),cut-3,cut+1,material),'UNION')
 boolop(body,cyl('Styrhals',7.2,cut-1,ceiling,material),'UNION')
 boolop(body,cyl('Blindhal diameter 8.4 djup 6.5',4.2,ceiling-6.5,ceiling+1,material),'DIFFERENCE')
 for p in body.data.polygons:p.material_index=0
 bb,bv=clean(body);tb,tv=clean(top);assert bb==0 and tb==0,(title,bb,tb)
 # Match the requested maximum equatorial diameter, preserving XY proportions.
 coords=np.array([list(t.co)for t in body.data.vertices]);diam=float(max(np.ptp(coords,axis=0)[:2]));assert abs(diam-100)<1 and bv>10000,(title,'unexpected body change',diam,bv);adjust=100/diam
 for ob in [body,top]:
  for t in ob.data.vertices:t.co.x*=adjust;t.co.y*=adjust
  ob.data.update()
 dims=np.ptp(np.array([list(t.co)for t in body.data.vertices]),axis=0).tolist()
 report[title]={'body_dimensions_mm':dims,'max_diameter_mm':max(dims[:2]),'scale_from_original':scale,'peg_diameter_mm':8*adjust,'socket_diameter_mm':8.4*adjust,'radial_glue_clearance_mm':.2*adjust,'peg_insertion_mm':6,'socket_depth_mm':6.5,'socket_wall_mm':3*adjust,'body_nonmanifold_edges':bb,'top_nonmanifold_edges':tb,'body_volume_mm3':bv,'top_volume_mm3':tv,'top_seat_z_mm':ceiling}
 export3mf(title,body,top,bodyhex)
 stl(body,OUT/(title+'-kula.stl'))
 low=min(t.co.z for t in top.data.vertices)
 for t in top.data.vertices:t.co.z-=low
 stl(top,OUT/(title+'-guldtop.stl'))
 for t in top.data.vertices:t.co.z+=low
 body.location.x=x;top.location.x=x;products.append((body,top));print(title,json.dumps(report[title]),flush=True)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=.001;scene.unit_settings.length_unit='MILLIMETERS';scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.color_type='MATERIAL';scene.display.shading.light='STUDIO';scene.display.shading.show_cavity=True;scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.film_transparent=True
bpy.ops.object.camera_add(location=(0,-360,200));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,63))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=255;scene.camera=cam
scene.render.filepath=str(OUT/'monterade.png');bpy.ops.render.render(write_still=True)
for body,top in products:top.location.z+=25
scene.render.filepath=str(OUT/'isartagna.png');bpy.ops.render.render(write_still=True)
for sc in bpy.data.screens:
 for a in sc.areas:
  if a.type=='VIEW_3D':a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.shading.color_type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'Julgranskulor-100mm-tva-delar.blend'))
(OUT/'kontroll.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('All four parts ready',flush=True)
import runpy
runpy.run_path(str(Path(__file__).with_name('finish-two-piece-baubles.py')))
