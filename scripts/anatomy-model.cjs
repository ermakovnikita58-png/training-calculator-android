/* Original FORGE region diagram. Not imported from AGPL assets; not a clinical atlas. */
const front={
 chest:'M58 76Q73 65 88 79L87 111Q72 122 57 104Z',
 shoulder:'M56 70Q40 71 39 94L52 109L60 89Z',
 biceps:'M41 104Q31 126 37 147L48 144L52 115Z',
 forearm:'M36 149Q25 170 28 199L36 204L47 153Z',
 quads:'M63 223Q48 251 59 303L76 305L87 236Z',
 calf:'M60 311Q52 339 64 372L72 376L78 317Z',
 abs:'M79 124Q84 120 88 125L88 141L78 141Z M78 146L88 146V163L77 162Z M77 168L88 168V185L78 185Z M79 190L88 190V207L81 206Z',
 oblique:'M59 119L74 126L72 198L61 188Z',
 neck:'M79 48L87 52V67L71 73Z'
};
const back={
 shoulder:front.shoulder,triceps:front.biceps,forearm:front.forearm,calf:front.calf,
 lats:'M58 91L86 112L83 173L67 153Z',
 traps:'M79 52L88 61V111L59 84L64 76Z',
 lower:'M78 152L88 169V208L73 213Z',
 glutes:'M61 209Q50 220 60 242Q75 250 87 235L88 209Z',
 hamstrings:'M60 247Q51 272 62 305L78 303L85 247Z'
};
const map={'Грудь':['chest'],'Спина':['lats','traps'],'Плечи':['shoulder'],'Бицепс':['biceps'],'Трицепс':['triceps'],'Предплечья':['forearm'],'Пресс':['abs','oblique'],'Ягодицы':['glutes'],'Квадрицепс':['quads'],'Бицепс бедра':['hamstrings'],'Икры':['calf'],'Нижняя спина':['lower']};
function render(primary=[],secondary=[]){
 const keys=groups=>new Set(groups.flatMap(g=>map[g]||[])),p=keys(primary),s=keys(secondary);
 const fill=k=>p.has(k)?'url(#main)':s.has(k)?'url(#aux)':'url(#gray)';
 const pair=(k,d)=>`<g fill="${fill(k)}" stroke="#56645e" stroke-width=".8"><path d="${d}"/><path d="${d}" transform="translate(180 0) scale(-1 1)"/></g>`;
 const body=`<ellipse cx="90" cy="29" rx="17" ry="23"/><path d="M79 49L77 62Q45 65 36 85L26 139L18 200L26 219L37 210L43 157L53 123L59 191L56 216L56 242L51 291L56 319L60 372L54 394L72 394L80 370L83 315L90 267L97 315L100 370L108 394L126 394L120 372L124 319L129 291L124 242L124 216L121 191L127 123L137 157L143 210L154 219L162 200L154 139L144 85Q135 65 103 62L101 49Z"/>`;
 function person(parts,x){return `<g transform="translate(${x} 7)"><g fill="url(#gray)" stroke="#65736d" stroke-width="1">${body}</g>${Object.entries(parts).map(([k,d])=>pair(k,d)).join('')}<g fill="none" stroke="#c8d0c9" stroke-width=".5" opacity=".24">${Array.from({length:13},(_,i)=>`<path d="M62 ${83+i*9}q15 8 25 1M93 ${84+i*9}q12 6 25-1"/>`).join('')}<path d="M66 251l5 45M75 250l-3 48M105 250l3 48M114 251l-5 45M90 72v137"/></g></g>`;}
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 374 420" role="img" aria-label="Условная карта областей тела"><defs><linearGradient id="gray"><stop stop-color="#53625c"/><stop offset=".45" stop-color="#b8c1b7"/><stop offset="1" stop-color="#63746a"/></linearGradient><linearGradient id="main"><stop stop-color="#b85b32"/><stop offset=".5" stop-color="#f2a16c"/><stop offset="1" stop-color="#c66f45"/></linearGradient><linearGradient id="aux"><stop stop-color="#6f853e"/><stop offset=".5" stop-color="#c3d68b"/><stop offset="1" stop-color="#7b9447"/></linearGradient></defs><desc>Оригинальная условная схема FORGE. Цвет показывает область, а не степень активации. Не клинический атлас.</desc><rect width="374" height="420" rx="24" fill="#111a14"/>${person(front,3)}${person(back,191)}</svg>`;
}
module.exports={render,map};
