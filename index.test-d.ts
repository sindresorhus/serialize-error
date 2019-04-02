import {expectType} from 'tsd';
import serializeError = require('.');
import {ErrorObject} from '.';

const error = new Error('unicorn');

expectType<number>(serializeError(1));
expectType<ErrorObject>(serializeError(error));
