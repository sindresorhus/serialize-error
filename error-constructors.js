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

export function addKnownErrorConstructor(constructor) {
	let instance;
	try {
		instance = new constructor();
	} catch (error) {
		throw new Error(`The error constructor "${constructor.name}" is not compatible`, {cause: error});
	}

	const {name} = instance;
	if (errorConstructors.has(name)) {
		throw new Error(`The error constructor "${name}" is already known.`);
	}

	errorConstructors.set(name, constructor);
}
