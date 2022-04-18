/**
Map of error constructors to recreate from the serialize `name` property. If the name is not found in this map, the errors will be deserialized as simple `Error` instances.

Warning: Only simple and standard error constructors are supported, like `new MyCustomError(name)`. If your error constructor *requires* a second parameter or does not accept a string as first parameter, adding it to this map *will* break the deserialization.
*/
declare const errorConstructors: Map<string, ErrorConstructor>;

export default errorConstructors;
