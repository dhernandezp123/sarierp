export type CargoDimensionLine = {
  id: string
  quantity: string
  packageType: 'Caja' | 'Pallet' | 'Pieza'
  length: string
  width: string
  height: string
  dimensionUnit: 'in' | 'cm' | 'mm' | 'm'
  weight: string
  weightUnit?: 'lbs' | 'kg'
  volumeMode?: 'dimensions' | 'manual'
  manualCbm?: string | number
}

export const getCbmPerUnit = (line: CargoDimensionLine) => {
  const length = Number(line.length || 0)
  const width = Number(line.width || 0)
  const height = Number(line.height || 0)

  if (!length || !width || !height) return 0

  if (line.dimensionUnit === 'in') {
    return (length * width * height) / 61023.7441
  }

  if (line.dimensionUnit === 'cm') {
    return (length * width * height) / 1_000_000
  }

  if (line.dimensionUnit === 'mm') {
    return (length * width * height) / 1_000_000_000
  }

  if (line.dimensionUnit === 'm') {
    return length * width * height
  }

  return 0
}

export const getCargoVolumeMode = (line: CargoDimensionLine) =>
  line.volumeMode || 'dimensions'

export const hasLineVolume = (line: CargoDimensionLine) => {
  if (getCargoVolumeMode(line) === 'manual') {
    return Number(line.manualCbm || 0) > 0
  }

  return (
    Number(line.length || 0) > 0 &&
    Number(line.width || 0) > 0 &&
    Number(line.height || 0) > 0
  )
}

export const calculateLineCbm = (line: CargoDimensionLine) => {
  if (getCargoVolumeMode(line) === 'manual') {
    return Number(line.manualCbm || 0)
  }

  const quantity = Number(line.quantity || 0)
  if (!quantity) return 0

  return getCbmPerUnit(line) * quantity
}

export const calculateLineFt3 = (line: CargoDimensionLine) => {
  return calculateLineCbm(line) * 35.3147
}

export const getCargoWeightUnit = (line: CargoDimensionLine) =>
  line.weightUnit || 'lbs'

export const getLineUnitWeightLbs = (line: CargoDimensionLine) => {
  const weight = Number(line.weight || 0)
  return getCargoWeightUnit(line) === 'kg' ? weight * 2.20462 : weight
}

export const getLineUnitWeightKg = (line: CargoDimensionLine) => {
  const weight = Number(line.weight || 0)
  return getCargoWeightUnit(line) === 'kg' ? weight : weight / 2.20462
}

export const getLineTotalWeightLbs = (line: CargoDimensionLine) =>
  getLineUnitWeightLbs(line) * Number(line.quantity || 0)

export const getLineTotalWeightKg = (line: CargoDimensionLine) =>
  getLineUnitWeightKg(line) * Number(line.quantity || 0)
