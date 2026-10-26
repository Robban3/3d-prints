import bpy,bmesh,json
from pathlib import Path
root=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Documents\Formlabb\3D-modeller')
bpy.ops.wm.open_mainfile(filepath=str(root/'Modeller/julgranskulor-tvadelade-100mm/Julgranskulor-100mm-tva-delar.blend'))
path=root/'Leveranser/Julgranskulor-tvadelade-100mm/kontroll.json';report=json.loads(path.read_text(encoding='utf8'))
for name in ['Julkula-veckad-rod','Julkula-vavd-gron']:
 copies=[]
 for suffix in [' kula',' guldtop med ogla och limtapp']:
  original=bpy.data.objects[name+suffix];o=original.copy();o.data=original.data.copy();bpy.context.collection.objects.link(o);o.location=(0,0,0);copies.append(o)
 body,top=copies;bpy.context.view_layer.objects.active=top;mod=top.modifiers.new('Geometrisk kollisionskontroll','BOOLEAN');mod.operation='INTERSECT';mod.solver='EXACT';mod.object=body;bpy.ops.object.modifier_apply(modifier=mod.name)
 bm=bmesh.new();bm.from_mesh(top.data);vol=abs(bm.calc_volume());bm.free();assert vol<.05,(name,vol)
 report[name]['assembled_intersection_volume_mm3']=vol
 print(name,'overlap mm3',vol,flush=True)
 for o in copies:bpy.data.objects.remove(o,do_unlink=True)
path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
