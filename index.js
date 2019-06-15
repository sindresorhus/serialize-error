'use strict';

const destroyCircular = (from, seen, maxDepth, depth) => {
	const to = Array.isArray(from) ? [] : {};

	seen.push(from);

	if (depth === maxDepth) {
		return to;
	}

	for (const [key, value] of Object.entries(from)) {
		depth++;

		if (typeof value === 'function') {
			continue;
		}

		if (!value || typeof value !== 'object') {
			to[key] = value;
			continue;
		}

		if (!seen.includes(from[key])) {
			to[key] = destroyCircular(from[key], seen.slice(), maxDepth, depth);
			continue;
		}

		to[key] = '[Circular]';
	}

	const commonProperties = [
		'name',
		'message',
		'stack',
		'code'
	];

	for (const property of commonProperties) {
		if (typeof from[property] === 'string') {
			to[property] = from[property];
		}
	}

	return to;
};

const serializeError = (value, options = {}) => {
	const {maxDepth = Infinity} = options;

	if (typeof value === 'object') {
		return destroyCircular(value, [], maxDepth, 0);
	}

	// People sometimes throw things besides Error objects…
	if (typeof value === 'function') {
		// `JSON.stringify()` discards functions. We do too, unless a function is thrown directly.
		return `[Function: ${(value.name || 'anonymous')}]`;
	}

	return value;
};

module.exports = serializeError;
// TODO: Remove this for the next major release
module.exports.default = serializeError;
