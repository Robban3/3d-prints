from pathlib import Path
p=Path('client/src/pages/HomePage.tsx')
s=p.read_text(encoding='utf-8').replace('className="season-card photo-card" to="/produkter"','className="season-card photo-card" to="/produkter?kategori=julkollektionen"')
s=s.replace('<nav aria-label="Kategorier"><Link', '<nav aria-label="Kategorier"><Link to="/produkter?kategori=julkollektionen">Julkollektionen</Link><Link')
p.write_text(s,encoding='utf-8')
