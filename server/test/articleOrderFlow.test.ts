import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';

it('runs shop and custom orders through article assignment, private tracking, planning, delivery, cancellation and local email', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'formlabb-article-flow-'));
  const stores = { CATALOG_STORE:'catalog.json', ARTICLE_STORE:'articles.json', ORDER_STORE:'orders.json', STOCK_STORE:'stock.json', ADMIN_ACCOUNT_STORE:'admin.json', AUDIT_STORE:'audit.json', FILE_FOLDERS_STORE:'folders.json', MAIL_OUTBOX:'outbox', UPLOAD_DIR:'uploads' };
  for (const [name,file] of Object.entries(stores)) process.env[name] = join(directory,file);
  process.env.ADMIN_TOKEN = 'article-flow-test-only-0123456789';
  process.env.SMTP_HOST = ''; process.env.KLARNA_USERNAME = ''; process.env.KLARNA_PASSWORD = '';
  process.env.STATE_BUCKET = ''; process.env.S3_BUCKET = '';
  await mkdir(process.env.UPLOAD_DIR!);
  const { api } = await import('../src/routes.ts');
  const { admin } = await import('../src/adminRoutes.ts');
  const { uploads } = await import('../src/uploadRoutes.ts');
  const { allProducts, updateProduct, resetCatalogCache } = await import('../src/catalog.ts');
  const { stockFor } = await import('../src/stock.ts');
  resetCatalogCache();
  const app = express(); app.use(express.json()); app.use('/api',uploads,admin,api);
  app.use((error: { fields?: unknown; status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.status ?? (error.fields ? 400 : 500)).json({error:'Test error',fields:error.fields}); });
  const server = app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve => server.once('listening',resolve));
  const base = `http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
  const headers = { Authorization:`Bearer ${process.env.ADMIN_TOKEN}`, 'Content-Type':'application/json' };
  async function call(method: string, path: string, body?: unknown, authenticated=false) {
    return fetch(base+path,{method,headers: authenticated ? headers : {'Content-Type':'application/json'},...(body === undefined ? {} : {body:JSON.stringify(body)})});
  }
  const json = async (response: Response): Promise<any> => response.json();
  const customer = {name:'Test Customer',email:'test@example.invalid',address:'Testgatan 1',postalCode:'12345',city:'Teststad'};
  try {
    const product = (await allProducts())[0]!;
    const stock = await stockFor(product.id);
    const cart = [{productId:product.id,quantity:1,articleNumber:'FL-P-9999-999'}];
    const session = await json(await call('POST','/payments/session',{type:'shop',lines:cart}));
    assert.equal(session.session.test,true);
    const response = await call('POST','/orders',{customer,lines:cart,expectedTotal:session.summary.total});
    assert.equal(response.status,201);
    const {order,accessToken} = await json(response);
    assert.equal(order.lines[0].articleNumber,product.articles![0]!.articleNumber);
    assert.equal(order.payment.test,true);
    assert.equal(await stockFor(product.id),stock-1);
    assert.equal((await call('GET',`/orders/${order.id}`)).status,404);
    const track = () => fetch(`${base}/orders/${order.id}`,{headers:{Authorization:`Bearer ${accessToken}`}});
    assert.equal((await track()).status,200);
    await updateProduct(product.id,{price:999,dimensions:{width:1,depth:1,height:1}});
    assert.deepEqual((await json(await track())).order.lines,order.lines);
    assert.equal((await call('GET',`/admin/orders/${order.id}/production-check`)).status,401);
    let checks = await json(await call('GET',`/admin/orders/${order.id}/production-check`,undefined,true));
    assert.equal(checks.checks.find((check:any)=>check.id==='files').status,'missing');
    for (const status of ['i_produktion','skickad','levererad']) assert.equal((await call('PATCH',`/admin/orders/${order.id}/status`,{status},true)).status,200);
    const cancelled = await json(await call('POST','/orders',{customer,lines:cart}));
    const beforeCancel = await stockFor(product.id);
    assert.equal((await call('PATCH',`/admin/orders/${cancelled.order.id}/status`,{status:'avbruten'},true)).status,200);
    assert.equal(await stockFor(product.id),beforeCancel+1);
    assert.equal((await call('PATCH',`/admin/orders/${cancelled.order.id}/status`,{status:'avbruten'},true)).status,409);
    assert.equal(await stockFor(product.id),beforeCancel+1);
    const request = {material:'pla',quality:'standard',volumeCm3:1,infill:20,quantity:1,rush:false,postProcessing:false};
    async function custom(bytes:string,email=customer.email) {
      const form = new FormData(); form.append('file',new Blob([bytes]),'same-name.stl');
      const uploadResponse = await fetch(base+'/uploads',{method:'POST',body:form});
      assert.equal(uploadResponse.status,201);
      const upload = (await json(uploadResponse)).upload;
      assert.equal(upload.sha256,undefined);
      const result = await call('POST','/custom-orders',{customer:{...customer,email},request,projectName:'Testmodell',description:'Endast automatiserat testunderlag.',fileId:upload.id,articleNumber:'FL-K-9999'});
      assert.equal(result.status,201);
      return json(result);
    }
    const first = await custom('solid test\nendsolid test');
    assert.match(first.order.articleNumber,/^FL-K-\d{4,}$/);
    const repeat = await custom('solid test\nendsolid test');
    assert.equal(repeat.order.articleNumber,first.order.articleNumber);
    const changed = await custom('solid changed\nendsolid changed');
    assert.notEqual(changed.order.articleNumber,first.order.articleNumber);
    const otherCustomer = await custom('solid test\nendsolid test','other@example.invalid');
    assert.notEqual(otherCustomer.order.articleNumber,first.order.articleNumber);
    const plan = {machine:'Bambu testprofil',estimatedHours:2,plannedDate:'2026-10-20',dueDate:'2026-10-21',notes:'Internal test note',modelIds:[]};
    assert.equal((await call('PATCH',`/admin/orders/${first.order.id}/production`,{production:plan,expectedRevision:0},true)).status,200);
    assert.equal((await call('PATCH',`/admin/orders/${first.order.id}/production`,{production:plan,expectedRevision:0},true)).status,409);
    checks = await json(await call('GET',`/admin/orders/${first.order.id}/production-check`,undefined,true));
    assert.equal(checks.checks.find((check:any)=>check.id==='files').status,'ok');
    assert.equal(checks.checks.find((check:any)=>check.id==='payment').status,'review');
    const publicResponse = await fetch(`${base}/orders/${first.order.id}`,{headers:{Authorization:`Bearer ${first.accessToken}`}});
    assert.equal((await json(publicResponse)).order.production,undefined);
    for (const status of ['i_produktion','skickad','levererad']) assert.equal((await call('PATCH',`/admin/orders/${first.order.id}/status`,{status},true)).status,200);
    const messages = await readdir(process.env.MAIL_OUTBOX!);
    const contents = await Promise.all(messages.map(name=>readFile(join(process.env.MAIL_OUTBOX!,name),'utf8')));
    assert.ok(contents.some(mail=>mail.includes(order.lines[0].articleNumber)));
    assert.ok(contents.some(mail=>mail.includes(first.order.articleNumber)));
    assert.ok(contents.some(mail=>mail.includes('Reply-To: Formlabb.se <support@formlabb.se>')));
    for (const recipient of ['nygren.cn@gmail.com','rvdv1122@gmail.com']) {
      assert.ok(contents.some(mail=>mail.includes(`To: ${recipient}`) && mail.includes(order.id) && mail.includes('Ny order')));
      assert.ok(contents.some(mail=>mail.includes(`To: ${recipient}`) && mail.includes(first.order.id) && mail.includes('Ny order')));
    }
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    if (!directory.startsWith(join(tmpdir(),'formlabb-article-flow-'))) throw new Error('Unexpected test cleanup path');
    await rm(directory,{recursive:true,force:true});
  }
});
