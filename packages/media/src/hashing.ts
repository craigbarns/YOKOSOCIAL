import { createHash } from "node:crypto";

import sharp from "sharp";

export function sha256(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function differenceHash(buffer: Uint8Array): Promise<string> {
  const { data } = await sharp(buffer)
    .rotate()
    .resize(9, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = "";
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const index = row * 9 + column;
      bits += (data[index] ?? 0) > (data[index + 1] ?? 0) ? "1" : "0";
    }
  }

  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
}

export function perceptualDistance(left: string, right: string): number {
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right)) {
    throw new Error("Un hash perceptuel doit contenir exactement 16 caractères hexadécimaux.");
  }
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;
  while (value > 0n) {
    distance += Number(value & 1n);
    value >>= 1n;
  }
  return distance;
}

export type DuplicateCandidate = {
  id: string;
  sha256: string;
  perceptualHash?: string;
};

export function findDuplicates(
  candidate: DuplicateCandidate,
  existing: DuplicateCandidate[],
  perceptualThreshold = 8
): { exact: DuplicateCandidate[]; similar: Array<DuplicateCandidate & { distance: number }> } {
  const exact = existing.filter((item) => item.sha256 === candidate.sha256);
  const similar = candidate.perceptualHash
    ? existing
        .filter((item) => item.sha256 !== candidate.sha256 && item.perceptualHash)
        .map((item) => ({
          ...item,
          distance: perceptualDistance(candidate.perceptualHash!, item.perceptualHash!)
        }))
        .filter((item) => item.distance <= perceptualThreshold)
        .sort((a, b) => a.distance - b.distance)
    : [];

  return { exact, similar };
}
