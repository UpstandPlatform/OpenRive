// Request and response schemas for the REST API. The route handlers parse with
// these, and the CLI/MCP client parses responses with them, so both sides agree.
import { z } from 'zod';
import { projectMetaSchema, roleSchema, userSchema } from './types';

/** Maximum size accepted for a .riv payload at any HTTP/MCP boundary. */
export const MAX_RIV_BYTES = 100 * 1024 * 1024;
/** Base64 expands binary data by four characters for every three bytes. */
export const MAX_RIV_BASE64_CHARS = Math.ceil(MAX_RIV_BYTES / 3) * 4;
/** Serialized editor documents are JSON, not arbitrary file uploads. */
export const MAX_DOC_CHARS = 64 * 1024 * 1024;
/** Thumbnails are data URLs and should remain small relative to the file. */
export const MAX_THUMBNAIL_CHARS = 4 * 1024 * 1024;

const docString = z.string().min(2, 'doc must be a serialized document').max(MAX_DOC_CHARS, 'doc is too large');
const base64 = z.string().base64().max(MAX_RIV_BASE64_CHARS, 'riv is too large').optional();
const thumbnail = z.string().max(MAX_THUMBNAIL_CHARS, 'thumbnail is too large').optional();

export const projectStatsSchema = z.object({
  artboards: z.number().int().nonnegative().optional(),
  animations: z.number().int().nonnegative().optional(),
  stateMachines: z.number().int().nonnegative().optional(),
});

export const createProjectSchema = projectStatsSchema.extend({
  name: z.string().trim().min(1).max(200).default('Untitled'),
  ownerId: z.string().default(''),
  doc: docString,
  riv: base64,
  thumbnail,
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = projectStatsSchema.extend({
  name: z.string().trim().min(1).max(200).optional(),
  doc: docString.optional(),
  riv: base64,
  thumbnail,
  ownerId: z.string().optional(),
  sharedWith: z.array(z.string().max(100)).max(1000).optional(),
  /** Optimistic concurrency token supplied by the editor/API client. */
  expectedUpdatedAt: z.number().int().nonnegative().optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const duplicateProjectSchema = z.object({ ownerId: z.string().default('') });

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: roleSchema.default('editor'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  role: roleSchema.optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const projectDocSchema = z.object({ meta: projectMetaSchema, doc: z.unknown().nullable() });
export const healthSchema = z.object({
  ok: z.boolean(),
  storage: z.string(),
  edition: z.enum(['local', 'self_hosted', 'cloud']).optional(),
  objectStorage: z.enum(['disabled', 'ready']).optional(),
  redis: z.enum(['disabled', 'ready']).optional(),
  error: z.string().optional(),
});
export const usersSchema = z.array(userSchema);
export const projectsSchema = z.array(projectMetaSchema);

/** Turns a zod error into one readable line for API responses and CLI output. */
export function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
}

// ---------------------------------------------------------------------------
// Accounts (self-hosted sign-in)

// Signing in and signing up are Better Auth's own endpoints under /api/auth,
// which validate their own input. What is left here is what an administrator
// does from the dashboard or the CLI.

export const adminCreateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: z.string().trim().email().optional().or(z.literal('')),
    password: z.string().min(8).max(200).optional().or(z.literal('')),
    role: roleSchema.default('editor'),
  })
  // the email is what an account signs in with, so a password needs one
  .refine((input) => !input.password || !!input.email, { path: ['email'], message: 'An account with a password needs an email' });

export const adminUpdateUserSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  password: z.string().min(8).max(200).optional().or(z.literal('')),
  role: roleSchema.optional(),
  disabled: z.boolean().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const accountSchema = userSchema.extend({
  email: z.string().nullable(),
  disabled: z.boolean(),
  lastLoginAt: z.number().nullable(),
  hasPassword: z.boolean(),
});

export const sessionInfoSchema = z.object({
  authEnabled: z.boolean(),
  needsSetup: z.boolean(),
  user: accountSchema.nullable(),
});
