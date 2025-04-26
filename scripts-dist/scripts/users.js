#!/usr/bin/env ts-node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
const prisma_1 = require("@/lib/prisma");
const auth_password_1 = require("@/lib/server-only/auth-password");
async function createUser(email, password) {
    const hashed = await (0, auth_password_1.hashPassword)(password);
    const user = await prisma_1.prisma.user.create({
        data: { email, password: hashed },
    });
    console.log('User created:', user);
}
async function changePassword(email, password) {
    const hashed = await (0, auth_password_1.hashPassword)(password);
    const user = await prisma_1.prisma.user.update({
        where: { email },
        data: { password: hashed },
    });
    console.log('Password changed for:', user.email);
}
async function deleteUser(email) {
    await prisma_1.prisma.user.delete({ where: { email } });
    console.log('Deleted user:', email);
}
async function listUsers() {
    const users = await prisma_1.prisma.user.findMany();
    users.forEach(u => {
        console.log(`${u.id} | ${u.email}`);
    });
}
async function userInfo(email) {
    const user = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (!user)
        return console.log('User not found');
    console.log(user);
}
const cli = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
    .scriptName('users')
    .command('create <email> <password>', 'Create a new user', y => y
    .positional('email', { type: 'string', demandOption: true })
    .positional('password', { type: 'string', demandOption: true }), async (argv) => {
    await createUser(argv.email, argv.password);
    process.exit(0);
})
    .command('changepass <email> <password>', 'Change user password', y => y
    .positional('email', { type: 'string', demandOption: true })
    .positional('password', { type: 'string', demandOption: true }), async (argv) => {
    await changePassword(argv.email, argv.password);
    process.exit(0);
})
    .command('delete <email>', 'Delete a user', y => y.positional('email', { type: 'string', demandOption: true }), async (argv) => {
    await deleteUser(argv.email);
    process.exit(0);
})
    .command('list', 'List all users', {}, async () => {
    await listUsers();
    process.exit(0);
})
    .command('info <email>', 'Show user info', y => y.positional('email', { type: 'string', demandOption: true }), async (argv) => {
    await userInfo(argv.email);
    process.exit(0);
})
    .demandCommand()
    .help()
    .strict();
cli.parse();
