// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { locales } from './src/i18n/locales';

export default defineConfig({
	site: 'https://aifocused.dev',
	output: 'static',
	trailingSlash: 'always',
	devToolbar: { enabled: false },
	markdown: {
		shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
	},
	integrations: [
		sitemap({ i18n: { defaultLocale: 'en', locales: Object.fromEntries(locales.map(({ code }) => [code, code])) } }),
	],
});
