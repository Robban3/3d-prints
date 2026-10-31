"""Prepare product drafts; do not publish placeholder prices."""
from pathlib import Path
from PIL import Image, ImageOps
import json, html, math

def time_price(seconds):
    raw = seconds / 3600 * 30 + 10
    return max(9, math.floor((raw - 9) / 10 + 0.5) * 10 + 9)

root = Path(__file__).resolve().parents[1]
source = Path(r'C:/Users/robvan/.codex/codex-remote-attachments/01a12557-5c6d-7681-994b-1bb9d44347aa/774AA7D4-DF75-4390-8FEE-DF4E1E518675')
out = root / 'exports/produkter-2026-10-31'
out.mkdir(parents=True, exist_ok=True)
pictures = ['tandborststation.webp', 'tandborststation-delar.webp', 'golfaren-flaskhallare.webp', 'tomtens-sack-flaskhallare.webp']
for index, name in enumerate(pictures, 1):
    with Image.open(source / f'{index}-Foto-{index}.jpg') as original:
        image = ImageOps.exif_transpose(original).convert('RGB')
        image.thumbnail((1400, 1400))
        image.save(out / name, 'WEBP', quality=90, method=6)

common = dict(material='pla', finish='Matt', price=1, published=False, featured=False,
              stock=0, rating=0, reviewCount=0, specificationsPending=True,
              dimensions=dict(width=0, depth=0, height=0), dimensionsNote='Mått inväntas.',
              weightGrams=0, printTimeHours=0, dimensionsEstimated=False, productionEstimated=False,
              productionNote='UTKAST: inväntar pris, mått och produktionsuppgifter. 1 kr är en intern platshållare och får inte publiceras.',
              art=dict(shape='organizer', tone='benvit'))
products = [
    dict(slug='tandborststation-tva-platser', name='Tandborststation – två platser', category='badrum',
         price=time_price(14863 + 7222), printTimeHours=(14863 + 7222) / 3600,
         dimensions=dict(width=170.5, depth=60, height=115),
         dimensionsNote='Sammansatt med tandkrämsbehållaren, utan tandborstar. Bredd 170,5 mm, djup 60 mm och höjd 115 mm.',
         productionNote='Sparad slicerberäkning för den senaste versionen med fast överdel: totalt 6 h 8 min för två byggplattor. Vikt fastställs inför produktion.',
         tagline='Samlad förvaring för två tandborstar och tandkräm.',
         description='En salviagrön tandborststation med två runda hållare och en separat behållare för tandkräm. De räfflade sidorna ger ett lugnt uttryck på handfatet. Bilden med lösa delar visar behållaren, droppbrickan och det slitsade gallret.\n\nYttermått sammansatt med tandkrämsbehållaren, utan tandborstar: 170,5 × 60 × 115 mm (bredd × djup × höjd).\n\nTandborstar, tandkräm och övrig rekvisita ingår inte.',
         colors=['Salviagrön'], highlights=['Två tandborstplatser', 'Separat behållare för tandkräm', 'Droppbricka med löstagbart galler']),
    dict(slug='golfaren-flaskhallare', name='Golfaren – flaskhållare', category='bar-restaurang',
         price=1199,
         dimensions=dict(width=323, depth=191, height=340), dimensionsEstimated=True,
         dimensionsNote='Ungefärliga yttermått: 32,3 × 19,1 × 34 cm (bredd × djup × höjd).',
         productionNote='Vikt och printtid fastställs inför produktion.',
         tagline='En golfspelare och golfbag som ger flaskan en egen plats.',
         description='En dekorativ flaskhållare där en golfspelare lutar sig mot en golfbag. Golfklubban, de kontrasterande färgerna och den gemensamma sockeln gör hållaren till ett blickfång på en skänk eller i hemmabaren.\n\nYttermått: cirka 32,3 × 19,1 × 34 cm (bredd × djup × höjd).\n\nFlaska och övrig rekvisita ingår inte. Vilka flaskor hållaren passar fastställs före publicering.',
         colors=['Svart och beige'], highlights=['Golfspelare med klubba', 'Flaskhållare formad som en golfbag', 'Gemensam dekorativ sockel']),
    dict(slug='tomtens-sack-flaskhallare', name='Tomtens säck – flaskhållare', category='bar-restaurang',
         price=1199,
         dimensions=dict(width=293, depth=205, height=300), dimensionsEstimated=True,
         dimensionsNote='Ungefärliga yttermått: 29,3 × 20,5 × 30 cm (bredd × djup × höjd).',
         productionNote='Vikt och printtid fastställs inför produktion.',
         tagline='Julens flaska får sällskap av en tomte med paket.',
         description='En julig flaskhållare med en tomte som håller ett grönt paket och lutar handen mot en stor säck. Säcken har dekorativt rep, stjärndetalj och synliga lappar, och figurerna står tillsammans på en snöliknande sockel.\n\nYttermått: cirka 29,3 × 20,5 × 30 cm (bredd × djup × höjd).\n\nFlaska och övrig rekvisita ingår inte. Vilka flaskor hållaren passar fastställs före publicering.',
         colors=['Flerfärgad enligt bild'], highlights=['Tomte med paket', 'Flaskhållare formad som en säck', 'Dekorativ sockel med snöutseende']),
]
products = [{**common, **product} for product in products]
calendar_source = Path(r'C:/Users/robvan/.codex/codex-remote-attachments/01a12557-5c6d-7681-994b-1bb9d44347aa/07266938-8124-4DE8-BABE-44E07B288E88')
calendar_images = ['adventskalender-julmiljo.webp', 'adventskalender-helhet.webp',
                   'adventskalender-framifran.webp', 'adventskalender-tomte.webp',
                   'adventskalender-sockel.webp', 'adventskalender-utdragen-del.webp',
                   'adventskalender-konstruktion.webp', 'adventskalender-delar.webp']
