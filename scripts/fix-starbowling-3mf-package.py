from pathlib import Path
import zipfile,xml.etree.ElementTree as E
ROOT=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Documents\Formlabb\3D-modeller\Leveranser')
DIR=ROOT/'StarBowling-kropp-100mm'
SRC=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Desktop\Star Bowling')
NS='http://schemas.microsoft.com/3dmanufacturing/core/2015/02';P='http://schemas.microsoft.com/3dmanufacturing/production/2015/06';R='http://schemas.openxmlformats.org/package/2006/relationships'
E.register_namespace('',NS);E.register_namespace('p',P)
for name in ['Saltkar','Pepparkar']:
 path=DIR/(name+'_kropp-100mm_med-lock.3mf')
 with zipfile.ZipFile(path)as z:parts={n:z.read(n)for n in z.namelist()}
 with zipfile.ZipFile(SRC/(name+'_100mm med lock.3mf'))as z:
  for n in ['3D/Objects/object_1.model','3D/Objects/object_2.model']:
   original=E.fromstring(z.read(n)).find('.//{'+NS+'}object')
   node=E.fromstring(parts[n]);obj=node.find('.//{'+NS+'}object');obj.set('{'+P+'}UUID',original.get('{'+P+'}UUID'))
   parts[n]=E.tostring(node,encoding='UTF-8',xml_declaration=True)
 root=E.fromstring(parts['3D/3dmodel.model'])
 for m in list(root.findall('./{'+NS+'}metadata')):
  if m.get('name','').startswith('Thumbnail_'):root.remove(m)
 parts['3D/3dmodel.model']=E.tostring(root,encoding='UTF-8',xml_declaration=True)
 parts['_rels/.rels']=b'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'
 keep=[n for n in parts if not n.startswith('Metadata/')or n in ['Metadata/project_settings.config','Metadata/model_settings.config']]
 with zipfile.ZipFile(path.with_suffix('.tmp'),'w',zipfile.ZIP_DEFLATED)as z:
  for n in keep:z.writestr(n,parts[n].replace(b"encoding='utf8'",b"encoding='UTF-8'"))
 path.with_suffix('.tmp').replace(path)
 print(name,'UTF-8 and object UUID references repaired')
with zipfile.ZipFile(ROOT/'StarBowling-kropp-100mm.zip','w',zipfile.ZIP_DEFLATED)as z:
 for f in DIR.iterdir():
  if f.is_file():z.write(f,f.name)
