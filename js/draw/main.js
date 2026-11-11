window.onload = function(){

var odiv=document.getElementById("div1");
var odiv2=document.getElementById("div2");  
/*
odiv.onmousedown=function(ev){
   var ev=ev || event;
   var disX=ev.clientX-odiv.offsetLeft;
   var disY=ev.clientY-odiv.offsetTop;

if(odiv.setCapture){odiv.setCapture()} //chrome不支持该方法；

document.onmousemove=function(ev){
   var ev=ev || event;  
  odiv.style.left=ev.clientX-disX+'px';
  odiv.style.top=ev.clientY-disY+'px';
}

document.onmouseup=function(ev){
  document.onmousemove=document.onmouseup=null;
  if(odiv.relaseCapture){odiv.relaseCapture()}
}

 return false;  //阻止默认行为 标准IE下有效，非标准即ie8或以下无效果。。。所以要有 setCapture();

}

*/

//进行封装的操作


drag(odiv);
drag(odiv2);

function drag (obj){

obj.onmousedown=function(ev){
   var ev=ev || event;
   var disX=ev.clientX-this.offsetLeft;
   var disY=ev.clientY-this.offsetTop;

if(obj.setCapture){obj.setCapture()} //chrome不支持该方法；

document.onmousemove=function(ev){
   var ev=ev || event;  
   var L=ev.clientX-disX;
   var T=ev.clientY-disY;
  
  if(L<100){L=0}else if(L>document.documentElement.clientWidth-obj.offsetWidth-100){L=document.documentElement.clientWidth-obj.offsetWidth};
  
  if(T<100){T=0}else if(T>document.documentElement.clientHeight-obj.offsetHeight-100){T=document.documentElement.clientHeight-obj.offsetHeight}
  
  obj.style.left=L+'px';
  obj.style.top=T+'px';
 
}

document.onmouseup=function(ev){
  document.onmousemove=document.onmouseup=null;
  if(obj.relaseCapture){obj.relaseCapture()}
}

 return false;  //阻止默认行为 标准IE下有效，非标准即ie8或以下无效果。。。所以要有 setCapture();

}

}
  
  
  
}