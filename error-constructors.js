const list = [
	// Native ES errors https://262.ecma-international.org/12.0/#sec-well-known-intrinsic-objects
	EvalError,
	RangeError,
	ReferenceError,
	SyntaxError,
	TypeError,
	URIError,

	// Browser-specific errors
	globalThis.DOMException,

	// Node-specific errors
	// https://nodejs.org/api/errors.html
	globalThis.AssertionError,
	globalThis.SystemError,
]
	.filter(Boolean)
	.map(
		constructor => [constructor.name, constructor],
	);

const errorConstructors = new Map(list);

export default errorConstructors;
