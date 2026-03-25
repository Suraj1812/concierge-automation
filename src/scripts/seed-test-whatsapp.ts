import { connectDatabase, disconnectDatabase } from "../infrastructure/db/mongoose";
import { runWithTenantContext } from "../infrastructure/tenancy/tenant-context";
import { buildResolvedTenantConfig } from "../modules/tenants/runtime-config";
import { customerService, tenantService } from "../container";
import { logger } from "../infrastructure/logging/logger";

const normalizePhone = (value: string): string => {
  const trimmed = value.trim();
  const digitsOnly = trimmed.replace(/[^\d+]/g, "");

  if (digitsOnly.startsWith("+")) {
    return `+${digitsOnly.slice(1).replace(/\D/g, "")}`;
  }

  return `+${digitsOnly.replace(/\D/g, "")}`;
};

const main = async (): Promise<void> => {
  const rawPhone = process.argv[2] || process.env.TEST_WHATSAPP_RECIPIENT;
  const rawName = process.argv[3] || process.env.TEST_WHATSAPP_NAME;

  if (!rawPhone) {
    throw new Error("Provide a WhatsApp number as the first argument or set TEST_WHATSAPP_RECIPIENT in .env");
  }

  const phone = normalizePhone(rawPhone);

  await connectDatabase();

  try {
    const tenant = await tenantService.seedDefaultTenant();
    const tenantId = String((tenant as unknown as { _id?: unknown })._id || (tenant as unknown as { id?: string }).id);

    const customer = await runWithTenantContext(
      {
        tenantId,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        tenantConfig: buildResolvedTenantConfig(tenant)
      },
      async () => customerService.upsertFromWhatsApp({
        phone,
        name: rawName
      })
    );

    logger.info("Seeded WhatsApp test customer", {
      customerId: String((customer as unknown as { _id?: unknown })._id || (customer as unknown as { id?: string }).id),
      phone,
      name: customer.name,
      tenantId
    });

    process.stdout.write(`Seeded WhatsApp test customer: ${phone}\n`);
  } finally {
    await disconnectDatabase();
  }
};

void main().catch((error) => {
  logger.error("Failed to seed WhatsApp test customer", { error });
  process.exit(1);
});
