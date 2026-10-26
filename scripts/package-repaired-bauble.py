from pathlib import Path
import zipfile,xml.etree.ElementTree as ET,json
root=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Documents\Formlabb\3D-modeller')
out=root/'Leveranser/Julkula-veckad-rod';path=out/'Julkula-veckad-rod-reparerad.3mf'
src=Path(r'\\hav.havochvatten.se\hav\root\users\robvan\Desktop\modeller m3f\Julkula - veckad (röd).3mf')
ns='http://schemas.microsoft.com/3dmanufacturing/core/2015/02';prod='http://schemas.microsoft.com/3dmanufacturing/production/2015/06'
ET.register_namespace('',ns);ET.register_namespace('p',prod)
with zipfile.ZipFile(path)as z:generic=ET.fromstring(z.read('3D/3dmodel.model'))
obj=generic.find('.//{'+ns+'}object');obj.set('id','1');obj.attrib.pop('pid',None)
triangles=obj.findall('.//{'+ns+'}triangle')
for t in triangles:
 color=t.attrib.pop('p1','0');t.attrib.pop('pid',None);t.set('paint_color','8'if color=='1'else'4')
model=ET.Element('{'+ns+'}model',{'unit':'millimeter','xmlns:p':prod,'requiredextensions':'p','xmlns:BambuStudio':'http://schemas.bambulab.com/package/2021'})
ET.SubElement(model,'{'+ns+'}metadata',{'name':'BambuStudio:3mfVersion'}).text='2'
r=ET.SubElement(model,'{'+ns+'}resources');r.append(obj)
with zipfile.ZipFile(src)as original,zipfile.ZipFile(out/'reparerad.tmp','w',zipfile.ZIP_DEFLATED)as z:
 for name in original.namelist():
  if name=='3D/Objects/object_1.model':data=ET.tostring(model,encoding='utf-8',xml_declaration=True)
  elif name=='Metadata/model_settings.config':
   data=original.read(name).decode().replace('2393044',str(len(triangles))).replace('Object_1','Julkula veckad röd reparerad').encode()
  else:data=original.read(name)
  z.writestr(name,data)
(out/'reparerad.tmp').replace(path)
with zipfile.ZipFile(path)as z:assert z.testzip()is None
print('Bambu package',len(triangles),'triangles',path.stat().st_size,'bytes')
