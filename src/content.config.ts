import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { localeCodes } from './i18n/locales';

const articles = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
	schema: z.object({
		locale: z.enum(localeCodes),
		translationKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
		title: z.string().min(1),
		description: z.string().min(1),
		pubDate: z.coerce.date(),
		draft: z.boolean().default(false),
		cover: z.object({
			src: z.string().min(1),
			alt: z.string().min(1),
		}).optional(),
	}),
});

export const collections = { articles };
