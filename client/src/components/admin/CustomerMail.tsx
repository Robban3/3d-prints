import { useState } from 'react';
import type { AnyOrder } from '../../types';
import { previewCustomerMessage, sendCustomerMessage } from '../../lib/api';
import type { CustomerMessageInput } from '../../lib/api';

export function CustomerMail({order,token}:{order:AnyOrder;token:string}) {
  const [input,setInput]=useState<CustomerMessageInput>({kind:'komplettering',message:''});
  const [preview,setPreview]=useState<{to:string;subject:string;html:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const update=(patch:Partial<CustomerMessageInput>)=>{setInput({...input,...patch});setPreview(null);setNotice('');};
  const closed=['avbruten','levererad'].includes(order.status);
  async function act(send=false) {
    setBusy(true);setNotice('');
    try {
      if(send) {const result=await sendCustomerMessage(token,order.id,input);setNotice(result.mail.delivered?'E-posttjänsten har accepterat mejlet. Slutlig leverans behöver kontrolleras i inkorgen.':'Mejlet sparades i lokal utkorg; det har inte skickats.');setPreview(null);}
      else setPreview((await previewCustomerMessage(token,order.id,input)).mail);
    } catch(error) {setNotice(error instanceof Error?error.message:'Mejlet kunde inte hanteras.');}
    finally {setBusy(false);}
  }
  return <details style={{marginTop:18}}><summary>Skicka kundmejl</summary><div className="stack" style={{marginTop:12}}>
    <label>Mejltyp<select value={input.kind} onChange={e=>update({kind:e.target.value as CustomerMessageInput['kind'],confirmed:false})}>
      <option value="komplettering" disabled={closed}>Komplettering behövs</option>
      {order.type==='custom'&&<option value="offert" disabled={closed}>Offert / prisförslag</option>}
      <option value="forsening" disabled={closed}>Försenad beställning</option>
      <option value="aterbetalning">Bekräftad återbetalning</option>
    </select></label>
    <label>Meddelande till kunden<textarea rows={5} maxLength={3000} value={input.message} onChange={e=>update({message:e.target.value})} placeholder="Beskriv vad kunden behöver veta. Vid försening: ange ny uppskattad tid eller när ni återkommer." /></label>
    {['offert','aterbetalning'].includes(input.kind)&&<label>Belopp inklusive moms (kr)<input type="number" min="0.01" step="0.01" value={input.amount??''} onChange={e=>update({amount:Number(e.target.value)})}/></label>}
    {input.kind==='aterbetalning'&&<><label>Återbetalningsreferens<input maxLength={200} value={input.reference??''} onChange={e=>update({reference:e.target.value})}/></label><label><input type="checkbox" checked={input.confirmed??false} onChange={e=>update({confirmed:e.target.checked})}/> Jag har verifierat att återbetalningen är genomförd hos betalningsleverantören.</label><p className="dim">Detta skickar en bekräftelse. Det utför ingen återbetalning och ändrar inte betalstatus.</p></>}
    {input.kind==='offert'&&<p className="dim">Prisförslaget ändrar inte orderns pris och tar inte betalt. Kunden ombeds svara innan ni går vidare.</p>}
    <button type="button" className="btn btn-ghost" disabled={busy||!input.message.trim()} onClick={()=>void act()}>Förhandsgranska kundmejl</button>
    {preview&&<><p><strong>Till:</strong> {preview.to}<br/><strong>Ämne:</strong> {preview.subject}</p><iframe title="Förhandsvisning av kundmejl" sandbox="" srcDoc={preview.html} style={{width:'100%',height:650,border:'1px solid #ddd'}}/><button type="button" className="btn" disabled={busy} onClick={()=>void act(true)}>{busy?'Skickar…':`Skicka till ${preview.to}`}</button></>}
    {notice&&<p role="status">{notice}</p>}
  </div></details>;
}