for index, name in enumerate(calendar_images, 1):
    with Image.open(calendar_source / f'{index}-Foto-{index}.jpg') as original:
        image = ImageOps.exif_transpose(original).convert('RGB')
        image.thumbnail((1400, 1400))
        image.save(out / name, 'WEBP', quality=90, method=6)
products.append({**common,
    'slug': 'tomtens-skorsten-adventskalender',
    'name': 'Tomtens skorsten – adventskalender, byggsats',
    'price': 849,
    'dimensions': {'width': 370, 'depth': 276, 'height': 1406},
    'dimensionsNote': 'Yttermått inklusive utskjutande detaljer. Levereras som byggsats.',
    'category': 'julkollektionen',
    'tagline': 'En 140,6 cm hög adventskalender att bygga och räkna ned till jul med.',
    'description': 'Bygg julstämning med en 140,6 cm hög adventskalender formad som en tegelskorsten. En tomte med paket sitter på toppen, medan en grön julkrans och en lyktformad detalj pryder framsidan. Längs sidan finns 24 numrerade utdragbara delar för nedräkningen till julafton.\n\nSockeln har en valvformad öppning, små julgranar och snöliknande detaljer. Kalendern levereras som byggsats för egen montering. Bilderna visar helheten, detaljer och konstruktionen.\n\nYttermått: bredd 37 cm, djup 27,6 cm och höjd 140,6 cm, inklusive utskjutande detaljer.',
    'colors': ['Flerfärgad enligt bild'],
    'highlights': ['Byggsats för egen montering', '24 numrerade dagar', '140,6 cm hög inklusive detaljer', 'Tomte, julkrans och detaljrik sockel'],
    'productionNote': 'Vikt och printtid fastställs inför produktion.',
})
products.append({**common,
    'slug': 'kastrullockshallare-sex-moduler',
    'name': 'Kastrullockshållare – sex moduler',
    'category': 'kok',
    'tagline': 'Modulär förvaring som håller ordning på kastrullocken.',
    'description': 'En kastrullockshållare uppbyggd av sex moduler och ett sluttande ändstycke. Delarna kopplas samman med kopplingsnycklar.\n\nKomplett yttermått: 520 × 180 × 64 mm (bredd × djup × höjd).\n\nDelmått, bredd × djup × höjd:\nEn modul: 82 × 180 × 64 mm.\nKopplingsnyckel: 22 × 60 × 14 mm.\nSluttande ändstycke: 28 × 180 × 60,3 mm.',
    'dimensions': {'width': 520, 'depth': 180, 'height': 64},
    'dimensionsNote': 'Komplett hållare med sex moduler och ett sluttande ändstycke. Delmått anges i beskrivningen.',
    'colors': ['Färg fastställs inför publicering'],
    'highlights': ['Sex moduler och ett sluttande ändstycke', 'Delar som kopplas samman', 'Komplett bredd 520 mm'],
    'productionNote': 'UTKAST: inväntar pris, färg, produktbild och produktionsuppgifter. 1 kr är en intern platshållare och får inte publiceras.',
})
(out / 'produktutkast-import.json').write_text(json.dumps(dict(version=1, products=products), ensure_ascii=False, indent=2), encoding='utf-8')
(out / 'adventskalender-publicera.json').write_text(json.dumps(dict(version=1, products=[{**products[3], 'published': True, 'stock': 10}]), ensure_ascii=False, indent=2), encoding='utf-8')
(out / 'prisunderlag.json').write_text(json.dumps({
    'hourlyRateSEK': 30, 'fixedMaterialCostSEK': 10,
    'rounding': 'Närmaste pris som slutar på 9; vid lika avstånd uppåt.',
    'products': [
        {'slug': products[0]['slug'], 'priceSEK': products[0]['price'], 'sliceTimeSeconds': 22085,
         'unroundedPriceSEK': 22085 / 3600 * 30 + 10,
         'source': 'Tandborststall-Nordisk-ribb/Kompakt-PETG-fast-overdel/Tandborststall_PETG_NORMALA_STOD_FRITT_BAGARHAL_04mm.3mf',
         'platesSeconds': [14863, 7222]},
        {'slug': products[1]['slug'], 'priceSEK': 1199, 'source': 'Bekräftat av användaren'},
        {'slug': products[2]['slug'], 'priceSEK': 1199, 'source': 'Bekräftat av användaren'},
        {'slug': products[3]['slug'], 'priceSEK': 849, 'source': 'Bekräftat av användaren'},
        {'slug': products[4]['slug'], 'priceSEK': None, 'status': 'Inväntar total utskriftstid för rätt sexmodulsmodell'},
    ],
}, ensure_ascii=False, indent=2), encoding='utf-8')
manifest = [dict(slug=products[0]['slug'], mainImage=pictures[0], detailImages=[pictures[1]]),
            dict(slug=products[1]['slug'], mainImage=pictures[2], detailImages=[]),
            dict(slug=products[2]['slug'], mainImage=pictures[3], detailImages=[])]
