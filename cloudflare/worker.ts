import { DurableObject } from 'cloudflare:workers';

interface Env {
  SHOP: DurableObjectNamespace<Shop>;
  [name: string]: unknown;
}

const forwardedVariables = [
  'PUBLIC_URL', 'ADMIN_EMAIL', 'ADMIN_TOKEN', 'STATE_BUCKET', 'STATE_PREFIX',
  'S3_BUCKET', 'S3_ENDPOINT', 'S3_PREFIX', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM',
  'KLARNA_USERNAME', 'KLARNA_PASSWORD', 'KLARNA_ENV', 'KLARNA_NOTIFICATION_SECRET',
];

export class Shop extends DurableObject<Env> {
  private starting: Promise<void> | undefined;

  private async ready(): Promise<void> {
    const container = this.ctx.container!;
    const variables: Record<string, string> = { S3_REGION: 'auto', TRUST_PROXY_HOPS: '1' };
    for (const name of forwardedVariables) {
      if (typeof this.env[name] === 'string') variables[name] = this.env[name] as string;
    }
    for (const name of ['PUBLIC_URL', 'ADMIN_TOKEN', 'STATE_BUCKET', 'S3_BUCKET', 'S3_ENDPOINT', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']) {
      if (!variables[name]) throw new Error(`Configure Cloudflare variable or secret ${name}`);
    }
    variables.PUBLIC_BASE_URL = variables.PUBLIC_URL!;
    // Durable Object-managed containers keep their startup image across deploys.
    // Compare both image and runtime settings before reusing an existing instance.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(variables)));
    const configuration = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const current = container.running ? await container.inspect() : null;
    if (current && (current.image !== container.images.shop || current.labels.configuration !== configuration)) {
      await container.destroy();
    }
    if (!container.running) {
      container.start({ image: container.images.shop, instance: 'lite', enableInternet: true, env: variables, labels: { configuration } });
    }
    await container.setInactivityTimeout(15 * 60 * 1000);
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await container.getTcpPort(4000).fetch('http://container/api/health', { signal: AbortSignal.timeout(1000) });
        await response.body?.cancel();
        if (response.ok) return;
      } catch { /* Wait for Node startup. */ }
      await scheduler.wait(200);
    }
    throw new Error('Shop container did not become ready');
  }

  async fetch(request: Request): Promise<Response> {
    this.starting ??= this.ready().finally(() => { this.starting = undefined; });
    await this.starting;
    const url = new URL(request.url);
    const originalHost = url.host;
    url.protocol = 'http:';
    url.host = 'container';
    const forwarded = new Request(url, request);
    forwarded.headers.delete('host');
    forwarded.headers.set('x-forwarded-proto', 'https');
    forwarded.headers.set('x-forwarded-host', originalHost);
    forwarded.headers.set('x-forwarded-for', request.headers.get('cf-connecting-ip') ?? 'unknown');
    return this.ctx.container!.getTcpPort(4000).fetch(forwarded);
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    // A single named instance preserves the server's order and stock queues.
    // Do not load-balance file-based state across multiple containers.
    return env.SHOP.getByName('formlabb-shop').fetch(request);
  },
};
