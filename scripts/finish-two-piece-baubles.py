from pathlib import Path
import bpy,numpy as np,json
code=Path(__file__).with_name('build-two-piece-baubles.py').read_text(encoding='utf8')
exec(code[:code.index('products=[];report={}')])
bpy.ops.wm.open_mainfile(filepath=str(WORK/'Julgranskulor-100mm-tva-delar.blend'))
red=bpy.data.materials['Rod'];green=bpy.data.materials['Gron'];gold=bpy.data.materials['Guld']
report=json.loads((OUT/'kontroll.json').read_text(encoding='utf8'));products=[]
for key,title,material,bodyhex in [('rod','Julkula-veckad-rod',red,'#7C0917FF'),('gron','Julkula-vavd-gron',green,'#30533FFF')]:
 d=np.load(WORK/(key+'-kalla.npz'));v=d['vertices'];g=v[np.unique(d['faces'][d['gold']])];s=float(100/max(np.ptp(v,axis=0)[:2]));base=float(g[:,2].min()*s);ceiling=float(g[:,2].max()*s)-2.4;seat=base+4;cut=base-.6
 body=bpy.data.objects[title+' kula'];top=bpy.data.objects[title+' guldtop med ogla och limtapp'];bx=body.location.x;tx=top.location.x;body.location=(0,0,0);top.location=(0,0,0)
 bpy.ops.mesh.primitive_cube_add(size=2,location=(0,0,cut/2));clip=bpy.context.object;clip.scale=(70,70,(cut+2)/2);bpy.context.view_layer.objects.active=clip;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);boolop(body,clip,'INTERSECT')
 boolop(body,cyl('Forstarkt limhals',7.2,seat-13,seat,material),'UNION');boolop(body,cyl('Blint limhal',4.2,seat-10.5,seat+1,material),'DIFFERENCE')
 boolop(top,cyl('Synlig limtapp',4,base-6,ceiling+1,gold),'UNION');boolop(top,cyl('Invandig stoppkant',7.5,seat,seat+1.5,gold),'UNION')
 bb,bv=clean(body);tb,tv=clean(top);assert bb==tb==0,(title,bb,tb)
 for ob in [body,top]:
  for p in ob.data.polygons:p.material_index=0
 dims=np.ptp(np.array([list(t.co)for t in body.data.vertices]),axis=0).tolist();assert abs(max(dims[:2])-100)<.001
 report[title].update({'body_dimensions_mm':dims,'body_volume_mm3':bv,'top_volume_mm3':tv,'socket_diameter_mm':8.4,'radial_glue_clearance_mm':(8.4-report[title]['peg_diameter_mm'])/2,'peg_insertion_mm':10,'socket_depth_mm':10.5,'peg_projection_below_skirt_mm':6,'top_seat_z_mm':seat,'socket_wall_mm':3.0,'top_stop_flange_diameter_mm':15,'body_nonmanifold_edges':bb,'top_nonmanifold_edges':tb})
 export3mf(title,body,top,bodyhex);stl(body,OUT/(title+'-kula.stl'));low=min(t.co.z for t in top.data.vertices)
 for t in top.data.vertices:t.co.z-=low
 stl(top,OUT/(title+'-guldtop.stl'))
 for t in top.data.vertices:t.co.z+=low
 body.location.x=bx;top.location.x=tx;products.append((body,top));print(title,report[title],flush=True)
scene=bpy.context.scene;scene.render.film_transparent=True
scene.render.filepath=str(OUT/'monterade.png');bpy.ops.render.render(write_still=True)
for b,t in products:t.location.z=25
scene.render.filepath=str(OUT/'isartagna.png');bpy.ops.render.render(write_still=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'Julgranskulor-100mm-tva-delar.blend'))
(OUT/'kontroll.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
