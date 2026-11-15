(function(root) {
'use strict';
const goals = {
 loss:{label:'Сушка · снижение жировой массы',range:[-20,-5],initial:-15},
 gain:{label:'Набор мышечной массы',range:[3,10],initial:5},
 recomp:{label:'Рекомпозиция',range:[-5,0],initial:0},
 maintain:{label:'Поддержание',range:[0,0],initial:0}
};
// Work additions represent non-step activity only; walking is counted in steps.
const work = {desk:0,standing:.04,physical:.12};
const mets = {strength:{light:3,moderate:3.5,hard:6},cycling:{light:4,moderate:6,hard:8},walking:{light:2.8,moderate:3.8,hard:4.8},running:{light:6.5,moderate:8.5,hard:11},mixed:{light:3.5,moderate:5,hard:7.5}};
const round = n=>Math.round(n*10)/10;
function number(v,label,min,max) {
 if(!['string','number'].includes(typeof v)||(typeof v==='string'&&!v.trim())||v===''||v===null||v===undefined||!Number.isFinite(Number(v))||Number(v)<min||Number(v)>max) throw Error(label+': допустимо '+min+'–'+max);
 return Number(v);
}
function choice(v,values,label){if(!values.includes(v))throw Error('Выберите: '+label);return v}
function profile(input) {
 const p={...input,age:number(input.age,'Возраст',14,100),sex:choice(input.sex,['male','female'],'пол для формулы'),height:number(input.height,'Рост, см',120,230),weight:number(input.weight,'Текущая масса, кг',30,300),training:number(input.training,'Тренировок за неделю',0,14),goal:choice(input.goal,Object.keys(goals),'цель'),special:input.special===true,
 mode:choice(input.mode||'simple',['simple','advanced'],'режим'),source:choice(input.source||'questionnaire',['questionnaire','manual'],'источник поддержания'),
 steps:number(input.steps,'Шагов за сутки',0,60000),work:choice(input.work,Object.keys(work),'рабочая подвижность'),duration:number(input.duration,'Минут на тренировку',0,240),type:choice(input.type,Object.keys(mets),'тип тренировки'),intensity:choice(input.intensity,['light','moderate','hard'],'интенсивность'),
 sessionSteps:number(input.sessionSteps??0,'Шагов внутри одной тренировки',0,40000),macroBasis:choice(input.macroBasis||'weight',['weight','lean'],'база для БЖУ'),proteinRate:number(input.proteinRate??1.8,'Белок, г/кг',1.6,2.2),fatMode:choice(input.fatMode||'kg',['kg','percent'],'способ расчёта жиров'),fatRate:number(input.fatRate??.9,'Жиры, г/кг',.8,1),fatPercent:number(input.fatPercent??30,'Жиры, % энергии',20,40)};
 if(!Number.isInteger(p.age)||!Number.isInteger(p.training)||!Number.isInteger(p.steps)||!Number.isInteger(p.sessionSteps))throw Error('Возраст, шаги и число тренировок должны быть целыми');
 if(p.training>0&&p.duration<10)throw Error('Для тренировок укажите длительность от 10 минут');
 if(p.source==='manual'){
  p.manualTDEE=number(input.manualTDEE,'Известное поддержание',1200,10000);
  p.journalDays=number(input.journalDays,'Дней достоверного дневника',14,90);
  if(!Number.isInteger(p.journalDays)||input.maintenanceConfirmed!==true)throw Error('Подтвердите полный дневник и стабильную массу за несколько недель');
 }
 if(p.macroBasis==='lean'){
  p.bodyFat=number(input.bodyFat,'Процент жира',5,55);
  if(input.bodyFatReliable!==true)throw Error('Для расчёта по безжировой массе нужна достоверная оценка процента жира');
 }
 return p;
}
function restrictions(p){const bmi=p.weight/(p.height/100)**2;return [p.age<18?'Возраст до 18 лет':null,p.age>65?'Возраст старше 65 лет':null,bmi<18.5?'Недостаточная масса по ИМТ':null,bmi>=40?'ИМТ 40 и выше':null,p.training>7?'Очень высокая тренировочная нагрузка':null,p.special?'Особые медицинские обстоятельства':null].filter(Boolean)}
function energy(m){return 4*m.protein+9*m.fat+4*m.carbs}
function manual(input){const m={calories:number(input.calories,'Калории',1500,10000),protein:number(input.protein,'Белок',0,500),fat:number(input.fat,'Жиры',0,350),carbs:number(input.carbs,'Углеводы',0,1500)};const kcal=energy(m);if(kcal<1500||kcal>10000)throw Error('Энергия БЖУ должна быть в пределах 1500–10000 ккал');return {...m,energy:round(kcal),delta:round(kcal-m.calories)}}
function resting(p){return 10*p.weight+6.25*p.height-5*p.age+(p.sex==='male'?5:-161)}
function activityEstimate(p){
 const bmr=resting(p),base=bmr*1.2,nonStepWork=bmr*work[p.work];
 // All daily steps include workouts. Remove their weekly daily average before counting non-training walking.
 const sessionSteps=p.sessionSteps||({walking:100,running:150,mixed:60}[p.type]||0)*p.duration;
 const excludedSteps=sessionSteps*p.training/7;
 const outsideSteps=Math.max(0,p.steps-excludedSteps);
 const walking=Math.max(0,outsideSteps-2000)*(p.height*.415/100000)*p.weight*.5;
 // Replace already-counted sedentary time, instead of adding gross workout calories.
 const exercise=Math.max(0,mets[p.type][p.intensity]-1.3)*p.weight*p.duration/60*p.training/7;
 return {bmr,base,nonStepWork,walking,exercise,excludedSteps,outsideSteps,tdee:base+nonStepWork+walking+exercise,
 warnings:excludedSteps>p.steps?['Оценка шагов тренировок выше всех суточных шагов. Уточните анкету; бытовые шаги приняты равными нулю.']:[]};
}
function macros(p,calories){
 const basis=p.macroBasis==='lean'?p.weight*(1-p.bodyFat/100):p.weight;
 const protein=round(basis*p.proteinRate),fat=round(p.fatMode==='kg'?basis*p.fatRate:calories*p.fatPercent/100/9);
 const carbs=round((calories-protein*4-fat*9)/4);
 if(carbs<0)throw Error('Белки и жиры превышают калорийную цель. Измените настройки; отрицательные углеводы не допускаются.');
 return {...manual({calories,protein,fat,carbs}),basis:round(basis)};
}
function calculate(input,adjustment){
 const p=profile(input),blocked=restrictions(p);if(blocked.length)throw Error('Автоподбор отключён: '+blocked.join('; ')+'. Нужен индивидуальный план специалиста.');
 const pct=number(adjustment??goals[p.goal].initial,'Дефицит/профицит, %',...goals[p.goal].range),components=activityEstimate(p);
 const tdee=p.source==='manual'?p.manualTDEE:components.tdee;
 const requested=tdee*(1+pct/100),calories=Math.round(Math.max(1500,tdee*.8,requested));
 const result={...macros(p,calories),bmr:Math.round(resting(p)),tdee:Math.round(tdee),requested:round(requested),adjustment:pct,effectivePercent:round((calories/tdee-1)*100),change:round(calories-tdee),clamped:requested<1500,profile:p,components,model:'forge-11.1',warnings:components.warnings.slice()};
 if(p.source==='manual')result.warnings=[]; // The questionnaire is not added to known total maintenance.
 if(calories<resting(p))result.warnings.push('Цель ниже оценки расхода в покое. Само по себе это не запрет: важны общая нагрузка, восстановление и доступная энергия.');
 if(p.macroBasis==='lean'){result.availableEnergy=round((calories-components.exercise)/result.basis);result.warnings.push('Энергетическая доступность — грубая оценка после нагрузки на кг безжировой массы, не диагноз и не универсальный порог безопасности.');}
 return result;
}
const DAY=86400000;
function dayNumber(date){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return NaN;const n=Date.parse(date+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===date?n/DAY:NaN}
const average=a=>a.reduce((s,v)=>s+v,0)/a.length;
function median(a){const b=a.slice().sort((x,y)=>x-y),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2}
function strengthTrend(workouts,start,middle,end){
 const groups=[new Map(),new Map()];
 for(const w of workouts||[]){const d=dayNumber(w.date);if(d<start||d>end||!Number.isFinite(d))continue;const g=groups[d<middle?0:1];
 for(const s of w.sets||[]){const weight=Number(s.weight),reps=Number(s.reps);if(s.done===false||!s.exercise||!Number.isFinite(weight)||weight<=0||!Number.isInteger(reps)||reps<1||reps>15)continue;
 const key=s.exercise;const v=reps===1?weight:weight*(1+reps/30);if(!g.has(key))g.set(key,new Map());g.get(key).set(d,Math.max(g.get(key).get(d)||0,v));}}
 const changes=[];for(const [name,first] of groups[0]){const last=groups[1].get(name);if(first.size>=2&&last?.size>=2)changes.push(average([...last.values()])/average([...first.values()])-1)}
 if(!changes.length)return null;changes.sort((a,b)=>a-b);return changes[Math.floor(changes.length/2)];
}
function analyze(data,options={}){
 const insufficient=reason=>({status:'insufficient',message:'Недостаточно данных для корректировки',reason});
 let p;try{p=profile(data.nutritionCoach?.profile||{});}catch{return insufficient('Сначала сохраните заполненную анкету 11.1.')}
 if(restrictions(p).length)return {status:'blocked',message:'Автоматическая корректировка отключена',reason:restrictions(p).join('; ')};
 const days=options.days??21;if(![14,21].includes(days))return insufficient('Выберите период 14 или 21 день.');
 const end=dayNumber(options.today)-1,start=end-days+1,middle=start+days/2;
 if(!Number.isFinite(end))return insufficient('Некорректная дата анализа.');
 const history=data.nutritionCoach.history||[],last=history.at(-1);
 if(last&&Number.isFinite(Date.parse(last.at))&&dayNumber(options.today)-Math.floor(Date.parse(last.at)/DAY)<14)return insufficient('После изменения цели нужно не менее 14 дней наблюдения.');
 const weights=new Map();for(const w of data.weights||[]){const d=dayNumber(w.date),v=Number(w.weight);if(d>=start&&d<=end&&Number.isFinite(v)&&v>=30&&v<=300){if(!weights.has(d))weights.set(d,[]);weights.get(d).push(v)}}
 const points=[...weights].map(([d,a])=>({d,v:average(a)})).sort((a,b)=>a.d-b.d);
 if(points.length<6||points.at(-1).d-points[0].d<days-3||points.filter(x=>x.d<middle).length<3||points.filter(x=>x.d>=middle).length<3||end-points.at(-1).d>3)return insufficient('Нужны минимум 6 дней измерений, по 3 в каждой половине периода, включая последние 3 дня.');
 const calories=new Map();for(const f of data.foods||[]){const d=dayNumber(f.date),v=Number(f.cal);if(d>=start&&d<=end&&Number.isFinite(v)&&v>=0)calories.set(d,(calories.get(d)||0)+v)}
 const daily=data.nutritionCoach.daily||{},complete=[];
 for(let d=start;d<=end;d++){const key=new Date(d*DAY).toISOString().slice(0,10),r=daily[key];if(r?.complete===true&&calories.get(d)>0&&calories.get(d)<=10000&&Number.isFinite(r.steps)&&r.steps>=0&&r.steps<=60000&&Number.isFinite(r.trainingMinutes)&&r.trainingMinutes>=0&&r.trainingMinutes<=480&&Object.hasOwn(work,r.work)&&Object.hasOwn(mets,r.type)&&['light','moderate','hard'].includes(r.intensity))complete.push({d,steps:r.steps,trainingMinutes:r.trainingMinutes,work:r.work,type:r.type,intensity:r.intensity,cal:calories.get(d)})}
 if(complete.length<Math.ceil(days*.8)||complete.filter(x=>x.d<middle).length<5||complete.filter(x=>x.d>=middle).length<5)return insufficient('Нужно ≥80% полностью записанных дней питания с шагами и минутами тренировки. Наличие одной еды не означает полный день.');
 const a=complete.filter(x=>x.d<middle),b=complete.filter(x=>x.d>=middle),stepA=average(a.map(x=>x.steps)),stepB=average(b.map(x=>x.steps)),trainA=average(a.map(x=>x.trainingMinutes)),trainB=average(b.map(x=>x.trainingMinutes));
 const loadA=average(a.map(x=>x.trainingMinutes*(mets[x.type][x.intensity]-1.3))),loadB=average(b.map(x=>x.trainingMinutes*(mets[x.type][x.intensity]-1.3)));
 const activityChanged=Math.abs(loadB-loadA)>Math.max(22,loadA*.25)||Math.abs(stepB-stepA)>Math.max(1500,stepA*.2)||Math.abs(trainB-trainA)>Math.max(10,trainA*.25)||complete.some(x=>x.work!==p.work);
 const currentWeight=median(points.filter(x=>x.d>=end-6).map(x=>x.v));
 const slopes=[];for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)slopes.push((points[j].v-points[i].v)/(points[j].d-points[i].d));
 const slope=median(slopes);
 const weeklyPercent=slope*7/currentWeight*100,actualCalories=average(complete.map(x=>x.cal)),strength=strengthTrend(data.workouts,start,middle,end);
 const evidence={days,measurements:points.length,completeDays:complete.length,currentWeight:round(currentWeight),weeklyPercent:round(weeklyPercent),actualCalories:Math.round(actualCalories),stepsBefore:Math.round(stepA),stepsAfter:Math.round(stepB),minutesBefore:round(trainA),minutesAfter:round(trainB),loadBefore:round(loadA),loadAfter:round(loadB),strengthPercent:strength===null?null:round(strength*100)};
 if(activityChanged)return {status:'blocked',message:'Активность изменилась — пока без корректировки',reason:'Обновите анкету и соберите стабильный период. Нагрузка не должна ошибочно считаться изменением обмена.',evidence};
 if(p.type==='strength'&&p.training>0&&strength===null)return {...insufficient('Нужны сопоставимые силовые результаты: одно упражнение минимум в двух днях каждой половины периода.'),evidence};
 if(strength!==null&&strength<-.05)return {status:'blocked',message:'Силовые результаты снизились — не уменьшаем питание автоматически',reason:'Проверьте восстановление, нагрузку и здоровье; обсудите индивидуальный план.',evidence};
 const current=Number(data.goals?.calories);if(!Number.isFinite(current)||current<1500||Math.abs(actualCalories-current)>current*.15)return {status:'blocked',message:'Сначала уточните соблюдение текущей цели',reason:'Средняя калорийность отличается от цели больше чем на 15%.',evidence};
 const bands={loss:[-.75,-.25],gain:[.1,.25],recomp:[-.25,.1],maintain:[-.15,.15]},band=bands[p.goal];
 const delta=weeklyPercent<band[0]?100:weeklyPercent>band[1]?-100:0;
 if(!delta)return {status:'keep',message:'Пока оставьте текущую цель',reason:'Тренд в выбранном ориентировочном диапазоне. Не меняем КБЖУ.',evidence};
 p={...p,weight:currentWeight};let baseline;try{baseline=calculate(p,goals[p.goal].initial)}catch(e){return {status:'blocked',message:'Нужен пересмотр анкеты',reason:e.message,evidence}}
 const low=Math.max(1500,baseline.tdee*(p.goal==='loss'?.8:p.goal==='recomp'?.95:p.goal==='gain'?1.03:.95)),high=baseline.tdee*(p.goal==='gain'?1.1:p.goal==='loss'?.95:p.goal==='recomp'?1:1.05);
 const target=Math.round(Math.max(low,Math.min(high,current+delta)));
 if(Math.sign(target-current)!==Math.sign(delta)||Math.abs(target-current)<50||Math.abs(target-current)>101)return {status:'blocked',message:'Корректировка выходит за защитные границы',reason:'Пересмотрите исходное поддержание и анкету вручную.',evidence};
 let proposal;try{proposal=macros(p,target)}catch(e){return {status:'blocked',message:'Нельзя согласовать БЖУ',reason:e.message,evidence}}
 return {status:'ready',message:`Предложение: ${target} ккал (${target-current>0?'+':''}${target-current})`,reason:'По тренду массы, полноте питания и стабильной активности. Это осторожная эвристика, не медицинское заключение.',evidence,proposal,profile:p,fromCalories:current};
}
function validateStore(c){
 if(!c||c.version!==1||!Array.isArray(c.history))throw Error('Некорректная история Nutrition Coach');
 if(c.profile?.modelVersion===2)profile(c.profile);
 if(c.analysisWindow!==undefined&&![14,21].includes(c.analysisWindow))throw Error('Некорректное окно анализа');
 if(c.daily!==undefined){if(!c.daily||typeof c.daily!=='object'||Array.isArray(c.daily))throw Error('Некорректные отметки дней');
 for(const [date,r] of Object.entries(c.daily)){if(!Number.isFinite(dayNumber(date))||!r||typeof r.complete!=='boolean'||!Number.isFinite(r.steps)||!Number.isInteger(r.steps)||r.steps<0||r.steps>60000||!Number.isFinite(r.trainingMinutes)||r.trainingMinutes<0||r.trainingMinutes>480||!Object.hasOwn(work,r.work)||(r.type!==undefined&&!Object.hasOwn(mets,r.type))||(r.intensity!==undefined&&!['light','moderate','hard'].includes(r.intensity)))throw Error('Некорректная отметка дня');}}
 return true;
}
const api={validateStore,goals,work,mets,number,profile,restrictions,energy,manual,resting,activityEstimate,macros,calculate,dayNumber,strengthTrend,analyze};
if(typeof module==='object'&&module.exports)module.exports=api;else root.ForgeNutrition=api;
})(typeof window==='object'?window:globalThis);
