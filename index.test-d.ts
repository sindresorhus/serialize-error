import {expectTypeOf} from 'expect-type';
import {
	serializeError,
	deserializeError,
	type ErrorObject,
	type Options,
} from './index.js';

const error = new Error('unicorn');

expectTypeOf(serializeError(1)).toEqualTypeOf<number>();
expectTypeOf(serializeError(error as unknown)).toEqualTypeOf<unknown>();
expectTypeOf(serializeError(error)).toEqualTypeOf<ErrorObject>();
expectTypeOf({maxDepth: 1}).toMatchTypeOf<Options>();

expectTypeOf(deserializeError({
	message: 'error message',
	stack: 'at <anonymous>:1:13',
	name: 'name',
	code: 'code',
})).toEqualTypeOf<Error>();
