import {Primitive, JsonObject} from 'type-fest';

export type ErrorObject = {
	name?: string;
	stack?: string;
	message?: string;
	code?: string;
} & JsonObject;

/**
Serialize an error into a plain object.

@example
```
import serializeError from 'serialize-error';

const error = new Error('🦄');

console.log(error);
//=> [Error: 🦄]

console.log(serializeError(error));
//=> {name: 'Error', message: '🦄', stack: 'Error: 🦄\n    at Object.<anonymous> …'}
```
*/
export default function serializeError<ErrorType>(error: ErrorType): ErrorType extends Primitive ? ErrorType : ErrorObject;
