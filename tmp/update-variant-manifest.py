import json
from pathlib import Path
p=Path('tmp/variant-jobs.json')
old=json.loads(p.read_text(encoding='utf-8'))
nexo=json.loads(Path('tmp/nexo-jobs.json').read_text(encoding='utf-8'))
p.write_text(json.dumps([j for j in old if j['slug'] not in ['spiral-vas','vas-nexo']]+nexo,ensure_ascii=False),encoding='utf-8')
