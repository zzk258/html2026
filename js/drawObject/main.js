
var disx=0;
var disy=0;

window.onload=function(){
  new drag('div1');
}
  
  
function drag(id){
  var _this=this;
   this.odiv=document.getElementById(id); 
  
  this.odiv.onmousedown=function(){
    _this.fndown();
 
     document.onmousemove=function(){
         _this.fnmove();
     }
     document.onmouseup=function(){
         _this.fnup();
     }
  
    }
  
  }
  
drag.prototype.fndown=function(ev){
   var ev = ev || event;
    
     this.disx=ev.clientX-this.odiv.offsetLeft;
     this.disy=ev.clientY-this.odiv.offsetTop;
};
  
drag.prototype.fnmove=function(ev){
  var ev = ev || event;
    
    this.odiv.style.left=ev.clientX-this.disx+'px';
    this.odiv.style.top=ev.clientY-this.disy+'px';
}

drag.prototype.fnup=function(){
  document.onmousemove=document.onmouseup=null;
}   
  
  
  
  

  

  
  
  





