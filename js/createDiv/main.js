window.onload=function(){
  
var obox=document.getElementById("box");

for(var i=0;i<100;i++){
  obox.innerHTML+="<div style='left:"+i%10*30+"px;top:"+Math.floor(i/10)*30+"px'>"+i+"</div>"; 
}

var odiv=obox.getElementsByTagName("div");

for(var i=0;i<odiv.length;i++){
  odiv[i].onmouseover=function(){
    this.style.display="none";
  } 
}

}   
  
  
  
  

  

  
  
  





