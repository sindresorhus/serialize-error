import {expectTypeOf} from 'expect-type';
import {
	serializeError,
	deserializeError,
	isErrorLike,
	addKnownErrorConstructor,
	NonError,
	type ErrorObject,
	type ErrorLike,
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
expectTypeOf({maxDepth: 1}).toExtend<Options>();

expectTypeOf(deserializeError({
	message: 'error message',
	stack: 'at <anonymous>:1:13',
	name: 'name',
	code: 'code',
})).toEqualTypeOf<Error>();

class CustomError extends Error {
	name = 'CustomError';
}
addKnownErrorConstructor(CustomError);

class FactoryError extends Error {
	name = 'FactoryError';
}
addKnownErrorConstructor(FactoryError, () => new FactoryError());

expectTypeOf(new NonError('test')).toEqualTypeOf<NonError>();
expectTypeOf(NonError.isNonError(new NonError('test'))).toEqualTypeOf<boolean>();

// A constructor that requires an argument must not be registrable without a factory.
class NeedsArgument extends Error {
	name = 'NeedsArgument';
	detail: string;

	constructor(message: string) {
		super(message);
		this.detail = 'required';
	}
}

// @ts-expect-error a constructor that needs arguments requires a factory
addKnownErrorConstructor(NeedsArgument);
expectTypeOf(addKnownErrorConstructor).toBeCallableWith(NeedsArgument, () => new NeedsArgument('m'));

// A no-argument constructor takes no factory.
class NoArgument extends Error {
	name = 'NoArgument';
}
addKnownErrorConstructor(NoArgument);

// Checked without calling, since registering the same name twice throws at runtime.
expectTypeOf(addKnownErrorConstructor).toBeCallableWith(NoArgument, () => new NoArgument());

// A non-Error class must be rejected.
class NotAnError {
	name = 'NotAnError';
}

// @ts-expect-error the constructor must produce an `Error`
addKnownErrorConstructor(NotAnError);

// A non-function must be rejected.
// @ts-expect-error the constructor must be a function
addKnownErrorConstructor(42);

// @ts-expect-error the factory must be a function
addKnownErrorConstructor(NoArgument, 'not a function');

// The factory must return an instance of the constructor at runtime. TypeScript cannot enforce this,
// because two error classes with the same shape are structurally assignable, so it stays a runtime check.
class Other extends Error {
	name = 'Other';
}
expectTypeOf(addKnownErrorConstructor).toBeCallableWith(NoArgument, () => new Other());

// `deserializeError` always returns an `Error`.
expectTypeOf(deserializeError({message: 'm'})).toEqualTypeOf<Error>();
expectTypeOf(deserializeError(undefined)).toEqualTypeOf<Error>();
expectTypeOf(deserializeError(null)).toEqualTypeOf<Error>();
expectTypeOf(deserializeError(42)).toEqualTypeOf<Error>();
expectTypeOf(deserializeError([])).toEqualTypeOf<Error>();

// `serializeError` always returns an `ErrorObject`.
expectTypeOf(serializeError(undefined)).toEqualTypeOf<ErrorObject>();
expectTypeOf(serializeError({})).toEqualTypeOf<ErrorObject>();
expectTypeOf(serializeError([], {maxDepth: 2})).toEqualTypeOf<ErrorObject>();

// Options are constrained.
// @ts-expect-error maxDepth must be a number
serializeError(new Error('m'), {maxDepth: 'deep'});

/* eslint-disable @typescript-eslint/naming-convention -- The public option name */
// @ts-expect-error useToJSON must be a boolean
serializeError(new Error('m'), {useToJSON: 'yes'});
/* eslint-enable @typescript-eslint/naming-convention */

// @ts-expect-error unknown options are rejected
serializeError(new Error('m'), {unknownOption: true});

// `isErrorLike` narrows to `ErrorLike`.
const maybe = JSON.parse('{}') as unknown;
if (isErrorLike(maybe)) {
	expectTypeOf(maybe).toEqualTypeOf<ErrorLike>();
	expectTypeOf(maybe.name).toBeString();
	expectTypeOf(maybe.message).toBeString();
	expectTypeOf(maybe.stack).toBeString();
}

// `ErrorLike` and `Options` are exported for consumers.
/* eslint-disable-next-line @typescript-eslint/naming-convention -- The public option name */
expectTypeOf({maxDepth: 1, useToJSON: false}).toExtend<Options>();
expectTypeOf(new NonError('x')).toExtend<Error>();
