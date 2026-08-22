import type { Item } from '../../model/types';
import type { Provider } from '../types';
import { DESCRIBE_IMAGE_SYSTEM } from '../prompts';
import { cleanTags } from './classify';

export interface DescribeImagePatch { summary?: string; tags?: string[]; meta?: string }

export async function describeImage(provider: Provider, item: Item, opts: { image: { bytes: Uint8Array; mime: string } }): Promise<DescribeImagePatch> {
  if (!provider.capabilities().vision) throw new Error(`${provider.id} has no vision`);
  const user = item.title ? `Filename/title: ${item.title}` : 'Describe the image.';
  const out = JSON.parse(await provider.complete({ system: DESCRIBE_IMAGE_SYSTEM, user, json: true, maxTokens: 300, images: [opts.image] }));
  const patch: DescribeImagePatch = { tags: cleanTags(out.tags) };
  if (typeof out.summary === 'string' && out.summary.trim()) {
    patch.summary = out.summary.trim();
    patch.meta = JSON.stringify({ ...(item.meta ? JSON.parse(item.meta) : {}), caption: patch.summary });
  }
  return patch;
}
