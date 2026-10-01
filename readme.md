# serialize-error

> Serialize/deserialize an error into a plain object

Useful if you for example need to `JSON.stringify()` or `process.send()` the error.

## Install

```sh
npm install serialize-error
```

## Usage

```js
import {serializeError, deserializeError} from 'serialize-error';

const error = new Error('🦄');

console.log(error);
//=> [Error: 🦄]

const serialized = serializeError(error);

console.log(serialized);
//=> {name: 'Error', message: '🦄', stack: 'Error: 🦄\n    at Object.<anonymous> …'}

const deserialized = deserializeError(serialized);

console.log(deserialized);
//=> [Error: 🦄]
```

### Error constructors

When a serialized error with a known `name` is encountered, it will be deserialized using the corresponding error constructor, while unknown error names will be deserialized as regular errors:

```js
import {deserializeError} from 'serialize-error';

const known = deserializeError({
	name: 'TypeError',
	message: '🦄'
});

console.log(known);
//=> [TypeError: 🦄] <-- Still a TypeError

const unknown = deserializeError({
	name: 'TooManyCooksError',
	message: '🦄'
});

console.log(unknown);
//=> [Error: 🦄] <-- Just a regular Error
```

The [list of known errors](./error-constructors.js) can be extended globally. This also works if `serialize-error` is a sub-dependency that's not used directly, as long as the project ends up with a single physical copy of the package. Registrations live in that copy's module state, so a duplicate, which is easy to end up with through version skew or a nested install, keeps its own separate list and does not see them.

```js
import {addKnownErrorConstructor} from 'serialize-error';
import {MyCustomError} from './errors.js'

addKnownErrorConstructor(MyCustomError);
```

For error constructors that require arguments, you can provide a factory function:

```js
import {addKnownErrorConstructor} from 'serialize-error';

class CustomError extends Error {
	name = 'CustomError';

	constructor(message, options) {
		super(message);
		this.code = options.code;
	}
}

addKnownErrorConstructor(CustomError, () => new CustomError('', {code: 'ERR_UNICORN'}));
```

The constructor, or the factory if given, must return an extensible `Error` instance, since the payload's properties are added to it.

## API

### serializeError(value, options?)

Serialize an `Error` object into a plain object.

- Custom properties are preserved.
- All properties are made enumerable (`name`, `message`, `stack`, `cause`, `errors`), so the result survives `JSON.stringify()`.
- Primitive values (including `null`, `undefined`, strings, numbers, etc.) and functions are wrapped in a `NonError` error and serialized.
- Buffer properties are replaced with `[object Buffer]`.
- Stream properties are replaced with `[object Stream]`.
- Circular references are handled.
- If the input object has a `.toJSON()` method, then it's called instead of serializing the object's properties.
- A `.toJSON()` that returns the object it received is ignored, since that would hand back the original rather than a copy.
- It's up to `.toJSON()` implementation to handle circular references and enumerability of the properties.

### value

Type: `Error | unknown`

### toJSON implementation examples

```js
import {serializeError} from 'serialize-error';

class ErrorWithDate extends Error {
	constructor() {
		super();
		this.date = new Date(0);
	}
}

const error = new ErrorWithDate();

console.log(serializeError(error));
//=> {name, message, stack, date: '1970-01-01T00:00:00.000Z'}
```

```js
import {serializeError} from 'serialize-error';

const error = new Error('Unicorn');

error.horn = {
	toJSON() {
		return 'x';
	}
};

serializeError(error);
// => {name, message, stack, horn: 'x'}
```

### deserializeError(value, options?)

Deserialize a plain object or any value into an `Error` object.

- `Error` objects are passed through.
- Objects with a string `message` property are interpreted as errors. Arrays never are, even with a `message` property.
- All other values are wrapped in a `NonError` error.
- Custom properties are preserved.
- Non-enumerable properties are kept non-enumerable (`name`, `message`, `stack`, `cause`, `errors`).
- Enumerable properties are kept enumerable (all properties besides the non-enumerable ones).
- Circular references are handled.
- [Native error constructors](./error-constructors.js) are preserved (TypeError, DOMException, etc) and [more can be added.](#error-constructors)

### value

Type: `{message: string} | unknown`

### options

Type: `object`

#### maxDepth

Type: `number`\
Default: `Number.POSITIVE_INFINITY`

The maximum depth of properties to preserve when serializing/deserializing.

```js
import {serializeError} from 'serialize-error';

const error = new Error('🦄');
error.one = {two: {three: {}}};

console.log(serializeError(error, {maxDepth: 1}));
//=> {name: 'Error', message: '🦄', stack: 'Error: 🦄\n    at Object.<anonymous> …', one: {}}

console.log(serializeError(error, {maxDepth: 2}));
//=> {name: 'Error', message: '🦄', stack: 'Error: 🦄\n    at Object.<anonymous> …', one: { two: {} }}
```

#### useToJSON

Type: `boolean`\
Default: `true`

Indicate whether to use a `.toJSON()` method if encountered in the object. This is useful when a custom error implements [its own serialization logic via `.toJSON()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#tojson_behavior) but you prefer to not use it.

### isErrorLike(value)

Predicate to determine whether a value looks like an error, even if it's not an instance of `Error`. It must be an object with string `name`, `message`, and `stack` properties.

```js
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

isErrorLike(serializeError(new Error('🦄')));
//=> true

isErrorLike({
	name: 'Bluberricious pancakes',
	stack: 12,
	ingredients: 'Blueberry',
});
//=> false
```

## Limitations

- Deep nesting can overflow the call stack. Set `maxDepth` to limit recursion.
- `Map`, `Set`, `RegExp`, `ArrayBuffer`, and `DataView` serialize as empty objects.
- `toJSON()` results are returned as-is and may be primitives. They must handle their own circular references and BigInts. `useToJSON` only applies to serialization.
- Getters and registered constructors/factories can throw. Registered constructors/factories must consistently return extensible errors.
- Nested objects with both `pipe()` and `on()` methods are treated as streams.
- `DOMException` usually deserializes as a plain `Error` because its `name` differs from its constructor name.
- Serialization may reorder properties, including those of nested plain objects.
- Deserialized errors have non-enumerable error properties. Call `serializeError()` before passing them to `JSON.stringify()`.
