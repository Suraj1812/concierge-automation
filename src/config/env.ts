import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const emptyStringToUndefined = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const isProduction = process.env.NODE_ENV === "production";
const defaultJwtSecret = "dev-only-jwt-secret-change-before-production-123456789";
const defaultOpenAiKey = "dev-openai-key";
const defaultAutomationApiKey = "dev-automation-key-change-me";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_PORT: z.coerce.number().int().positive().default(4000),
  APP_NAME: z.string().default("AI Concierge System"),
  APP_BASE_URL: z.string().url().default("http://localhost:4000"),
  DEFAULT_TENANT_SLUG: z.string().min(2).default("default"),
  DEFAULT_TENANT_NAME: z.string().min(2).default("Default Tenant"),
  AUTOMATION_API_KEY: z.preprocess(
    emptyStringToUndefined,
    isProduction
      ? z.string().min(24)
      : z.string().min(12).default(defaultAutomationApiKey)
  ),
  JWT_SECRET: z.preprocess(
    emptyStringToUndefined,
    isProduction
      ? z.string().min(32)
      : z.string().min(32).default(defaultJwtSecret)
  ),
  JWT_EXPIRES_IN: z.string().default("8h"),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(8),
  ADMIN_NAME: z.string().min(2),
  MONGODB_URI: z.string().min(1),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(""),
  OPENAI_API_KEY: z.preprocess(
    emptyStringToUndefined,
    isProduction
      ? z.string().min(1)
      : z.string().min(1).default(defaultOpenAiKey)
  ),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_APP_SECRET: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_API_VERSION: z.string().default("v21.0"),
  VENDOR_WEBHOOK_SECRET: z.string().min(1),
  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1),
  PDF_STORAGE_PATH: z.string().default("storage/proposals"),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().email().default("luxury.concierge@example.com"),
  EMAIL_WEBHOOK_SECRET: z.string().min(1).default("email-webhook-secret"),
  DEFAULT_CURRENCY: z.string().default("INR"),
  MAX_VENDOR_RETRY_ATTEMPTS: z.coerce.number().int().positive().default(3),
  VENDOR_RESPONSE_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(180),
  PAYMENT_LINK_EXPIRY_MINUTES: z.coerce.number().int().positive().default(30),
  MAX_PAYMENT_RETRY_ATTEMPTS: z.coerce.number().int().positive().default(3),
  CUSTOMER_FOLLOW_UP_MINUTES: z.coerce.number().int().positive().default(180),
  SERVICE_REMINDER_HOURS_BEFORE: z.coerce.number().int().min(0).default(24),
  POST_SERVICE_FOLLOW_UP_HOURS_AFTER: z.coerce.number().int().min(0).default(6),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
  LOG_LEVEL: z.string().default("info")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
  throw new Error(`Environment validation failed: ${issues}`);
}

export const env = parsed.data;
