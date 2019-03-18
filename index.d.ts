import {Primitive, JsonObject} from 'type-fest';

export type ErrorObject = {
	name?: string;
	stack?: string;
	message?: string;
	code?: string;
} & JsonObject;

/**
Serialize an error into a plain object.
*/
export default function serializeError<ErrorType>(error: ErrorType): ErrorType extends Primitive ? ErrorType : ErrorObject;
