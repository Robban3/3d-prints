"""Read-only mesh checks for the latest identified production candidates (NumPy only).
No slicing, repairs, rescaling or print approval. Outputs JSON with file hashes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import zipfile
import xml.etree.ElementTree as ET
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'servettring-noel': ['models/jul-blender-v3'],
    'presentask-gomma': ['models/presentask-original-v3'],
    'gravbiblioteket': ['models/gravbiblioteket-blender-v2'],
    'fold-telefonstall': ['models/fold-fusion-v1'],
    'brew-kaffedripp': ['models/brew-fusion-v1'],
    'haxans-gomma': ['models/haxans-gomma-blender-v6'],
    'pepparkakshus': ['models/pepparkakshus-blender-v3', 'exports/julmodeller-granskade-v4'],
    'luciataget': ['exports/julmodeller-granskade-v4', 'models/baby-jul-blender-v1'],
    'tomten-och-rudolf': ['exports/julmodeller-granskade-v4'],
    'tomtar-3-pack': ['exports/julmodeller-granskade-v4'],
    'mala-din-jul': ['models/jul-blender-v2'],
}

def mesh_check(vertices, faces):
    vertices, faces = np.asarray(vertices, dtype=float), np.asarray(faces, dtype=np.int64)
    if not len(vertices) or not len(faces) or not np.isfinite(vertices).all():
        raise ValueError('Empty mesh or non-finite coordinates')
    if faces.min() < 0 or faces.max() >= len(vertices):
        raise ValueError('Triangle index outside vertex array')
    triangles = vertices[faces]
    twice_area = np.linalg.norm(np.cross(triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0]), axis=1)
    # Weld equal STL coordinates at 0.00001 mm to check edge topology.
    _, inverse = np.unique(np.round(vertices*100000).astype(np.int64), axis=0, return_inverse=True)
    welded = inverse[faces]
    edges = np.concatenate([welded[:, [0, 1]], welded[:, [1, 2]], welded[:, [2, 0]]])
    sorted_edges = np.sort(edges, axis=1)
    _, counts = np.unique(sorted_edges, axis=0, return_counts=True)
    boundary, nonmanifold = int((counts == 1).sum()), int((counts > 2).sum())
    degenerate = int((twice_area <= 1e-10).sum())
    signed_volume = float(np.einsum('ij,ij->i', triangles[:, 0], np.cross(triangles[:, 1], triangles[:, 2])).sum()/6)
    return {
        'triangles': int(len(faces)), 'bounds_mm': [vertices.min(axis=0).round(4).tolist(), vertices.max(axis=0).round(4).tolist()],
        'dimensions_mm': np.ptp(vertices, axis=0).round(4).tolist(),
        'boundary_edges': boundary, 'nonmanifold_edges': nonmanifold, 'degenerate_triangles': degenerate,
        'closed_edge_topology': boundary == 0 and nonmanifold == 0,
        'signed_volume_mm3': round(signed_volume, 3),
        'limitations': 'Edge topology is not a self-intersection, wall-thickness, fit, support or slicing check.',
    }

def stl_check(path):
    with path.open('rb') as stream:
        header = stream.read(84)
    count = struct.unpack('<I', header[80:84])[0] if len(header) == 84 else 0
    if path.stat().st_size == 84+50*count:
        records = np.memmap(path, dtype=np.dtype([('n','<f4',(3,)),('v','<f4',(3,3)),('a','<u2')]), mode='r', offset=84, shape=(count,))
        vertices = records['v'].reshape(-1,3).astype(float)
        faces = np.arange(len(vertices)).reshape(-1,3)
    else:
        vertices = np.array([list(map(float, line.split()[1:])) for line in path.read_text().splitlines() if line.strip().startswith('vertex ')])
        faces = np.arange(len(vertices)).reshape(-1,3)
    return {'meshes': [mesh_check(vertices,faces)], 'dimensions_context': 'Single STL in its stored orientation; separate parts are not assembled.'}

def three_mf_check(path):
    result = []
    with zipfile.ZipFile(path) as archive:
        roots = {name: ET.fromstring(archive.read(name)) for name in archive.namelist() if name.lower().endswith('.model')}
        objects = {}
        def local(tag): return tag.rsplit('}',1)[-1]
        def attr(element,name): return next((v for k,v in element.attrib.items() if local(k)==name),None)
        def matrix(transform): return np.array(list(map(float,transform.split()))).reshape(4,3) if transform else np.vstack([np.eye(3),np.zeros(3)])
        units = {'micron':0.001,'millimeter':1,'centimeter':10,'meter':1000,'inch':25.4,'foot':304.8}
        for name,root in roots.items():
            for obj in root.findall('./{*}resources/{*}object'): objects[(name,obj.attrib['id'])] = obj
        def parts(name,object_id,seen):
            key=(name,object_id)
            if key in seen: raise ValueError('Cyclic 3MF components')
            obj=objects[key]; mesh=obj.find('./{*}mesh')
            if mesh is not None:
                vertices=np.array([[float(v.attrib[k]) for k in ('x','y','z')] for v in mesh.findall('./{*}vertices/{*}vertex')])
                faces=np.array([[int(t.attrib[k]) for k in ('v1','v2','v3')] for t in mesh.findall('./{*}triangles/{*}triangle')])
                yield vertices,faces
            for component in obj.findall('./{*}components/{*}component'):
                target=(attr(component,'path') or name).lstrip('/')
                for vertices,faces in parts(target,component.attrib['objectid'],seen|{key}):
                    yield np.column_stack([vertices,np.ones(len(vertices))]) @ matrix(component.attrib.get('transform')),faces
        build_roots=[(name,root) for name,root in roots.items() if root.find('./{*}build') is not None]
        bounds=[]
        for name,root in build_roots:
            unit=units[root.attrib.get('unit','millimeter')]
            for item in root.findall('./{*}build/{*}item'):
                target=(attr(item,'path') or name).lstrip('/')
                for vertices,faces in parts(target,item.attrib['objectid'],set()):
                    vertices=(np.column_stack([vertices,np.ones(len(vertices))]) @ matrix(item.attrib.get('transform')))*unit
                    check=mesh_check(vertices,faces);result.append(check);bounds.extend(check['bounds_mm'])
        if not result: raise ValueError('No printable build meshes in 3MF')
        resource_count=sum(len(root.findall('./{*}resources/*')) for root in roots.values())
        return {'meshes':result,'build_bounds_dimensions_mm':np.ptp(np.array(bounds),axis=0).round(4).tolist(), 'dimensions_context':'3MF build placement; may contain multiple parts, not an assembled product envelope.', 'resource_count':resource_count,'printer_profile_present':any(name.lower().endswith('project_settings.config') for name in archive.namelist())}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--catalog',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
    data=json.loads(Path(args.catalog).read_text(encoding='utf-8-sig'));products=data if isinstance(data,list) else data['products']
    target=Path(args.output)
    previous=json.loads(target.read_text(encoding='utf-8')).get('files',{}) if target.exists() else {}
    checked={};rows=[]
    for product in products:
        candidates=[]
        for folder in SOURCES.get(product['slug'],[]):
            files=sorted((ROOT/folder).rglob('*.stl'))+sorted((ROOT/folder).glob('*.3mf'))
            if product['slug']=='mala-din-jul': files=[file for file in files if file.name.startswith('Julkula-')]
            if folder.endswith('baby-jul-blender-v1'): files=[file for file in files if file.name.startswith('Tarna')]
            if any('_print.stl' in file.name for file in files): files=[file for file in files if '_print.stl' in file.name]
            if folder.endswith('julmodeller-granskade-v4'):
                if product['slug']=='luciataget': files=[file for file in files if file.name.startswith(('Lucia','Stjarngosse','Pepparkaksgubbe'))]
                elif product['slug']=='tomten-och-rudolf': files=[file for file in files if file.name.startswith('Slade-')]
                elif product['slug']=='tomtar-3-pack': files=[file for file in files if file.name.startswith('Tomte')]
                elif product['slug']=='pepparkakshus': files=[file for file in files if file.name.startswith('Pepparkakshus')]
            for file in files:
                relative=file.relative_to(ROOT).as_posix();candidates.append(relative)
                if relative in checked:continue
                print('Checking '+relative,flush=True)
                try:
                    with file.open('rb') as stream: digest=hashlib.file_digest(stream,'sha256').hexdigest()
                    if previous.get(relative,{}).get('sha256')==digest:
                        checked[relative]=previous[relative];continue
                    details=stl_check(file) if file.suffix.lower()=='.stl' else three_mf_check(file)
                    checked[relative]={'sha256':digest,'bytes':file.stat().st_size,**details}
                except Exception as error: checked[relative]={'error':str(error)}
        rows.append({'slug':product['slug'],'name':product['name'],'catalog_dimensions_mm':product['dimensions'],'production_estimated':product.get('productionEstimated',True),'model_candidates':candidates,'status':'candidates_checked' if candidates else 'no_identified_production_mesh','requires':['Match exact variant and revision','Slicer on actual printer/filament','Verify fit, supports and test print']})
    output={'checked_at':'2026-10-19','scope':'Read-only production candidates, not automatic print approval. No source models modified.','products':rows,'files':checked}
    target=Path(args.output);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'products':len(rows),'with_mesh_candidates':sum(bool(row['model_candidates']) for row in rows),'files':len(checked),'errors':sum('error' in row for row in checked.values())}),flush=True)

if __name__=='__main__':main()
