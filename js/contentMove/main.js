
window.onload=function(){

var obox=document.getElementById("box");
var topdiv=document.getElementById("topdiv");
var bottomdiv=document.getElementById("bottomdiv");
var obtn=obox.getElementsByTagName("input");
var str="hfkjdshskfhskjfhsjkdfhkjfdskjfhjksdhfkj";
var str1="";
   for(var i=0;i<str.length;i++){ 
     str1+="<span style='left:"+i%10*20+"px;top:"+Math.floor(i/10)*20+"px'>"+str.charAt(i)+"</span>"
   }
  
  topdiv.innerHTML=str1;


  obtn[0].onclick=function(){       
    domove(126);  
  }
  
  obtn[1].onclick=function(){    
    domove(0);
  }
    

function domove(y){
  var ospan=obox.getElementsByTagName("span"); 
    var timer=null;
    var n=0;
   timer=setInterval(function(){
     ospan[n].style.top=Math.floor(n/10)*20+y+"px"; 
      n++; 
     if(n>ospan.length-1){clearInterval(timer);}   
   },30)
}


}


 
  


