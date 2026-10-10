/**
 * Bygger riktiga modellfiler i minnet så att uppmätningen kan testas mot
 * geometri med känd volym i stället för mot inspelade filer.
 */
import { crc32, deflateRawSync } from 'node:zlib';

export interface Mesh {
  vertices: Array<[number, number, number]>;
  /** Hörnindex, vridna så att normalen pekar utåt. */
  faces: number[][];
}

/** En låda med utåtvända normaler. Volymen är w×d×h, ytan 2(wd+wh+dh). */
export function box(
  width: number,
  depth: number,
  height: number,
  origin: [number, number, number] = [0, 0, 0],
): Mesh {
  const [ox, oy, oz] = origin;
  const vertices: Mesh['vertices'] = [
    [ox, oy, oz],
    [ox + width, oy, oz],
    [ox + width, oy + depth, oz],
    [ox, oy + depth, oz],
    [ox, oy, oz + height],
    [ox + width, oy, oz + height],
    [ox + width, oy + depth, oz + height],
    [ox, oy + depth, oz + height],
  ];
  const faces = [
    [0, 2, 1],
    [0, 3, 2], // botten
    [4, 5, 6],
    [4, 6, 7], // topp
    [0, 1, 5],
    [0, 5, 4], // framsida
    [2, 3, 7],
    [2, 7, 6], // baksida
    [0, 4, 7],
    [0, 7, 3], // vänster
    [1, 2, 6],
    [1, 6, 5], // höger
  ];
  return { vertices, faces };
}

/** Samma låda men med fyrhörningar i stället för trianglar – för OBJ. */
export function quadBox(width: number, depth: number, height: number): Mesh {
  const { vertices } = box(width, depth, height);
  return {
    vertices,
    faces: [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [2, 3, 7, 6],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
    ],
  };
}

/** En tetraeder med hörn i origo och på axlarna. Volymen är a·b·c/6. */
export function tetrahedron(a: number, b: number, c: number): Mesh {
  return {
    vertices: [
      [0, 0, 0],
      [a, 0, 0],
      [0, b, 0],
      [0, 0, c],
    ],
    faces: [
      [0, 2, 1],
      [0, 1, 3],
      [0, 3, 2],
      [1, 2, 3],
    ],
  };
}

/** Vänder alla trianglar inåt. */
export function flipped(mesh: Mesh): Mesh {
  return { vertices: mesh.vertices, faces: mesh.faces.map((face) => [...face].reverse()) };
}

/** Tar bort trianglar så att meshen får ett hål. */
export function withoutFaces(mesh: Mesh, count: number): Mesh {
  return { vertices: mesh.vertices, faces: mesh.faces.slice(0, mesh.faces.length - count) };
}

export function flyttad(mesh: Mesh, dx: number, dy: number, dz: number): Mesh {
  return {
    vertices: mesh.vertices.map(([x, y, z]) => [x + dx, y + dy, z + dz]),
    faces: mesh.faces,
  };
}

function triangles(mesh: Mesh): Array<[number, number, number][]> {
  const out: Array<[number, number, number][]> = [];
  for (const face of mesh.faces) {
    for (let i = 1; i + 1 < face.length; i += 1) {
      out.push([mesh.vertices[face[0]!]!, mesh.vertices[face[i]!]!, mesh.vertices[face[i + 1]!]!]);
    }
  }
  return out;
}

export function triangleCount(mesh: Mesh): number {
  return triangles(mesh).length;
}

export function binaryStl(mesh: Mesh, header = 'testmodell'): Buffer {
  const faces = triangles(mesh);
  const buffer = Buffer.alloc(84 + faces.length * 50);
  buffer.write(header.slice(0, 79), 0, 'latin1');
  buffer.writeUInt32LE(faces.length, 80);
  let offset = 84;
  for (const [a, b, c] of faces) {
    // Normalen lämnas som nollor; uppmätningen räknar fram den själv.
    offset += 12;
    for (const vertex of [a, b, c]) {
      for (const value of vertex) {
        buffer.writeFloatLE(value, offset);
        offset += 4;
      }
    }
    offset += 2; // attributbyten
  }
  return buffer;
}

