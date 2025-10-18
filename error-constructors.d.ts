export type ErrorFactory<T extends Error> = () => T;

/**
Let `serialize-error` know about your custom error constructors so that when `{name: 'MyCustomError', message: 'It broke'}` is found, it uses the right error constructor. If "MyCustomError" isn't found in the global list of known constructors, it defaults to the base `Error` error constructor.

@param constructor - The error constructor to add.
@param factory - Factory function to create instances. Optional if the constructor can be called without arguments, required if it needs arguments.

@example
```
// Constructor that works without arguments - factory is optional
addKnownErrorConstructor(Error);
addKnownErrorConstructor(TypeError);

class MyError extends Error {
	name = 'MyError';

	constructor(message?: string) {
		super(message);
		this.name = 'MyError';
	}
}
addKnownErrorConstructor(MyError);

// Constructor that requires arguments - factory is required
class CustomError extends Error {
	name = 'CustomError';

	constructor(message: string, options: {code: string}) {
		super(message);
		this.code = options.code;
	}
}
addKnownErrorConstructor(CustomError, () => new CustomError('', {code: 'ERR_UNICORN'}));
```
*/
export function addKnownErrorConstructor<T extends Error>(
	constructor: new () => T,
	factory?: ErrorFactory<T>
): void;
export function addKnownErrorConstructor<T extends Error>(
	constructor: new (...arguments_: [any, ...any[]]) => T,
	factory: ErrorFactory<T>
): void;
