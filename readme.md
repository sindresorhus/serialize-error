# serialize-error [![Build Status](https://travis-ci.org/sindresorhus/serialize-error.svg?branch=master)](https://travis-ci.org/sindresorhus/serialize-error)

> Serialize an error into a plain object

Useful if you for example need to `JSON.stringify()` or `process.send()` the error.


## Install

```
$ npm install serialize-error
```


## Usage

```js
const { serializeError, deserializeError } = require('serialize-error');

const error = new Error('🦄');

console.log(error);
//=> [Error: 🦄]

const serialized = serializeError(error)

console.log(serialized);
//=> {name: 'Error', message: '🦄', stack: 'Error: 🦄\n    at Object.<anonymous> …'}

const deserialized = deserializeError(serialized);
//=> [Error: 🦄]
```

## License

MIT © [Sindre Sorhus](https://sindresorhus.com)
