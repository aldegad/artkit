interface PointerPressureLike {
  pointerType?: string;
  pressure?: number;
}

export function normalizePressureValue(pressure: number | undefined): number {
  return Number.isFinite(pressure) ? Math.max(0.01, Math.min(1, pressure as number)) : 1;
}

export function getPointerPressure(input: PointerPressureLike): number {
  if (input.pointerType !== "pen") {
    return 1;
  }
  return normalizePressureValue(input.pressure);
}
