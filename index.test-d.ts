import {expectType} from 'tsd-check';
import serializeError, {ErrorObject} from '.';

const error = new Error('unicorn');

expectType<number>(serializeError(1));
expectType<ErrorObject>(serializeError(error));
