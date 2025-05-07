// This file disables NextAuth.js middleware to prevent URL parsing errors on Vercel
// Ref: https://next-auth.js.org/configuration/nextjs#advanced-usage

/** @type {import('next-auth').NextAuthConfig} */
export const nextAuthConfig = {
  // Disable the built-in middleware
  useMiddleware: false,
}
