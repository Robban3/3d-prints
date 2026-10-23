"""Convert a 3MF build to binary STL in millimetres, respecting transforms."""
import argparse, json, posixpath, struct, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
import numpy as np

NS = {'m': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
PROD = '{http://schemas.microsoft.com/3dmanufacturing/production/2015/06}'

def convert(source, destination):
    cache = {}
    factors = {'micron': .001, 'millimeter': 1, 'centimeter': 10,
               'inch': 25.4, 'foot': 304.8, 'meter': 1000}
    def transform(value):
        matrix = np.eye(4)
        if value:
            matrix[:3, :] = np.array([float(x) for x in value.split()]).reshape(4, 3).T
        return matrix
    with zipfile.ZipFile(source) as package:
        def model(path):
            if path not in cache:
                root = ET.fromstring(package.read(path))
                cache[path] = (root, {o.get('id'): o for o in root.findall('m:resources/m:object', NS)})
            return cache[path]
        triangles = []
        def visit(path, oid, matrix):
            root, objects = model(path)
            obj = objects[oid]
            mesh = obj.find('m:mesh', NS)
            if mesh is not None:
                vertices = np.array([[float(v.get(k)) for k in ('x', 'y', 'z')]
                                     for v in mesh.findall('m:vertices/m:vertex', NS)])
                faces = np.array([[int(t.get(k)) for k in ('v1', 'v2', 'v3')]
                                  for t in mesh.findall('m:triangles/m:triangle', NS)])
                points = vertices @ matrix[:3, :3].T + matrix[:3, 3]
                triangles.append(points[faces])
            for component in obj.findall('m:components/m:component', NS):
                reference = component.get(PROD + 'path')
                child = reference.lstrip('/') if reference and reference.startswith('/') else (
                    posixpath.normpath(posixpath.join(posixpath.dirname(path), reference)) if reference else path)
                visit(child, component.get('objectid'), matrix @ transform(component.get('transform')))
        root, _ = model('3D/3dmodel.model')
        scale = np.diag([factors[root.get('unit', 'millimeter')]] * 3 + [1])
        for item in root.findall('m:build/m:item', NS):
            if item.get('printable', '1') != '0':
                visit('3D/3dmodel.model', item.get('objectid'), scale @ transform(item.get('transform')))
        data = np.concatenate(triangles)
    normals = np.cross(data[:, 1] - data[:, 0], data[:, 2] - data[:, 0])
    lengths = np.linalg.norm(normals, axis=1)
    np.divide(normals, lengths[:, None], out=normals, where=lengths[:, None] > 0)
    dtype = np.dtype([('normal', '<f4', (3,)), ('vertices', '<f4', (3, 3)), ('attribute', '<u2')])
    records = np.zeros(len(data), dtype=dtype)
    records['normal'] = normals
    records['vertices'] = data
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('wb') as stream:
        stream.write(b'Formlabb conversion - units mm'.ljust(80, b'\0'))
        stream.write(struct.pack('<I', len(records)))
        stream.write(records.tobytes())
    # Re-read the export to verify its triangle count and bounds.
    check = np.fromfile(destination, dtype=dtype, offset=84)
    assert len(check) == len(data)
    assert destination.stat().st_size == 84 + 50 * len(data)
    assert np.allclose(check['vertices'].min(axis=(0, 1)), data.min(axis=(0, 1)), atol=1e-4)
    assert np.allclose(check['vertices'].max(axis=(0, 1)), data.max(axis=(0, 1)), atol=1e-4)
    report = {'source': source.name, 'output': destination.name, 'units': 'mm',
              'triangles': len(data), 'dimensions_mm': np.ptp(data.reshape(-1, 3), axis=0).tolist(),
              'verified_export': True, 'note': 'STL preserves geometry but has no colors or textures.'}
    destination.with_suffix('.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print(json.dumps(report))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    convert(args.source, args.destination)
