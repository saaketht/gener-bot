"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
class MongoDb {
    constructor(uri) {
        mongoose_1.default.connect(uri, { keepAlive: true });
        this.db = mongoose_1.default.connection;
        this.db.on('error', console.error.bind(console, 'connection error: '));
        this.db.once('open', function () {
            console.log('Connected to MongoDB successfully');
        });
    }
}
exports.default = MongoDb;
