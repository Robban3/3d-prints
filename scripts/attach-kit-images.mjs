import {readFile} from 'node:fs/promises';
const env=await readFile(new URL('../server/.env',import.meta.url),'utf8');
const token=process.env.ADMIN_TOKEN||env.match(/^ADMIN_TOKEN=(.+)$/m)?.[1].trim();
const base='http://localhost:4000/api';
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
async function request(path,body){const r=await fetch(base+path,{method:body?'PATCH':'GET',headers,...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));return d;}
async function upload(file){const bytes=await readFile(new URL(`../client/public/images/christmas/${file}.webp`,import.meta.url));const form=new FormData();form.append('file',new Blob([bytes],{type:'image/webp'}),`${file}-visualisering.webp`);const r=await fetch(base+'/uploads/images',{method:'POST',body:form});const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));return d.image;}
const {products}=await request('/admin/products');
for(const slug of ['mala-din-jul','julpyssel']){
 const p=products.find(p=>p.slug===slug);const image=await upload(`${slug}-kit`);await request(`/admin/products/${p.id}`,{image});console.log(`${p.name}: komplett paketbild kopplad`);
}
const p=products.find(p=>p.slug==='julkula-med-namn');
const withYear=p.variantImages?.find(v=>v.size==='med-artal')?.image??p.image;
const withoutYear=await upload('julkula-med-namn-utan-artal');
await request(`/admin/products/${p.id}`,{image:withoutYear,variantImages:[{color:p.colors[0],size:'utan-artal',image:withoutYear},{color:p.colors[0],size:'med-artal',image:withYear}]});
console.log('Julkula med namn: med och utan årtal kopplade till rätt bilder.');
