import mongoose from 'mongoose';
import { MongoResult } from '../types';

const reqString: mongoose.SchemaDefinitionProperty = {
	type: String,
	required: true,
};

const ServerSettingsSchema: mongoose.Schema<MongoResult> =
	new mongoose.Schema<MongoResult>({
		_id: reqString,
	});

const ServerSettings: mongoose.Model<MongoResult> = mongoose.model<MongoResult>(
	'ServerSettings',
	ServerSettingsSchema,
);

export { ServerSettings };