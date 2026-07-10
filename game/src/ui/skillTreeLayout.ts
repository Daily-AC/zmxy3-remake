export interface SchoolCardLayout {
  headerY: number
  dividerY: number
  iconY: number
  iconTop: number
  nameY: number
  actionY: number
  levelY: number
  costY: number
}

const ICON_HEIGHT = 62

export function schoolCardLayout(cardY: number): SchoolCardLayout {
  const iconY = cardY + 76
  return {
    headerY: cardY + 20,
    dividerY: cardY + 38,
    iconY,
    iconTop: iconY - ICON_HEIGHT / 2,
    nameY: cardY + 64,
    actionY: cardY + 91,
    levelY: cardY + 134,
    costY: cardY + 162,
  }
}
