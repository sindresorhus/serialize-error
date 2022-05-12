import {Primitive, JsonObject} from 'type-fest';

export {default as errorConstructors} from './error-constructors.js';

export type ErrorObject = {
	name?: string;
	message?: string;
	stack?: string;
	cause?: unknown;
	code?: string;
} & JsonObject;

export type ErrorLike = {
	[key: string]: unknown;
	name: string;
	message: string;
	stack: string;
	cause?: unknown;
	code?: string;
};

export interface Options {
	/**
	The maximum depth of properties to preserve when serializing/deserializing.

	@default Number.POSITIVE_INFINITY

	@example
	```
	import {serializeError} from 'serialize-error';

	const error = new Error('🦄');
	error.one = {two: {three: {}}};

	console.log(serializeError(error, {maxDepth: 1}));
	//=> {name: 'Error', message: '…', one: {}}

	console.log(serializeError(error, {maxDepth: 2}));
	//=> {name: 'Error', message: '…', one: { two: {}}}
	```
	*/
	readonly maxDepth?: number;

	/**
	Indicate whether to use a `.toJSON()` method if encountered in the object. This is useful when a custom error implements its own serialization logic via `.toJSON()` but you prefer to not use it.

	@default true
	*/
	readonly useToJSON?: boolean;
}

/**
Serialize an `Error` object into a plain object.

- Non-error values are passed through.
- Custom properties are preserved.
- Buffer properties are replaced with `[object Buffer]`.
- Circular references are handled.
- If the input object has a `.toJSON()` method, then it's called instead of serializing the object's properties.
- It's up to `.toJSON()` implementation to handle circular references and enumerability of the properties.

@example
```
import {serializeError} from 'serialize-error';

const error = new Error('🦄');

console.log(error);
//=> [Error: 🦄]

console.log(serializeError(error));
//=> {name: 'Error', message: '🦄', stack: 'Error: 🦄\n    at Object.<anonymous> …'}
```

@example
```
import {serializeError} from 'serialize-error';

class ErrorWithDate extends Error {
	constructor() {
		super();
		this.date = new Date();
	}
}

const error = new ErrorWithDate();

console.log(serializeError(error));
//=> {date: '1970-01-01T00:00:00.000Z', name, message, stack}
```

@example
```
import {serializeError} from 'serialize-error';

const error = new Error('Unicorn');

error.horn = {
	toJSON() {
		return 'x';
	}
};

serializeError(error);
// => {horn: 'x', name, message, stack}
```
*/
export function serializeError<ErrorType>(error: ErrorType, options?: Options): ErrorType extends Primitive
	? ErrorType
	: ErrorObject;

/**
Deserialize a plain object or any value into an `Error` object.

- `Error` objects are passed through.
- Objects that have at least a `message` property are interpreted as errors.
- All other values are wrapped in a `NonError` error.
- Custom properties are preserved.
- Non-enumerable properties are kept non-enumerable (name, message, stack, cause).
- Enumerable properties are kept enumerable (all properties besides the non-enumerable ones).
- Circular references are handled.
- Native error constructors are preserved (TypeError, DOMException, etc) and more can be added.

@example
```
import {deserializeError} from 'serialize-error';

const error = deserializeError({
	message: 'aaa',
	stack: 'at <anonymous>:1:13'
});

console.log(error);
// Error: aaa
// at <anonymous>:1:13
```
*/
export function deserializeError(errorObject: ErrorObject | unknown, options?: Options): Error;

/**
Predicate to determine whether a value looks like an error, even if it's not an instance of `Error`. It must have at least the `name`, `message`, and `stack` properties.

@example
```
import {isErrorLike} from 'serialize-error';

const error = new Error('🦄');
error.one = {two: {three: {}}};

isErrorLike({
	name: 'DOMException',
	message: 'It happened',
	stack: 'at foo (index.js:2:9)',
});
//=> true

isErrorLike(new Error('🦄'));
//=> true

isErrorLike(serializeError(new Error('🦄'));
//=> true

isErrorLike({
	name: 'Bluberricious pancakes',
	stack: 12,
	ingredients: 'Blueberry',
});
//=> false
```
*/
export function isErrorLike(value: unknown): value is ErrorLike;
