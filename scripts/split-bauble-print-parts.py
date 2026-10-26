from pathlib import Path
import zipfile,xml.etree.ElementTree as E,json,shutil
ROOT=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Documents\Formlabb\3D-modeller\Leveranser');OUT=ROOT/'Julgranskulor-tvadelade-100mm'
NS='http://schemas.microsoft.com/3dmanufacturing/core/2015/02';P='http://schemas.microsoft.com/3dmanufacturing/production/2015/06';R='http://schemas.openxmlformats.org/package/2006/relationships';E.register_namespace('',NS);E.register_namespace('p',P)
for name in ['Julkula-veckad-rod','Julkula-vavd-gron']:
 with zipfile.ZipFile(OUT/(name+'-2-delar.3mf'))as source:
  settings=json.loads(source.read('Metadata/project_settings.config'))
  for j,suffix in enumerate(['kula','guldtop']):
   wrapper=str(2+2*j);subfile=f'3D/Objects/object_{j+1}.model';model=E.fromstring(source.read('3D/3dmodel.model'));res=model.find('./{*}resources');build=model.find('./{*}build')
   for o in list(res):
    if o.get('id')!=wrapper:res.remove(o)
   for item in list(build):
    if item.get('objectid')!=wrapper:build.remove(item)
    else:item.set('transform','1 0 0 0 1 0 0 0 1 125 125 0')
   config=E.fromstring(source.read('Metadata/model_settings.config'))
   for o in list(config.findall('./object')):
    if o.get('id')!=wrapper:config.remove(o)
    else:
     for m in o.findall('./metadata'):
      if m.get('key')=='extruder':m.set('value','1')
   for ins in list(config.findall('./plate/model_instance')):
    ident=ins.find('./metadata[@key="object_id"]')
    if ident.get('value')!=wrapper:config.find('./plate').remove(ins)
   for assembly in list(config.findall('./assemble')):config.remove(assembly)
   cfg=dict(settings)
   for key in ['filament_colour','filament_type','filament_diameter','filament_settings_id']:cfg[key]=[settings[key][j]]
   cfg['enable_prime_tower']='0'
   with zipfile.ZipFile(OUT/(name+'-'+suffix+'.3mf'),'w',zipfile.ZIP_DEFLATED)as target:
    for entry in source.infolist():
     n=entry.filename
     if n.startswith('3D/Objects/')and n!=subfile:continue
     if n=='3D/3dmodel.model':target.writestr(n,E.tostring(model,encoding='UTF-8',xml_declaration=True))
     elif n=='Metadata/model_settings.config':target.writestr(n,E.tostring(config,encoding='UTF-8',xml_declaration=True))
     elif n=='Metadata/project_settings.config':target.writestr(n,json.dumps(cfg))
     elif n=='3D/_rels/3dmodel.model.rels':target.writestr(n,f'<Relationships xmlns="{R}"><Relationship Target="/{subfile}" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')
     elif n==subfile and j==1:
      data=source.read(n);assert b'paint_color="8"'in data;target.writestr(n,data.replace(b'paint_color="8"',b'paint_color="4"'))
     else:
      with source.open(entry)as a,target.open(n,'w')as b:shutil.copyfileobj(a,b,1024*1024)
   with zipfile.ZipFile(OUT/(name+'-'+suffix+'.3mf'))as check:
    assert check.testzip()is None
    root=E.fromstring(check.read('3D/3dmodel.model'));assert len(root.findall('./{*}build/{*}item'))==1
    cfg=json.loads(check.read('Metadata/project_settings.config'));assert len(cfg['filament_colour'])==1
   print(name,suffix,'single-colour 3MF verified',flush=True)
readme=OUT/'LAS-MIG.txt';text=readme.read_text(encoding='utf8');text+='\nÖppna filerna som slutar på -kula.3mf respektive -guldtop.3mf för att skriva ut en färgdel i taget. Varje sådan fil har ett objekt och ett filament. Filerna -2-delar.3mf innehåller båda färgdelarna för överblick.\n';readme.write_text(text,encoding='utf8')
with zipfile.ZipFile(ROOT/'Julgranskulor-tvadelade-100mm.zip','w',zipfile.ZIP_DEFLATED)as z:
 for f in OUT.iterdir():
  if f.is_file():z.write(f,f.name)
