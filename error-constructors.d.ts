export type ErrorFactory<T extends Error> = () => T;

/**
Let `serialize-error` know about your custom error constructors so that when `{name: 'MyCustomError', message: 'It broke'}` is found, it uses the right error constructor. If "MyCustomError" isn't found in the global list of known constructors, it defaults to the base `Error` error constructor.

@param constructor - The error constructor to add.
@param factory - Optional factory function to create instances. Required if the constructor doesn't work without arguments.

@example
```
// Simple constructor that works without arguments
addKnownErrorConstructor(MyError);

// Constructor that requires arguments with factory function
class CustomError extends Error {
	constructor(message, options = {}) {
		super(message);
		this.name = 'CustomError';
		this.code = options.code ?? 'UNKNOWN';
	}
}

// Use a factory function to provide default arguments
addKnownErrorConstructor(CustomError, () => new CustomError('', {code: 'ERR_UNICORN'}));
```
*/
export function addKnownErrorConstructor<T extends Error>(
	constructor: new (...arguments_: any[]) => T,
	factory?: ErrorFactory<T>
): void;
