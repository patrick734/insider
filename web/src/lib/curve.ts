/** The key curve, mirrored from InsiderKeys.sol so prices show without a chain read. All values in wei. */
const P0 = 2_000_000_000_000_000n; // 0.002 ETH
const ALPHA = 150_000_000_000_000n; // 0.00015 ETH
const BETA = 2_000_000_000_000n; // 0.000002 ETH
const CAP = 40n;
export const BASE_FEE_BPS = 800n;
export const FLIP_FEE_BPS = 400n;

const sumSquares = (n: bigint) => (n === 0n ? 0n : ((n - 1n) * n * (2n * n - 1n)) / 6n);
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max = (a: bigint, b: bigint) => (a > b ? a : b);

export function priceAt(supply: bigint): bigint {
  const q = min(supply, CAP);
  return P0 + ALPHA * supply + BETA * q * q;
}

export function curveCost(supply: bigint, amount: bigint): bigint {
  if (amount === 0n) return 0n;
  const end = supply + amount;
  const linear = amount * supply + (amount * (amount - 1n)) / 2n;
  let squares = sumSquares(min(end, CAP)) - sumSquares(min(supply, CAP));
  squares += (max(end, CAP) - max(supply, CAP)) * CAP * CAP;
  return amount * P0 + ALPHA * linear + BETA * squares;
}

export const buyTotal = (supply: bigint, amount: bigint) => {
  const p = curveCost(supply, amount);
  return p + (p * BASE_FEE_BPS) / 10_000n;
};

export const sellNet = (supply: bigint, amount: bigint, flipBps = 0n) => {
  if (amount > supply) return 0n;
  const p = curveCost(supply - amount, amount);
  return p - (p * (BASE_FEE_BPS + flipBps)) / 10_000n;
};

/** Max keys per buy: 5, and no more than 10% of supply (at least 1). */
export const maxBuy = (supply: bigint) => {
  const tenth = supply / 10n;
  return Number(min(max(tenth, 1n), 5n));
};
