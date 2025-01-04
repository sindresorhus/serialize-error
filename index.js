import {errorConstructors} from './error-constructors.js';

export class NonError extends Error {
	name = 'NonError';

	constructor(message) {
		super(NonError._prepareSuperMessage(message));
	}

	static _prepareSuperMessage(message) {
		try {
			return JSON.stringify(message);
		} catch {
			return String(message);
		}
	}
}

const errorProperties = [
	{
		property: 'name',
		enumerable: false,
	},
	{
		property: 'message',
		enumerable: false,
	},
	{
		property: 'stack',
		enumerable: false,
	},
	{
		property: 'code',
		enumerable: true,
	},
	{
		property: 'cause',
		enumerable: false,
	},
	{
		property: 'errors',
		enumerable: false,
	},
];

const toJsonWasCalled = new WeakSet();

const toJSON = from => {
	toJsonWasCalled.add(from);
	const json = from.toJSON();
	toJsonWasCalled.delete(from);
	return json;
};

const newError = name => {
	const ErrorConstructor = errorConstructors.get(name) ?? Error;
	return ErrorConstructor === AggregateError
		? new ErrorConstructor([])
		: new ErrorConstructor();
};

// eslint-disable-next-line complexity
const destroyCircular = ({
	from,
	seen,
	to,
	forceEnumerable,
	maxDepth,
	depth,
	useToJSON,
	serialize,
}) => {
	if (!to) {
		if (Array.isArray(from)) {
			to = [];
		} else if (!serialize && isErrorLike(from)) {
			to = newError(from.name);
		} else {
			to = {};
		}
	}

	seen.push(from);

	if (depth >= maxDepth) {
		return to;
	}

	if (useToJSON && typeof from.toJSON === 'function' && !toJsonWasCalled.has(from)) {
		return toJSON(from);
	}

	const continueDestroyCircular = value => destroyCircular({
		from: value,
		seen: [...seen],
		forceEnumerable,
		maxDepth,
		depth,
		useToJSON,
		serialize,
	});

	for (const [key, value] of Object.entries(from)) {
		if (value && value instanceof Uint8Array && value.constructor.name === 'Buffer') {
			to[key] = '[object Buffer]';
			continue;
		}

		// TODO: Use `stream.isReadable()` when targeting Node.js 18.
		if (value !== null && typeof value === 'object' && typeof value.pipe === 'function') {
			to[key] = '[object Stream]';
			continue;
		}

		if (typeof value === 'function') {
			continue;
		}

		if (!value || typeof value !== 'object') {
			// Gracefully handle non-configurable errors like `DOMException`.
			try {
				to[key] = value;
			} catch {}

			continue;
		}

		if (!seen.includes(from[key])) {
			depth++;
			to[key] = continueDestroyCircular(from[key]);

			continue;
		}

		to[key] = '[Circular]';
	}

	if (serialize || to instanceof Error) {
		for (const {property, enumerable} of errorProperties) {
			if (from[property] !== undefined && from[property] !== null) {
				Object.defineProperty(to, property, {
					value: isErrorLike(from[property]) || Array.isArray(from[property])
						? continueDestroyCircular(from[property])
						: from[property],
					enumerable: forceEnumerable ? true : enumerable,
					configurable: true,
					writable: true,
				});
			}
		}
	}

	return to;
};

export function serializeError(value, options = {}) {
	const {
		maxDepth = Number.POSITIVE_INFINITY,
		useToJSON = true,
	} = options;

	if (typeof value === 'object' && value !== null) {
		return destroyCircular({
			from: value,
			seen: [],
			forceEnumerable: true,
			maxDepth,
			depth: 0,
			useToJSON,
			serialize: true,
		});
	}

	// People sometimes throw things besides Error objects…
	if (typeof value === 'function') {
		// `JSON.stringify()` discards functions. We do too, unless a function is thrown directly.
		// We intentionally use `||` because `.name` is an empty string for anonymous functions.
		return `[Function: ${value.name || 'anonymous'}]`;
	}

	return value;
}

export function deserializeError(value, options = {}) {
	const {maxDepth = Number.POSITIVE_INFINITY} = options;

	if (value instanceof Error) {
		return value;
	}

	if (isMinimumViableSerializedError(value)) {
		return destroyCircular({
			from: value,
			seen: [],
			to: newError(value.name),
			maxDepth,
			depth: 0,
			serialize: false,
		});
	}

	return new NonError(value);
}

export function isErrorLike(value) {
	return Boolean(value)
	&& typeof value === 'object'
	&& typeof value.name === 'string'
	&& typeof value.message === 'string'
	&& typeof value.stack === 'string';
}

// Used as a weak check for immediately-passed objects, whereas `isErrorLike` is used for nested values to avoid bad detection
function isMinimumViableSerializedError(value) {
	return Boolean(value)
	&& typeof value === 'object'
	&& typeof value.message === 'string'
	&& !Array.isArray(value);
}

export {addKnownErrorConstructor} from './error-constructors.js';
