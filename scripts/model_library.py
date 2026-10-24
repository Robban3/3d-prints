"""Location of the model library, stored outside the website repository."""
import os
from pathlib import Path

REPO=Path(__file__).resolve().parents[1]
LIBRARY=Path(os.environ.get('FORMLABB_MODEL_LIBRARY',r'\\hav.havochvatten.se\hav\root\users\robvan\Documents\Formlabb\3D-modeller'))

def model_source(relative):
    path=Path(relative)
    if path.parts and path.parts[0] in ('models','exports'):
        group='Modeller' if path.parts[0]=='models' else 'Leveranser'
        relocated=LIBRARY/group/Path(*path.parts[1:])
        if relocated.exists():return relocated
    return REPO/path

def model_reference(path):
    try:return str(path.relative_to(LIBRARY))
    except ValueError:return str(path.relative_to(REPO))
