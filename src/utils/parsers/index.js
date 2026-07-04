import * as czbooks from './czbooks';
import * as twkan from './twkan';
import * as wyblogs from './wyblogs';
import * as blogspot from './blogspot';

export const parsers = [
    czbooks,
    twkan,
    wyblogs,
    blogspot
];

export const getParserForUrl = (url) => {
    return parsers.find(p => url && url.includes(p.domain)) || czbooks; // Fallback to czbooks
};

export const searchAll = async (keyword) => {
    // Run search across all parsers concurrently
    const promises = parsers.map(p => typeof p.search === 'function' ? p.search(keyword).catch(() => []) : Promise.resolve([]));
    const results = await Promise.all(promises);
    return results.flat();
};
