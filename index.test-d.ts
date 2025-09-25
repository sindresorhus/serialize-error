import {expectTypeOf} from 'expect-type';
import {
	serializeError,
	deserializeError,
	addKnownErrorConstructor,
	type ErrorObject,
	type Options,
} from './index.js';

const error = new Error('unicorn');

expectTypeOf(serializeError(1)).toEqualTypeOf<ErrorObject>();
expectTypeOf(serializeError('hello')).toEqualTypeOf<ErrorObject>();
expectTypeOf(serializeError(true)).toEqualTypeOf<ErrorObject>();
expectTypeOf(serializeError(undefined)).toEqualTypeOf<ErrorObject>();
expectTypeOf(serializeError(null)).toEqualTypeOf<ErrorObject>();
// eslint-disable-next-line @typescript-eslint/no-empty-function
expectTypeOf(serializeError(() => {})).toEqualTypeOf<ErrorObject>();
expectTypeOf(serializeError(error as unknown)).toEqualTypeOf<ErrorObject>();
expectTypeOf(serializeError(error)).toEqualTypeOf<ErrorObject>();
expectTypeOf({maxDepth: 1}).toMatchTypeOf<Options>();

expectTypeOf(deserializeError({
	message: 'error message',
	stack: 'at <anonymous>:1:13',
	name: 'name',
	code: 'code',
})).toEqualTypeOf<Error>();

addKnownErrorConstructor(Error);

class CustomError extends Error {}
addKnownErrorConstructor(CustomError);
