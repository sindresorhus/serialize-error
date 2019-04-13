import {expectError, expectType} from 'tsd';
import serializeError = require('.');
import {ErrorObject, SerializeOptions} from '.';

const error = new Error('unicorn');

expectType<number>(serializeError(1));
expectType<ErrorObject>(serializeError(error));
expectError(() => {
  serializeError(error, {maxDepth: 'string'});
});
serializeError(error, {maxDepth: 1});
