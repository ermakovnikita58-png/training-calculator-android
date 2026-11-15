const fs = require('node:fs');
const path = require('node:path');

const support = `
  <path class="secondary" d="M70 360 Q70 349 83 349 H316 Q329 349 329 359 V379 Q329 387 318 387 H83 Q70 387 70 378 Z"/>
  <path class="fine" d="M71 366 Q77 371 87 371 H315 Q325 371 328 366 M96 387 V429 M117 387 V429 M285 387 V429 M306 387 V429"/>
  <path class="secondary" d="M94 429 H119 M283 429 H308"/>
`;

// The sleeve, forearm, thumb and closed fingers were drawn independently for each view.
const neutralHand = `
  <path d="M45 237 Q56 218 74 206 Q98 224 112 253
           C129 276 141 289 156 293
           C196 280 243 285 274 288 Q301 291 323 286
           Q335 283 342 274 Q348 263 362 259
           Q375 251 384 255 Q396 260 399 273
           Q408 277 407 286 Q414 294 408 303
           Q412 312 406 320 Q409 332 397 337
           Q383 343 366 340 Q345 338 333 328
           C306 323 287 332 260 338 C221 347 186 352 149 348
           C121 348 104 336 94 316 Q78 284 45 237 Z"/>
  <path class="fine" d="M71 274 Q89 259 108 247 M77 284 Q91 269 113 257
           M110 298 Q126 316 147 322 Q189 322 224 309 Q259 298 289 300
           M143 340 Q181 344 209 337 M259 324 Q287 314 317 317
           M331 289 Q333 303 338 310 M338 284 Q338 294 343 300
           M347 280 Q353 267 363 267 Q375 267 383 277 Q388 283 382 288
           Q377 291 371 285 L363 282 Q360 291 352 298
           M384 276 Q391 271 399 273 M383 290 Q395 283 407 286
           M378 303 Q391 295 408 303 M378 316 Q390 307 406 320
           M372 329 Q385 324 397 328 M362 301 Q369 309 369 322"/>
`;
const turnedHand = `
  <path d="M45 237 Q56 218 74 206 Q96 222 111 252
           C127 274 140 287 155 292
           C190 281 228 281 264 288 Q294 293 321 286
           Q332 282 340 271 Q349 258 361 254
           Q375 247 387 252 Q397 254 402 264
           Q413 266 416 275 Q422 280 417 291
           Q423 298 416 307 Q418 317 408 321
           Q403 333 390 335 Q372 340 352 336
           Q335 332 326 326 C304 325 279 334 254 341
           C219 350 181 352 149 348 C122 348 104 336 94 316
           Q77 282 45 237 Z"/>
  <path class="fine" d="M71 274 Q89 258 108 246 M77 284 Q91 267 113 256
           M112 301 Q130 314 149 316 Q188 319 223 307 Q260 296 292 303
           M144 339 Q176 343 208 337 M256 328 Q291 317 318 318
           M330 288 Q334 293 335 307 M339 282 Q344 290 343 297
           M346 276 Q351 263 363 262 Q373 258 385 265 Q393 271 388 279
           Q385 283 379 282 L367 277 Q364 289 354 297
           M386 266 Q393 260 402 264 M388 280 Q404 269 416 275
           M384 292 Q399 282 417 291 M379 303 Q397 294 416 307
           M378 316 Q392 308 408 321 M370 329 Q383 327 391 324
           M355 303 Q362 313 362 324"/>
`;

function hammer(angle, upperEnd, lowerStart) {
  return `<g transform="translate(376 295) rotate(${angle})">
    <path d="M-8 ${upperEnd} L-6 -157 M6 -157 L9 ${upperEnd}
             M-10 ${lowerStart} Q-12 43 -14 55 Q-15 65 -4 68 Q6 70 13 63
             Q15 60 13 54 L10 ${lowerStart}"/>
    <path class="fine" d="M-3 -143 L-5 ${upperEnd - 4} M4 ${lowerStart + 5} L6 58 M-10 60 Q0 65 10 61"/>
    <path d="M-46 -179 Q-47 -184 -43 -188 H-19 Q-12 -188 -9 -182
             L17 -182 Q26 -184 32 -189 L46 -202
             Q49 -205 54 -202 L58 -199 Q60 -196 56 -193 L45 -180
             L58 -190 Q63 -193 65 -188 Q66 -186 62 -182 L45 -165
             Q38 -159 26 -157 H-10 Q-14 -151 -20 -151 H-43 Q-47 -153 -47 -158 Z"/>
    <path class="fine" d="M-38 -186 V-152 M-15 -182 V-158 M-7 -178 H19
             Q29 -179 35 -184 M26 -161 Q36 -163 42 -170"/>
  </g>`;
}

const style = `<style>
  .art { fill: none; stroke: #fff; stroke-width: 3.0; stroke-linejoin: round; stroke-linecap: round }
  .fine { stroke-width: 1.65 }
  .secondary { stroke-width: 2.15 }
</style>`;
const phases = [
  support + hammer(-4, -36, 46) + neutralHand,
  support + hammer(48, -43, 53) + turnedHand,
];

function svg(viewBox, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="title">
<title id="title">${title}</title>${style}${body}</svg>\n`;
}
for (const [index, phase] of phases.entries()) {
  fs.writeFileSync(path.join(__dirname, `hammer-rotation-phase-${index + 1}.svg`),
    svg('0 0 590 512', `Вращение кисти с молотком — положение ${index + 1}`, `<g class="art">${phase}</g>`));
}
const preview = svg('0 0 1280 512', 'Вращение кисти с молотком — обе фазы',
  `<rect width="1280" height="512" fill="#000"/><g class="art" transform="translate(28 0)">${phases[0]}</g>
  <g class="art" transform="translate(662 0)">${phases[1]}</g>`);
fs.writeFileSync(path.join(__dirname, 'hammer-rotation-preview.svg'), preview);
fs.writeFileSync(path.join(__dirname, 'hammer-rotation-preview.html'),
  '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}svg{display:block;width:1280px;height:512px}</style>' + preview);
