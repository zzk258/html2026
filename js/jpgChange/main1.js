


window.onload=function(){
  var obox=document.getElementById("box");
  var obtn=obox.getElementsByTagName("input");
  var opic=document.getElementById("pic");
  var op=obox.getElementsByTagName("p")[0];
  var ospan=obox.getElementsByTagName("span")[0];
  
 
  var arr=["images/f1.jpg","images/f2.jpg","images/f3.jpg"]
  var num=0;
  var onoff=true;
  //alert(num);
  ospan.innerHTML=num+"/"+(arr.length-1);
  opic.src=arr[0];
  obtn[0].onclick=function(){
    onoff=true;
    op.innerHTML="顺序模式";
  }
  
  obtn[1].onclick=function(){
    onoff=false;
    op.innerHTML="循环模式";
  }
  
  obtn[3].onclick=function(){
   
    if(num>=arr.length-1){
      if(onoff){
        num=arr.length-1;
      }else{num=0}
      
    }else{num++};
   opic.src=arr[num];
     ospan.innerHTML=num+"/"+(arr.length-1);
    
    
  
  }
  
  obtn[2].onclick=function(){
    if(num<=0){
      if(onoff){
        num=0
      }else{num=arr.length-1}
      
    }else{
      num--;
    }    
    pic.src=arr[num];
    ospan.innerHTML=num+"/"+(arr.length-1);
  }
  
   
  
  
  
}




 
  


