'use strict';

const destroyCircular = (from, seen) => {
	const to = Array.isArray(from) ? [] : {};

	seen.push(from);

	// TODO: Use `Object.entries() when targeting Node.js 8
	for (const key of Object.keys(from)) {
		const value = from[key];

		if (typeof value === 'function') {
			continue;
		}

		if (!value || typeof value !== 'object') {
			to[key] = value;
			continue;
		}

		if (!seen.includes(from[key])) {
			to[key] = destroyCircular(from[key], seen.slice());
			continue;
		}

		to[key] = '[Circular]';
	}

	const commonProperties = ['name', 'message', 'stack', 'code'];

	for (const property of commonProperties) {
		if (typeof from[property] === 'string') {
			to[property] = from[property];
		}
	}

	return to;
};

module.exports = value => {
	if (typeof value === 'object') {
		return destroyCircular(value, []);
	}

	// People sometimes throw things besides Error objects…
	if (typeof value === 'function') {
		// JSON.stringify discards functions. We do too, unless a function is thrown directly.
		return `[Function: ${(value.name || 'anonymous')}]`;
	}

	return value;
};
