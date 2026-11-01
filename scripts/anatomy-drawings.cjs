// Compact native SVG anatomy plates for movements without a licensed vector plate.
// These are schematic illustrations, not photographs or motion capture.
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const line=(a,b,color='#8a9b9e',width=5)=>`<path d="M${a} L${b}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linecap="round"/>`;
const ellipse=(x,y,rx,ry,fill)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
function limb(a,b,width,active){let dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),angle=Math.atan2(dy,dx)*180/Math.PI-90;return `<g transform="translate(${a}) rotate(${angle})"><path d="M0 0 C${-width} ${len*.15},${-width*.85} ${len*.62},-4 ${len} L4 ${len} C${width*.85} ${len*.62},${width} ${len*.15},0 0Z" fill="url(#${active?'hot':'silver'})" stroke="#b3c2c5" stroke-width="1.2"/>${[-.45,-.2,.2,.45].map(f=>`<path d="M0 6 Q${width*f} ${len*.45},${f*3} ${len-5}" stroke="${active?'#ffc28d':'#e5eeed'}" opacity=".35" fill="none"/>`).join('')}</g>`;}
function pose(type,phase,seated){
 let p={head:[250,98],ls:[213,156],rs:[287,156],lh:[232,278],rh:[268,278],le:[200,220],re:[300,220],lw:[194,270],rw:[306,270],lk:[228,350],rk:[272,350],la:[226,420],ra:[274,420]};
 let arms=(el,er,wl,wr)=>Object.assign(p,{le:el,re:er,lw:wl,rw:wr});
 if(type==='press')arms([177,166],[323,166],phase?[208,52]:[177,107],phase?[292,52]:[323,107]);
 if(type==='lateral')arms(phase?[150,162]:[193,217],phase?[350,162]:[307,217],phase?[91,164]:[179,277],phase?[409,164]:[321,277]);
 if(type==='raise')arms([207,205],[293,205],phase?[210,124]:[202,270],phase?[290,124]:[298,270]);
 if(type==='upright')arms(phase?[165,163]:[203,220],phase?[335,163]:[297,220],phase?[218,153]:[220,270],phase?[282,153]:[280,270]);
 if(type==='curl'||type==='rotation')arms([200,218],[300,218],phase?[206,164]:[185,273],phase?[294,164]:[315,273]);
 if(type==='fly'||type==='chestpress'||type==='pallof')arms([164,175],[336,175],phase?[230,192]:[120,145],phase?[270,192]:[380,145]);
 if(type==='pulldown'||type==='hang')arms(phase&&type!=='hang'?[176,196]:[185,109],phase&&type!=='hang'?[324,196]:[315,109],phase&&type!=='hang'?[174,140]:[165,55],phase&&type!=='hang'?[326,140]:[335,55]);
 if(type==='triceps')arms([200,213],[300,213],phase?[198,275]:[224,176],phase?[302,275]:[276,176]);
 if(type==='squat'||type==='jump'){if(!phase){p.lh=[229,310];p.rh=[271,310];p.lk=[172,351];p.rk=[328,351];p.la=[175,420];p.ra=[325,420];p.head=[250,130];p.ls=[213,188];p.rs=[287,188];}else if(type==='jump'){p.la[1]=393;p.ra[1]=393;} }
 if(type==='row'||type==='hinge'||type==='rear'){p.head=[315,163];p.ls=[275,199];p.rs=[303,207];p.lh=[215,284];p.rh=[243,293];arms([285,260],[317,270],phase?[255,264]:[292,322],phase?[285,277]:[330,332]);if(type==='rear'&&phase)arms([221,185],[353,214],[175,174],[402,224]);}
 if(type==='rotation')arms([204,217],[296,217],phase?[152,214]:[236,214],phase?[348,214]:[264,214]);
 if(type==='facepull')arms(phase?[170,155]:[200,178],phase?[330,155]:[300,178],phase?[211,114]:[230,155],phase?[289,114]:[270,155]);
 if(type==='woodchop'){arms(phase?[183,243]:[280,130],phase?[213,250]:[330,139],phase?[174,294]:[340,78],phase?[194,294]:[360,78]);}
 if(type==='shrug'&&phase){p.ls[1]-=14;p.rs[1]-=14;}
 if(type==='calf'&&phase){p.head[1]-=12;p.ls[1]-=12;p.rs[1]-=12;p.lh[1]-=12;p.rh[1]-=12;p.lk[1]-=12;p.rk[1]-=12;p.la[1]-=12;p.ra[1]-=12;}
 if(type==='kick'){p.rk=phase?[350,310]:[278,350];p.ra=phase?[395,352]:[278,420];}
 if(type==='lunge'||type==='step'||type==='run'){p.lk=[198,326];p.la=[156,402];p.rk=[317,350];p.ra=[348,418];if(phase){p.lk=[189,294];p.la=[182,350];}arms([169,201],[319,214],[174,151],[347,254]);}
 if(type==='stretch'){arms([181,104],[314,170],[227,48],[347,227]);if(phase){p.head[0]-=20;p.ls[0]-=15;p.rs[0]-=15;}}
 if(seated||['legpress','legcurl','legextension','cycle','crunch'].includes(type)){p.lh=[231,282];p.rh=[269,282];p.lk=[179,314];p.rk=[321,314];p.la=[175,401];p.ra=[325,401];if(type==='legextension'&&phase){p.la=[105,320];p.ra=[395,320];}if(type==='legcurl'&&!phase){p.la=[115,321];p.ra=[385,321];}}
 if(type==='bridge'){p={head:[108,302],ls:[145,305],rs:[160,315],lh:[245,phase?255:342],rh:[261,phase?265:352],le:[143,345],re:[172,365],lw:[204,370],rw:[234,380],lk:[333,286],rk:[348,300],la:[361,389],ra:[382,400]};}
 if(['floorpress','pullover','plank','legraise','ballplank','abwheel','swim','roll'].includes(type)){
 p={head:[116,248],ls:[153,275],rs:[159,298],lh:[267,284],rh:[272,306],le:[154,phase?190:238],re:[176,phase?200:248],lw:[154,phase?135:196],rw:[185,phase?145:206],lk:[341,291],rk:[347,313],la:[416,298],ra:[424,320]};
 if(type==='plank'||type==='ballplank'||type==='abwheel'){p.le=[139,334];p.re=[164,352];p.lw=[193,363];p.rw=[219,380];}
 if(type==='legraise'&&phase){p.lk=[308,217];p.rk=[327,228];p.la=[335,149];p.ra=[355,160];}
 if(type==='pullover'){p.lw=phase?[111,161]:[48,261];p.rw=phase?[139,172]:[65,281];p.le=phase?[132,216]:[100,273];p.re=phase?[156,221]:[110,290];}
 }
 return p;
}
function equipmentAt(p,eq,type,phase,single=false){let s='',w=single?[p.rw]:[p.lw,p.rw];const bar=(a,b)=>line(a,b,'#b7c6ce',6)+w.map(([x,y])=>`<rect x="${x-9}" y="${y-19}" width="18" height="38" rx="4" fill="#394b55" stroke="#91a4af" stroke-width="2"/>`).join('');
 if(eq==='barbell')s+=bar([p.lw[0]-35,p.lw[1]],[p.rw[0]+35,p.rw[1]]);
 if(eq==='dumbbell')for(const [x,y] of w)s+=`<g transform="translate(${x} ${y})"><path d="M-16 0H16" stroke="#dce3e3" stroke-width="5"/><rect x="-24" y="-15" width="12" height="30" rx="4" fill="#425561" stroke="#b5c6c8"/><rect x="12" y="-15" width="12" height="30" rx="4" fill="#425561" stroke="#b5c6c8"/></g>`;
 if(eq==='kettlebell')for(const [x,y] of w)s+=`<g transform="translate(${x} ${y})"><rect x="-10" y="-6" width="20" height="18" rx="7" stroke="#c5d0d0" fill="none" stroke-width="5"/><circle cy="20" r="17" fill="#42545a" stroke="#d0d8d6" stroke-width="2"/></g>`;
 if(eq==='plate')for(const [x,y] of w)s+=`<circle cx="${x}" cy="${y}" r="20" fill="#42545a" stroke="#b8c8c7" stroke-width="3"/><circle cx="${x}" cy="${y}" r="4" fill="#101a1e"/>`;
 if(eq==='cable'||eq==='band'){let anchors=type==='rotation'?[[90,214],[410,214]]:type==='pulldown'||type==='triceps'||type==='facepull'?[[90,65],[410,65]]:type==='woodchop'?[[425,70],[425,70]]:[[90,422],[410,422]];s+=w.map((hand,i)=>line(anchors[single?1:i],hand,eq==='band'?'#64dec9':'#a4b8ba',eq==='band'?6:2)).join('');if(eq==='cable')s+=`<path d="M65 425V65H105 M435 425V65H395" stroke="#556a75" stroke-width="10" fill="none"/>`;}
 if(eq==='rings')for(const [x,y] of w)s+=line([x,35],[x,y-12],'#9caeae',3)+`<circle cx="${x}" cy="${y}" r="15" fill="none" stroke="#c29b67" stroke-width="5"/>`;
 if(eq==='smith')s+=`<path d="M125 425V55M375 425V55" stroke="#526876" stroke-width="10"/>`+bar([120,p.lw[1]],[380,p.rw[1]]);
 if(eq==='ball')s+=`<circle cx="260" cy="360" r="61" fill="#254e57" stroke="#71b7bb" stroke-width="3"/>`;
 if(eq==='landmine')s+=line([70,430],p.rw,'#b7c6ce',8)+ellipse(p.rw[0]-12,p.rw[1]+20,15,21,'#42545a');
 if(eq==='trap')s+=`<path d="M145 280L195 248H305L355 280L305 312H195Z" fill="none" stroke="#bac7c9" stroke-width="6"/>`;
 return s;
}
function classify(name,group){let n=name.toLowerCase().replaceAll('ё','е'),type=null;
 const rules=[[/кист|запяст|пальц|эспандер|роллер|молотком|край рукояти/,'wrist'],[/ходьба на носках|нос[ко]|тибиалис/,'calf'],[/жим.*ног|гакк/,'legpress'],[/разгибани.*ног/,'legextension'],[/сгибани.*ног/,'legcurl'],[/мост|хип-траст|подъем таза|удержание таза/,'bridge'],[/пуловер/,'pullover'],[/жим.*лежа|жим.*полу|жим.*пола/,'floorpress'],[/отжимани|планка/,'plank'],[/колесо/,'abwheel'],[/подъем.*ног|складка|уголок/,'legraise'],[/подтягива|вис |вис$|удержание.*турник/,'hang'],[/тяга.*верх|тяга.*вертик|тяга.*сверху/,'pulldown'],[/скручив|пресс.*тренаж/,'crunch'],[/шраг/,'shrug'],[/подъем.*подбород|тяга.*подбород/,'upright'],[/тяга.*лиц|тяга.*каната.*груд/,'facepull'],[/вращени.*плеч|ротаци.*плеч/,'rotation'],[/жим.*паллоф|резинкой в руках/,'pallof'],[/дровосек|протяжка каната/,'woodchop'],[/сведени|жим.*грудь|жим.*эспандер/,'chestpress'],[/жим|лэндмайн/,'press'],[/гантел.*[yt] |заднюю дельт|разведени.*наклон/,'rear'],[/отведени.*рук|разведени.*сторон/,'lateral'],[/подъем.*перед|отведени.*диск/,'raise'],[/сгибани|бицепс|молотков|брахиал/,'curl'],[/разгибани.*рук|разгибани.*локт/,'triceps'],[/присед/,'squat'],[/выпад/,'lunge'],[/тумб|степ-ап|платформ|лестниц/,'step'],[/отведени.*ног|отведени.*бед|мах.*ног/,'kick'],[/тяга.*пояс|тяга.*гриф|тяга.*горизонт|тяга.*нижн|тяга.*бедру|тяга.*гантел|тяга.*гири|тяга.*тренаж|тяга.*хаммер|тяга.*смите/,'row'],[/станов|тяга.*пола|тяга.*колен|тяга.*цеп|тяга.*резин|тяга.*гир|наклон.*корп|доброе утро|удержание.*наклон|гиперэкстенз|рывковая тяга|тяга.*широк/,'hinge'],[/прогулка фермера|удержание.*гир|удержание.*штанг/,'carry'],[/прыж/,'jump'],[/велотренаж|велосип/,'cycle'],[/плавани/,'swim'],[/прокатыв|ролл|перекат.*мяч/,'roll'],[/бег|дорожк|аэробик|бокс|ходьб|лыж/,'run'],[/растяж|мобилизац|поворот|поза |разведение рук у стены|вращени|голов|круговые движения/,'stretch']];
 for(const [re,t] of rules)if(re.test(n)){type=t;break;}
 if(!type)throw Error('No drawing specification: '+name);
 let eq=/лэндмайн/.test(n)?'landmine':/смита|смите/.test(n)?'smith':/трэп/.test(n)?'trap':/штанг|гриф/.test(n)?'barbell':/гантел/.test(n)?'dumbbell':/гир/.test(n)?'kettlebell':/блин|диск/.test(n)?'plate':/резин|эспандер/.test(n)?'band':/кольц|trx/.test(n)?'rings':/блок|кроссовер|канат/.test(n)?'cable':/фитбол/.test(n)?'ball':'body';
 return {type,eq,seated:/сидя|сидени|на скамье|стуле/.test(n),single:/одной|одну|одно|односторон/.test(n),machine:/тренаж|хаммер|смите|смита/.test(n),name,group};
}
function render(spec,phase=1){const {type,eq,name,group,seated,single,machine}=spec;let p=pose(type,phase,seated),g=group.toLowerCase(),n=name.toLowerCase().replaceAll('ё','е');
 if(single&&!/ног|hip|бедр/.test(n)){p.le=[195,222];p.lw=[183,280];}
 if(/одной ног|одну ног/.test(n)){p.lk=[225,349];p.la=[224,420];}
 if(/узким хват/.test(n)){p.lw[0]+=25;p.rw[0]-=25;}
 if(/широк.*хват/.test(n)){p.lw[0]-=25;p.rw[0]+=25;}
 if(/нейтральн/.test(n)){p.le[0]+=14;p.re[0]-=14;p.lw[0]+=14;p.rw[0]-=14;}
 if(/лэндмайн/.test(n)){p.re=[300,190];p.rw=phase?[352,110]:[300,155];if(!single){p.lw=[p.rw[0]-16,p.rw[1]+10];p.le=[268,202];}}
 if(/гантел.*[yt] /.test(n)){p=pose('rear',phase,false);if(phase){p.lw=[190,/y /.test(n)?96:187];p.rw=[394,/y /.test(n)?121:218];}}
 if(type==='legpress'){p=pose('bridge',1,false);p.lk=phase?[324,190]:[256,216];p.rk=phase?[348,210]:[282,237];p.la=phase?[384,139]:[298,181];p.ra=phase?[408,159]:[324,202];}
 if(type==='cycle'){p.le=[200,215];p.re=[303,214];p.lw=[213,243];p.rw=[327,243];p.la=phase?[194,387]:[214,343];p.ra=phase?[308,342]:[332,388];}
 if(/на прямых рук/.test(n)){p.le=[150,329];p.re=[171,345];p.lw=[150,392];p.rw=[174,409];}
 if(/планка с подъемом ноги|боковая планка с подъемом ноги/.test(n)&&phase){p.rk=[351,257];p.ra=[426,227];}
 if(/поза голубя/.test(n)){p.head=[206,177];p.ls=[190,229];p.rs=[241,229];p.lh=[216,321];p.rh=[247,328];p.lk=[152,360];p.la=[252,379];p.rk=[332,365];p.ra=[420,384];p.le=[174,292];p.re=[271,297];p.lw=[159,373];p.rw=[291,385];}
 if(/90\/90|растяжка ягодиц сидя/.test(n)){p=pose('crunch',0,true);p.lk=[176,338];p.la=[224,388];p.rk=[322,331];p.ra=[374,378];}
 if(/присед в глубоком/.test(n))p=pose('squat',0,false);
 if(/растяжка трицепса/.test(n)){p.re=[310,72];p.rw=[262,143];p.le=[189,123];p.lw=[308,77];}
 if(/растяжка бицепса у стены/.test(n)){p.re=[352,158];p.rw=[412,158];p.le=[202,215];p.lw=[201,270];}
 if(/голов|шеи/.test(n)&&type==='stretch'){p=pose('carry',0,false);p.head[0]+=phase?15:-10;}
 if(/мобилизация голеностоп/.test(n)){p=pose('lunge',phase,false);p.re=[348,155];p.rw=[411,153];p.le=[267,168];p.lw=[405,178];}
 if(/грудного отдела на четвереньках/.test(n)){p=pose('plank',0,false);p.lk=[265,369];p.la=[342,393];p.rk=[280,390];p.ra=[357,411];p.re=phase?[175,233]:[172,351];p.rw=phase?[178,170]:[175,404];}
 if(/вращение плеч с резинкой|мобилизация плеч с палкой/.test(n)){p=pose('press',phase,false);p.lw=[142,phase?66:166];p.rw=[358,phase?66:166];}
 if(/из-за головы/.test(n)&&type==='press'){p.lw[1]+=14;p.rw[1]+=14;}
 let activeArm=/плеч|бицепс$|трицеп|предплеч/.test(g),activeLeg=/бедр|квад|икр|ягод/.test(g);let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 470"><title>${esc(name)} — схема движения</title><defs><linearGradient id="silver"><stop stop-color="#52656b"/><stop offset=".42" stop-color="#cbd3d1"/><stop offset=".65" stop-color="#899c9e"/><stop offset="1" stop-color="#394e57"/></linearGradient><linearGradient id="hot"><stop stop-color="#a83f26"/><stop offset=".5" stop-color="#ff9c51"/><stop offset="1" stop-color="#d6532f"/></linearGradient></defs><path d="M52 432H448" stroke="#34454c" stroke-width="2"/>`;
 if(seated||['legpress','legextension','legcurl','cycle','crunch'].includes(type))s+=`<path d="M181 301H321M201 305V426M301 305V426" stroke="#526977" stroke-width="12" fill="none"/>`;
 if(type==='floorpress'&&!/пол/.test(n))s+=`<path d="M95 331H310M121 334V420M287 334V420" stroke="#566f79" stroke-width="11" fill="none"/>`;
 if(type==='floorpress'&&/пол/.test(n))s+=`<path d="M60 340H450" stroke="#69828b" stroke-width="7"/>`;
 if(type==='hang')s+=`<path d="M110 432V42H390V432" stroke="#4c626b" stroke-width="9" fill="none"/>`;
 if(type==='step')s+=`<path d="M120 425V353H220V425" fill="#243842" stroke="#64828b" stroke-width="4"/>`;
 if(machine)s+=`<path d="M98 425V65M402 425V65M98 70H402" stroke="#3c535e" stroke-width="9" fill="none"/>`;
 const torso=`M${p.ls} Q${p.ls[0]-8} ${p.ls[1]+55},${p.lh} L${p.rh} Q${p.rs[0]+8} ${p.rs[1]+55},${p.rs} Q250 ${Math.min(p.ls[1],p.rs[1])-15},${p.ls}Z`;
 s+=`<path d="${torso}" fill="url(#${/груд|спин|пресс/.test(g)?'hot':'silver'})" stroke="#b3c2c5" stroke-width="1.2"/>`;
 let mx=(p.ls[0]+p.rs[0])/2,my=(p.ls[1]+p.rs[1])/2;
 s+=`<path d="M${mx} ${my+5}L${(p.lh[0]+p.rh[0])/2} ${(p.lh[1]+p.rh[1])/2-8} M${p.ls[0]+6} ${my+24}Q${mx-12} ${my+45},${mx} ${my+24}Q${mx+12} ${my+45},${p.rs[0]-6} ${my+24}" stroke="#263d43" opacity=".65" fill="none" stroke-width="2"/>`;
 for(let k=0;k<4;k++)s+=`<path d="M${mx-16} ${my+48+k*14}Q${mx} ${my+55+k*14},${mx+16} ${my+48+k*14}" stroke="#e3e6d7" opacity=".4" fill="none"/>`;
 s+=limb(p.lh,p.lk,20,activeLeg)+limb(p.lk,p.la,14,/икр/.test(g))+limb(p.rh,p.rk,20,activeLeg)+limb(p.rk,p.ra,14,/икр/.test(g));
 s+=limb(p.ls,p.le,17,activeArm)+limb(p.le,p.lw,12,/предплеч/.test(g))+limb(p.rs,p.re,17,activeArm)+limb(p.re,p.rw,12,/предплеч/.test(g));
 s+=ellipse(p.head[0],p.head[1]+32,13,22,'url(#silver)')+ellipse(...p.head,21,28,'url(#silver)');
 for(const a of [p.la,p.ra])s+=`<path d="M${a[0]-9} ${a[1]-2}L${a[0]-10} ${a[1]+12}Q${a[0]+17} ${a[1]+20},${a[0]+25} ${a[1]+9}L${a[0]+8} ${a[1]-2}Z" fill="#90a3a3"/>`;
 s+=equipmentAt(p,eq,type,phase,single);
 if(/плавани/.test(n))s+=`<path d="M58 369Q95 352 132 369T206 369T280 369T354 369T428 369" fill="none" stroke="#50a1ba" stroke-width="4"/>`;
 if(/с палкой/.test(n))s+=line(p.lw,p.rw,'#c5aa78',6);
 if(/лыж|скандинав/.test(n))s+=line(p.lw,[p.lw[0]-40,426],'#a8c9ce',4)+line(p.rw,[p.rw[0]+40,426],'#a8c9ce',4);
 if(type==='wrist')s+=`<g transform="translate(325 70)"><rect width="115" height="105" rx="18" fill="#13282e" stroke="#708c91"/><path d="M18 76L41 64L51 26M41 64L67 21M41 64L83 30M41 64L93 45M41 64L91 61" stroke="#f5b583" stroke-width="8" stroke-linecap="round" fill="none"/><path d="M21 20Q10 43 27 51" stroke="#61dac6" stroke-width="3" fill="none"/></g>`;
 if(type==='cycle')s+=`<g fill="none" stroke="#68838c" stroke-width="5"><circle cx="168" cy="389" r="38"/><circle cx="339" cy="389" r="38"/><path d="M168 389L221 326L267 389H168L221 326H316L339 389"/></g>`;
 if(type==='run'&&/дорожк/.test(name))s+=`<path d="M115 437H397L425 413M390 413V233L362 214" stroke="#67838c" fill="none" stroke-width="9"/>`;
 if(type==='roll')s+=`<rect x="220" y="325" width="75" height="30" rx="12" fill="#527783" stroke="#b5d3d7"/>`;
 if(single)s+=`<text x="250" y="460" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#9eb8bc">По одной стороне</text>`;
 return s+'</svg>';
}
module.exports={classify,render};
