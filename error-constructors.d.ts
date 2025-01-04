/**
Let `serialize-error` know about your custom error constructors so that when `{name: 'MyCustomError', message: 'It broke'}` is found, it uses the right error constructor. If "MyCustomError" isn't found in the global list of known constructors, it defaults to the base `Error` error constructor.

Warning: The constructor must work without any arguments or this function will throw.
*/

type BaseErrorConstructor = new (message?: string, ...arguments_: unknown[]) => Error;
declare function addKnownErrorConstructor(constructor: BaseErrorConstructor): void;

export {addKnownErrorConstructor};
