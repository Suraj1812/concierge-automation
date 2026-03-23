import crypto from "crypto";

export const createHmacSha256 = (secret: string, payload: string | Buffer): string =>
  crypto.createHmac("sha256", secret).update(payload).digest("hex");

export const safeEqual = (a: string, b: string): boolean => {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufferA, bufferB);
};

export const sha256 = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");
