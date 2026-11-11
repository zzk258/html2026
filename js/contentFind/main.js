window.onload = function(){

var odiv=document.getElementById('div1');
var oinp=document.getElementsByTagName('input');

var op1=document.getElementById('p1');
var odiv2=document.getElementById('div2');
oinp[1].onclick=function(){
  var str=oinp[0].value;
  var newstr=oinp[2].value
  
  if(!str)return;
  odiv2.innerHTML=op1.innerHTML.split(str).join('<span>'+newstr+'</span>');
  
}
  
  
  
  
}