export function asciiStl(mesh: Mesh): Buffer {
  const rows = ['solid testmodell'];
  for (const [a, b, c] of triangles(mesh)) {
    rows.push('  facet normal 0 0 0', '    outer loop');
    for (const [x, y, z] of [a, b, c]) rows.push(`      vertex ${x} ${y} ${z}`);
    rows.push('    endloop', '  endfacet');
  }
  rows.push('endsolid testmodell', '');
  return Buffer.from(rows.join('\n'), 'utf8');
}

export function objFile(mesh: Mesh): Buffer {
  const rows = ['# testmodell'];
  for (const [x, y, z] of mesh.vertices) rows.push(`v ${x} ${y} ${z}`);
  // OBJ räknar hörn från 1.
  for (const face of mesh.faces) rows.push(`f ${face.map((i) => i + 1).join(' ')}`);
  rows.push('');
  return Buffer.from(rows.join('\n'), 'utf8');
}

export interface ThreeMfOptions {
  unit?: string;
  /** Transform på bygglistans post, som en 3×4-matris radvis. */
  transform?: number[];
  /** Lägger meshen i ett objekt som byggs via en komponent med egen transform. */
  componentTransform?: number[];
  /** Packa med metod 0 i stället för deflate. */
  stored?: boolean;
  /** Bygger samma objekt flera gånger. */
  items?: number;
}

export function threeMfModelXml(mesh: Mesh, options: ThreeMfOptions = {}): string {
  const vertices = mesh.vertices
    .map(([x, y, z]) => `        <vertex x="${x}" y="${y}" z="${z}"/>`)
    .join('\n');
  const faces = triangles(mesh);
  const indexOf = new Map(mesh.vertices.map((vertex, index) => [vertex.join(','), index]));
  const triangleRows = faces
    .map(([a, b, c]) => {
      const v = [a, b, c].map((vertex) => indexOf.get(vertex.join(','))!);
      return `        <triangle v1="${v[0]}" v2="${v[1]}" v3="${v[2]}"/>`;
    })
    .join('\n');

  const mesh1 = `  <object id="1" type="model">
    <mesh>
      <vertices>
${vertices}
      </vertices>
      <triangles>
${triangleRows}
      </triangles>
    </mesh>
  </object>`;

  const wrapper = options.componentTransform
    ? `  <object id="2" type="model">
    <components>
      <component objectid="1" transform="${options.componentTransform.join(' ')}"/>
    </components>
  </object>`
    : '';

  const builtId = options.componentTransform ? '2' : '1';
  const transform = options.transform ? ` transform="${options.transform.join(' ')}"` : '';
  // Flera kopior läggs med 60 mm mellanrum. Lagda på exakt samma plats skulle de
  // dela kanter med varandra och se ut som dubblerad geometri.
  const count = options.items ?? 1;
  const items = Array.from({ length: count }, (_unused, index) => {
    const base = options.transform ?? [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
    const placed =
      index === 0 ? base : [...base.slice(0, 9), base[9]! + index * 60, base[10]!, base[11]!];
    return count === 1 && !options.transform
      ? `    <item objectid="${builtId}"/>`
      : `    <item objectid="${builtId}" transform="${placed.join(' ')}"/>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${options.unit ?? 'millimeter'}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
${mesh1}
${wrapper}
  </resources>
  <build>
${items}
  </build>
</model>
`;
}

export function threeMf(mesh: Mesh, options: ThreeMfOptions = {}): Buffer {
  return zip(
    [
      {
        name: '[Content_Types].xml',
        data: Buffer.from(
          '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
          'utf8',
        ),
      },
      { name: '3D/3dmodel.model', data: Buffer.from(threeMfModelXml(mesh, options), 'utf8') },
    ],
    options.stored === true,
  );
}

export interface ZipEntry {
  name: string;
  data: Buffer;
}

/** Skriver en riktig zip, så att uppackningen testas och inte bara XML-läsningen. */
export function zip(entries: ZipEntry[], stored = false): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const payload = stored ? entry.data : deflateRawSync(entry.data);
    const method = stored ? 0 : 8;
    const checksum = crc32(entry.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, payload);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);

    offset += local.length + payload.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralDirectory, end]);
}
