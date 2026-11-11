window.onload = function(){
 var wrap=document.getElementById('wrap');
 var main=document.getElementById('main');
 var p1=document.getElementById('p1');
 
  var img1=document.getElementById('img1');

var divr=document.getElementById('right');
var ospan=divr.getElementsByTagName('span');

  var picName=['pic1','pic2','pic3'];
   var pic=['images/f1.jpg','images/f2.jpg','images/f3.jpg'];


for(var i=0;i<ospan.length;i++){
 
     
     ospan[i].index=i;
     var clearclass=0; 
  
    
  ospan[i].onclick = function(){
   
      
    
    
    ospan[clearclass].className="spanr";
    
    this.className='active';
    p1.innerHTML=this.index+1+'/'+ospan.length;
    p2.innerHTML=picName[this.index]
    img1.src=pic[this.index];
   
     clearclass=this.index;
  
    
  }
    
  
}
  
  
  
  
  
  
}