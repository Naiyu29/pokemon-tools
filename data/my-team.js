// 我的隊伍「Meta」：由遊戲截圖轉出（2026-09-03），數值已逐隻反推驗證（Lv50、IV31）
// zh: 顯示用中文名
module.exports = [
  {
    zh: '仙子伊布', name: 'Sylveon', item: 'Fairy Feather', ability: 'Pixilate',
    nature: 'Modest', evs: { hp: 252, spa: 252, spe: 16 },
    moves: ['Hyper Voice', 'Yawn', 'Hyper Beam', 'Detect'],
  },
  {
    zh: '超壞星', name: 'Toxapex', item: 'Leftovers', ability: 'Regenerator',
    nature: 'Bold', evs: { hp: 252, def: 252 },
    moves: ['Toxic', 'Wide Guard', 'Infestation', 'Baneful Bunker'],
  },
  {
    zh: '熾焰咆哮虎', name: 'Incineroar', item: 'Figy Berry', ability: 'Intimidate',
    nature: 'Relaxed', evs: { hp: 16, atk: 252, def: 252 },
    moves: ['Darkest Lariat', 'Fake Out', 'Flare Blitz', 'Parting Shot'],
  },
  {
    zh: '烈咬陸鯊', name: 'Garchomp', item: 'Choice Scarf', ability: 'Rough Skin',
    nature: 'Jolly', evs: { atk: 252, spd: 16, spe: 252 },
    moves: ['Earthquake', 'Rock Slide', 'Stomping Tantrum', 'Dragon Claw'],
  },
  {
    zh: '妙蛙花', name: 'Venusaur', item: 'Life Orb', ability: 'Chlorophyll',
    nature: 'Modest', evs: { hp: 88, spa: 252, spe: 184 },
    moves: ['Sludge Bomb', 'Protect', 'Earth Power', 'Solar Beam'],
  },
  {
    zh: '噴火龍', name: 'Charizard', item: 'Charizardite Y', ability: 'Blaze',
    nature: 'Modest', evs: { hp: 16, spa: 252, spe: 252 },
    moves: ['Ancient Power', 'Heat Wave', 'Solar Beam', 'Protect'],
    mega: 'Charizard-Mega-Y', // 對戰中 Mega 進化後以 Y 型態計算（特性 Drought）
  },
];
