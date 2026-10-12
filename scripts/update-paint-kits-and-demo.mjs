import { readFile } from 'node:fs/promises';
const env = await readFile(new URL('../server/.env', import.meta.url),'utf8');
const token = process.env.ADMIN_TOKEN || env.match(/^ADMIN_TOKEN=(.+)$/m)?.[1].trim();
const base='http://localhost:4000/api';
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
async function request(path,body){const r=await fetch(base+path,{method:body?'PATCH':'GET',headers,...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));return d;}
const {products}=await request('/admin/products');
const kits={
 'mala-din-jul':{price:349,tagline:'Fyra kulor, fem färger och två penslar.',description:'Ett komplett kreativt paket med fyra julkulor: en grön, en röd, en vit och en svart. Upphöjda mönster ger en tydlig grund för din egen målning. Paketet innehåller fem färger – grön, röd, guld, svart och silver – samt två penslar för små detaljer och större ytor. Planerat färginnehåll är 10 ml per kulör. Priset gäller hela paketet; upphängningsband ingår inte.',highlights:['4 kulor: grön, röd, vit och svart','5 färger: grön, röd, guld, svart och silver','2 penslar – fin och mellan','Komplett paket, pris inklusive färg och penslar']},
 'julpyssel':{price:229,tagline:'Sex dekorationer. Fem färger. Två penslar.',description:'Ett komplett måla-själv-paket med två granar, två hjärtan och två stjärnor i vitt. Måla dina egna mönster med de fem medföljande färgerna: grön, röd, guld, svart och silver. Två penslar ger plats för både detaljer och större färgfält. Planerat färginnehåll är 10 ml per kulör. Priset gäller sex dekorationer, fem färger och två penslar; upphängningsband ingår inte.',highlights:['6 dekorationer: 2 granar, 2 hjärtan och 2 stjärnor','5 färger: grön, röd, guld, svart och silver','2 penslar – fin och mellan','Komplett paket, pris inklusive färg och penslar']},
};
for(const p of products.filter(p=>p.published!==false)){
 const patch={...(kits[p.slug]??{})};
 if(p.slug==='vas-nexo')patch.stock=0;
 else if(p.stock<=0)patch.stock=25;
 if(p.slug==='julkula-med-namn'){
  patch.optionLabel='Årtal';
  patch.sizes=[{id:'utan-artal',name:'Utan årtal',priceDelta:0,dimensions:p.dimensions},{id:'med-artal',name:'Med årtal (2026)',priceDelta:0,dimensions:p.dimensions}];
  patch.description='En benvit julkula med ditt eget namn och luftig, ribbad form. Välj utan årtal för en tidlös dekoration eller med 2026 för att minnas just denna jul. Båda utförandena kostar lika mycket. Priset gäller en kula med ett namn; namnet Elsa på bilden är ett exempel och önskat namn stäms av inför tillverkning. Upphängningsband ingår inte.';
  patch.highlights=['Personlig julkula med ett namn','Välj utan årtal eller med 2026','Samma pris för båda utförandena'];
 }
 if(Object.keys(patch).length){await request(`/admin/products/${p.id}`,patch);console.log(`${p.name}: uppdaterad`);}
}
console.log('Vas Nexo är enda Kommer snart-produkten i lokal demo.');
