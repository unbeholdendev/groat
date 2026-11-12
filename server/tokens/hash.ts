export const hashToken = (token: string) => new Bun.CryptoHasher("sha256").update(token).digest("hex");
