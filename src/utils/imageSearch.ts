import logger from './logger';

/**
 * Image search wrapper — currently uses Brave Search API.
 *
 * To swap providers, replace the fetch call and map the response to return
 * an image URL string. Expected provider response shape (Brave):
 *   { results: [{ properties: { url: string } }, ...] }
 *
 * Other providers and their equivalents:
 *   Google Custom Search: response.items[0].link
 *   Bing Image Search:    response.value[0].contentUrl
 *   SerpAPI:              response.images_results[0].original
 */
export async function searchImage(query: string, index?: number): Promise<string | null> {
	const res = await fetch(`https://api.search.brave.com/res/v1/images/search?${new URLSearchParams({
		q: query,
		count: '200',
		safesearch: 'off',
	})}`, {
		headers: { 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY! },
	});

	if (!res.ok) throw new Error(`Image search API returned ${res.status}`);
	const data = await res.json();

	if (!data.results?.length) return null;

	const pick = index !== undefined
		? Math.min(index, data.results.length - 1)
		: Math.floor(Math.random() * data.results.length);

	const url = data.results[pick].properties.url;
	logger.debug(`image search result: ${url}, index: ${pick}/${data.results.length}`);
	return url;
}
