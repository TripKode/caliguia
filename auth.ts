import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import type { NextAuthConfig } from "next-auth"
import { prisma } from "@/lib/prisma"

const SUPPORTED_LANGUAGES = ["es", "en", "pt"] as const;
type PreferredLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function normalizeLanguage(value: unknown): PreferredLanguage {
    return SUPPORTED_LANGUAGES.includes(value as PreferredLanguage) ? value as PreferredLanguage : "es";
}

/**
 * Configuración de Auth.js v5 usando las API routes de Next.js y Prisma.
 */
export const authConfig = {
    secret: process.env.AUTH_SECRET,
    trustHost: true,
    pages: {
        signIn: '/auth', // Cambiado a /auth que es donde está la página de login
        signOut: '/auth',
        error: '/auth',
    },
    callbacks: {
        authorized({ auth }) {
            return true
        },
        async jwt({ token, user, account, trigger, session }) {
            // Sincronización inicial al iniciar sesión
            if (account && user) {
                console.log("[Auth] JWT Initial Login:", account.provider, user.email);
                if (account.provider === "google") {
                    try {
                        const externalId = `${account.provider}:${account.providerAccountId}`;
                        const dbUser = await (prisma.user as any).upsert({
                            where: { externalId },
                            update: {
                                email: user.email,
                                name: user.name,
                                displayName: user.name,
                                image: user.image,
                            },
                            create: {
                                externalId,
                                email: user.email,
                                name: user.name,
                                displayName: user.name,
                                image: user.image,
                                preferredLanguage: "es",
                                languageConfigured: false,
                                permissions: [],
                            },
                        });

                        await prisma.account.upsert({
                            where: {
                                provider_providerAccountId: {
                                    provider: account.provider,
                                    providerAccountId: account.providerAccountId,
                                },
                            },
                            update: {
                                access_token: account.access_token,
                                expires_at: account.expires_at,
                                id_token: account.id_token,
                                refresh_token: account.refresh_token,
                                scope: account.scope,
                                session_state: account.session_state as string | undefined,
                                token_type: account.token_type,
                                type: account.type,
                            },
                            create: {
                                userId: dbUser.id,
                                type: account.type,
                                provider: account.provider,
                                providerAccountId: account.providerAccountId,
                                access_token: account.access_token,
                                expires_at: account.expires_at,
                                id_token: account.id_token,
                                refresh_token: account.refresh_token,
                                scope: account.scope,
                                session_state: account.session_state as string | undefined,
                                token_type: account.token_type,
                            },
                        });

                        token.id = dbUser.id;
                        token.role = dbUser.role;
                        token.permissions = dbUser.permissions || [];
                        token.externalId = dbUser.externalId || externalId;
                        token.preferredLanguage = (dbUser.preferredLanguage || "es") as "es" | "en" | "pt";
                        token.languageConfigured = Boolean(dbUser.languageConfigured);
                        token.name = dbUser.displayName || dbUser.name || user.name || undefined;
                        token.picture = dbUser.image || user.image || undefined;
                    } catch (error) {
                        console.error("[Auth] Error sincronizando usuario google con Prisma:", error);
                    }
                }

                token.provider = account.provider;
                token.email = user.email ?? undefined;
                
                // Solo usamos los de Google como fallback si el token aún no tiene nada
                if (!token.name) token.name = user.name ?? undefined;
                if (!token.picture) token.picture = (user as any).picture || (user as any).image;

                console.log("[Auth] Token assigned role:", token.role);
            }

            // Manejo de actualización manual de sesión (session.update())
            if (trigger === "update" && session) {
                console.log("[Auth] JWT Session Update Triggered");
                if (session.role) token.role = session.role;
                if (session.permissions) token.permissions = session.permissions;
                if (session.user?.name) token.name = session.user.name;
                if (session.user?.image) token.picture = session.user.image;
                if (session.accessToken) token.accessToken = session.accessToken;
                if (session.preferredLanguage) token.preferredLanguage = session.preferredLanguage;
                if (typeof session.languageConfigured === "boolean") token.languageConfigured = session.languageConfigured;
            }

            const lookup = token.id
                ? { id: token.id as string }
                : token.email
                    ? { email: token.email as string }
                    : null;

            if (lookup) {
                const dbUser = await (prisma.user as any).findUnique({
                    where: lookup,
                    select: {
                        id: true,
                        role: true,
                        permissions: true,
                        externalId: true,
                        preferredLanguage: true,
                        languageConfigured: true,
                        displayName: true,
                        name: true,
                        image: true,
                    },
                }).catch(() => null);

                if (dbUser) {
                    token.id = dbUser.id;
                    token.role = dbUser.role;
                    token.permissions = dbUser.permissions || [];
                    token.externalId = dbUser.externalId;
                    token.preferredLanguage = normalizeLanguage(dbUser.preferredLanguage);
                    token.languageConfigured = Boolean(dbUser.languageConfigured);
                    token.name = dbUser.displayName || dbUser.name || token.name;
                    token.picture = dbUser.image || token.picture;
                }
            }

            return token;
        },
        async session({ session, token }) {
            if (session.user && token) {
                session.user.id = token.id as string
                session.user.externalId = token.externalId as string
                session.user.email = token.email as string
                session.user.name = token.name as string
                session.user.image = token.picture as string
                session.role = token.role as string
                session.accessToken = token.accessToken as string
                session.provider = token.provider as string
                session.permissions = (token.permissions as string[]) || []
                session.preferredLanguage = token.preferredLanguage as "es" | "en" | "pt"
                session.languageConfigured = Boolean(token.languageConfigured)

                console.log("[Auth] Session Role assigned:", session.role);
            }
            return session
        },
    },
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true, // Permite entrar con Google si ya existe la cuenta por email
        }),
    ],
} satisfies NextAuthConfig

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
