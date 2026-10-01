const list = [
	// Native ES errors https://262.ecma-international.org/12.0/#sec-well-known-intrinsic-objects
	Error,
	EvalError,
	RangeError,
	ReferenceError,
	SyntaxError,
	TypeError,
	URIError,
	AggregateError,

	// Built-in errors
	globalThis.DOMException,

	// Node-specific errors
	// https://nodejs.org/api/errors.html
	globalThis.AssertionError,
	globalThis.SystemError,
]
	// Non-native Errors are used with `globalThis` because they might be missing. This filter drops them when undefined.
	.filter(Boolean)
	.map(constructor => [constructor.name, constructor]);

export const errorConstructors = new Map(list);
export const errorFactories = new Map();

// `instanceof` is realm-bound, so an error built in another realm, such as in a `vm` context, fails it. `Error.isError()` is a real brand check that holds across realms. `addKnownErrorConstructor()` accepts such a constructor, and `deserializeError()` then has to recognize what it builds from one, so both sides share this instead of each writing their own.
// `instanceof` still comes first, since `Error.isError()` rejects an instance of a legacy constructor that only inherits from `Error.prototype`, such as one set up with `util.inherits()`, which must keep working.
// Engines without `Error.isError()` fall back to `Object.prototype.toString`, which also holds across realms but which a `Symbol.toStringTag` can fake.
// eslint-disable-next-line no-use-extend-native/no-use-extend-native -- `Error.isError()` is native, the rule does not know it yet
export const isErrorInstance = value => value instanceof Error || (Error.isError?.(value) ?? Object.prototype.toString.call(value) === '[object Error]');

export function addKnownErrorConstructor(constructor, factory) {
	let instance;
	let resolvedName;

	if (typeof constructor !== 'function') {
		throw new TypeError('Constructor must be a function');
	}

	if (factory && typeof factory !== 'function') {
		throw new TypeError('Factory must be a function');
	}

	// Prove the pair can produce an instance, reading the name inside the guard so a throwing getter keeps this context
	try {
		instance = factory ? factory() : new constructor();
		resolvedName = instance.name;
	} catch (error) {
		const subject = factory ? 'Factory' : `Constructor "${constructor.name}"`;
		throw new Error(`${subject} is not compatible`, {cause: error});
	}

	// A factory can stand in for a constructor it is not, which would put the wrong prototype on the result
	if (factory && !(instance instanceof constructor)) {
		throw new TypeError('Factory must return an instance of the constructor');
	}

	// `deserializeError()` is typed as returning an `Error`, and this check gates the non-enumerable error properties
	if (!isErrorInstance(instance)) {
		throw new TypeError('Constructor must produce an instance of `Error`');
	}

	// `deserializeError()` adds the payload's properties to the instance, which a frozen or sealed one cannot take
	if (!Object.isExtensible(instance)) {
		throw new TypeError('Constructor must produce an extensible instance');
	}

	if (!resolvedName || typeof resolvedName !== 'string') {
		throw new TypeError('Error instances must have a non-empty string "name" property');
	}

	// `newError()` always returns a real `NonError` for this name, so registering it would be silently ignored
	if (resolvedName === 'NonError') {
		throw new Error('Error constructor name "NonError" is reserved');
	}

	if (errorConstructors.has(resolvedName)) {
		throw new Error(`Error constructor "${resolvedName}" is already known`);
	}

	errorConstructors.set(resolvedName, constructor);
	if (factory) {
		errorFactories.set(resolvedName, factory);
	}
}
