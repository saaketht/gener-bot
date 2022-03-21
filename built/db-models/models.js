"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerSettings = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const reqString = {
    type: String,
    required: true,
};
const ServerSettingsSchema = new mongoose_1.default.Schema({
    _id: reqString,
});
const ServerSettings = mongoose_1.default.model('<table-name>', ServerSettingsSchema);
exports.ServerSettings = ServerSettings;
