import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = files.filter(path => /^(models|exports)\//i.test(path)
  || /\.(stl|3mf|blend\d*|f3d|step|stp|iges|igs|obj|glb|gltf|fbx|ply|amf|gcode|npz|npy|zip)$/i.test(path));
if (forbidden.length) {
  console.error('Modellfiler och exportpaket hör till Dokument/Formlabb/3D-modeller, inte Git:\n' + forbidden.join('\n'));
  process.exitCode = 1;
} else {
  console.log('OK: inga modellfiler eller exportpaket i Git.');
}
