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

// including Date properties
error.time = new Date(0);
console.log(serializeError(error));
//=> {name: 'Error', message: '🦄', time: 1970-01-01T00:00:00.000Z, stack: 'Error: 🦄\n    at Object.<anonymous> …'}
```


## License

MIT © [Sindre Sorhus](https://sindresorhus.com)
