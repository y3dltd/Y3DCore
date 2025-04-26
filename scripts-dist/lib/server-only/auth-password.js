"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPassword = exports.hashPassword = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// NOTE: These functions are currently only used for DB compatibility
// in the mock auth setup, not for active security checks.
const SALT_ROUNDS = 10;
// Function to hash a password (Node.js only)
async function hashPassword(password) {
    const hashedPassword = await bcryptjs_1.default.hash(password, SALT_ROUNDS);
    return hashedPassword;
}
exports.hashPassword = hashPassword;
// Function to verify a password (Node.js only)
async function verifyPassword(password, hashedPassword) {
    const isValid = await bcryptjs_1.default.compare(password, hashedPassword);
    return isValid;
}
exports.verifyPassword = verifyPassword;