manifest.append(dict(slug=products[3]['slug'], mainImage=calendar_images[0], detailImages=calendar_images[1:]))
manifest.append(dict(slug=products[4]['slug'], mainImage=None, detailImages=[]))
(out / 'bildkoppling.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
cards = []
for product, images in zip(products, manifest):
    thumbs = ''.join(f'<img src="{html.escape(name)}" alt="Detaljbild">' for name in images['detailImages'])
    status = '849 kr · Byggsats · 37 × 27,6 × 140,6 cm (B × D × H)' if product['slug'] == 'tomtens-skorsten-adventskalender' else 'Utkast – pris och mått saknas'
    if product['slug'] == 'tandborststation-tva-platser':
        status = '199 kr · 170,5 × 60 × 115 mm (B × D × H)'
    elif product['slug'] == 'golfaren-flaskhallare':
        status = '1 199 kr · Cirka 32,3 × 19,1 × 34 cm (B × D × H)'
    elif product['slug'] == 'tomtens-sack-flaskhallare':
        status = '1 199 kr · Cirka 29,3 × 20,5 × 30 cm (B × D × H)'
    elif product['slug'] == 'kastrullockshallare-sex-moduler':
        status = 'Pris och produktbild inväntas · 520 × 180 × 64 mm (B × D × H)'
    main_image = f'<img src="{images["mainImage"]}" alt="{html.escape(product["name"])}">' if images['mainImage'] else '<p>Produktbild inväntas</p>'
    cards.append(f'<article>{main_image}<h2>{html.escape(product["name"])}</h2><p>{html.escape(product["tagline"])}</p><p>Kategori: {html.escape(product["category"])}</p><p><strong>{status}</strong></p>{thumbs}</article>')
(out / 'index.html').write_text('<!doctype html><html lang="sv"><meta charset="utf-8"><title>Fyra nya produktutkast</title><style>body{font:16px system-ui;background:#f5f2eb;color:#202922;margin:30px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}article{background:white;border-radius:18px;padding:18px}img{width:100%;border-radius:12px}h1{font-size:28px}h2{font-size:22px}</style><h1>Produktutkast – inväntar pris och mått</h1><p>Lokalt förberett. Inte sparat eller publicerat i admin.</p><main>'+''.join(cards)+'</main></html>', encoding='utf-8')
print(json.dumps(dict(products=len(products), pictures=len(pictures)+len(calendar_images), preview=str(out/'index.html'), published=False), ensure_ascii=False))
