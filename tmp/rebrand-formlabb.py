from pathlib import Path
from PIL import Image
root = Path.cwd()
targets = list((root/'client/src').rglob('*.tsx')) + list((root/'client/src').rglob('*.ts')) + list((root/'server/src').rglob('*.ts')) + list((root/'scripts').glob('*.mjs')) + [root/'client/index.html', root/'README.md', root/'server/data/catalog.json']
for path in targets:
    text = path.read_text(encoding='utf-8')
    updated = text.replace('VANYs','Formlabbs').replace('VANY','Formlabb').replace('/images/brand/vany-logo.png','/images/brand/formlabb-logo.png')
    if updated != text: path.write_text(updated,encoding='utf-8')
out = root/'client/public/images/brand'
logo = Image.open(root/'design-concepts/branding/formlabb-logo.png').convert('RGBA')
logo.crop(logo.getbbox()).save(out/'formlabb-logo.png')
symbol = logo.crop((0,0,int(logo.width*.26),logo.height))
symbol = symbol.crop(symbol.getbbox())
symbol.save(out/'formlabb-symbol.png')
icon = Image.new('RGBA',(512,512),'#f7f4ed')
symbol.thumbnail((380,380),Image.Resampling.LANCZOS)
icon.alpha_composite(symbol,((512-symbol.width)//2,(512-symbol.height)//2))
icon.save(root/'client/public/favicon.png')
icon.save(root/'client/public/favicon.ico',sizes=[(16,16),(32,32),(48,48)])
icon.resize((180,180),Image.Resampling.LANCZOS).save(root/'client/public/apple-touch-icon.png')
