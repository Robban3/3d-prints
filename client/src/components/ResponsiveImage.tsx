import type { ImgHTMLAttributes } from 'react';
import manifest from '../lib/responsive-images.json';

const images = manifest as Record<string, { src: string; srcSet: string; width: number; height: number }>;

/** Only known public assets use generated sizes. Private/API URLs keep their original access checks. */
export function ResponsiveImage({ src, sizes = '100vw', fetchPriority, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const image = src ? images[src] : undefined;
  return <img decoding="async" {...props} {...(fetchPriority ? { fetchpriority: fetchPriority } : {})} src={image?.src ?? src} srcSet={image?.srcSet} sizes={image ? sizes : undefined}
    width={props.width ?? image?.width} height={props.height ?? image?.height} />;
}
