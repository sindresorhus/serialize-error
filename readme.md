# serialize-error [![Build Status](https://travis-ci.org/sindresorhus/serialize-error.svg?branch=master)](https://travis-ci.org/sindresorhus/serialize-error)

> Serialize an error into a plain object

Useful if you for example need to `JSON.stringify()` or `process.send()` the error.


## Install

```
$ npm install serialize-error
```


## Usage

```js
const serializeError = require('serialize-error');

const error = new Error('🦄');

console.log(error);
//=> [Error: 🦄]

console.log(serializeError(error));
//=> {name: 'Error', message: '🦄', stack: 'Error: 🦄\n    at Object.<anonymous> …'}

// Passing `maxDepth` will limit how deep we will copy the error object
const nestedError = {...error, a: {b: 'c'}};
console.log(serializeError(nestedError), {maxDepth: 1});
//=> {name: 'Error', message: 'oops', stack: stack: 'Error: 🦄\n    at Object.<anonymous> …', a: {} }
```

## API

### serialize(error, options?)

#### error

Type: `Error`

An error object.

#### options

Type: `object`

##### maxDepth

Type: `number`<br>
Default: `Infinity`

Specify a maximum depth on the serialized error object.


## License

MIT © [Sindre Sorhus](https://sindresorhus.com)
