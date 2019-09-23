import {expectType} from 'tsd';
import {ErrorObject, serializeError, deserializeError} from '.';

const error = new Error('unicorn');

expectType<number>(serializeError(1));
expectType<ErrorObject>(serializeError(error));

expectType<Error>(deserializeError({
	message: 'error message',
	stack: 'at <anonymous>:1:13',
	name: 'name',
	code: 'code'
}));
