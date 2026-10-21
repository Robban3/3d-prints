import { mkdir,writeFile } from 'node:fs/promises';
import { orderConfirmation,orderConfirmationExample,newOrderNotifications,statusUpdate,passwordResetMail,customerMessage } from '../server/src/mailer.ts';
process.env.PUBLIC_URL='https://formlabb.se';
const folder=process.argv[2] ?? 'exports/mejl-design-2026-10-21';await mkdir(folder,{recursive:true});
const base={id:'EXEMPEL-1001',type:'shop',createdAt:'2026-10-21T10:00:00Z',status:'mottagen',customer:{name:'Exempelkund',email:'kund@example.invalid',address:'Exempelgatan 1',postalCode:'12345',city:'Exempelstad'},lines:[{productId:'example',name:'Luciatåget – komplett set',articleNumber:'FL-P-0053-001',quantity:1,unitPrice:499,color:'Originalfärger'}],subtotal:499,shipping:59,total:558,payment:{provider:'klarna',status:'obetald',test:true},history:[]};
const custom={...base,id:'EXEMPEL-1002',type:'custom',articleNumber:'FL-K-0001',projectName:'Kundens modell',fileName:'exempelmodell.stl',request:{quantity:2,material:'pla',quality:'fin',infill:15},total:350};
const mails=[
 ['order-butik','Orderbekräftelse – butik',orderConfirmation(base)],
 ['order-egen','Orderbekräftelse – egen modell',orderConfirmation(custom)],
 ['avisering-butik','Intern avisering – butik',newOrderNotifications(base)[0]],
 ['avisering-egen','Intern avisering – egen modell',newOrderNotifications(custom)[0]],
 ...['i_produktion','skickad','levererad','avbruten'].map(s=>[s,({i_produktion:'Produktion',skickad:'Skickad',levererad:'Levererad',avbruten:'Avbokad'})[s],statusUpdate({...base,status:s})]),
 ['aterstallning','Återställning av adminlösenord',passwordResetMail('admin@example.invalid','https://formlabb.se/verkstad#aterstall=EXEMPELTOKEN')],
 ['komplettering','Komplettering behövs',customerMessage(custom,{kind:'komplettering',message:'Vi behöver en ny modellfil med sluten botten innan vi kan starta produktionen. Svara gärna på detta mejl så hjälper vi dig vidare.'})],
 ['offert','Offert / prisförslag',customerMessage(custom,{kind:'offert',message:'Här är vårt prisförslag för två exemplar i PLA. Frakt ingår i detta exempel. Uppskattad produktionstid är fem arbetsdagar efter ditt godkännande.',amount:350})],
 ['forsening','Försenad beställning',customerMessage(base,{kind:'forsening',message:'Din beställning blir tyvärr försenad eftersom en del behöver printas om. Vi räknar med att kunna skicka den den 28 oktober och hör av oss om tiden ändras. Tack för ditt tålamod.'})],
 ['aterbetalning','Återbetalningsbekräftelse',customerMessage({...base,payment:{...base.payment,test:false}},{kind:'aterbetalning',message:'Vi har hanterat den överenskomna återbetalningen för din avbokade beställning.',amount:558,reference:'EXEMPEL-REF-1001',confirmed:true})],
 ['testmejl','Manuellt designexempel',orderConfirmationExample('kund@example.invalid')],
];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for(const [slug,title,m] of mails){
 // Preview uses fictitious data and disabled private links; no outgoing email.
 const content=m.html?.replace(/https?:\/\/[^"<>\s]*spara-order[^"<>\s]*/g,'#exempellank')??`<!doctype html><html lang="sv"><body style="margin:0;padding:28px;font:15px/1.6 Arial,sans-serif;color:#202124;background:#fff"><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.text)}</div></body></html>`;
 await writeFile(`${folder}/${slug}.html`,content);
 await writeFile(`${folder}/${slug}.txt`,`${m.subject}\nTill: ${m.to}\n\n${m.text.replace(/https?:\/\/\S*spara-order\S*/g,'[Privat orderlänk – exempel]')}`);
}
await writeFile(`${folder}/index.html`,`<!doctype html><html lang="sv"><meta charset="utf-8"><title>Formlabb – befintliga mejl</title><body style="font:16px Arial;background:#f3f2ed;color:#213b2c;margin:30px"><h1>Formlabbs mejl – gemensam design</h1><p>Exempeldata. Inga mejl skickade. Alla mallar har gemensam grafisk design och textreserv. Exempeldata – inga utskick.</p>${mails.map(([slug,title,m])=>`<h2>${esc(title)}</h2><p>Ämne: ${esc(m.subject)} · ${m.html?'HTML + text':'Vanlig text'}</p><iframe title="${esc(title)}" src="${slug}.html" style="display:block;width:760px;max-width:100%;height:${m.html?1800:550}px;border:1px solid #ccc;background:white"></iframe>`).join('')}</body></html>`);
console.log('Generated',mails.length,'previews without sending mail.');
