# serialize-error [![Build Status](https://travis-ci.org/sindresorhus/serialize-error.svg?branch=master)](https://travis-ci.org/sindresorhus/serialize-error)

> Serialize/deserialize an error into a plain object

Useful if you for example need to `JSON.stringify()` or `process.send()` the error.  This library works in the browser and Node.js

## Install

```
$ npm install serialize-error
```

## Usage

```js
const {serialize, deserialize} = require('serialize-error');
const serializeError = serialize({});
const deserializeError = deserialize({});

const error = new Error('🦄');

console.log(error);
//=> [Error: 🦄]

const serialized = serializeError(error)

console.log(serialized);
//=> {name: 'Error', message: '🦄', stack: 'Error: 🦄\n    at Object.<anonymous> …'}

const deserialized = deserializeError(serialized);
//=> [Error: 🦄]
```

## Browser Use
Use a <a href="https://github.com/feross/buffer">polyfill for `Buffer`</a>.
## Options
By default Buffers are not converted to strings.

To configure Buffers to be converted to strings:
```js
const {serialize, deserialize} = require('serialize-error');
const serializeError = serialize({ serializeError: { buffer: { toString: true } } } );
const deserializeError = deserialize({});

const err = new Error('🦄');
err.buffer = Buffer.from('ABC', 'utf8');

console.log(serializeError(err).buffer);
//=>  [ 65, 66, 67 ]
```

If you wish to override the UTF-8 encoding, use one of the encodings supported by Buffer.toString ('hex', 'base64', 'latin1', etc.)
```js
const {serialize, deserialize} = require('serialize-error');
const serializeError = serialize({ serializeError: { buffer: { toStringEncoding: 'hex' } } });
const deserializeError = deserialize({});

const err = new Error('🦄');
err.buffer = Buffer.from('ABC', 'utf8');

console.log(serializeError(err).buffer);
//=>  0daa
```

## API

### serializeError(value)

Type: `Error | unknown`

Serialize an `Error` object into a plain object.

Non-error values are passed through.
Custom properties are preserved.
Circular references are handled.

### deserializeError(value)

Type: `{[key: string]: unknown} | unknown`

Deserialize a plain object or any value into an `Error` object.

`Error` objects are passed through.
Non-error values are wrapped in a `NonError` error.
Custom properties are preserved.
Circular references are handled.
