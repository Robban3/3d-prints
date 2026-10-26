from pathlib import Path
import zipfile,xml.etree.ElementTree as E,json,numpy as np,shutil
ROOT=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Documents\Formlabb\3D-modeller\Leveranser')
OUT=ROOT/'Julgranskulor-tvadelade-100mm'
NS='http://schemas.microsoft.com/3dmanufacturing/core/2015/02';P='http://schemas.microsoft.com/3dmanufacturing/production/2015/06'
reports=json.loads((OUT/'kontroll.json').read_text(encoding='utf8'))
for name,r in reports.items():
 path=OUT/(name+'-2-delar.3mf')
 with zipfile.ZipFile(path)as z:config=json.loads(z.read('Metadata/project_settings.config'))
 if config.get('support_on_build_plate_only')!='0':
  config['support_on_build_plate_only']='0'
  with zipfile.ZipFile(path)as source,zipfile.ZipFile(path.with_suffix('.tmp'),'w',zipfile.ZIP_DEFLATED)as target:
   for entry in source.infolist():
    if entry.filename=='Metadata/project_settings.config':target.writestr(entry.filename,json.dumps(config))
    else:
     with source.open(entry)as a,target.open(entry.filename,'w')as b:shutil.copyfileobj(a,b,1024*1024)
  path.with_suffix('.tmp').replace(path)
 assert abs(r['max_diameter_mm']-100)<.001
 assert r['body_nonmanifold_edges']==r['top_nonmanifold_edges']==0
 assert .15<r['radial_glue_clearance_mm']<.3
 with zipfile.ZipFile(OUT/(name+'-2-delar.3mf'))as z:
  assert z.testzip()is None
  model=E.fromstring(z.read('3D/3dmodel.model'));wrappers={o.get('id'):o for o in model.findall('./{*}resources/{*}object')};items=model.findall('./{*}build/{*}item');assert len(items)==2
  results=[]
  for i,item in enumerate(items):
   component=wrappers[item.get('objectid')].find('./{*}components/{*}component');path=component.get('{'+P+'}path').lstrip('/');part=E.fromstring(z.read(path));obj=part.find('./{*}resources/{*}object');assert obj.get('id')==component.get('objectid')and obj.get('{'+P+'}UUID')
   verts=obj.findall('.//{*}vertex');tris=obj.findall('.//{*}triangle');assert len(verts)>100 and len(tris)>100
   assert {t.get('paint_color')for t in tris}==({'4'}if i==0 else{'8'})
   v=np.array([[float(p.get(a))for a in ['x','y','z']]for p in verts]);dims=np.ptp(v,axis=0)
   if i==0:assert abs(max(dims[:2])-100)<.001
   results.append({'vertices':len(verts),'triangles':len(tris),'dimensions_mm':dims.tolist(),'filament_slot':i+1})
  cfg=json.loads(z.read('Metadata/project_settings.config'));assert len(cfg['filament_colour'])==2
  r['package_validation']={'parts':results,'filament_colours':cfg['filament_colour'],'reference_check':'passed'}
 print(name,results,flush=True)
(OUT/'kontroll.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf8')
(OUT/'LAS-MIG.txt').write_text('Två julkulor med 100 mm största diameter på själva kulkroppen.\nVarje 3MF-projekt innehåller två separata utskriftsobjekt: färgad kula och guldtopp med ögla och limtapp.\nTapp cirka Ø8 mm, hål cirka Ø8,4 mm, instick 10 mm och blint håldjup 10,5 mm. Nominellt limspel 0,2 mm per sida. En invändig stoppkant i guldtoppen möter limhalsen.\nBåda projekt har två filamentfärger. Välj rätt skrivare och filament före beredning. Stöd är aktiverat och kan behövas även på modellens insida under limfästet; kontrollera förhandsvisningen innan utskrift.\nSTL-filer saknar färger. Blenderprojektet finns under Modeller/julgranskulor-tvadelade-100mm.\nKällfilerna är oförändrade. Mesh och paketstruktur är kontrollerade; fysisk limpassning och provutskrift är inte genomförda.\n',encoding='utf8')
with zipfile.ZipFile(ROOT/'Julgranskulor-tvadelade-100mm.zip','w',zipfile.ZIP_DEFLATED)as z:
 for f in OUT.iterdir():
  if f.is_file():z.write(f,f.name)
print('Validated and packaged')
