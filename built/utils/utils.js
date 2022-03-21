"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readMessageEvents = exports.readEvents = exports.readCommands = void 0;
const glob_1 = __importDefault(require("glob"));
const readCommands = async () => {
    const commands = [];
    let res;
    if (process.env.NODE_ENV === 'prod') {
        res = glob_1.default.sync('**/*.js', {
            cwd: `${process.cwd()}/commands/`,
        });
    }
    else {
        res = res = glob_1.default.sync('**/*.ts', {
            cwd: `${process.cwd()}/commands/`,
        });
    }
    for (const file of res) {
        const fileNoExt = file.substring(0, file.length - 3);
        const command = (await Promise.resolve().then(() => __importStar(require(`../commands/${fileNoExt}`))))
            .default;
        // Set a new item in the Collection
        commands.push(command);
    }
    return commands;
};
exports.readCommands = readCommands;
const readEvents = async () => {
    const events = [];
    let res;
    if (process.env.NODE_ENV === 'prod') {
        res = glob_1.default.sync('**/*.js', {
            cwd: `${process.cwd()}/events/`,
        });
    }
    else {
        res = res = glob_1.default.sync('**/*.ts', {
            cwd: `${process.cwd()}/events/`,
        });
    }
    for (const file of res) {
        const fileNoExt = file.substring(0, file.length - 3);
        const event = (await Promise.resolve().then(() => __importStar(require(`../events/${fileNoExt}`))))
            .default;
        // Set a new item in the Collection
        events.push(event);
    }
    return events;
};
exports.readEvents = readEvents;
const readMessageEvents = async () => {
    const messageEvents = [];
    let res;
    if (process.env.NODE_ENV === 'prod') {
        res = glob_1.default.sync('**/*.js', {
            cwd: `${process.cwd()}/message-events/`,
        });
    }
    else {
        res = res = glob_1.default.sync('**/*.ts', {
            cwd: `${process.cwd()}/message-events/`,
        });
    }
    for (const file of res) {
        const fileNoExt = file.substring(0, file.length - 3);
        const messageEvent = (await Promise.resolve().then(() => __importStar(require(`../message-events/${fileNoExt}`))))
            .default;
        messageEvents.push(messageEvent);
    }
    return messageEvents;
};
exports.readMessageEvents = readMessageEvents;
