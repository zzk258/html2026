window.onload=function(){





$(function(){
  

$(window).scroll(function(){ 
  var x=$(".souji").offset().top;
  var y=$(document).scrollTop();
   if(y>=x){
       $(".fixedTool").fadeIn();
   }else{
       $(".fixedTool").fadeOut();
   };

  $(".w").each(function(i,ele){
        if(y >= $(ele).offset().top){
        $(".fixedTool li").eq(i).addClass("current").siblings().removeClass("current");
        } 
  });
});



$(".fixedTool li").click(function(){
    $(this).addClass("current").siblings().removeClass("current");
    var current=$(".w").eq($(this).index()).offset().top;
    $("body,html").animate({scrollTop:current});
});







});





  
}