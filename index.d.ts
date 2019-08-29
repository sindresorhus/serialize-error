import {Primitive, JsonObject} from 'type-fest';

declare namespace serializeError {
	type ErrorObject = {
		name?: string;
		stack?: string;
		message?: string;
		code?: string;
	} & JsonObject;
}

declare const serializeError: {
	/**
	Serialize an error into a plain object.

	@example
	```
	import serializeError = require('serialize-error');

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
	*/
	<ErrorType>(error: ErrorType): ErrorType extends Primitive
		? ErrorType
		: serializeError.ErrorObject;

	// TODO: Remove this for the next major release, refactor the whole definition to:
	// declare function serializeError<ErrorType>(
	// 	error: ErrorType
	// ): ErrorType extends Primitive ? ErrorType : ErrorObject;
	// export = serializeError;
	default: typeof serializeError;
};

export = serializeError;
