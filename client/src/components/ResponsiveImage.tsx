import type { ImgHTMLAttributes } from 'react';
import manifest from '../lib/responsive-images.json';

const images = manifest as Record<string, { src: string; srcSet: string; width: number; height: number }>;
// Older catalog entries retain upload IDs even after their originals were
// exported as public seed assets. Resolve those known IDs without a failed API
// download first; this also keeps admin thumbnails on the same CDN as the shop.
const seedImages = Object.fromEntries(Object.entries(images).flatMap(([path, image]) => {
  const id = path.match(/^\/images\/catalog-(?:seed|live)\/([a-f0-9]{32})\.(?:webp|png|jpe?g|avif)$/)?.[1];
  return id ? [[id, image]] : [];
}));

/** Only known public assets use generated sizes. Private/API URLs keep their original access checks. */
export function ResponsiveImage({ src, sizes = '100vw', fetchPriority, onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const uploaded = src?.match(/^\/api\/uploads\/([a-f0-9]{32})$/);
  const image = src ? images[src] ?? (uploaded ? seedImages[uploaded[1]!] ?? {
    src: `${src}/image/960`,
    srcSet: [128, 320, 640, 960, 1536].map(width => `${src}/image/${width} ${width}w`).join(', '),
    width: undefined, height: undefined,
  } : undefined) : undefined;
  return <img decoding="async" {...props} {...(fetchPriority ? { fetchpriority: fetchPriority } : {})} src={image?.src ?? src} srcSet={image?.srcSet} sizes={image ? sizes : undefined}
    onError={event => {
      if (uploaded && event.currentTarget.getAttribute('src') !== src) {
        event.currentTarget.removeAttribute('srcset');
        event.currentTarget.removeAttribute('sizes');
        event.currentTarget.src = src!;
      }
      onError?.(event);
    }}
    width={props.width ?? image?.width} height={props.height ?? image?.height} />;
}
