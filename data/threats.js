// Champions 威脅資料庫 Top 50（Season 5／Regulation M-B，2026-09-03 更新）
// 名次/評級來源：WebSearch 快照（game8、Pokémon Zone、Serebii、StrataDex、ShowdownTier、
//   Pikalytics、nintendoeverything、Bulbagarden，2026-09-02~03）
// 配置（道具/性格/努力值/招式）為常見標準配置的「推估」，非官方統計
// rank 標記：單打/雙打上位＝本季搜尋確認；Mega強勢＝tier list 確認；常青候補＝歷代標準款、本季名單未逐一確認
// megaAbility：新 Mega 在 @smogon/calc 0.11.0 的特性為佔位值，這裡覆寫成媒體報導的實際特性
module.exports = [
  // ===== 本季確認：單打上位 =====
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
    zh: '鋼鎧鴉', name: 'Corviknight', rank: '單打上位', item: 'Leftovers',
    ability: 'Mirror Armor', nature: 'Impish', evs: { hp: 252, def: 252, spd: 4 },
    moves: ['Brave Bird', 'Body Press', 'Iron Defense', 'Roost'],
  },
  {
    zh: '妖火紅狐', name: 'Delphox', rank: '單打上位', item: 'Life Orb',
    ability: 'Blaze', nature: 'Timid', evs: { spa: 252, spd: 4, spe: 252 },
    moves: ['Fire Blast', 'Psyshock', 'Grass Knot', 'Calm Mind'],
  },
  {
    zh: '幽尾玄魚(雄)', name: 'Basculegion', rank: '單打/雙打上位', item: 'Choice Band',
    ability: 'Adaptability', nature: 'Adamant', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Wave Crash', 'Last Respects', 'Aqua Jet', 'Flip Turn'],
  },
  {
    zh: '暴鯉龍', name: 'Gyarados', rank: '單打上位', item: 'Sitrus Berry',
    ability: 'Intimidate', nature: 'Jolly', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Waterfall', 'Ice Fang', 'Dragon Dance', 'Protect'],
  },
  {
    zh: '河馬獸', name: 'Hippowdon', rank: '單打上位', item: 'Leftovers',
    ability: 'Sand Stream', nature: 'Impish', evs: { hp: 252, def: 252, spd: 4 },
    moves: ['Earthquake', 'Slack Off', 'Stealth Rock', 'Yawn'],
  },
  {
    zh: '大劍鬼(洗翠)', name: 'Samurott-Hisui', rank: '單打上位', item: 'Focus Sash',
    ability: 'Sharpness', nature: 'Jolly', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Ceaseless Edge', 'Razor Shell', 'Sucker Punch', 'Sacred Sword'],
  },
  {
    zh: '九尾(阿羅拉)', name: 'Ninetales-Alola', rank: '單打/雙打上位', item: 'Light Clay',
    ability: 'Snow Warning', nature: 'Timid', evs: { spa: 252, spd: 4, spe: 252 },
    moves: ['Aurora Veil', 'Blizzard', 'Moonblast', 'Encore'],
  },
  // ===== 本季確認：雙打上位 =====
  {
    zh: '仆斬將軍', name: 'Kingambit', rank: '雙打#1', item: 'Black Glasses',
    ability: 'Defiant', nature: 'Adamant', evs: { hp: 252, atk: 252, def: 4 },
    moves: ['Kowtow Cleave', 'Sucker Punch', 'Iron Head', 'Protect'],
  },
  {
    zh: '熾焰咆哮虎', name: 'Incineroar', rank: '雙打S級', item: 'Sitrus Berry',
    ability: 'Intimidate', nature: 'Careful', evs: { hp: 252, atk: 4, spd: 252 },
    moves: ['Fake Out', 'Flare Blitz', 'Knock Off', 'Parting Shot'],
  },
  {
    zh: '風妖精', name: 'Whimsicott', rank: '雙打S級', item: 'Focus Sash',
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
    ability: 'Blaze', megaAbility: 'Drought', nature: 'Modest', evs: { hp: 4, spa: 252, spe: 252 },
    moves: ['Heat Wave', 'Solar Beam', 'Overheat', 'Protect'],
    mega: 'Charizard-Mega-Y',
  },
  {
    zh: '大狃拉', name: 'Sneasler', rank: '雙打S級', item: 'Focus Sash',
    ability: 'Unburden', nature: 'Jolly', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Dire Claw', 'Close Combat', 'Fake Out', 'Protect'],
  },
  {
    zh: '仙子伊布', name: 'Sylveon', rank: '雙打S級', item: 'Choice Specs',
    ability: 'Pixilate', nature: 'Modest', evs: { hp: 252, spa: 252, spd: 4 },
    moves: ['Hyper Voice', 'Psyshock', 'Shadow Ball', 'Quick Attack'],
  },
  {
    zh: '姆克鷹(Mega)', name: 'Staraptor', rank: '雙打A級(新Mega)', item: 'Staraptorite',
    ability: 'Intimidate', megaAbility: 'Contrary', nature: 'Adamant', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Brave Bird', 'Close Combat', 'Double-Edge', 'Protect'],
    mega: 'Staraptor-Mega',
  },
  {
    zh: '奇麒麟', name: 'Farigiraf', rank: '雙打A級', item: 'Sitrus Berry',
    ability: 'Armor Tail', nature: 'Relaxed', evs: { hp: 252, def: 252, spd: 4 },
    moves: ['Trick Room', 'Psychic Noise', 'Foul Play', 'Helping Hand'],
  },
  {
    zh: '大嘴鷗', name: 'Pelipper', rank: '雙打S級(雨隊)', item: 'Focus Sash',
    ability: 'Drizzle', nature: 'Modest', evs: { hp: 4, spa: 252, spe: 252 },
    moves: ['Hurricane', 'Weather Ball', 'Tailwind', 'Protect'],
  },
  {
    zh: '袋獸(Mega)', name: 'Kangaskhan', rank: '雙打上位', item: 'Kangaskhanite',
    ability: 'Scrappy', megaAbility: 'Parental Bond', nature: 'Jolly', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Fake Out', 'Double-Edge', 'Sucker Punch', 'Protect'],
    mega: 'Kangaskhan-Mega',
  },
  {
    zh: '花葉蒂(永恆之花Mega)', name: 'Floette-Eternal', rank: '雙打上位(新Mega)', item: 'Floettite',
    ability: 'Flower Veil', nature: 'Modest', evs: { hp: 4, spa: 252, spe: 252 },
    moves: ['Light of Ruin', 'Moonblast', 'Psychic', 'Protect'],
    mega: 'Floette-Mega',
  },
  {
    zh: '雷丘(Mega Y)', name: 'Raichu', rank: 'S級勝率首位', item: 'Raichunite Y',
    ability: 'Static', megaAbility: 'Surge Surfer', nature: 'Timid', evs: { spa: 252, spd: 4, spe: 252 },
    moves: ['Thunderbolt', 'Fake Out', 'Grass Knot', 'Protect'],
    mega: 'Raichu-Mega-Y',
  },
  {
    zh: '雷丘(Mega X)', name: 'Raichu', rank: 'Mega強勢(電場)', item: 'Raichunite X',
    ability: 'Static', megaAbility: 'Electric Surge', nature: 'Jolly', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Volt Tackle', 'Fake Out', 'Nuzzle', 'Protect'],
    mega: 'Raichu-Mega-X',
  },
  // ===== 本季確認：強勢 Mega =====
  {
    zh: '巨金怪(Mega)', name: 'Metagross', rank: 'Mega強勢', item: 'Metagrossite',
    ability: 'Clear Body', megaAbility: 'Tough Claws', nature: 'Jolly', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Meteor Mash', 'Zen Headbutt', 'Bullet Punch', 'Protect'],
    mega: 'Metagross-Mega',
  },
  {
    zh: '大嘴娃(Mega)', name: 'Mawile', rank: 'Mega強勢', item: 'Mawilite',
    ability: 'Intimidate', megaAbility: 'Huge Power', nature: 'Adamant', evs: { hp: 252, atk: 252, def: 4 },
    moves: ['Play Rough', 'Sucker Punch', 'Iron Head', 'Protect'],
    mega: 'Mawile-Mega',
  },
  {
    zh: '耿鬼(Mega)', name: 'Gengar', rank: 'Mega強勢', item: 'Gengarite',
    ability: 'Cursed Body', megaAbility: 'Shadow Tag', nature: 'Timid', evs: { spa: 252, spd: 4, spe: 252 },
    moves: ['Shadow Ball', 'Sludge Bomb', 'Focus Blast', 'Protect'],
    mega: 'Gengar-Mega',
  },
  {
    zh: '火焰雞(Mega)', name: 'Blaziken', rank: 'Mega強勢', item: 'Blazikenite',
    ability: 'Speed Boost', megaAbility: 'Speed Boost', nature: 'Adamant', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Flare Blitz', 'Close Combat', 'Swords Dance', 'Protect'],
    mega: 'Blaziken-Mega',
  },
  {
    zh: '巨沼怪(Mega)', name: 'Swampert', rank: 'Mega強勢(雨隊)', item: 'Swampertite',
    ability: 'Torrent', megaAbility: 'Swift Swim', nature: 'Adamant', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Wave Crash', 'Earthquake', 'Ice Punch', 'Protect'],
    mega: 'Swampert-Mega',
  },
  {
    zh: '蜥蜴王(Mega)', name: 'Sceptile', rank: 'Mega(新增)', item: 'Sceptilite',
    ability: 'Overgrow', megaAbility: 'Lightning Rod', nature: 'Timid', evs: { spa: 252, spd: 4, spe: 252 },
    moves: ['Leaf Storm', 'Dragon Pulse', 'Focus Blast', 'Protect'],
    mega: 'Sceptile-Mega',
  },
  {
    zh: '暴飛龍(Mega)', name: 'Salamence', rank: 'Mega強勢', item: 'Salamencite',
    ability: 'Intimidate', megaAbility: 'Aerilate', nature: 'Jolly', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Double-Edge', 'Dragon Claw', 'Dragon Dance', 'Protect'],
    mega: 'Salamence-Mega',
  },
  {
    zh: '路卡利歐(Mega)', name: 'Lucario', rank: 'Mega強勢', item: 'Lucarionite',
    ability: 'Inner Focus', megaAbility: 'Adaptability', nature: 'Jolly', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Close Combat', 'Bullet Punch', 'Extreme Speed', 'Swords Dance'],
    mega: 'Lucario-Mega',
  },
  // ===== 本季確認：M-B 新加入 =====
  {
    zh: '賽富豪', name: 'Gholdengo', rank: '新增·成績穩定', item: 'Life Orb',
    ability: 'Good as Gold', nature: 'Modest', evs: { hp: 4, spa: 252, spe: 252 },
    moves: ['Make It Rain', 'Shadow Ball', 'Nasty Plot', 'Protect'],
  },
  {
    zh: '棄世猴', name: 'Annihilape', rank: '新增·上位', item: 'Leftovers',
    ability: 'Defiant', nature: 'Careful', evs: { hp: 252, atk: 4, spd: 252 },
    moves: ['Rage Fist', 'Drain Punch', 'Bulk Up', 'Protect'],
  },
  {
    zh: '長毛巨魔', name: 'Grimmsnarl', rank: '新增·最具影響', item: 'Light Clay',
    ability: 'Prankster', nature: 'Careful', evs: { hp: 252, atk: 4, spd: 252 },
    moves: ['Spirit Break', 'Reflect', 'Light Screen', 'Thunder Wave'],
  },
  {
    zh: '勾魂眼', name: 'Sableye', rank: '雙打輔助常見', item: 'Leftovers',
    ability: 'Prankster', nature: 'Bold', evs: { hp: 252, def: 252, spd: 4 },
    moves: ['Will-O-Wisp', 'Foul Play', 'Recover', 'Taunt'],
  },
  {
    zh: '霸王花', name: 'Vileplume', rank: '新增(M-B)', item: 'Sitrus Berry',
    ability: 'Effect Spore', nature: 'Bold', evs: { hp: 252, def: 252, spd: 4 },
    moves: ['Sludge Bomb', 'Giga Drain', 'Sleep Powder', 'Protect'],
  },
  // ===== 常青候補（歷代標準款，本季名單未逐一確認） =====
  {
    zh: '快龍', name: 'Dragonite', rank: '常青候補', item: 'Lum Berry',
    ability: 'Multiscale', nature: 'Adamant', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Extreme Speed', 'Outrage', 'Earthquake', 'Dragon Dance'],
  },
  {
    zh: '班基拉斯', name: 'Tyranitar', rank: '常青候補(沙暴)', item: 'Assault Vest',
    ability: 'Sand Stream', nature: 'Adamant', evs: { hp: 252, atk: 252, spd: 4 },
    moves: ['Rock Slide', 'Crunch', 'Low Kick', 'Iron Head'],
  },
  {
    zh: '暴露菇', name: 'Amoonguss', rank: '常青候補(雙打輔助)', item: 'Sitrus Berry',
    ability: 'Regenerator', nature: 'Calm', evs: { hp: 252, def: 4, spd: 252 },
    moves: ['Spore', 'Rage Powder', 'Pollen Puff', 'Protect'],
  },
  {
    zh: '轟擂金剛猩', name: 'Rillaboom', rank: '常青候補', item: 'Assault Vest',
    ability: 'Grassy Surge', nature: 'Adamant', evs: { hp: 252, atk: 252, spd: 4 },
    moves: ['Grassy Glide', 'Wood Hammer', 'Fake Out', 'U-turn'],
  },
  {
    zh: '吃吼霸', name: 'Dondozo', rank: '常青候補(受)', item: 'Leftovers',
    ability: 'Unaware', nature: 'Impish', evs: { hp: 252, def: 252, spd: 4 },
    moves: ['Wave Crash', 'Body Press', 'Rest', 'Curse'],
  },
  {
    zh: '鹽石巨靈', name: 'Garganacl', rank: '常青候補(受)', item: 'Leftovers',
    ability: 'Purifying Salt', nature: 'Careful', evs: { hp: 252, atk: 4, spd: 252 },
    moves: ['Salt Cure', 'Recover', 'Iron Defense', 'Body Press'],
  },
  {
    zh: '海牛獸', name: 'Gastrodon', rank: '常青候補', item: 'Leftovers',
    ability: 'Storm Drain', nature: 'Calm', evs: { hp: 252, def: 4, spd: 252 },
    moves: ['Earth Power', 'Ice Beam', 'Recover', 'Clear Smog'],
  },
  {
    zh: '月月熊', name: 'Ursaluna', rank: '常青候補', item: 'Flame Orb',
    ability: 'Guts', nature: 'Adamant', evs: { hp: 252, atk: 252, spd: 4 },
    moves: ['Facade', 'Headlong Rush', 'Crunch', 'Protect'],
  },
  {
    zh: '烈箭鶲', name: 'Talonflame', rank: '常青候補(順風手)', item: 'Covert Cloak',
    ability: 'Gale Wings', nature: 'Jolly', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Brave Bird', 'Tailwind', 'Will-O-Wisp', 'Protect'],
  },
  {
    zh: '蒼炎刃鬼', name: 'Ceruledge', rank: '常青候補', item: 'Focus Sash',
    ability: 'Flash Fire', nature: 'Adamant', evs: { atk: 252, spd: 4, spe: 252 },
    moves: ['Bitter Blade', 'Shadow Sneak', 'Swords Dance', 'Protect'],
  },
  {
    zh: '3D龍2', name: 'Porygon2', rank: '常青候補(空間手)', item: 'Eviolite',
    ability: 'Download', nature: 'Quiet', evs: { hp: 252, def: 4, spa: 252 },
    moves: ['Ice Beam', 'Thunderbolt', 'Recover', 'Trick Room'],
  },
];
