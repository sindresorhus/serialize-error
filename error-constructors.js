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

export function addKnownErrorConstructor(constructor, factory) {
	let instance;
	let resolvedName;

	if (factory) {
		if (typeof factory !== 'function') {
			throw new TypeError('Factory must be a function');
		}

		// Verify factory can execute without throwing
		try {
			instance = factory();
		} catch (error) {
			throw new Error('Factory is not compatible', {cause: error});
		}

		if (!(instance instanceof constructor)) {
			throw new TypeError('Factory must return an instance of the constructor');
		}

		resolvedName = instance.name;
	} else {
		try {
			instance = new constructor();
		} catch (error) {
			throw new Error(`Constructor "${constructor.name}" is not compatible`, {cause: error});
		}

		resolvedName = instance.name;
	}

	if (!resolvedName || typeof resolvedName !== 'string') {
		throw new TypeError('Error instances must have a non-empty string "name" property');
	}

	if (errorConstructors.has(resolvedName)) {
		throw new Error(`Error constructor "${resolvedName}" is already known`);
	}

	errorConstructors.set(resolvedName, constructor);
	if (factory) {
		errorFactories.set(resolvedName, factory);
	}
}
