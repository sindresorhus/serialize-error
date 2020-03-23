'use strict';

class NonError extends Error {
	constructor(message) {
		super(NonError._prepareSuperMessage(message));
		this.name = 'NonError';

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, NonError);
		}
	}

	static _prepareSuperMessage(message) {
		try {
			return JSON.stringify(message);
		} catch (_) {
			return String(message);
		}
	}
}

const commonProperties = [
	'name',
	'message',
	'stack',
	'code'
];

const destroyCircular = (from, seen, to_, options) => {
	const to = to_ || (Array.isArray(from) ? [] : {});

	seen.push(from);

	for (const [key, value] of Object.entries(from)) {
		let bufferSubstitutedValue = value;
		if (value instanceof Buffer) {
			bufferSubstitutedValue = getBufferValue(value, options);
		}

		if (typeof bufferSubstitutedValue === 'function') {
			continue;
		}

		if (bufferSubstitutedValue !== value || !bufferSubstitutedValue || typeof bufferSubstitutedValue !== 'object') {
			to[key] = bufferSubstitutedValue;
			continue;
		}

		if (!seen.includes(from[key])) {
			to[key] = destroyCircular(from[key], seen.slice(), null, options);
			continue;
		}

		to[key] = '[Circular]';
	}

	for (const property of commonProperties) {
		if (typeof from[property] === 'string') {
			to[property] = from[property];
		}
	}

	return to;
};

const getBufferValue = (value, options) => {
	if (options && options.serializeError && options.serializeError.buffer && options.serializeError.buffer.toStringEncoding) {
		return value.toString(options.serializeError.buffer.toStringEncoding);
	}

	if (options && options.serializeError && options.serializeError.buffer && options.serializeError.buffer.toString) {
		return value.toString();
	}

	return [...value];
};

const serialize = options => value => {
	let bufferSubstitutedValue = value;
	if (value instanceof Buffer) {
		bufferSubstitutedValue = getBufferValue(bufferSubstitutedValue, options);
	}

	if (bufferSubstitutedValue === value && typeof bufferSubstitutedValue === 'object' && bufferSubstitutedValue !== null) {
		return destroyCircular(bufferSubstitutedValue, [], null, options);
	}

	// People sometimes throw things besides Error objects…
	if (typeof bufferSubstitutedValue === 'function') {
		// `JSON.stringify()` discards functions. We do too, unless a function is thrown directly.
		return `[Function: ${(bufferSubstitutedValue.name || 'anonymous')}]`;
	}

	return bufferSubstitutedValue;
};

const deserialize = () => value => {
	if (value instanceof Error) {
		return value;
	}

	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		const newError = new Error();
		destroyCircular(value, [], newError);
		return newError;
	}

	return new NonError(value);
};

module.exports = {
	serialize,
	deserialize
};
