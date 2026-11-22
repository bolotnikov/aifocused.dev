import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { localeCodes } from './i18n/locales';

const articleImage = z.object({ src: z.string().min(1), alt: z.string().min(1) });

const articles = defineCollection({
	loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/articles' }),
	schema: z.object({
		locale: z.enum(localeCodes),
		translationKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
		title: z.string().min(1),
		cardTitle: z.string().min(1).optional(),
		subtitle: z.string().min(1).optional(),
		description: z.string().min(1),
		pubDate: z.coerce.date(),
		draft: z.boolean().default(false),
		cover: articleImage.optional(),
		video: z.object({
			youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
			title: z.string().min(1),
		}).optional(),
		preview: articleImage.optional(),
	}),
});

export const collections = { articles };
