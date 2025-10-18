import NonError from 'non-error';
import {errorConstructors} from './error-constructors.js';

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
			to[key] = serialize ? '[object Buffer]' : value;
			continue;
		}

		if (value !== null && typeof value === 'object' && typeof value.pipe === 'function') {
			to[key] = serialize ? '[object Stream]' : value;
			continue;
		}

		if (typeof value === 'function') {
			if (!serialize) {
				to[key] = value;
			}

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
		value = '<Function>';
	}

	return destroyCircular({
		from: new NonError(value),
		seen: [],
		forceEnumerable: true,
		maxDepth,
		depth: 0,
		useToJSON,
		serialize: true,
	});
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
export {default as NonError} from 'non-error';
