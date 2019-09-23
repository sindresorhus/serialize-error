import {Primitive, JsonObject} from 'type-fest';

declare namespace serializeError {
	type ErrorObject = {
		name?: string;
		stack?: string;
		message?: string;
		code?: string;
	} & JsonObject;

	const serializeError: {
		/**
		Serialize an error into a plain object.

		@example
		```
		import { serializeError } = require('serialize-error');

		const error = new Error('🦄');

		console.log(error);
		//=> [Error: 🦄]

		console.log(serializeError(error));
		//=> {name: 'Error', message: '🦄', stack: 'Error: 🦄\n    at Object.<anonymous> …'}
		```
		*/
		<ErrorType>(error: ErrorType): ErrorType extends Primitive
			? ErrorType
			: ErrorObject;
	};

	const deserializeError: {
		/**
		Deserialize into a plain object into an error.

		@example
		```
		import { deserializeError } = require('serialize-error');

		const error = deserializeError(errorObject);

		console.log(error);
		//=> Error: aaa
			at <anonymous>:1:13
		```
		*/
		(errorObject: ErrorObject): Error
	}
}

export = serializeError;
