import {expectType} from 'tsd';
import serializeError = require('.');
import {ErrorObject} from '.';

const error = new Error('unicorn');

expectType<number>(serializeError(1));
expectType<ErrorObject>(serializeError(error));

class CustomError extends Error
{
	public readonly code: number;
	public readonly type: string;
	
    public constructor(code: number, type: string, message: string)
    {
        super(message);
        this.code = code;
        this.type = type;
    }
	public toJSON(): object
	{
		return {
			name: this.name, stack: this.stack, message: this.message,
			code: this.code, type: this.type
		};
	}
}

const custom = new CustomError(100, "Some Type", "Some Message");
if (JSON.stringify(custom) !== JSON.stringify(serializeError(custom)))
    throw new Error("serializeError failed to using Object.toJSON() method.");