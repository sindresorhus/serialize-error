import {expectType, expectAssignable} from 'tsd';
import {
	serializeError,
	deserializeError,
	type ErrorObject,
	type Options,
} from './index.js';

const error = new Error('unicorn');

expectType<number>(serializeError(1));
expectType<ErrorObject>(serializeError(error));
expectAssignable<Options>({maxDepth: 1});

expectType<Error>(deserializeError({
	message: 'error message',
	stack: 'at <anonymous>:1:13',
	name: 'name',
	code: 'code',
}));
