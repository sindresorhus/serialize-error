import NonError from 'non-error';
import {errorConstructors, errorFactories, isErrorInstance} from './error-constructors.js';

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

	try {
		return from.toJSON();
	} finally {
		toJsonWasCalled.delete(from);
	}
};

// Some errors expose getter-only properties that cannot be assigned to, like `DOMException.prototype.code`
const setProperty = (to, key, value) => {
	try {
		to[key] = value;
	} catch {}
};

// Derived from the descriptors so the two property loops always agree on which names they own.
const errorPropertyNames = new Set(errorProperties.map(({property}) => property));

const newError = name => {
	if (name === 'NonError') {
		return new NonError();
	}

	const factory = errorFactories.get(name);
	if (factory) {
		return factory();
	}

	const ErrorConstructor = errorConstructors.get(name) ?? Error;
	return ErrorConstructor === AggregateError
		? new ErrorConstructor([])
		: new ErrorConstructor();
};

// Returned for values that must not be copied, such as functions when serializing
const skip = Symbol('skip');

// Converts a single property value into its serialized form.
// Shared by the regular properties and the error properties so both get the same conversions.
// Reads `options` lazily rather than destructuring it, because this runs for every property of every object.
const destroyValue = (value, options, depth) => {
	if (value && value instanceof Uint8Array && value.constructor?.name === 'Buffer') {
		return options.serialize ? '[object Buffer]' : value;
	}

	// Every stream is also an `EventEmitter`, so requiring `on` keeps plain objects that merely define `pipe` from being mistaken for one
	if (value !== null && typeof value === 'object' && typeof value.pipe === 'function' && typeof value.on === 'function') {
		return options.serialize ? '[object Stream]' : value;
	}

	if (typeof value === 'function') {
		return options.serialize ? skip : value;
	}

	if (options.serialize && typeof value === 'bigint') {
		return `${value}n`;
	}

	if (!value || typeof value !== 'object') {
		return value;
	}

	if (options.seen.has(value)) {
		return '[Circular]';
	}

	// Recursing through `destroyCircular` directly, rather than through a per-call wrapper, keeps the stack depth per level unchanged
	return destroyCircular({
		...options,
		from: value,
		to: undefined,
		depth,
	});
};

const createTarget = (from, serialize) => {
	if (Array.isArray(from)) {
		return [];
	}

	if (!serialize && isErrorLike(from)) {
		return newError(from.name);
	}

	return {};
};

// Some errors have non-configurable properties that cannot be redefined.
// `addKnownErrorConstructor()` rejects a non-extensible instance, so a property `to` does not have yet can be added. That is only checked on the first call, and a constructor that freezes its instance later is unsupported.
const canRedefine = (to, property) => Object.getOwnPropertyDescriptor(to, property)?.configurable !== false;

// Returned when a speculative read throws, so the property is skipped rather than written as `undefined`
const unreadable = Symbol('unreadable');

// The error property names are probed on every value walked, including plain objects that are not errors, and through
// the prototype chain, since `name` lives on `Error.prototype`. `JSON.stringify()` reads neither a non-enumerable nor
// an inherited property, so a getter on one of these would otherwise take the whole call down over a property it would
// never have read either. The regular property loop below is left alone, since it only reads keys `JSON.stringify()`
// reads too, and a throwing getter there propagates the same way it does natively.
const readProperty = (from, property) => {
	try {
		return from[property];
	} catch {
		return unreadable;
	}
};

// An error property the source did not set, which must not be invented. An own `null` or `undefined` is kept, because the source set it deliberately and `null` survives `JSON.stringify`.
// It does not have to be enumerable. `new Error('m', {cause: null})` and `deserializeError()` both set a non-enumerable one, and requiring enumerability lost it on a round trip.
// Takes the already-read value, so the property is only read once.
const isAbsent = (from, property, value) =>
	(value === undefined || value === null) && !Object.hasOwn(from, property);

const destroyCircular = options => {
	const {
		from,
		seen,
		forceEnumerable,
		maxDepth,
		depth,
		useToJSON,
		serialize,
	} = options;

	const to = options.to ?? createTarget(from, serialize);

	seen.add(from);

	if (depth >= maxDepth) {
		seen.delete(from);
		return to;
	}

	if (useToJSON && typeof from.toJSON === 'function' && !toJsonWasCalled.has(from)) {
		const json = toJSON(from);

		// A `toJSON()` returning its own receiver is a no-op, so keep serializing instead of handing back the original object
		if (json !== from) {
			seen.delete(from);
			return json;
		}
	}

	// Only a serialized result or a real error gets the error properties below. A nested plain object keeps these
	// names through the loop that follows instead, which is why that loop only steps aside in this case.
	// A registered constructor can come from another realm, so this cannot be a plain `instanceof`.
	const copyErrorProperties = serialize || isErrorInstance(to);

	// Copies error properties first; JavaScript still enumerates array-index keys before them. This also applies to nested plain objects when serializing.
	if (copyErrorProperties) {
		for (const {property, enumerable} of errorProperties) {
			const rawValue = readProperty(from, property);
			if (rawValue === unreadable || isAbsent(from, property, rawValue)) {
				continue;
			}

			const value = destroyValue(rawValue, options, depth + 1);
			if (value === skip) {
				continue;
			}

			if (!canRedefine(to, property)) {
				setProperty(to, property, value);
				continue;
			}

			Object.defineProperty(to, property, {
				value,
				enumerable: forceEnumerable || enumerable,
				configurable: true,
				writable: true,
			});
		}
	}

	for (const key of Object.keys(from)) {
		// `JSON.parse` makes `__proto__` an own enumerable property, and assigning it would replace the prototype instead of adding a property
		if (key === '__proto__') {
			continue;
		}

		// Copying these here as well would destroy them twice, running getters and `toJSON()` twice
		if (copyErrorProperties && errorPropertyNames.has(key)) {
			continue;
		}

		const value = destroyValue(from[key], options, depth + 1);
		if (value !== skip) {
			setProperty(to, key, value);
		}
	}

	seen.delete(from);
	return to;
};

export function serializeError(value, options = {}) {
	const {
		maxDepth = Number.POSITIVE_INFINITY,
		useToJSON = true,
	} = options;

	// People sometimes throw things besides Error objects…
	if (typeof value !== 'object' || value === null) {
		value = new NonError(typeof value === 'function' ? '<Function>' : value);
	}

	return destroyCircular({
		from: value,
		seen: new Set(),
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
			seen: new Set(),
			to: newError(value.name),
			maxDepth,
			depth: 0,
			serialize: false,
		});
	}

	return new NonError(value);
}

export function isErrorLike(value) {
	// A predicate answers yes or no, and this runs on every nested value while deserializing, so a getter on one of
	// the three names must not escape as an exception.
	return Boolean(value)
		&& typeof value === 'object'
		&& typeof readProperty(value, 'name') === 'string'
		&& typeof readProperty(value, 'message') === 'string'
		&& typeof readProperty(value, 'stack') === 'string';
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
