// Season 5（Regulation M-B，2026-08 起）熱門威脅
// 名次來源：搜尋結果（game8 / Pokémon Zone / Pikalytics，2026-09-02 快照）
// 配置（道具/性格/努力值/招式）為常見標準配置的「推估」，非官方統計
module.exports = [
  {
    zh: '烈咬陸鯊', name: 'Garchomp', rank: '單打#1／雙打常見', item: 'Choice Scarf',
    ability: 'Rough Skin', nature: 'Jolly', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Earthquake', 'Rock Slide', 'Dragon Claw', 'Stomping Tantrum'],
    scarf: true,
  },
  {
    zh: '西獅海壬', name: 'Primarina', rank: '單打#2', item: 'Assault Vest',
    ability: 'Liquid Voice', nature: 'Modest', evs: { hp: 252, spa: 252, spd: 4 },
    moves: ['Moonblast', 'Hyper Voice', 'Energy Ball', 'Haze'],
  },
  {
    zh: '魔幻假面喵', name: 'Meowscarada', rank: '單打#3', item: 'Focus Sash',
    ability: 'Protean', nature: 'Jolly', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Flower Trick', 'Knock Off', 'Sucker Punch', 'U-turn'],
  },
  {
    zh: '鋁鋼橋龍', name: 'Archaludon', rank: '單打#4', item: 'Assault Vest',
    ability: 'Stamina', nature: 'Modest', evs: { hp: 252, spa: 252, spd: 4 },
    moves: ['Electro Shot', 'Draco Meteor', 'Flash Cannon', 'Body Press'],
  },
  {
    zh: '謎擬Ｑ', name: 'Mimikyu', rank: '單打#5', item: 'Life Orb',
    ability: 'Disguise', nature: 'Adamant', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Play Rough', 'Shadow Sneak', 'Shadow Claw', 'Swords Dance'],
  },
  {
    zh: '仆刀將軍', name: 'Kingambit', rank: '雙打S級', item: 'Black Glasses',
    ability: 'Defiant', nature: 'Adamant', evs: { hp: 252, atk: 252, def: 4 },
    moves: ['Kowtow Cleave', 'Sucker Punch', 'Iron Head', 'Protect'],
  },
  {
    zh: '熾焰咆哮虎', name: 'Incineroar', rank: '雙打S級', item: 'Sitrus Berry',
    ability: 'Intimidate', nature: 'Careful', evs: { hp: 252, atk: 4, spd: 252 },
    moves: ['Fake Out', 'Flare Blitz', 'Knock Off', 'Parting Shot'],
  },
  {
    zh: '白蓬蓬', name: 'Whimsicott', rank: '雙打S級', item: 'Focus Sash',
    ability: 'Prankster', nature: 'Timid', evs: { hp: 252, spa: 4, spe: 252 },
    moves: ['Moonblast', 'Tailwind', 'Encore', 'Light Screen'],
  },
  {
    zh: '來悲粗茶', name: 'Sinistcha', rank: '雙打A級', item: 'Sitrus Berry',
    ability: 'Hospitality', nature: 'Bold', evs: { hp: 252, def: 252, spd: 4 },
    moves: ['Matcha Gotcha', 'Shadow Ball', 'Trick Room', 'Life Dew'],
  },
  {
    zh: '噴火龍(Mega Y)', name: 'Charizard', rank: '雙打最大宗核心(鏡像)', item: 'Charizardite Y',
    ability: 'Drought', nature: 'Modest', evs: { hp: 4, spa: 252, spe: 252 },
    moves: ['Heat Wave', 'Solar Beam', 'Overheat', 'Protect'],
    mega: 'Charizard-Mega-Y',
  },
];
