import mongoose from 'mongoose';
import { DatabaseRepository } from './@types/bot';

class MongoDb implements DatabaseRepository {
	db: mongoose.Connection;
	constructor(uri: string) {
		mongoose.connect(uri, { keepAlive: true });
		this.db = mongoose.connection;
		this.db.on('error', console.error.bind(console, 'connection error: '));
		this.db.once('open', function() {
			console.log('Connected to MongoDB successfully');
		});
	}
}
export default MongoDb;