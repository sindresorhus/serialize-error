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

## API

### serializeError(value, options?)

Type: `Error | unknown`

Serialize an `Error` object into a plain object.

- Non-error values are passed through.
- Custom properties are preserved.
- Non-enumerable properties are kept non-enumerable (name, message, stack).
- Enumerable properties are kept enumerable (all properties besides the non-enumerable ones).
- Buffer properties are replaced with `[object Buffer]`.
- Circular references are handled.
- If the input object has a `.toJSON()` method, then it's called instead of serializing the object's properties.
- It's up to `.toJSON()` implementation to handle circular references and enumerability of the properties.

`.toJSON` examples:

```js
import {serializeError} from 'serialize-error';

class ErrorWithDate extends Error {
	constructor() {
		super();
		this.date = new Date();
	}
}

const error = new ErrorWithDate();

serializeError(error);
// => {date: '1970-01-01T00:00:00.000Z', name, message, stack}
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
// => {horn: 'x', name, message, stack}
```

### deserializeError(value, options?)

Type: `{[key: string]: unknown} | unknown`

Deserialize a plain object or any value into an `Error` object.

- `Error` objects are passed through.
- Non-error values are wrapped in a `NonError` error.
- Custom properties are preserved.
- Non-enumerable properties are kept non-enumerable (name, message, stack, cause).
- Enumerable properties are kept enumerable (all properties besides the non-enumerable ones).
- Circular references are handled.

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
//=> {name: 'Error', message: '…', one: {}}

console.log(serializeError(error, {maxDepth: 2}));
//=> {name: 'Error', message: '…', one: { two: {}}}
```

### isErrorLike(value)

Predicate to determine whether a value looks like an error, even if it's not an instance of `Error`. It must have at least the `name`, `message`, and `stack` properties.

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

isErrorLike(serializeError(new Error('🦄'));
//=> true

isErrorLike({
	name: 'Bluberricious pancakes',
	stack: 12,
	ingredients: 'Blueberry',
});
//=> false
```
