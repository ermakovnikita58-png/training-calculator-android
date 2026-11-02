const assert=require('node:assert/strict'),zlib=require('node:zlib');
// Read screenshot pixels without image-editing dependencies. Chromium PNG: 8-bit RGB/RGBA.
function pixels(png){
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20),depth=png[24],type=png[25],channels=type===6?4:type===2?3:0;
 assert.equal(depth,8);assert.ok(channels,'RGB screenshot required');const chunks=[];
 for(let p=8;p<png.length;){const n=png.readUInt32BE(p),kind=png.toString('ascii',p+4,p+8);if(kind==='IDAT')chunks.push(png.subarray(p+8,p+8+n));p+=n+12;}
 const raw=zlib.inflateSync(Buffer.concat(chunks)),stride=width*channels,out=Buffer.alloc(stride*height);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];for(let x=0;x<stride;x++){const a=x>=channels?out[y*stride+x-channels]:0,b=y?out[(y-1)*stride+x]:0,c=y&&x>=channels?out[(y-1)*stride+x-channels]:0,v=raw[y*(stride+1)+1+x];out[y*stride+x]=(v+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}}
 return {width,height,at:(x,y)=>[...out.subarray((y*width+x)*channels,(y*width+x)*channels+3)]};
}
async function checkScreen(page,png,width){
 const p=pixels(png);assert.equal(p.width,width);assert.deepEqual(p.at(1,1),[11,16,22],'brand background token');
 const boxes=await page.evaluate(()=>({header:document.querySelector('.top').getBoundingClientRect().toJSON(),title:document.querySelector('.page.active h1')?.getBoundingClientRect().toJSON(),navigation:document.querySelector('.tabbar').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('.tab')].map(e=>e.getBoundingClientRect().toJSON())}));
 assert.ok(boxes.header.height>=48);assert.ok(boxes.title&&boxes.title.top>=boxes.header.bottom-1&&boxes.title.top<boxes.header.bottom+100,'heading follows header without a viewport spacer');
 assert.ok(boxes.navigation.bottom<=p.height+1,'bottom panel is inside viewport');
 for(const b of boxes.buttons)assert.ok(b.height>=48&&b.width>=48,'48px navigation targets');
 let primary=0;for(let y=Math.max(0,Math.floor(boxes.navigation.top));y<p.height;y++)for(let x=0;x<p.width;x++){const c=p.at(x,y);if(c[0]===209&&c[1]===255&&c[2]===99)primary++;}
 assert.ok(primary>10,'selected tab has visible lime accent in screenshot');
}
module.exports={checkScreen};
