import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    provider?: string;
    role?: string;
    permissions?: string[];
    preferredLanguage?: "es" | "en" | "pt";
    languageConfigured?: boolean;
    user: {
      id?: string;
      externalId?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    role?: string;
    permissions?: string[];
    accessToken?: string;
    externalId?: string;
    preferredLanguage?: "es" | "en" | "pt";
    languageConfigured?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    provider?: string;
    role?: string;
    permissions?: string[];
    externalId?: string;
    preferredLanguage?: "es" | "en" | "pt";
    languageConfigured?: boolean;
  }
}
