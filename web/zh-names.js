// 招式／特性／屬性 顯示用中文名（查無對照時原樣顯示英文）
import zhNames from '../data/zh-names.json';

// 與 calc-core.toID 相同；就地複製避免循環引用
const toID = s => ('' + s).toLowerCase().replace(/[^a-z0-9]/g, '');

export function moveZh(name) {
  return zhNames.moves[toID(name)] || name;
}
export function abilityZh(name) {
  return zhNames.abilities[toID(name)] || name;
}

export const TYPE_ZH = {
  Normal: '一般', Fire: '火', Water: '水', Electric: '電', Grass: '草', Ice: '冰',
  Fighting: '格鬥', Poison: '毒', Ground: '地面', Flying: '飛行', Psychic: '超能力',
  Bug: '蟲', Rock: '岩石', Ghost: '幽靈', Dragon: '龍', Dark: '惡', Steel: '鋼',
  Fairy: '妖精', Stellar: '星晶',
};
export function typeZh(type) {
  return TYPE_ZH[type] || type;
}
